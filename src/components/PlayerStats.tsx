import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, TrendingUp, TrendingDown, Trophy, Target } from "lucide-react";

interface Player {
  id: string;
  name: string;
  current_elo: number;
}

interface EloHistory {
  id: string;
  player_id: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  created_at: string;
  match_id: string;
}

interface PlayerStats {
  player: Player;
  matches_played: number;
  matches_won: number;
  win_percentage: number;
  highest_elo: number;
  lowest_elo: number;
  total_elo_change: number;
  recent_form: number[];
}

export const PlayerStats = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [eloHistory, setEloHistory] = useState<EloHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (selectedPlayer) {
      fetchPlayerStats(selectedPlayer);
      fetchEloHistory(selectedPlayer);
    }
  }, [selectedPlayer]);

  const fetchPlayers = async () => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setPlayers(data || []);
      
      if (data && data.length > 0) {
        setSelectedPlayer(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlayerStats = async (playerId: string) => {
    try {
      const player = players.find(p => p.id === playerId);
      if (!player) return;

      // Get all matches for this player
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('*')
        .or(`player1_id.eq.${playerId},player2_id.eq.${playerId},player3_id.eq.${playerId},player4_id.eq.${playerId}`)
        .eq('is_completed', true);

      if (matchesError) throw matchesError;

      // Calculate wins
      const wins = matches?.filter(match => 
        match.winner_ids.includes(playerId)
      ).length || 0;

      const totalMatches = matches?.length || 0;
      const winPercentage = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

      // Get ELO history for min/max
      const { data: history, error: historyError } = await supabase
        .from('elo_history')
        .select('*')
        .eq('player_id', playerId)
        .order('created_at');

      if (historyError) throw historyError;

      const eloValues = history?.map(h => h.elo_after) || [player.current_elo];
      const highestElo = Math.max(...eloValues, player.current_elo);
      const lowestElo = Math.min(...eloValues, 1000); // Starting ELO is 1000

      const totalEloChange = player.current_elo - 1000;

      // Recent form (last 5 matches)
      const recentHistory = history?.slice(-5) || [];
      const recentForm = recentHistory.map(h => h.elo_change);

      setPlayerStats({
        player,
        matches_played: totalMatches,
        matches_won: wins,
        win_percentage: winPercentage,
        highest_elo: highestElo,
        lowest_elo: lowestElo,
        total_elo_change: totalEloChange,
        recent_form: recentForm
      });
    } catch (error) {
      console.error('Error fetching player stats:', error);
    }
  };

  const fetchEloHistory = async (playerId: string) => {
    try {
      const { data, error } = await supabase
        .from('elo_history')
        .select('*')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setEloHistory(data || []);
    } catch (error) {
      console.error('Error fetching ELO history:', error);
    }
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return "text-green-600";
    if (change < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading player stats...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Player Statistics</h2>
        </div>
        
        <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select a player" />
          </SelectTrigger>
          <SelectContent>
            {players.map((player) => (
              <SelectItem key={player.id} value={player.id}>
                {player.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {playerStats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {playerStats.player.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold">{playerStats.player.name}</div>
                  <div className="text-sm text-muted-foreground">Current ELO</div>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono">
                {playerStats.player.current_elo}
              </div>
              <div className="flex items-center gap-1 mt-2">
                {getChangeIcon(playerStats.total_elo_change)}
                <span className={`text-sm ${getChangeColor(playerStats.total_elo_change)}`}>
                  {playerStats.total_elo_change > 0 ? "+" : ""}{playerStats.total_elo_change} from start
                </span>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <div className="text-sm text-muted-foreground">Matches</div>
              </div>
              <div className="text-2xl font-bold">
                {playerStats.matches_won}/{playerStats.matches_played}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {playerStats.win_percentage.toFixed(1)}% win rate
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <div className="text-sm text-muted-foreground">Peak ELO</div>
              </div>
              <div className="text-2xl font-bold font-mono">
                {playerStats.highest_elo}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Personal best
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-blue-500" />
                <div className="text-sm text-muted-foreground">Recent Form</div>
              </div>
              <div className="flex gap-1 mt-2">
                {playerStats.recent_form.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No recent matches</span>
                ) : (
                  playerStats.recent_form.map((change, index) => (
                    <Badge
                      key={index}
                      variant={change > 0 ? "default" : change < 0 ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {change > 0 ? "+" : ""}{change}
                    </Badge>
                  ))
                )}
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent ELO History</h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                    <TableHead>Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eloHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {new Date(entry.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono">
                        {entry.elo_before}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">
                        {entry.elo_after}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getChangeIcon(entry.elo_change)}
                          <span className={`font-mono ${getChangeColor(entry.elo_change)}`}>
                            {entry.elo_change > 0 ? "+" : ""}{entry.elo_change}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {eloHistory.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No match history found for this player.
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {players.length === 0 && (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground">
            No active players found. Add some players to view statistics!
          </div>
        </Card>
      )}
    </div>
  );
};