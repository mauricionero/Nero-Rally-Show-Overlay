import React, { useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Trash2, Plus, Edit } from 'lucide-react';

const STAGE_TYPES = ['SS', 'Liaison', 'Service Park', 'Other'];

export default function StagesTab() {
  const {
    stages,
    currentStageId,
    setCurrentStageId,
    addStage,
    updateStage,
    deleteStage
  } = useRally();

  const [newStage, setNewStage] = useState({ name: '', type: 'SS', ssNumber: '', startTime: '' });
  const [editingStage, setEditingStage] = useState(null);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);

  const handleAddStage = () => {
    if (!newStage.name.trim()) {
      toast.error('Stage name is required');
      return;
    }
    addStage(newStage);
    setNewStage({ name: '', type: 'SS', ssNumber: '', startTime: '' });
    toast.success('Stage added successfully');
  };

  const handleUpdateStage = () => {
    if (!editingStage.name.trim()) {
      toast.error('Stage name is required');
      return;
    }
    updateStage(editingStage.id, editingStage);
    setEditingStage(null);
    setStageDialogOpen(false);
    toast.success('Stage updated successfully');
  };

  const sortedStages = [...stages].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  const currentStage = stages.find(s => s.id === currentStageId);

  return (
    <div className="space-y-4">
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Add New Stage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2">
              <Label className="text-white">Stage Name *</Label>
              <Input
                value={newStage.name}
                onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                placeholder="SS1 - Mountain Pass"
                className="bg-[#09090B] border-zinc-700 text-white"
                data-testid="input-stage-name"
              />
            </div>
            <div>
              <Label className="text-white">Type</Label>
              <Select value={newStage.type} onValueChange={(val) => setNewStage({ ...newStage, type: val })}>
                <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white">SS Number</Label>
              <Input
                value={newStage.ssNumber}
                onChange={(e) => setNewStage({ ...newStage, ssNumber: e.target.value })}
                placeholder="1"
                className="bg-[#09090B] border-zinc-700 text-white"
              />
            </div>
            <div>
              <Label className="text-white">Start Time (HH:MM)</Label>
              <Input
                value={newStage.startTime}
                onChange={(e) => setNewStage({ ...newStage, startTime: e.target.value })}
                placeholder="09:00"
                className="bg-[#09090B] border-zinc-700 text-white"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAddStage}
                className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90"
                data-testid="button-add-stage"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Current Stage</CardTitle>
          <CardDescription className="text-zinc-400">Select the stage currently being raced</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={currentStageId || ''} onValueChange={setCurrentStageId}>
            <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white" data-testid="select-current-stage">
              <SelectValue placeholder="Select current stage" />
            </SelectTrigger>
            <SelectContent>
              {sortedStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.ssNumber ? `SS${stage.ssNumber} - ` : ''}{stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentStage && (
            <p className="mt-2 text-[#FACC15] font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              LIVE: {currentStage.ssNumber ? `SS${currentStage.ssNumber} - ` : ''}{currentStage.name}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {sortedStages.map((stage) => (
          <Card key={stage.id} className="bg-[#18181B] border-zinc-800" data-testid={`stage-card-${stage.id}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-xl uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {stage.ssNumber && <span className="text-[#FF4500]">SS{stage.ssNumber}</span>} {stage.name}
                  </h3>
                  <div className="flex gap-4 mt-1 text-sm text-zinc-400">
                    <span>Type: {stage.type}</span>
                    {stage.startTime && <span>Start: {stage.startTime}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Dialog open={stageDialogOpen && editingStage?.id === stage.id} onOpenChange={(open) => {
                    setStageDialogOpen(open);
                    if (!open) setEditingStage(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingStage({ ...stage })}
                        className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                        data-testid={`button-edit-stage-${stage.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#18181B] border-zinc-800 text-white">
                      <DialogHeader>
                        <DialogTitle className="text-white">Edit Stage</DialogTitle>
                      </DialogHeader>
                      {editingStage && (
                        <div className="space-y-4">
                          <div>
                            <Label className="text-white">Stage Name *</Label>
                            <Input
                              value={editingStage.name}
                              onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-white">Type</Label>
                            <Select value={editingStage.type} onValueChange={(val) => setEditingStage({ ...editingStage, type: val })}>
                              <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STAGE_TYPES.map((type) => (
                                  <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-white">SS Number</Label>
                            <Input
                              value={editingStage.ssNumber}
                              onChange={(e) => setEditingStage({ ...editingStage, ssNumber: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-white">Start Time (HH:MM)</Label>
                            <Input
                              value={editingStage.startTime}
                              onChange={(e) => setEditingStage({ ...editingStage, startTime: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        <Button onClick={handleUpdateStage} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
                          Update Stage
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm('Delete this stage?')) {
                        deleteStage(stage.id);
                        toast.success('Stage deleted');
                      }
                    }}
                    className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    data-testid={`button-delete-stage-${stage.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stages.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No stages registered. Add your first stage above.
        </div>
      )}
    </div>
  );
}
