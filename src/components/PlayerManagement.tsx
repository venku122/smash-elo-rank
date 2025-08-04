import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Edit, Trash2, Plus, UserCheck, UserX } from "lucide-react";

interface Player {
  id: string;
  name: string;
  current_elo: number;
  is_active: boolean;
  created_at: string;
}

export const PlayerManagement = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [newPlayerName, setNewPlayerName] = useState("");

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('current_elo', { ascending: false });

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

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return;

    try {
      const { error } = await supabase
        .from('players')
        .insert([{ name: newPlayerName.trim() }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Player added successfully",
      });

      setNewPlayerName("");
      setIsDialogOpen(false);
      fetchPlayers();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add player",
        variant: "destructive",
      });
    }
  };

  const handleUpdatePlayer = async (id: string, updates: Partial<Player>) => {
    try {
      const { error } = await supabase
        .from('players')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Player updated successfully",
      });

      fetchPlayers();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update player",
        variant: "destructive",
      });
    }
  };

  const handleDeletePlayer = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('players')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Player deleted successfully",
      });

      fetchPlayers();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete player",
        variant: "destructive",
      });
    }
  };

  const resetDialog = () => {
    setEditingPlayer(null);
    setNewPlayerName("");
    setIsDialogOpen(false);
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading players...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Player Management</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Player
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingPlayer ? "Edit Player" : "Add New Player"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={editingPlayer ? editingPlayer.name : newPlayerName}
                  onChange={(e) => {
                    if (editingPlayer) {
                      setEditingPlayer({ ...editingPlayer, name: e.target.value });
                    } else {
                      setNewPlayerName(e.target.value);
                    }
                  }}
                  placeholder="Enter player name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={editingPlayer ? 
                    () => handleUpdatePlayer(editingPlayer.id, { name: editingPlayer.name }) :
                    handleAddPlayer
                  }
                >
                  {editingPlayer ? "Update" : "Add"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>ELO Rating</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((player) => (
              <TableRow key={player.id}>
                <TableCell className="font-medium">{player.name}</TableCell>
                <TableCell>
                  <span className="font-mono text-sm bg-secondary px-2 py-1 rounded">
                    {player.current_elo}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {player.is_active ? (
                      <UserCheck className="h-4 w-4 text-green-500" />
                    ) : (
                      <UserX className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Switch
                      checked={player.is_active}
                      onCheckedChange={(checked) => 
                        handleUpdatePlayer(player.id, { is_active: checked })
                      }
                    />
                  </div>
                </TableCell>
                <TableCell>
                  {new Date(player.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingPlayer(player);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeletePlayer(player.id, player.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {players.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No players found. Add your first player to get started!
          </div>
        )}
      </div>
    </div>
  );
};