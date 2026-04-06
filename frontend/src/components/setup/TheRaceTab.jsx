import React, { useMemo, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { Trash2, Plus, Edit, Flag, Trophy, RotateCcw, Timer, Car } from 'lucide-react';
import { compareStagesBySchedule, formatStageScheduleRange } from '../../utils/stageSchedule.js';
import CurrentStageCard from './CurrentStageCard.jsx';
import {
  getStageNumberLabel,
  isLapRaceStageType,
  isSpecialStageType,
  isTransitStageType,
  SUPER_PRIME_STAGE_TYPE
} from '../../utils/stageTypes.js';

const formatScheduledStartInput = (value) => {
  const digits = value.replace(/\D/g, '').slice(-4);

  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const getTodayDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultStageDate = (stages) => {
  const lastFilledDate = [...stages].reverse().find((stage) => stage.date)?.date;
  return lastFilledDate || getTodayDateString();
};

const DEFAULT_LAP_RACE_TOTAL_TIME_MODE = 'cumulative';

const formatEditableDateInput = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const formatDateForEditing = (value) => {
  if (!value) return '';

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  return formatEditableDateInput(value);
};

const normalizeEditedDate = (value) => {
  if (!value) return '';

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return value;

  const displayMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (displayMatch) {
    return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
  }

  return null;
};

export default function TheRaceTab() {
  const { t } = useTranslation();
  const {
    eventName,
    setEventName,
    stages,
    mapPlacemarks,
    currentStageId,
    addStage,
    updateStage,
    deleteStage
  } = useRally();

  const mapPlacemarkOptions = useMemo(
    () => [...mapPlacemarks].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [mapPlacemarks]
  );

  const STAGE_TYPES = [
    { id: 'SS', name: t('theRace.stageTypes.ss'), description: 'Point-to-point timed stage', icon: Flag },
    { id: SUPER_PRIME_STAGE_TYPE, name: t('theRace.stageTypes.superPrime'), description: 'Head-to-head timed stage with manual starts', icon: Flag },
    { id: 'Lap Race', name: t('theRace.stageTypes.lapRace'), description: 'Circuit racing with multiple laps', icon: RotateCcw },
    { id: 'Liaison', name: t('theRace.stageTypes.liaison'), description: 'Transfer section between stages', icon: Car },
    { id: 'Service Park', name: t('theRace.stageTypes.servicePark'), description: 'Service/repair period', icon: Timer }
  ];

  const defaultStageDate = getDefaultStageDate(stages);

  const [newStage, setNewStage] = useState({ name: '', type: 'SS', ssNumber: '', date: defaultStageDate, distance: '', startTime: '', endTime: '', mapPlacemarkId: '', numberOfLaps: '', lapRaceTotalTimeMode: DEFAULT_LAP_RACE_TOTAL_TIME_MODE, lapRaceMaxTimeMinutes: '', lapRaceVariableLaps: false });
  const [editingStage, setEditingStage] = useState(null);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);

  const handleAddStage = () => {
    if (!newStage.name.trim()) {
      toast.error(t('theRace.stageName') + ' is required');
      return;
    }
    addStage(newStage);
    setNewStage({ name: '', type: 'SS', ssNumber: '', date: newStage.date || defaultStageDate, distance: '', startTime: '', endTime: '', mapPlacemarkId: '', numberOfLaps: '', lapRaceTotalTimeMode: DEFAULT_LAP_RACE_TOTAL_TIME_MODE, lapRaceMaxTimeMinutes: '', lapRaceVariableLaps: false });
    toast.success('Stage added successfully');
  };

  const handleUpdateStage = () => {
    if (!editingStage.name.trim()) {
      toast.error(t('theRace.stageName') + ' is required');
      return;
    }

    const normalizedDate = normalizeEditedDate(editingStage.date || '');
    if (editingStage.date && !normalizedDate) {
      toast.error('Date must be in DD/MM/YYYY format');
      return;
    }

    updateStage(editingStage.id, {
      ...editingStage,
      date: normalizedDate || ''
    });
    setEditingStage(null);
    setStageDialogOpen(false);
    toast.success('Updated successfully');
  };

  const sortedStages = [...stages].sort(compareStagesBySchedule);

  const isLapRaceType = isLapRaceStageType(newStage.type);
  const isSSType = isSpecialStageType(newStage.type);
  const supportsEndTime = isTransitStageType(newStage.type);

  const getDisplayedStageSchedule = (stage) => {
    if (!stage) return '';
    if (isTransitStageType(stage.type)) {
      return formatStageScheduleRange(stage);
    }
    return stage.startTime || '';
  };

  const handleNewStageTypeChange = (type) => {
    setNewStage((prev) => ({
      ...prev,
      type,
      endTime: isTransitStageType(type) ? prev.endTime : '',
      lapRaceTotalTimeMode: isLapRaceStageType(type)
        ? (prev.lapRaceTotalTimeMode || DEFAULT_LAP_RACE_TOTAL_TIME_MODE)
        : prev.lapRaceTotalTimeMode
    }));
  };

  const handleEditingStageTypeChange = (type) => {
    setEditingStage((prev) => prev ? ({
      ...prev,
      type,
      endTime: isTransitStageType(type) ? (prev.endTime || '') : '',
      lapRaceTotalTimeMode: isLapRaceStageType(type)
        ? (prev.lapRaceTotalTimeMode || DEFAULT_LAP_RACE_TOTAL_TIME_MODE)
        : prev.lapRaceTotalTimeMode
    }) : prev);
  };

  const getStageTypeIcon = (type) => {
    const stageType = STAGE_TYPES.find(t => t.id === type);
    return stageType?.icon || Flag;
  };

  const getStageTypeColor = (type) => {
    switch (type) {
      case 'SS': return 'text-[#FF4500]';
      case SUPER_PRIME_STAGE_TYPE: return 'text-orange-400';
      case 'Lap Race': return 'text-[#FACC15]';
      case 'Liaison': return 'text-blue-400';
      case 'Service Park': return 'text-green-400';
      default: return 'text-zinc-400';
    }
  };

  const getLapRaceMetaParts = (stage) => {
    const parts = [];
    const lapCount = Number(stage?.numberOfLaps || 0);
    const maxTime = Number(stage?.lapRaceMaxTimeMinutes || 0);

    if (Number.isFinite(lapCount) && lapCount > 0) {
      parts.push(`${lapCount} ${t('scene3.laps').toLowerCase()}`);
    }

    if (Number.isFinite(maxTime) && maxTime > 0) {
      parts.push(`${t('theRace.lapRaceMaxTimeMinutes')}: ${maxTime}`);
    }

    return parts;
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

      <CurrentStageCard />

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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {STAGE_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => handleNewStageTypeChange(type.id)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      newStage.type === type.id
                        ? 'border-[#FF4500] bg-[#FF4500]/10'
                        : 'border-zinc-700 hover:border-zinc-500'
                    }`}
                    data-testid={`stage-type-${type.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${getStageTypeColor(type.id)}`} />
                      <span className="font-bold text-sm text-white">{type.name}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{type.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stage Details Form */}
          {isLapRaceType ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-4 min-w-0">
                  <Label className="text-white">{t('theRace.stageName')} *</Label>
                  <Input
                    value={newStage.name}
                    onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                    placeholder={t('theRace.placeholder.stageName')}
                    className="bg-[#09090B] border-zinc-700 text-white"
                    data-testid="input-stage-name"
                  />
                </div>
                <div className="xl:col-span-2 min-w-0">
                  <Label className="text-white">{t('theRace.distance')}</Label>
                  <Input
                    value={newStage.distance}
                    onChange={(e) => setNewStage({ ...newStage, distance: e.target.value })}
                    placeholder={t('theRace.placeholder.distance')}
                    className="bg-[#09090B] border-zinc-700 text-white"
                    inputMode="decimal"
                  />
                </div>
                <div className="xl:col-span-2 min-w-0">
                  <Label className="text-white">{t('theRace.date')}</Label>
                  <Input
                    type="date"
                    value={newStage.date}
                    onChange={(e) => setNewStage({ ...newStage, date: e.target.value })}
                    className="bg-[#09090B] border-zinc-700 text-white"
                  />
                </div>
                <div className="xl:col-span-2 min-w-0">
                  <Label className="text-white">{t('theRace.scheduledStart')}</Label>
                  <Input
                    value={newStage.startTime}
                    onChange={(e) => setNewStage({ ...newStage, startTime: formatScheduledStartInput(e.target.value) })}
                    placeholder={t('theRace.placeholder.time')}
                    className="bg-[#09090B] border-zinc-700 text-white"
                    inputMode="numeric"
                  />
                </div>
                <div className="xl:col-span-2 min-w-0">
                  <Label className="text-white">{t('theRace.lapRaceTotalTimeMode')}</Label>
                  <Select
                    value={newStage.lapRaceTotalTimeMode || DEFAULT_LAP_RACE_TOTAL_TIME_MODE}
                    onValueChange={(value) => setNewStage({ ...newStage, lapRaceTotalTimeMode: value })}
                  >
                    <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cumulative">{t('theRace.lapRaceTotalTimeModes.cumulative')}</SelectItem>
                      <SelectItem value="bestLap">{t('theRace.lapRaceTotalTimeModes.bestLap')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-end">
                <div className="xl:col-span-2 min-w-0">
                  <Label className="text-white">{t('theRace.numberOfLaps')}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newStage.numberOfLaps ?? ''}
                    onChange={(e) => setNewStage({ ...newStage, numberOfLaps: e.target.value })}
                    placeholder={t('theRace.placeholder.laps')}
                    className="bg-[#09090B] border-zinc-700 text-white"
                    inputMode="numeric"
                  />
                </div>
                <div className="xl:col-span-3 min-w-0">
                  <Label className="text-white opacity-0 select-none">.</Label>
                  <label className="flex items-center gap-3 h-10 px-3 rounded-md border border-zinc-700 bg-[#09090B] text-white">
                    <Checkbox
                      checked={!!newStage.lapRaceVariableLaps}
                      onCheckedChange={(checked) => setNewStage({ ...newStage, lapRaceVariableLaps: !!checked })}
                    />
                    <span className="text-sm">{t('theRace.variableNumberOfLaps')}</span>
                  </label>
                </div>
                <div className="xl:col-span-2 min-w-0">
                  <Label className="text-white">{t('theRace.lapRaceMaxTimeMinutes')}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newStage.lapRaceMaxTimeMinutes || ''}
                    onChange={(e) => setNewStage({ ...newStage, lapRaceMaxTimeMinutes: e.target.value })}
                    placeholder={t('theRace.placeholder.minutes')}
                    className="bg-[#09090B] border-zinc-700 text-white"
                    inputMode="numeric"
                  />
                </div>
                <div className="xl:col-span-3 min-w-0">
                  <Label className="text-white">{t('theRace.mapPlacemark')}</Label>
                  <Select
                    value={newStage.mapPlacemarkId || 'none'}
                    onValueChange={(value) => setNewStage({ ...newStage, mapPlacemarkId: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                      <SelectValue placeholder={t('theRace.placeholder.mapPlacemark')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('theRace.noMapPlacemark')}</SelectItem>
                      {mapPlacemarkOptions.map((placemark) => (
                        <SelectItem key={placemark.id} value={placemark.id}>{placemark.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="xl:col-span-2 flex items-end justify-end">
                  <Button
                    onClick={handleAddStage}
                    className="w-full md:w-auto bg-[#FF4500] hover:bg-[#FF4500]/90"
                    data-testid="button-add-stage"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t('theRace.addStage')}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
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

              <div>
                <Label className="text-white">{t('theRace.date')}</Label>
                <Input
                  type="date"
                  value={newStage.date}
                  onChange={(e) => setNewStage({ ...newStage, date: e.target.value })}
                  className="bg-[#09090B] border-zinc-700 text-white"
                />
              </div>

              <div>
                <Label className="text-white">{t('theRace.distance')}</Label>
                <Input
                  value={newStage.distance}
                  onChange={(e) => setNewStage({ ...newStage, distance: e.target.value })}
                  placeholder={t('theRace.placeholder.distance')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  inputMode="decimal"
                />
              </div>

              <div>
                <Label className="text-white">{t('theRace.mapPlacemark')}</Label>
                <Select
                  value={newStage.mapPlacemarkId || 'none'}
                  onValueChange={(value) => setNewStage({ ...newStage, mapPlacemarkId: value === 'none' ? '' : value })}
                >
                  <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                    <SelectValue placeholder={t('theRace.placeholder.mapPlacemark')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('theRace.noMapPlacemark')}</SelectItem>
                    {mapPlacemarkOptions.map((placemark) => (
                      <SelectItem key={placemark.id} value={placemark.id}>{placemark.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-white">{t('theRace.scheduledStart')}</Label>
                <Input
                  value={newStage.startTime}
                  onChange={(e) => setNewStage({ ...newStage, startTime: formatScheduledStartInput(e.target.value) })}
                  placeholder={t('theRace.placeholder.time')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  inputMode="numeric"
                />
              </div>

              {supportsEndTime && (
                <div>
                  <Label className="text-white">{t('theRace.endTime')}</Label>
                  <Input
                    value={newStage.endTime}
                    onChange={(e) => setNewStage({ ...newStage, endTime: formatScheduledStartInput(e.target.value) })}
                    placeholder={t('theRace.placeholder.time')}
                    className="bg-[#09090B] border-zinc-700 text-white"
                    inputMode="numeric"
                  />
                </div>
              )}

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
          )}
        </CardContent>
      </Card>

      {/* Stages List */}
      <div className="space-y-2">
        {sortedStages.map((stage) => {
          const Icon = getStageTypeIcon(stage.type);
          const isEditing = stageDialogOpen && editingStage?.id === stage.id;
          const linkedPlacemark = mapPlacemarkOptions.find((placemark) => placemark.id === stage.mapPlacemarkId);
          
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
                        {isSpecialStageType(stage.type) && stage.ssNumber && <span className="text-[#FF4500]">{getStageNumberLabel(stage)} </span>}
                        {stage.name}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${getStageTypeColor(stage.type)} bg-white/5`}>
                        {stage.type}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-1 text-sm text-zinc-400">
                      {stage.date && <span>{stage.date}</span>}
                      {stage.distance && <span>{stage.distance} km</span>}
                      {getDisplayedStageSchedule(stage) && <span>{getDisplayedStageSchedule(stage)}</span>}
                      {linkedPlacemark && <span>{t('theRace.mapPlacemark')}: {linkedPlacemark.name}</span>}
                      {isLapRaceStageType(stage.type) && getLapRaceMetaParts(stage).map((part) => (
                        <span key={`${stage.id}-${part}`} className="text-[#FACC15]">{part}</span>
                      ))}
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
                          onClick={() => setEditingStage({ ...stage, date: formatDateForEditing(stage.date) })}
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
                              <Select value={editingStage.type} onValueChange={handleEditingStageTypeChange}>
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
                            {isSpecialStageType(editingStage.type) && (
                              <div>
                                <Label className="text-white">{t('theRace.ssNumber')}</Label>
                                <Input
                                  value={editingStage.ssNumber || ''}
                                  onChange={(e) => setEditingStage({ ...editingStage, ssNumber: e.target.value })}
                                  className="bg-[#09090B] border-zinc-700 text-white"
                                />
                              </div>
                            )}
                            {isLapRaceStageType(editingStage.type) && (
                              <div className="space-y-4">
                                <Label className="text-white">{t('theRace.numberOfLaps')}</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={editingStage.numberOfLaps ?? ''}
                                  onChange={(e) => setEditingStage({ ...editingStage, numberOfLaps: e.target.value })}
                                  className="bg-[#09090B] border-zinc-700 text-white"
                                  inputMode="numeric"
                                />
                                <label className="flex items-center gap-3 h-10 px-3 rounded-md border border-zinc-700 bg-[#09090B] text-white">
                                  <Checkbox
                                    checked={!!editingStage.lapRaceVariableLaps}
                                    onCheckedChange={(checked) => setEditingStage({ ...editingStage, lapRaceVariableLaps: !!checked })}
                                  />
                                  <span className="text-sm">{t('theRace.variableNumberOfLaps')}</span>
                                </label>
                                <div>
                                  <Label className="text-white">{t('theRace.lapRaceTotalTimeMode')}</Label>
                                  <Select
                                    value={editingStage.lapRaceTotalTimeMode || DEFAULT_LAP_RACE_TOTAL_TIME_MODE}
                                    onValueChange={(value) => setEditingStage({ ...editingStage, lapRaceTotalTimeMode: value })}
                                  >
                                    <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="cumulative">{t('theRace.lapRaceTotalTimeModes.cumulative')}</SelectItem>
                                      <SelectItem value="bestLap">{t('theRace.lapRaceTotalTimeModes.bestLap')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-white">{t('theRace.lapRaceMaxTimeMinutes')}</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editingStage.lapRaceMaxTimeMinutes || ''}
                                    onChange={(e) => setEditingStage({ ...editingStage, lapRaceMaxTimeMinutes: e.target.value })}
                                    placeholder={t('theRace.placeholder.minutes')}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                    inputMode="numeric"
                                  />
                                </div>
                              </div>
                            )}
                            <div>
                              <Label className="text-white">{t('theRace.date')}</Label>
                              <Input
                                value={editingStage.date || ''}
                                onChange={(e) => setEditingStage({ ...editingStage, date: formatEditableDateInput(e.target.value) })}
                                placeholder="DD/MM/YYYY"
                                className="bg-[#09090B] border-zinc-700 text-white"
                                inputMode="numeric"
                              />
                            </div>
                            <div>
                              <Label className="text-white">{t('theRace.distance')}</Label>
                              <Input
                                value={editingStage.distance || ''}
                                onChange={(e) => setEditingStage({ ...editingStage, distance: e.target.value })}
                                placeholder={t('theRace.placeholder.distance')}
                                className="bg-[#09090B] border-zinc-700 text-white"
                                inputMode="decimal"
                              />
                            </div>
                            <div>
                              <Label className="text-white">{t('theRace.mapPlacemark')}</Label>
                              <Select
                                value={editingStage.mapPlacemarkId || 'none'}
                                onValueChange={(value) => setEditingStage({ ...editingStage, mapPlacemarkId: value === 'none' ? '' : value })}
                              >
                                <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                                  <SelectValue placeholder={t('theRace.placeholder.mapPlacemark')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{t('theRace.noMapPlacemark')}</SelectItem>
                                  {mapPlacemarkOptions.map((placemark) => (
                                    <SelectItem key={placemark.id} value={placemark.id}>{placemark.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-white">{t('theRace.scheduledStart')}</Label>
                              <Input
                                value={editingStage.startTime || ''}
                                onChange={(e) => setEditingStage({ ...editingStage, startTime: formatScheduledStartInput(e.target.value) })}
                                placeholder={t('theRace.placeholder.time')}
                                className="bg-[#09090B] border-zinc-700 text-white"
                                inputMode="numeric"
                              />
                            </div>
                            {isTransitStageType(editingStage.type) && (
                              <div>
                                <Label className="text-white">{t('theRace.endTime')}</Label>
                                <Input
                                  value={editingStage.endTime || ''}
                                  onChange={(e) => setEditingStage({ ...editingStage, endTime: formatScheduledStartInput(e.target.value) })}
                                  placeholder={t('theRace.placeholder.time')}
                                  className="bg-[#09090B] border-zinc-700 text-white"
                                  inputMode="numeric"
                                />
                              </div>
                            )}
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
