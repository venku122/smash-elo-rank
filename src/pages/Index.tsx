import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayerManagement } from "@/components/PlayerManagement";
import { AttendanceTracker } from "@/components/AttendanceTracker";
import { MatchGenerator } from "@/components/MatchGenerator";
import { MatchResults } from "@/components/MatchResults";
import { Leaderboard } from "@/components/Leaderboard";
import { PlayerStats } from "@/components/PlayerStats";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
const Index = () => {
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (sess?.user) {
        setTimeout(() => {
          supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', sess.user.id)
            .then(({ data }) => setRoles(data?.map((r: any) => r.role) ?? []));
        }, 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .then(({ data }) => setRoles(data?.map((r: any) => r.role) ?? []));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAdmin = roles.includes('admin');
  const isScorer = isAdmin || roles.includes('scorer');
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div className="text-center mx-auto">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent mb-2">
                Smash Champs
              </h1>
              <p className="text-xl text-muted-foreground">
                ELO Rating System for Badminton
              </p>
            </div>
            <div className="ml-4">
              {session ? (
                <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button>
              ) : (
                <Button asChild variant="outline"><Link to="/auth">Sign in</Link></Button>
              )}
            </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-8">
            <TabsTrigger value="leaderboard">Rankings</TabsTrigger>
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="matches">Generate</TabsTrigger>
            <TabsTrigger value="results">Enter Results</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard">
            <Card className="p-6">
              <Leaderboard />
            </Card>
          </TabsContent>

          <TabsContent value="players">
            <Card className="p-6">
              <PlayerManagement />
            </Card>
          </TabsContent>

          <TabsContent value="attendance">
            <Card className="p-6">
              <AttendanceTracker />
            </Card>
          </TabsContent>

          <TabsContent value="matches">
            <Card className="p-6">
              <MatchGenerator />
            </Card>
          </TabsContent>

          <TabsContent value="results">
            <Card className="p-6">
              <MatchResults />
            </Card>
          </TabsContent>

          <TabsContent value="stats">
            <Card className="p-6">
              <PlayerStats />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
