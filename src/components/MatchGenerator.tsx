import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CalendarIcon, Shuffle, Target, Users, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  current_elo: number;
  is_active: boolean;
}

interface Match {
  id?: string;
  court_number: number;
  match_type: 'singles' | 'doubles';
  player1: Player;
  player2: Player;
  player3?: Player;
  player4?: Player;
  estimated_balance: number;
}

export const MatchGenerator = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [presentPlayers, setPresentPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [numberOfCourts, setNumberOfCourts] = useState(4);
  const [matchType, setMatchType] = useState<'singles' | 'doubles'>('doubles');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchPresentPlayers();
  }, [selectedDate]);

  const fetchPresentPlayers = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          player_id,
          players:player_id (
            id,
            name,
            current_elo,
            is_active
          )
        `)
        .eq('session_date', dateStr)
        .eq('present', true);

      if (error) throw error;

      const players = data
        ?.map(item => item.players)
        .filter((player): player is Player => player !== null && player.is_active)
        .sort((a, b) => b.current_elo - a.current_elo) || [];

      setPresentPlayers(players);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch present players",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateMatchBalance = (team1Elo: number, team2Elo: number): number => {
    return Math.abs(team1Elo - team2Elo);
  };

  const generateMatches = () => {
    if (presentPlayers.length < 2) {
      toast({
        title: "Error",
        description: "Need at least 2 players to generate matches",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    
    const playersPerMatch = matchType === 'singles' ? 2 : 4;
    const maxMatches = Math.min(numberOfCourts, Math.floor(presentPlayers.length / playersPerMatch));
    
    if (maxMatches === 0) {
      toast({
        title: "Error",
        description: `Need at least ${playersPerMatch} players for ${matchType} matches`,
        variant: "destructive",
      });
      setIsGenerating(false);
      return;
    }

    const newMatches: Match[] = [];
    const availablePlayers = [...presentPlayers];

    for (let court = 1; court <= maxMatches; court++) {
      if (availablePlayers.length < playersPerMatch) break;

      if (matchType === 'singles') {
        // For singles: pair players with similar ELO
        const player1 = availablePlayers.shift()!;
        const player2 = availablePlayers.shift()!;
        
        const balance = calculateMatchBalance(player1.current_elo, player2.current_elo);
        
        newMatches.push({
          court_number: court,
          match_type: 'singles',
          player1,
          player2,
          estimated_balance: balance
        });
      } else {
        // For doubles: create balanced teams
        const player1 = availablePlayers.shift()!;
        const player2 = availablePlayers.shift()!;
        const player3 = availablePlayers.shift()!;
        const player4 = availablePlayers.shift()!;

        // Team 1: player1 + player4, Team 2: player2 + player3
        const team1Elo = (player1.current_elo + player4.current_elo) / 2;
        const team2Elo = (player2.current_elo + player3.current_elo) / 2;
        const balance = calculateMatchBalance(team1Elo, team2Elo);

        newMatches.push({
          court_number: court,
          match_type: 'doubles',
          player1,
          player2,
          player3,
          player4,
          estimated_balance: balance
        });
      }
    }

    setMatches(newMatches);
    setIsGenerating(false);
    
    toast({
      title: "Success",
      description: `Generated ${newMatches.length} matches for ${newMatches.length * playersPerMatch} players`,
    });
  };

  const saveMatches = async () => {
    if (matches.length === 0) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const matchesToSave = matches.map(match => ({
        session_date: dateStr,
        court_number: match.court_number,
        match_type: match.match_type,
        player1_id: match.player1.id,
        player2_id: match.player2.id,
        player3_id: match.player3?.id || null,
        player4_id: match.player4?.id || null,
        winner_ids: [], // Empty array initially
        is_completed: false
      }));

      const { error } = await supabase
        .from('matches')
        .insert(matchesToSave);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Matches saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save matches",
        variant: "destructive",
      });
    }
  };

  const escapeHtml = (str: string) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const printMatches = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = `
      <html>
        <head>
          <title>Smash Champs - Match Sheet</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .match { border: 1px solid #ddd; margin: 15px 0; padding: 15px; border-radius: 8px; }
            .court { font-weight: bold; font-size: 18px; margin-bottom: 10px; }
            .players { margin: 10px 0; }
            .team { margin: 5px 0; }
            .vs { text-align: center; font-weight: bold; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Smash Champs</h1>
            <h2>Match Sheet - ${format(selectedDate, "EEEE, MMMM d, yyyy")}</h2>
            <p>${matches.length} ${matchType} matches scheduled</p>
          </div>
          ${matches.map(match => `
            <div class="match">
              <div class="court">Court ${match.court_number}</div>
              ${match.match_type === 'singles' ? `
                <div class="players">
                  <div>${escapeHtml(match.player1.name)} (${match.player1.current_elo})</div>
                  <div class="vs">VS</div>
                  <div>${escapeHtml(match.player2.name)} (${match.player2.current_elo})</div>
                </div>
              ` : `
                <div class="players">
                  <div class="team">Team 1: ${escapeHtml(match.player1.name)} (${match.player1.current_elo}) & ${escapeHtml(match.player4!.name)} (${match.player4!.current_elo})</div>
                  <div class="vs">VS</div>
                  <div class="team">Team 2: ${escapeHtml(match.player2.name)} (${match.player2.current_elo}) & ${escapeHtml(match.player3!.name)} (${match.player3!.current_elo})</div>
                </div>
              `}
              <div style="margin-top: 15px; font-size: 12px;">
                Winner: ________________
              </div>
            </div>
          `).join('')}
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading match generator...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Target className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Match Generator</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-1">
          <h3 className="text-lg font-semibold mb-4">Configuration</h3>
          <div className="space-y-4">
            <div>
              <Label>Session Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
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

            <div>
              <Label htmlFor="courts">Number of Courts</Label>
              <Input
                id="courts"
                type="number"
                min="1"
                max="10"
                value={numberOfCourts}
                onChange={(e) => setNumberOfCourts(parseInt(e.target.value) || 1)}
              />
            </div>

            <div>
              <Label>Match Type</Label>
              <Select value={matchType} onValueChange={(value: 'singles' | 'doubles') => setMatchType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="singles">Singles</SelectItem>
                  <SelectItem value="doubles">Doubles</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4">
              <div className="text-sm text-muted-foreground mb-2">
                <Users className="h-4 w-4 inline mr-1" />
                {presentPlayers.length} players present
              </div>
              <Button 
                onClick={generateMatches} 
                disabled={isGenerating || presentPlayers.length < 2}
                className="w-full"
              >
                <Shuffle className="h-4 w-4 mr-2" />
                {isGenerating ? "Generating..." : "Generate Matches"}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Generated Matches</h3>
            {matches.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={printMatches}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                <Button onClick={saveMatches}>
                  Save Matches
                </Button>
              </div>
            )}
          </div>

          {matches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No matches generated yet. Configure settings and click "Generate Matches".
            </div>
          ) : (
            <div className="space-y-4">
              {matches.map((match, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="secondary" className="text-sm">
                      Court {match.court_number}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Balance: {match.estimated_balance.toFixed(0)} ELO
                    </Badge>
                  </div>

                  {match.match_type === 'singles' ? (
                    <div className="grid grid-cols-3 items-center gap-4">
                      <div className="text-center">
                        <div className="font-medium">{match.player1.name}</div>
                        <div className="text-sm text-muted-foreground">{match.player1.current_elo}</div>
                      </div>
                      <div className="text-center text-sm font-bold text-muted-foreground">VS</div>
                      <div className="text-center">
                        <div className="font-medium">{match.player2.name}</div>
                        <div className="text-sm text-muted-foreground">{match.player2.current_elo}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 items-center gap-4">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">Team 1</div>
                        <div className="font-medium text-sm">{match.player1.name}</div>
                        <div className="text-xs text-muted-foreground">{match.player1.current_elo}</div>
                        <div className="font-medium text-sm mt-1">{match.player4!.name}</div>
                        <div className="text-xs text-muted-foreground">{match.player4!.current_elo}</div>
                      </div>
                      <div className="text-center text-sm font-bold text-muted-foreground">VS</div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">Team 2</div>
                        <div className="font-medium text-sm">{match.player2.name}</div>
                        <div className="text-xs text-muted-foreground">{match.player2.current_elo}</div>
                        <div className="font-medium text-sm mt-1">{match.player3!.name}</div>
                        <div className="text-xs text-muted-foreground">{match.player3!.current_elo}</div>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};