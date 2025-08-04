import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CalendarIcon, Users, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  is_active: boolean;
}

interface AttendanceRecord {
  id: string;
  player_id: string;
  session_date: string;
  present: boolean;
  player?: Player;
}

export const AttendanceTracker = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchAttendance();
    }
  }, [selectedDate]);

  const fetchPlayers = async () => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setPlayers(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch players",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAttendance = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          players:player_id (
            id,
            name,
            is_active
          )
        `)
        .eq('session_date', dateStr);

      if (error) throw error;
      setAttendance(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch attendance",
        variant: "destructive",
      });
    }
  };

  const toggleAttendance = async (playerId: string, present: boolean) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    try {
      setIsSaving(true);
      
      // Check if attendance record exists
      const existingRecord = attendance.find(a => a.player_id === playerId);
      
      if (existingRecord) {
        // Update existing record
        const { error } = await supabase
          .from('attendance')
          .update({ present })
          .eq('id', existingRecord.id);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('attendance')
          .insert([{
            player_id: playerId,
            session_date: dateStr,
            present
          }]);

        if (error) throw error;
      }

      await fetchAttendance();
      
      toast({
        title: "Success",
        description: "Attendance updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update attendance",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isPlayerPresent = (playerId: string) => {
    const record = attendance.find(a => a.player_id === playerId);
    return record?.present || false;
  };

  const getPresentCount = () => {
    return attendance.filter(a => a.present).length;
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading attendance tracker...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Attendance Tracker</h2>
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

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Session: {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserCheck className="h-4 w-4" />
            <span>{getPresentCount()} of {players.length} players present</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {players.map((player) => (
            <Card key={player.id} className="p-4">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id={`player-${player.id}`}
                  checked={isPlayerPresent(player.id)}
                  onCheckedChange={(checked) => 
                    toggleAttendance(player.id, checked as boolean)
                  }
                  disabled={isSaving}
                />
                <Label 
                  htmlFor={`player-${player.id}`}
                  className="text-sm font-medium cursor-pointer flex-1"
                >
                  {player.name}
                </Label>
                {isPlayerPresent(player.id) && (
                  <UserCheck className="h-4 w-4 text-green-500" />
                )}
              </div>
            </Card>
          ))}
        </div>

        {players.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No active players found. Add some players first!
          </div>
        )}
      </Card>

      {getPresentCount() > 0 && (
        <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <UserCheck className="h-5 w-5" />
            <span className="font-medium">
              Ready for matches! {getPresentCount()} players are present today.
            </span>
          </div>
        </Card>
      )}
    </div>
  );
};