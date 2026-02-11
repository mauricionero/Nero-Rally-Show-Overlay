import React, { useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Trash2, Plus, Edit, Flag, Trophy, RotateCcw } from 'lucide-react';

const STAGE_TYPES = ['SS', 'Liaison', 'Service Park', 'Other'];
const RACE_TYPES = [
  { id: 'rally', name: 'Rally', description: 'Traditional point-to-point stages' },
  { id: 'lapRace', name: 'Lap Race', description: 'Circuit racing with multiple laps' },
  { id: 'rallyX', name: 'Rally X', description: 'Multiple short races with laps' }
];

export default function TheRaceTab() {
  const {
    raceType,
    setRaceType,
    eventName,
    setEventName,
    numberOfLaps,
    setNumberOfLaps,
    stages,
    currentStageId,
    setCurrentStageId,
    addStage,
    updateStage,
    deleteStage
  } = useRally();

  const [newStage, setNewStage] = useState({ name: '', type: 'SS', ssNumber: '', startTime: '', numberOfLaps: 5 });
  const [editingStage, setEditingStage] = useState(null);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);

  const handleAddStage = () => {
    if (!newStage.name.trim()) {
      toast.error('Stage/Race name is required');
      return;
    }
    addStage(newStage);
    setNewStage({ name: '', type: 'SS', ssNumber: '', startTime: '', numberOfLaps: 5 });
    toast.success(raceType === 'rally' ? 'Stage added successfully' : 'Race added successfully');
  };

  const handleUpdateStage = () => {
    if (!editingStage.name.trim()) {
      toast.error('Stage/Race name is required');
      return;
    }
    updateStage(editingStage.id, editingStage);
    setEditingStage(null);
    setStageDialogOpen(false);
    toast.success('Updated successfully');
  };

  const sortedStages = [...stages].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  const currentStage = stages.find(s => s.id === currentStageId);

  // For Lap Race, we treat it as having one implicit stage (the event itself)
  const isLapRace = raceType === 'lapRace';
  const isRallyX = raceType === 'rallyX';
  const isRally = raceType === 'rally';

  return (
    <div className="space-y-4">
      {/* Race Type Selector */}
      <Card className="bg-[#18181B] border-zinc-800 border-l-4 border-l-[#FF4500]">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Trophy className="w-5 h-5 text-[#FF4500]" />
            Race Type
          </CardTitle>
          <CardDescription className="text-zinc-400">Select the type of racing event</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {RACE_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setRaceType(type.id)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  raceType === type.id
                    ? 'border-[#FF4500] bg-[#FF4500]/10'
                    : 'border-zinc-700 hover:border-zinc-500'
                }`}
                data-testid={`race-type-${type.id}`}
              >
                <h3 className="font-bold text-lg uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {type.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-1">{type.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Event Name */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Event Name</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="e.g., Rally Monte Carlo 2025"
            className="bg-[#09090B] border-zinc-700 text-white text-lg"
            data-testid="input-event-name"
          />
        </CardContent>
      </Card>

      {/* Lap Race - Number of Laps */}
      {isLapRace && (
        <Card className="bg-[#18181B] border-zinc-800">
          <CardHeader>
            <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              <RotateCcw className="w-5 h-5" />
              Number of Laps
            </CardTitle>
            <CardDescription className="text-zinc-400">Set the total number of laps for this race</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Input
                type="number"
                min="1"
                max="999"
                value={numberOfLaps}
                onChange={(e) => setNumberOfLaps(parseInt(e.target.value) || 1)}
                className="bg-[#09090B] border-zinc-700 text-white w-32 text-center text-2xl font-bold"
                data-testid="input-number-of-laps"
              />
              <span className="text-zinc-400">laps</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rally / RallyX - Stage Management */}
      {(isRally || isRallyX) && (
        <>
          {/* Add New Stage/Race */}
          <Card className="bg-[#18181B] border-zinc-800">
            <CardHeader>
              <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                <Flag className="w-5 h-5" />
                {isRallyX ? 'Add New Race' : 'Add New Stage'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="md:col-span-2">
                  <Label className="text-white">{isRallyX ? 'Race Name *' : 'Stage Name *'}</Label>
                  <Input
                    value={newStage.name}
                    onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                    placeholder={isRallyX ? 'Heat 1' : 'SS1 - Mountain Pass'}
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
                {isRally && (
                  <div>
                    <Label className="text-white">SS Number</Label>
                    <Input
                      value={newStage.ssNumber}
                      onChange={(e) => setNewStage({ ...newStage, ssNumber: e.target.value })}
                      placeholder="1"
                      className="bg-[#09090B] border-zinc-700 text-white"
                    />
                  </div>
                )}
                {isRallyX && newStage.type === 'SS' && (
                  <div>
                    <Label className="text-white">Number of Laps</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newStage.numberOfLaps}
                      onChange={(e) => setNewStage({ ...newStage, numberOfLaps: parseInt(e.target.value) || 1 })}
                      placeholder="5"
                      className="bg-[#09090B] border-zinc-700 text-white"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-white">Start Time</Label>
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

          {/* Current Stage Selector */}
          <Card className="bg-[#18181B] border-zinc-800">
            <CardHeader>
              <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {isRallyX ? 'Current Race' : 'Current Stage'}
              </CardTitle>
              <CardDescription className="text-zinc-400">
                {isRallyX ? 'Select the race currently being run' : 'Select the stage currently being raced'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={currentStageId || ''} onValueChange={setCurrentStageId}>
                <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white" data-testid="select-current-stage">
                  <SelectValue placeholder={isRallyX ? 'Select current race' : 'Select current stage'} />
                </SelectTrigger>
                <SelectContent>
                  {sortedStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {isRally && stage.ssNumber ? `SS${stage.ssNumber} - ` : ''}{stage.name}
                      {isRallyX && stage.type === 'SS' && stage.numberOfLaps ? ` (${stage.numberOfLaps} laps)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentStage && (
                <p className="mt-2 text-[#FACC15] font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  LIVE: {isRally && currentStage.ssNumber ? `SS${currentStage.ssNumber} - ` : ''}{currentStage.name}
                  {isRallyX && currentStage.type === 'SS' && currentStage.numberOfLaps ? ` (${currentStage.numberOfLaps} laps)` : ''}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Stages/Races List */}
          <div className="space-y-2">
            {sortedStages.map((stage) => (
              <Card key={stage.id} className="bg-[#18181B] border-zinc-800" data-testid={`stage-card-${stage.id}`}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold text-xl uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {isRally && stage.ssNumber && <span className="text-[#FF4500]">SS{stage.ssNumber}</span>} {stage.name}
                      </h3>
                      <div className="flex gap-4 mt-1 text-sm text-zinc-400">
                        <span>Type: {stage.type}</span>
                        {stage.startTime && <span>Start: {stage.startTime}</span>}
                        {isRallyX && stage.type === 'SS' && stage.numberOfLaps && (
                          <span className="text-[#FF4500]">{stage.numberOfLaps} laps</span>
                        )}
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
                            <DialogTitle className="text-white">{isRallyX ? 'Edit Race' : 'Edit Stage'}</DialogTitle>
                          </DialogHeader>
                          {editingStage && (
                            <div className="space-y-4">
                              <div>
                                <Label className="text-white">{isRallyX ? 'Race Name *' : 'Stage Name *'}</Label>
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
                              {isRally && (
                                <div>
                                  <Label className="text-white">SS Number</Label>
                                  <Input
                                    value={editingStage.ssNumber}
                                    onChange={(e) => setEditingStage({ ...editingStage, ssNumber: e.target.value })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                              )}
                              {isRallyX && editingStage.type === 'SS' && (
                                <div>
                                  <Label className="text-white">Number of Laps</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={editingStage.numberOfLaps || ''}
                                    onChange={(e) => setEditingStage({ ...editingStage, numberOfLaps: parseInt(e.target.value) || 1 })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                              )}
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
                              Update
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(`Delete this ${isRallyX ? 'race' : 'stage'}?`)) {
                            deleteStage(stage.id);
                            toast.success('Deleted successfully');
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
              No {isRallyX ? 'races' : 'stages'} registered. Add your first {isRallyX ? 'race' : 'stage'} above.
            </div>
          )}
        </>
      )}

      {/* Lap Race Info */}
      {isLapRace && (
        <Card className="bg-[#09090B] border-zinc-800 border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-zinc-400">
              Lap Race mode uses the event name as the race identifier.
            </p>
            <p className="text-zinc-500 text-sm mt-2">
              Configure pilots in the Pilots tab and record lap times in the Times tab.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
