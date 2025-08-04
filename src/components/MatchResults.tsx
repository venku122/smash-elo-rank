import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CalendarIcon, Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  current_elo: number;
}

interface Match {
  id: string;
  court_number: number;
  match_type: 'singles' | 'doubles';
  player1_id: string;
  player2_id: string;
  player3_id?: string;
  player4_id?: string;
  winner_ids: string[];
  is_completed: boolean;
  session_date: string;
  players?: { [key: string]: Player };
}

export const MatchResults = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchMatches();
  }, [selectedDate]);

  const fetchMatches = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('session_date', dateStr)
        .order('court_number');

      if (error) throw error;

      // Fetch player details for each match
      const matchesWithPlayers = await Promise.all(
        (data || []).map(async (match) => {
          const playerIds = [
            match.player1_id,
            match.player2_id,
            match.player3_id,
            match.player4_id
          ].filter(Boolean);

          const { data: players, error: playersError } = await supabase
            .from('players')
            .select('*')
            .in('id', playerIds);

          if (playersError) throw playersError;

          const playersMap = players?.reduce((acc, player) => {
            acc[player.id] = player;
            return acc;
          }, {} as { [key: string]: Player }) || {};

          return { 
            ...match, 
            match_type: match.match_type as 'singles' | 'doubles',
            players: playersMap 
          };
        })
      );

      setMatches(matchesWithPlayers);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch matches",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateEloChange = (winnerElo: number, loserElo: number, kFactor = 32): number => {
    const expectedScore = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    return Math.round(kFactor * (1 - expectedScore));
  };

  const updateMatchResult = async (matchId: string, winnerIds: string[]) => {
    const match = matches.find(m => m.id === matchId);
    if (!match || !match.players) return;

    setIsSaving(true);
    
    try {
      // Update match with winner
      const { error: matchError } = await supabase
        .from('matches')
        .update({
          winner_ids: winnerIds,
          is_completed: true
        })
        .eq('id', matchId);

      if (matchError) throw matchError;

      // Calculate ELO changes
      const allPlayerIds = [
        match.player1_id,
        match.player2_id,
        match.player3_id,
        match.player4_id
      ].filter(Boolean);

      const eloUpdates = [];
      const eloHistory = [];

      if (match.match_type === 'singles') {
        const player1 = match.players[match.player1_id];
        const player2 = match.players[match.player2_id];
        const winner = winnerIds.includes(player1.id) ? player1 : player2;
        const loser = winnerIds.includes(player1.id) ? player2 : player1;

        const eloChange = calculateEloChange(winner.current_elo, loser.current_elo);

        eloUpdates.push(
          { id: winner.id, current_elo: winner.current_elo + eloChange },
          { id: loser.id, current_elo: loser.current_elo - eloChange }
        );

        eloHistory.push(
          {
            player_id: winner.id,
            match_id: matchId,
            elo_before: winner.current_elo,
            elo_after: winner.current_elo + eloChange,
            elo_change: eloChange
          },
          {
            player_id: loser.id,
            match_id: matchId,
            elo_before: loser.current_elo,
            elo_after: loser.current_elo - eloChange,
            elo_change: -eloChange
          }
        );
      } else {
        // Doubles logic
        const team1 = [match.players[match.player1_id], match.players[match.player4_id!]];
        const team2 = [match.players[match.player2_id], match.players[match.player3_id!]];
        
        const team1Elo = (team1[0].current_elo + team1[1].current_elo) / 2;
        const team2Elo = (team2[0].current_elo + team2[1].current_elo) / 2;
        
        const team1Wins = winnerIds.includes(team1[0].id);
        const winningTeam = team1Wins ? team1 : team2;
        const losingTeam = team1Wins ? team2 : team1;
        const winningElo = team1Wins ? team1Elo : team2Elo;
        const losingElo = team1Wins ? team2Elo : team1Elo;

        const eloChange = calculateEloChange(winningElo, losingElo);

        winningTeam.forEach(player => {
          eloUpdates.push({
            id: player.id,
            current_elo: player.current_elo + eloChange
          });
          eloHistory.push({
            player_id: player.id,
            match_id: matchId,
            elo_before: player.current_elo,
            elo_after: player.current_elo + eloChange,
            elo_change: eloChange
          });
        });

        losingTeam.forEach(player => {
          eloUpdates.push({
            id: player.id,
            current_elo: player.current_elo - eloChange
          });
          eloHistory.push({
            player_id: player.id,
            match_id: matchId,
            elo_before: player.current_elo,
            elo_after: player.current_elo - eloChange,
            elo_change: -eloChange
          });
        });
      }

      // Update player ELOs
      for (const update of eloUpdates) {
        const { error } = await supabase
          .from('players')
          .update({ current_elo: update.current_elo })
          .eq('id', update.id);
        
        if (error) throw error;
      }

      // Insert ELO history
      const { error: historyError } = await supabase
        .from('elo_history')
        .insert(eloHistory);

      if (historyError) throw historyError;

      toast({
        title: "Success",
        description: "Match result saved and ELO updated",
      });

      fetchMatches();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save match result",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getPlayerName = (match: Match, playerId: string): string => {
    return match.players?.[playerId]?.name || 'Unknown';
  };

  const isWinner = (match: Match, playerId: string): boolean => {
    return match.winner_ids.includes(playerId);
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading match results...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Match Results</h2>
        </div>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[240px] justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-4">
        {matches.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-muted-foreground">
              No matches found for {format(selectedDate, "MMMM d, yyyy")}
            </div>
          </Card>
        ) : (
          matches.map((match) => (
            <Card key={match.id} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Badge variant="secondary">Court {match.court_number}</Badge>
                <Badge variant={match.is_completed ? "default" : "outline"}>
                  {match.is_completed ? "Completed" : "Pending"}
                </Badge>
              </div>

              {match.match_type === 'singles' ? (
                <div className="grid grid-cols-3 items-center gap-4 mb-4">
                  <div className={`text-center p-3 rounded ${isWinner(match, match.player1_id) ? 'bg-green-50 dark:bg-green-950/20' : ''}`}>
                    <div className="font-medium">{getPlayerName(match, match.player1_id)}</div>
                    <div className="text-sm text-muted-foreground">
                      {match.players?.[match.player1_id]?.current_elo}
                    </div>
                    {isWinner(match, match.player1_id) && (
                      <Trophy className="h-4 w-4 text-yellow-500 mx-auto mt-1" />
                    )}
                  </div>
                  <div className="text-center text-sm font-bold text-muted-foreground">VS</div>
                  <div className={`text-center p-3 rounded ${isWinner(match, match.player2_id) ? 'bg-green-50 dark:bg-green-950/20' : ''}`}>
                    <div className="font-medium">{getPlayerName(match, match.player2_id)}</div>
                    <div className="text-sm text-muted-foreground">
                      {match.players?.[match.player2_id]?.current_elo}
                    </div>
                    {isWinner(match, match.player2_id) && (
                      <Trophy className="h-4 w-4 text-yellow-500 mx-auto mt-1" />
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 items-center gap-4 mb-4">
                  <div className={`text-center p-3 rounded ${isWinner(match, match.player1_id) ? 'bg-green-50 dark:bg-green-950/20' : ''}`}>
                    <div className="text-xs text-muted-foreground mb-1">Team 1</div>
                    <div className="font-medium text-sm">{getPlayerName(match, match.player1_id)}</div>
                    <div className="text-xs text-muted-foreground">{match.players?.[match.player1_id]?.current_elo}</div>
                    <div className="font-medium text-sm mt-1">{getPlayerName(match, match.player4_id!)}</div>
                    <div className="text-xs text-muted-foreground">{match.players?.[match.player4_id!]?.current_elo}</div>
                    {isWinner(match, match.player1_id) && (
                      <Trophy className="h-4 w-4 text-yellow-500 mx-auto mt-1" />
                    )}
                  </div>
                  <div className="text-center text-sm font-bold text-muted-foreground">VS</div>
                  <div className={`text-center p-3 rounded ${isWinner(match, match.player2_id) ? 'bg-green-50 dark:bg-green-950/20' : ''}`}>
                    <div className="text-xs text-muted-foreground mb-1">Team 2</div>
                    <div className="font-medium text-sm">{getPlayerName(match, match.player2_id)}</div>
                    <div className="text-xs text-muted-foreground">{match.players?.[match.player2_id]?.current_elo}</div>
                    <div className="font-medium text-sm mt-1">{getPlayerName(match, match.player3_id!)}</div>
                    <div className="text-xs text-muted-foreground">{match.players?.[match.player3_id!]?.current_elo}</div>
                    {isWinner(match, match.player2_id) && (
                      <Trophy className="h-4 w-4 text-yellow-500 mx-auto mt-1" />
                    )}
                  </div>
                </div>
              )}

              {!match.is_completed && (
                <div className="flex justify-center gap-2">
                  {match.match_type === 'singles' ? (
                    <>
                      <Button
                        onClick={() => updateMatchResult(match.id, [match.player1_id])}
                        disabled={isSaving}
                      >
                        {getPlayerName(match, match.player1_id)} Wins
                      </Button>
                      <Button
                        onClick={() => updateMatchResult(match.id, [match.player2_id])}
                        disabled={isSaving}
                      >
                        {getPlayerName(match, match.player2_id)} Wins
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => updateMatchResult(match.id, [match.player1_id, match.player4_id!])}
                        disabled={isSaving}
                      >
                        Team 1 Wins
                      </Button>
                      <Button
                        onClick={() => updateMatchResult(match.id, [match.player2_id, match.player3_id!])}
                        disabled={isSaving}
                      >
                        Team 2 Wins
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
};