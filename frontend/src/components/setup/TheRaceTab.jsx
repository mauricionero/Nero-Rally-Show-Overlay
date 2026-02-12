import React, { useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Trash2, Plus, Edit, Flag, Trophy, RotateCcw, Timer, Car } from 'lucide-react';

export default function TheRaceTab() {
  const { t } = useTranslation();
  const {
    eventName,
    setEventName,
    stages,
    currentStageId,
    setCurrentStageId,
    addStage,
    updateStage,
    deleteStage
  } = useRally();

  const STAGE_TYPES = [
    { id: 'SS', name: t('theRace.stageTypes.ss'), description: 'Point-to-point timed stage', icon: Flag },
    { id: 'Lap Race', name: t('theRace.stageTypes.lapRace'), description: 'Circuit racing with multiple laps', icon: RotateCcw },
    { id: 'Liaison', name: t('theRace.stageTypes.liaison'), description: 'Transfer section between stages', icon: Car },
    { id: 'Service Park', name: t('theRace.stageTypes.servicePark'), description: 'Service/repair period', icon: Timer }
  ];

  const [newStage, setNewStage] = useState({ name: '', type: 'SS', ssNumber: '', startTime: '', numberOfLaps: 5 });
  const [editingStage, setEditingStage] = useState(null);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);

  const handleAddStage = () => {
    if (!newStage.name.trim()) {
      toast.error(t('theRace.stageName') + ' is required');
      return;
    }
    addStage(newStage);
    setNewStage({ name: '', type: 'SS', ssNumber: '', startTime: '', numberOfLaps: 5 });
    toast.success('Stage added successfully');
  };

  const handleUpdateStage = () => {
    if (!editingStage.name.trim()) {
      toast.error(t('theRace.stageName') + ' is required');
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
  const isLapRaceType = newStage.type === 'Lap Race';
  const isSSType = newStage.type === 'SS';

  const getStageTypeIcon = (type) => {
    const stageType = STAGE_TYPES.find(t => t.id === type);
    return stageType?.icon || Flag;
  };

  const getStageTypeColor = (type) => {
    switch (type) {
      case 'SS': return 'text-[#FF4500]';
      case 'Lap Race': return 'text-[#FACC15]';
      case 'Liaison': return 'text-blue-400';
      case 'Service Park': return 'text-green-400';
      default: return 'text-zinc-400';
    }
  };

  return (
    <div className="space-y-4">
      {/* Event Name */}
      <Card className="bg-[#18181B] border-zinc-800 border-l-4 border-l-[#FF4500]">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Trophy className="w-5 h-5 text-[#FF4500]" />
            {t('theRace.eventName')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder={t('theRace.eventNamePlaceholder')}
            className="bg-[#09090B] border-zinc-700 text-white text-lg"
            data-testid="input-event-name"
          />
        </CardContent>
      </Card>

      {/* Add New Stage */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Plus className="w-5 h-5" />
            {t('theRace.addNewStage')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stage Type Selector */}
          <div>
            <Label className="text-white mb-2 block">{t('theRace.stageType')}</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {STAGE_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setNewStage({ ...newStage, type: type.id })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      newStage.type === type.id
                        ? 'border-[#FF4500] bg-[#FF4500]/10'
                        : 'border-zinc-700 hover:border-zinc-500'
                    }`}
                    data-testid={`stage-type-${type.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${getStageTypeColor(type.id)}`} />
                      <span className="font-bold text-sm text-white">{type.id}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{type.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stage Details Form */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <Label className="text-white">{t('theRace.stageName')} *</Label>
              <Input
                value={newStage.name}
                onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                placeholder={t('theRace.placeholder.stageName')}
                className="bg-[#09090B] border-zinc-700 text-white"
                data-testid="input-stage-name"
              />
            </div>
            
            {isSSType && (
              <div>
                <Label className="text-white">{t('theRace.ssNumber')}</Label>
                <Input
                  value={newStage.ssNumber}
                  onChange={(e) => setNewStage({ ...newStage, ssNumber: e.target.value })}
                  placeholder={t('theRace.placeholder.ssNumber')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                />
              </div>
            )}
            
            {isLapRaceType && (
              <div>
                <Label className="text-white">{t('theRace.numberOfLaps')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={newStage.numberOfLaps}
                  onChange={(e) => setNewStage({ ...newStage, numberOfLaps: parseInt(e.target.value) || 1 })}
                  placeholder={t('theRace.placeholder.laps')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                />
              </div>
            )}
            
            <div>
              <Label className="text-white">{t('theRace.scheduledStart')}</Label>
              <Input
                value={newStage.startTime}
                onChange={(e) => setNewStage({ ...newStage, startTime: e.target.value })}
                placeholder={t('theRace.placeholder.time')}
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
                {t('theRace.addStage')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Stage Selector */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {t('scene1.currentStage')} (Live)
          </CardTitle>
          <CardDescription className="text-zinc-400">
            {t('common.select')} - affects overlay display
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={currentStageId || ''} onValueChange={setCurrentStageId}>
            <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white" data-testid="select-current-stage">
              <SelectValue placeholder={t('common.select')} />
            </SelectTrigger>
            <SelectContent>
              {sortedStages.map((stage) => {
                const Icon = getStageTypeIcon(stage.type);
                return (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${getStageTypeColor(stage.type)}`} />
                      {stage.type === 'SS' && stage.ssNumber ? `SS${stage.ssNumber} - ` : ''}
                      {stage.name}
                      {stage.type === 'Lap Race' && ` (${stage.numberOfLaps} ${t('scene3.laps').toLowerCase()})`}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {currentStage && (
            <p className="mt-2 text-[#FACC15] font-bold flex items-center gap-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <span className="w-2 h-2 bg-[#FACC15] rounded-full animate-pulse" />
              LIVE: {currentStage.type === 'SS' && currentStage.ssNumber ? `SS${currentStage.ssNumber} - ` : ''}{currentStage.name}
              {currentStage.type === 'Lap Race' && ` (${currentStage.numberOfLaps} ${t('scene3.laps').toLowerCase()})`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stages List */}
      <div className="space-y-2">
        {sortedStages.map((stage) => {
          const Icon = getStageTypeIcon(stage.type);
          const isEditing = stageDialogOpen && editingStage?.id === stage.id;
          
          return (
            <Card 
              key={stage.id} 
              className={`bg-[#18181B] border-zinc-800 ${stage.id === currentStageId ? 'border-l-4 border-l-[#FACC15]' : ''}`}
              data-testid={`stage-card-${stage.id}`}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-5 h-5 ${getStageTypeColor(stage.type)}`} />
                      <h3 className="font-bold text-xl uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {stage.type === 'SS' && stage.ssNumber && <span className="text-[#FF4500]">SS{stage.ssNumber} </span>}
                        {stage.name}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${getStageTypeColor(stage.type)} bg-white/5`}>
                        {stage.type}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-1 text-sm text-zinc-400">
                      {stage.startTime && <span>{t('status.start')}: {stage.startTime}</span>}
                      {stage.type === 'Lap Race' && (
                        <span className="text-[#FACC15]">{stage.numberOfLaps} {t('scene3.laps').toLowerCase()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Dialog open={isEditing} onOpenChange={(open) => {
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
                          <DialogTitle className="text-white">{t('common.edit')} Stage</DialogTitle>
                        </DialogHeader>
                        {editingStage && (
                          <div className="space-y-4">
                            <div>
                              <Label className="text-white">{t('theRace.stageType')}</Label>
                              <Select value={editingStage.type} onValueChange={(val) => setEditingStage({ ...editingStage, type: val })}>
                                <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STAGE_TYPES.map((type) => (
                                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-white">{t('theRace.stageName')} *</Label>
                              <Input
                                value={editingStage.name}
                                onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                            {editingStage.type === 'SS' && (
                              <div>
                                <Label className="text-white">{t('theRace.ssNumber')}</Label>
                                <Input
                                  value={editingStage.ssNumber || ''}
                                  onChange={(e) => setEditingStage({ ...editingStage, ssNumber: e.target.value })}
                                  className="bg-[#09090B] border-zinc-700 text-white"
                                />
                              </div>
                            )}
                            {editingStage.type === 'Lap Race' && (
                              <div>
                                <Label className="text-white">{t('theRace.numberOfLaps')}</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={editingStage.numberOfLaps || 5}
                                  onChange={(e) => setEditingStage({ ...editingStage, numberOfLaps: parseInt(e.target.value) || 1 })}
                                  className="bg-[#09090B] border-zinc-700 text-white"
                                />
                              </div>
                            )}
                            <div>
                              <Label className="text-white">{t('theRace.scheduledStart')}</Label>
                              <Input
                                value={editingStage.startTime || ''}
                                onChange={(e) => setEditingStage({ ...editingStage, startTime: e.target.value })}
                                placeholder={t('theRace.placeholder.time')}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                          </div>
                        )}
                        <DialogFooter>
                          <Button onClick={handleUpdateStage} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
                            {t('common.save')}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (window.confirm(t('common.delete') + '?')) {
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
          );
        })}
      </div>

      {stages.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          {t('theRace.noStages')}
        </div>
      )}
    </div>
  );
}
