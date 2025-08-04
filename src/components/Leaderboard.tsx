import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { Crown, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Player {
  id: string;
  name: string;
  current_elo: number;
  is_active: boolean;
}

interface EloChange {
  player_id: string;
  elo_change: number;
}

export const Leaderboard = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [recentChanges, setRecentChanges] = useState<EloChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
    fetchRecentChanges();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('is_active', true)
        .order('current_elo', { ascending: false });

      if (error) throw error;
      setPlayers(data || []);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecentChanges = async () => {
    try {
      // Get the most recent ELO changes for each player (last 24 hours)
      const { data, error } = await supabase
        .from('elo_history')
        .select('player_id, elo_change')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Group by player_id and get the latest change
      const latestChanges: { [key: string]: number } = {};
      data?.forEach((change) => {
        if (!latestChanges[change.player_id]) {
          latestChanges[change.player_id] = change.elo_change;
        }
      });

      const changes = Object.entries(latestChanges).map(([player_id, elo_change]) => ({
        player_id,
        elo_change,
      }));

      setRecentChanges(changes);
    } catch (error) {
      console.error('Error fetching recent changes:', error);
    }
  };

  const getRecentChange = (playerId: string) => {
    return recentChanges.find(change => change.player_id === playerId)?.elo_change || 0;
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="h-5 w-5 text-yellow-500" />;
    return null;
  };

  const getRankBadge = (index: number) => {
    if (index < 3) {
      const colors = ["bg-yellow-100 text-yellow-800", "bg-gray-100 text-gray-800", "bg-orange-100 text-orange-800"];
      return <Badge className={colors[index]} variant="secondary">#{index + 1}</Badge>;
    }
    return <Badge variant="outline">#{index + 1}</Badge>;
  };

  const getEloChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading leaderboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Crown className="h-6 w-6 text-yellow-500" />
        <h2 className="text-2xl font-bold">Current Rankings</h2>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>ELO Rating</TableHead>
              <TableHead>Recent Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((player, index) => {
              const recentChange = getRecentChange(player.id);
              return (
                <TableRow key={player.id} className={index < 3 ? "bg-muted/30" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getRankIcon(index)}
                      {getRankBadge(index)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {player.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{player.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold">
                        {player.current_elo}
                      </span>
                      <Badge 
                        variant={player.current_elo >= 1200 ? "default" : 
                               player.current_elo >= 1000 ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {player.current_elo >= 1200 ? "Expert" : 
                         player.current_elo >= 1000 ? "Intermediate" : "Beginner"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getEloChangeIcon(recentChange)}
                      <span className={`font-mono text-sm ${
                        recentChange > 0 ? "text-green-600" : 
                        recentChange < 0 ? "text-red-600" : 
                        "text-muted-foreground"
                      }`}>
                        {recentChange > 0 ? "+" : ""}{recentChange || "0"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        
        {players.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No active players found. Add some players to see the rankings!
          </div>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        <p>ELO Rating System: Players start at 1000 points. Wins and losses adjust ratings based on opponent strength.</p>
      </div>
    </div>
  );
};