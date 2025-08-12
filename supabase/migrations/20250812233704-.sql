-- 1) Create roles enum and user_roles table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'scorer', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2) Role helper function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- 3) Drop permissive policies if they exist
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow all operations on players" ON public.players;
  DROP POLICY IF EXISTS "Allow all operations on matches" ON public.matches;
  DROP POLICY IF EXISTS "Allow all operations on elo_history" ON public.elo_history;
  DROP POLICY IF EXISTS "Allow all operations on attendance" ON public.attendance;
EXCEPTION WHEN others THEN NULL; END $$;

-- 4) Ensure RLS is enabled (idempotent)
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elo_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- 5) Create secure policies
-- Players
CREATE POLICY "Anyone can read players"
ON public.players FOR SELECT
USING (true);

CREATE POLICY "Only admins can modify players"
ON public.players FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Matches
CREATE POLICY "Anyone can read matches"
ON public.matches FOR SELECT
USING (true);

CREATE POLICY "Scorers and admins can modify matches"
ON public.matches FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'scorer'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'scorer'));

-- Attendance
CREATE POLICY "Anyone can read attendance"
ON public.attendance FOR SELECT
USING (true);

CREATE POLICY "Scorers and admins can modify attendance"
ON public.attendance FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'scorer'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'scorer'));

-- ELO history
CREATE POLICY "Anyone can read elo_history"
ON public.elo_history FOR SELECT
USING (true);

CREATE POLICY "Scorers and admins can insert elo_history"
ON public.elo_history FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'scorer'));

-- user_roles policies
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Only admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6) Secure server-side ELO update and match completion
CREATE OR REPLACE FUNCTION public.record_match_result(_match_id uuid, _winner_ids uuid[], _k_factor int DEFAULT 32)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m record;
  p1 record; p2 record; p3 record; p4 record;
  team1_elo numeric; team2_elo numeric;
  win_is_team1 boolean;
  expected numeric;
  elo_change int;
BEGIN
  -- Authorization (scorer or admin)
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'scorer')) THEN
    RAISE EXCEPTION 'Not authorized to record results';
  END IF;

  -- Fetch and lock match
  SELECT * INTO m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF m.is_completed THEN RAISE EXCEPTION 'Match already completed'; END IF;

  IF m.match_type = 'singles' THEN
    IF array_length(_winner_ids,1) <> 1 THEN RAISE EXCEPTION 'Singles requires exactly one winner id'; END IF;

    SELECT * INTO p1 FROM public.players WHERE id = m.player1_id FOR UPDATE;
    SELECT * INTO p2 FROM public.players WHERE id = m.player2_id FOR UPDATE;

    IF NOT (_winner_ids[1] = p1.id OR _winner_ids[1] = p2.id) THEN
      RAISE EXCEPTION 'Winner must be one of the match players';
    END IF;

    -- If p1 wins
    expected := 1 / (1 + power(10, (p2.current_elo - p1.current_elo) / 400.0));
    IF _winner_ids[1] = p1.id THEN
      elo_change := round(_k_factor * (1 - expected));
      UPDATE public.players SET current_elo = current_elo + elo_change WHERE id = p1.id;
      UPDATE public.players SET current_elo = current_elo - elo_change WHERE id = p2.id;

      INSERT INTO public.elo_history (player_id, match_id, elo_before, elo_after, elo_change)
      VALUES (p1.id, m.id, p1.current_elo, p1.current_elo + elo_change, elo_change),
             (p2.id, m.id, p2.current_elo, p2.current_elo - elo_change, -elo_change);
    ELSE
      -- p2 wins
      expected := 1 / (1 + power(10, (p1.current_elo - p2.current_elo) / 400.0));
      elo_change := round(_k_factor * (1 - expected));
      UPDATE public.players SET current_elo = current_elo + elo_change WHERE id = p2.id;
      UPDATE public.players SET current_elo = current_elo - elo_change WHERE id = p1.id;

      INSERT INTO public.elo_history (player_id, match_id, elo_before, elo_after, elo_change)
      VALUES (p2.id, m.id, p2.current_elo, p2.current_elo + elo_change, elo_change),
             (p1.id, m.id, p1.current_elo, p1.current_elo - elo_change, -elo_change);
    END IF;
  ELSE
    -- Doubles
    IF array_length(_winner_ids,1) <> 2 THEN RAISE EXCEPTION 'Doubles requires two winner ids'; END IF;

    SELECT * INTO p1 FROM public.players WHERE id = m.player1_id FOR UPDATE;
    SELECT * INTO p4 FROM public.players WHERE id = m.player4_id FOR UPDATE;
    SELECT * INTO p2 FROM public.players WHERE id = m.player2_id FOR UPDATE;
    SELECT * INTO p3 FROM public.players WHERE id = m.player3_id FOR UPDATE;

    team1_elo := (p1.current_elo + p4.current_elo) / 2.0;
    team2_elo := (p2.current_elo + p3.current_elo) / 2.0;

    win_is_team1 := (_winner_ids @> ARRAY[p1.id::uuid] AND _winner_ids @> ARRAY[p4.id::uuid]);
    IF NOT (win_is_team1 OR (_winner_ids @> ARRAY[p2.id::uuid] AND _winner_ids @> ARRAY[p3.id::uuid])) THEN
      RAISE EXCEPTION 'Winner ids must match a valid team';
    END IF;

    IF win_is_team1 THEN
      expected := 1 / (1 + power(10, (team2_elo - team1_elo) / 400.0));
      elo_change := round(_k_factor * (1 - expected));
      UPDATE public.players SET current_elo = current_elo + elo_change WHERE id IN (p1.id, p4.id);
      UPDATE public.players SET current_elo = current_elo - elo_change WHERE id IN (p2.id, p3.id);

      INSERT INTO public.elo_history (player_id, match_id, elo_before, elo_after, elo_change) VALUES
        (p1.id, m.id, p1.current_elo, p1.current_elo + elo_change, elo_change),
        (p4.id, m.id, p4.current_elo, p4.current_elo + elo_change, elo_change),
        (p2.id, m.id, p2.current_elo, p2.current_elo - elo_change, -elo_change),
        (p3.id, m.id, p3.current_elo, p3.current_elo - elo_change, -elo_change);
    ELSE
      expected := 1 / (1 + power(10, (team1_elo - team2_elo) / 400.0));
      elo_change := round(_k_factor * (1 - expected));
      UPDATE public.players SET current_elo = current_elo + elo_change WHERE id IN (p2.id, p3.id);
      UPDATE public.players SET current_elo = current_elo - elo_change WHERE id IN (p1.id, p4.id);

      INSERT INTO public.elo_history (player_id, match_id, elo_before, elo_after, elo_change) VALUES
        (p2.id, m.id, p2.current_elo, p2.current_elo + elo_change, elo_change),
        (p3.id, m.id, p3.current_elo, p3.current_elo + elo_change, elo_change),
        (p1.id, m.id, p1.current_elo, p1.current_elo - elo_change, -elo_change),
        (p4.id, m.id, p4.current_elo, p4.current_elo - elo_change, -elo_change);
    END IF;
  END IF;

  -- Mark match complete
  UPDATE public.matches SET winner_ids = _winner_ids, is_completed = true WHERE id = m.id;
END;
$$;

-- 7) Restrict function execution to authenticated users
REVOKE ALL ON FUNCTION public.record_match_result(uuid, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_match_result(uuid, uuid[], int) TO authenticated;