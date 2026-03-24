import React, { useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { TimeInput } from '../TimeInput.jsx';
import { CheckSquare, Square, Clock, X } from 'lucide-react';
import { formatClockFromDate, formatDurationMs, getTimePlaceholder } from '../../utils/timeFormat.js';

// Helper to get current time in HH:MM:SS.mmm format
const getCurrentTimeString = (timeDecimals) => formatClockFromDate(new Date(), timeDecimals);

// Helper to calculate lap duration from previous lap
const calculateLapDuration = (currentLapTime, previousLapTime, startTime, timeDecimals) => {
  if (!currentLapTime) return '';

  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length < 2) return null;
    const hours = parts.length === 3 ? parseInt(parts[0]) : 0;
    const mins = parts.length === 3 ? parseInt(parts[1]) : parseInt(parts[0]);
    const secsAndMs = parts.length === 3 ? parts[2] : parts[1];
    const [secs, ms] = secsAndMs.split('.');
    return (hours * 3600 + mins * 60 + parseFloat(secs || 0) + parseFloat(`0.${ms || 0}`)) * 1000;
  };

  const currentMs = parseTime(currentLapTime);
  const previousMs = previousLapTime ? parseTime(previousLapTime) : (startTime ? parseTime(startTime) : null);

  if (currentMs === null || previousMs === null) return '';

  const diffMs = currentMs - previousMs;
  if (diffMs < 0) return '';

  return formatDurationMs(diffMs, timeDecimals, { fallback: '' });
};

