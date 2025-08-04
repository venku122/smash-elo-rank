import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayerManagement } from "@/components/PlayerManagement";
import { AttendanceTracker } from "@/components/AttendanceTracker";
import { MatchGenerator } from "@/components/MatchGenerator";
import { MatchResults } from "@/components/MatchResults";
import { Leaderboard } from "@/components/Leaderboard";
import { PlayerStats } from "@/components/PlayerStats";

const Index = () => {
  const [activeTab, setActiveTab] = useState("leaderboard");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent mb-2">
            Smash Champs
          </h1>
          <p className="text-xl text-muted-foreground">
            ELO Rating System for Badminton
          </p>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-8">
            <TabsTrigger value="leaderboard">Rankings</TabsTrigger>
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="matches">Generate</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
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