export default function LapRaceStageCard({ stage, pilots, sortedPilots, categoryMap, categoryOrderById, comparePilotsForTimes, isReadOnly = false }) {
  const { t } = useTranslation();
  const {
    setLapTime,
    getLapTime,
    getPilotLapTimes,
    getStagePilots,
    togglePilotInStage,
    selectAllPilotsInStage,
    deselectAllPilotsInStage,
    updateStage,
    timeDecimals
  } = useRally();

  const selectedPilotIds = getStagePilots(stage.id);
  const selectedPilotIdSet = useMemo(() => new Set(selectedPilotIds), [selectedPilotIds]);
  const selectedPilots = useMemo(() => (
    sortedPilots
      .filter((pilot) => selectedPilotIdSet.has(pilot.id))
      .sort((a, b) => {
        const pilotAHasTime = getPilotLapTimes(a.id, stage.id).some((lapTime) => Boolean((lapTime || '').trim()));
        const pilotBHasTime = getPilotLapTimes(b.id, stage.id).some((lapTime) => Boolean((lapTime || '').trim()));

        if (pilotAHasTime !== pilotBHasTime) {
          return pilotAHasTime ? -1 : 1;
        }

        return comparePilotsForTimes(a, b, categoryOrderById);
      })
  ), [sortedPilots, selectedPilotIdSet, getPilotLapTimes, stage.id, categoryOrderById, comparePilotsForTimes]);

  const categoryBuckets = useMemo(() => {
    const buckets = new Map();
    const uncategorizedId = 'uncategorized';
    sortedPilots.forEach((pilot) => {
      const category = categoryMap.get(pilot.categoryId);
      const categoryId = category?.id || uncategorizedId;
      const categoryName = category?.name || t('categories.noCategory');
      const categoryColor = category?.color || '#3F3F46';
      if (!buckets.has(categoryId)) {
        buckets.set(categoryId, {
          id: categoryId,
          name: categoryName,
          color: categoryColor,
          pilots: []
        });
      }
      buckets.get(categoryId).pilots.push(pilot);
    });

    return Array.from(buckets.values())
      .map((bucket) => ({
        ...bucket,
        order: categoryOrderById.get(bucket.id) ?? Number.MAX_SAFE_INTEGER
      }))
      .sort((a, b) => {
        const aUncategorized = a.id === uncategorizedId;
        const bUncategorized = b.id === uncategorizedId;
        if (aUncategorized !== bUncategorized) {
          return aUncategorized ? 1 : -1;
        }
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name);
      });
  }, [sortedPilots, categoryMap, categoryOrderById, t]);

  const lapsArray = Array.from({ length: stage.numberOfLaps || 5 }, (_, i) => i);
  const allSelected = selectedPilotIds.length === pilots.length;
  const noneSelected = selectedPilotIds.length === 0;

  return (
    <div className="space-y-4">
      {/* Race Start Time */}
      <div className={`flex items-center gap-4 p-3 bg-[#09090B] rounded border border-zinc-700 ${isReadOnly ? 'opacity-80' : ''}`}>
        <Label className="text-white whitespace-nowrap">{t('times.raceStartTime')}:</Label>
        <Input
          value={stage.startTime || ''}
          onChange={(e) => updateStage(stage.id, { startTime: e.target.value })}
          placeholder="HH:MM:SS"
          className="bg-[#18181B] border-zinc-700 text-center font-mono text-white h-8 w-40"
          readOnly={isReadOnly}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => updateStage(stage.id, { startTime: getCurrentTimeString().slice(0, 8) })}
          className="border-zinc-700 text-white"
          disabled={isReadOnly}
        >
          <Clock className="w-3 h-3 mr-1" />
          {t('times.now')}
        </Button>
      </div>

      {/* Pilot Selection */}
      <div className={`p-3 bg-[#09090B] rounded border border-zinc-700 ${isReadOnly ? 'opacity-80' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-white">{t('times.pilotsInRace')} ({selectedPilotIds.length}/{pilots.length})</Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => selectAllPilotsInStage(stage.id)}
              className={`text-xs ${allSelected ? 'text-green-500' : 'text-zinc-400'}`}
              disabled={isReadOnly}
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              {t('common.all')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deselectAllPilotsInStage(stage.id)}
              className={`text-xs ${noneSelected ? 'text-red-500' : 'text-zinc-400'}`}
              disabled={isReadOnly}
            >
              <Square className="w-3 h-3 mr-1" />
              {t('common.none')}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {sortedPilots.map((pilot) => {
            const category = categoryMap.get(pilot.categoryId);
            return (
              <label
                key={pilot.id}
                className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors ${
                  selectedPilotIdSet.has(pilot.id)
                    ? 'bg-[#FF4500]/20 border border-[#FF4500]'
                    : 'bg-zinc-800 border border-zinc-700'
                }`}
              >
                <div className="w-1 h-4 rounded" style={{ backgroundColor: category?.color || 'transparent' }} />
                <Checkbox
                  checked={selectedPilotIdSet.has(pilot.id)}
                  onCheckedChange={() => togglePilotInStage(stage.id, pilot.id)}
                  className="w-3 h-3"
                  disabled={isReadOnly}
                />
                <span className="text-white text-xs">{pilot.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Lap Times Matrix */}
      {selectedPilots.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          {t('times.selectPilots')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left text-white uppercase font-bold p-2 sticky left-0 bg-[#18181B] z-10" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('scene3.pilot')}
                </th>
                {lapsArray.map((lapIndex) => (
                  <th key={lapIndex} className="text-center text-white uppercase font-bold p-2 min-w-[140px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    <div>{t('times.lap')} {lapIndex + 1}</div>
                    <div className="text-xs text-zinc-400 font-normal">{t('times.time')} / {t('times.duration')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categoryBuckets.map((bucket) => (
                <React.Fragment key={bucket.id}>
                  <tr className="bg-zinc-900/60">
                    <td colSpan={lapsArray.length + 1} className="p-2 border-b border-zinc-800">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: bucket.color }} />
                        <span className="text-zinc-300 text-xs uppercase font-semibold">
                          {bucket.name}
                        </span>
                      </div>
                    </td>
                  </tr>
                {selectedPilots
                  .filter((pilot) => bucket.pilots.some((p) => p.id === pilot.id))
                  .map((pilot) => (
                    <tr key={pilot.id} className="border-b border-zinc-800 hover:bg-white/5">
                        <td className="p-2 sticky left-0 bg-[#18181B] z-10">
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-6 rounded" style={{ backgroundColor: bucket.color }} />
                            <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                            <span className="text-white font-bold text-sm" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              {pilot.name}
                            </span>
                          </div>
                        </td>
                        {lapsArray.map((lapIndex) => {
                          const lapTime = getLapTime(pilot.id, stage.id, lapIndex);
                          const prevLapTime = lapIndex > 0 ? getLapTime(pilot.id, stage.id, lapIndex - 1) : null;
                          const lapDuration = calculateLapDuration(lapTime, prevLapTime, stage.startTime, timeDecimals);

                          return (
                            <td key={lapIndex} className="p-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <TimeInput
                                    value={lapTime}
                                    onChange={(val) => setLapTime(pilot.id, stage.id, lapIndex, val)}
                                    placeholder={getTimePlaceholder('clock', timeDecimals)}
                                    format="clock"
                                    decimals={timeDecimals}
                                    className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                                    readOnly={isReadOnly}
                                  />
                                  <button
                                    onClick={() => setLapTime(pilot.id, stage.id, lapIndex, getCurrentTimeString(timeDecimals))}
                                    className="text-zinc-400 hover:text-[#FF4500] transition-colors p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded"
                                    title={t('times.now')}
                                    disabled={isReadOnly}
                                  >
                                    <Clock className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setLapTime(pilot.id, stage.id, lapIndex, '')}
                                    className="text-zinc-500 hover:text-red-500 transition-colors p-0.5"
                                    title={t('common.clear')}
                                    disabled={isReadOnly}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                {lapDuration && (
                                  <div className="text-xs text-[#22C55E] font-mono text-center">
                                    {lapDuration}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
