import React, { useMemo, useState } from 'react';
import { useRallyMeta, useRallyTiming } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog.jsx';
import { TimeInput } from '../TimeInput.jsx';
import RollingClockInput from '../RollingClockInput.jsx';
import TimingSourceIndicator from '../TimingSourceIndicator.jsx';
import StatusPill from '../StatusPill.jsx';
import { CheckSquare, Square, Clock, Plus, X, TriangleAlert } from 'lucide-react';
import { formatClockFromDate, formatDurationMs, getTimePlaceholder } from '../../utils/timeFormat.js';
import { getLapRaceVisibleLapCount, getLapTimingStartTime, normalizeLapTimingBaselineClock, parseClockTimeToSeconds } from '../../utils/rallyHelpers.js';
import { SUPER_PRIME_STAGE_TYPE } from '../../utils/stageTypes.js';
import PilotStatusBadges from '../PilotStatusBadges.jsx';
import DebugIdText from './DebugIdText.jsx';

// Helper to get current time in HH:MM:SS.mmm format
const getCurrentTimeString = (timeDecimals) => formatClockFromDate(new Date(), timeDecimals);

// Helper to calculate lap duration from previous lap
const calculateLapDuration = (currentLapTime, previousLapTime, startTime, timeDecimals) => {
  if (!currentLapTime) return '';

  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const normalizedTimeStr = normalizeLapTimingBaselineClock(timeStr);
    const parts = normalizedTimeStr.split(':');
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

const isValidRealClockTime = (value) => /^\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value);

export default function LapRaceStageCard({ stage, pilots, sortedPilots, categoryMap, categoryOrderById, isReadOnly = false, showDebugIds = false }) {
  const { t } = useTranslation();
  const {
    setLapTime,
    setRealStartTime,
    removeLapTimeColumn = null,
    getLapTime,
    getPilotLapTimes,
    sourceFinishTime,
    sourceLapTime,
    startTimes,
    realStartTimes,
    getStagePilots,
    togglePilotInStage,
    selectAllPilotsInStage,
    deselectAllPilotsInStage,
    setStageAlert,
    setStageSos,
    stageAlerts,
    stageSos,
    times,
    timeDecimals
  } = useRallyTiming();
  const { updateStage } = useRallyMeta();
  const [pendingSosToggle, setPendingSosToggle] = useState(null);
  const isSuperPrimeStage = stage?.type === SUPER_PRIME_STAGE_TYPE;
  const timingCountLabel = isSuperPrimeStage ? t('times.pass') : t('times.lap');
  const addTimingCountLabel = isSuperPrimeStage ? t('times.addPass') : t('times.addLap');
  const stageStartLabel = isSuperPrimeStage ? t('times.stageStartTime') : t('times.raceStartTime');
  const selectedPilotsLabel = isSuperPrimeStage ? t('times.pilotsInStage') : t('times.pilotsInRace');
  const selectPilotsLabel = isSuperPrimeStage ? t('times.selectPilotsForStage') : t('times.selectPilots');

  const selectedPilotIds = getStagePilots(stage.id);
  const selectedPilotIdSet = useMemo(() => new Set(selectedPilotIds), [selectedPilotIds]);
  const selectedPilots = useMemo(() => (
    sortedPilots.filter((pilot) => selectedPilotIdSet.has(pilot.id))
  ), [sortedPilots, selectedPilotIdSet]);

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

  const visibleLapCount = useMemo(() => {
    const configuredLapCount = getLapRaceVisibleLapCount(stage);
    const recordedLapCount = selectedPilots.reduce((maxCount, pilot) => {
      const pilotLapCount = Math.max(getPilotLapTimes(pilot.id, stage.id)?.length || 0, 0);
      return Math.max(maxCount, pilotLapCount);
    }, 0);

    return Math.max(configuredLapCount, recordedLapCount, 1);
  }, [getPilotLapTimes, selectedPilots, stage]);
  const lapsArray = Array.from({ length: visibleLapCount }, (_, i) => i);
  const hasVariableLapCount = !!stage.lapRaceVariableLaps;
  const lapColumnCanDelete = useMemo(() => (
    lapsArray.map((lapIndex) => (
      pilots.every((pilot) => !String(getLapTime(pilot.id, stage.id, lapIndex) || '').trim())
    ))
  ), [getLapTime, lapsArray, pilots, stage.id]);
  const totalColumnWidth = 140;
  const nowColumnWidth = 104;
  const addLapColumnWidth = 56;
  const nowStickyRight = totalColumnWidth;
  const addLapStickyRight = totalColumnWidth + nowColumnWidth;
  const allSelected = selectedPilotIds.length === pilots.length;
  const noneSelected = selectedPilotIds.length === 0;
  const totalTimeLabel = stage.lapRaceTotalTimeMode === 'bestLap'
    ? t('times.bestLapTime')
    : t('times.cumulativeTime');
  const requestSosToggle = (pilotId, nextValue) => {
    if (isReadOnly) return;

    if (nextValue) {
      setPendingSosToggle({ pilotId, stageId: stage.id, nextValue: true });
      return;
    }

    setStageSos(pilotId, stage.id, false);
  };

  const confirmSosToggle = () => {
    if (!pendingSosToggle) return;
    setStageSos(
      pendingSosToggle.pilotId,
      pendingSosToggle.stageId,
      pendingSosToggle.nextValue,
      { highPriority: pendingSosToggle.nextValue === true }
    );
    setPendingSosToggle(null);
  };

  const handleAddLap = () => {
    if (isReadOnly) {
      return;
    }

    const nextLapCount = Math.max(1, visibleLapCount + 1);
    updateStage(stage.id, {
      numberOfLaps: nextLapCount
    });
  };

  const handleDeleteLap = (lapIndex) => {
    if (isReadOnly || isSuperPrimeStage || typeof removeLapTimeColumn !== 'function') {
      return;
    }

    removeLapTimeColumn(stage.id, lapIndex);
    const currentLapCount = Number(stage.numberOfLaps || visibleLapCount || 1);
    updateStage(stage.id, {
      numberOfLaps: Math.max(1, currentLapCount - 1)
    });
  };

  const commitRealStartTimeChange = (pilotId, value) => {
    if (isReadOnly) {
      return;
    }

    const nextRealStartTime = value || '';
    const previousStoredRealStartTime = realStartTimes?.[pilotId]?.[stage.id] || '';

    if (nextRealStartTime === previousStoredRealStartTime) {
      return;
    }

    setRealStartTime(
      pilotId,
      stage.id,
      nextRealStartTime === '' || isValidRealClockTime(nextRealStartTime)
        ? nextRealStartTime
        : previousStoredRealStartTime
    );
  };

  const getPilotIsJumpStart = (pilot) => {
    const idealSeconds = parseClockTimeToSeconds(stage?.startTime || '');
    const realSeconds = parseClockTimeToSeconds(realStartTimes?.[pilot.id]?.[stage.id] || '');

    if (!Number.isFinite(idealSeconds) || !Number.isFinite(realSeconds)) {
      return false;
    }

    return realSeconds < idealSeconds;
  };

  const getNextUnfilledLapIndex = (pilotId) => {
    const pilotLapEntries = getPilotLapTimes(pilotId, stage.id) || [];
    const nextEmptyIndex = Array.from({ length: visibleLapCount }, (_, lapIndex) => lapIndex)
      .find((lapIndex) => !String(pilotLapEntries[lapIndex] || '').trim());

    if (typeof nextEmptyIndex === 'number') {
      return nextEmptyIndex;
    }

    if (isSuperPrimeStage) {
      return Math.max(0, visibleLapCount - 1);
    }

    return Math.max(0, pilotLapEntries.length);
  };

  return (
    <div className="space-y-4">
      {/* Race Start Time */}
      <div className={`flex items-center gap-4 p-3 bg-[#09090B] rounded border border-zinc-700 ${isReadOnly ? 'opacity-80' : ''}`}>
        <Label className="text-white whitespace-nowrap">{stageStartLabel}:</Label>
        <RollingClockInput
          value={stage.startTime || ''}
          onCommit={(nextValue) => updateStage(stage.id, { startTime: nextValue })}
          showSeconds={false}
          placeholder="HH:MM"
          className="bg-[#18181B] border-zinc-700 text-center font-mono text-white h-8 w-40"
          readOnly={isReadOnly}
        />
        {!isSuperPrimeStage && (
          <>
            <Label className="text-white whitespace-nowrap">{t('times.realStartTime')}:</Label>
            <RollingClockInput
              value={stage.realStartTime || ''}
              onCommit={(nextValue) => updateStage(stage.id, { realStartTime: nextValue })}
              placeholder={getTimePlaceholder('clock', timeDecimals)}
              decimals={timeDecimals}
              className="bg-[#18181B] border-zinc-700 text-center font-mono text-white h-8 w-40"
              readOnly={isReadOnly}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateStage(stage.id, { realStartTime: getCurrentTimeString(timeDecimals) })}
              className="border-zinc-700 text-white"
              disabled={isReadOnly}
            >
              <Clock className="w-3 h-3 mr-1" />
              {t('times.now')}
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={Boolean(pendingSosToggle)} onOpenChange={(open) => { if (!open) setPendingSosToggle(null); }}>
        <AlertDialogContent className="bg-[#111113] border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              <TriangleAlert className="w-5 h-5 text-red-400" />
              {t('status.sosLabel')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-300">
              {t('status.sosTooltip')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSosToggle(null)}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSosToggle} className="bg-red-600 hover:bg-red-700 text-white">
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pilot Selection */}
      <div className={`p-3 bg-[#09090B] rounded border border-zinc-700 ${isReadOnly ? 'opacity-80' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-white">{selectedPilotsLabel} ({selectedPilotIds.length}/{pilots.length})</Label>
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
                {showDebugIds && <DebugIdText id={pilot.id} />}
              </label>
            );
          })}
        </div>
      </div>

      {/* Lap Times Matrix */}
      {selectedPilots.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          {selectPilotsLabel}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left text-white uppercase font-bold p-2 sticky left-0 bg-[#18181B] z-10" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('scene3.pilot')}
                </th>
                {isSuperPrimeStage && (
                  <th className="text-center text-white uppercase font-bold p-2 min-w-[180px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    <div>{t('times.realStartTime')}</div>
                    <div className="text-xs text-zinc-400 font-normal">&nbsp;</div>
                  </th>
                )}
                {lapsArray.map((lapIndex) => (
                  <th key={lapIndex} className="text-center text-white uppercase font-bold p-2 min-w-[140px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    <div className="flex items-center justify-center gap-1">
                      <span>{timingCountLabel} {lapIndex + 1}</span>
                      {lapColumnCanDelete[lapIndex] && !isReadOnly && !isSuperPrimeStage && (
                        <button
                          onClick={() => handleDeleteLap(lapIndex)}
                          className="inline-flex items-center justify-center h-5 w-5 rounded text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title={t('common.delete')}
                          type="button"
                          disabled={typeof removeLapTimeColumn !== 'function'}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 font-normal">{t('times.time')} / {t('times.duration')}</div>
                  </th>
                ))}
                {hasVariableLapCount && (
                  <th
                    className="text-center text-white uppercase font-bold p-2 bg-[#18181B] z-20"
                    style={{ fontFamily: 'Barlow Condensed, sans-serif', width: `${addLapColumnWidth}px`, minWidth: `${addLapColumnWidth}px`, position: 'sticky', right: `${addLapStickyRight}px` }}
                  >
                    <button
                      onClick={handleAddLap}
                      className="inline-flex items-center justify-center h-8 w-8 rounded bg-zinc-800 text-zinc-400 hover:text-[#FF4500] hover:bg-zinc-700 transition-colors"
                      title={addTimingCountLabel}
                      disabled={isReadOnly}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </th>
                )}
                <th
                  className="text-center text-white uppercase font-bold p-2 bg-[#18181B] z-20"
                  style={{ fontFamily: 'Barlow Condensed, sans-serif', width: `${nowColumnWidth}px`, minWidth: `${nowColumnWidth}px`, position: 'sticky', right: `${nowStickyRight}px` }}
                >
                  <div>{t('times.now')}</div>
                  <div className="text-xs text-zinc-400 font-normal">&nbsp;</div>
                </th>
                <th
                  className="text-center text-white uppercase font-bold p-2 bg-[#18181B] z-20"
                  style={{ fontFamily: 'Barlow Condensed, sans-serif', width: `${totalColumnWidth}px`, minWidth: `${totalColumnWidth}px`, position: 'sticky', right: 0 }}
                >
                  <div>{totalTimeLabel}</div>
                  <div className="text-xs text-zinc-400 font-normal">{t('times.totalTime')}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {categoryBuckets.map((bucket) => (
                <React.Fragment key={bucket.id}>
                  <tr className="bg-zinc-900/60">
                    <td colSpan={lapsArray.length + 3 + (hasVariableLapCount ? 1 : 0) + (isSuperPrimeStage ? 1 : 0)} className="p-2 border-b border-zinc-800">
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
                  .map((pilot) => {
                    const alert = !!stageAlerts?.[pilot.id]?.[stage.id];
                    const sos = Number(stageSos?.[pilot.id]?.[stage.id] || 0) > 0;
                    const realStartTime = realStartTimes?.[pilot.id]?.[stage.id] || '';
                    const isJumpStart = getPilotIsJumpStart(pilot);

                    return (
                    <tr key={pilot.id} className="border-b border-zinc-800 hover:bg-white/5">
                      <td className="p-2 sticky left-0 bg-[#18181B] z-10">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-1 h-6 rounded" style={{ backgroundColor: bucket.color }} />
                          <span className="text-zinc-500 text-xs whitespace-nowrap">#{pilot.startOrder || '?'}</span>
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full border border-[#FACC15]/30 bg-[#FACC15]/10 text-[#FACC15] text-[11px] font-bold whitespace-nowrap">
                            {pilot.carNumber || '?'}
                          </span>
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="text-white font-bold text-sm truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              {pilot.name}
                            </span>
                            {showDebugIds && <DebugIdText id={pilot.id} />}
                            {isJumpStart && (
                              <StatusPill
                                variant="jumpStart"
                                text={t('status.jumpStart')}
                                className="text-xs"
                                tooltipTitle={t('times.jumpStart')}
                                tooltipText={t('times.jumpStartTooltip')}
                              />
                            )}
                            <PilotStatusBadges pilotId={pilot.id} stageId={stage.id} compact />
                          </div>
                        </div>
                      </td>
                      {isSuperPrimeStage && (
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <RollingClockInput
                              value={realStartTime}
                              onCommit={(nextValue) => commitRealStartTimeChange(pilot.id, nextValue)}
                              showSeconds
                              decimals={timeDecimals}
                              placeholder={getTimePlaceholder('clock', timeDecimals)}
                              className={`bg-[#09090B] border-zinc-700 text-center font-mono text-xs h-7 flex-1 ${realStartTime ? 'text-white' : 'text-zinc-400'}`}
                              readOnly={isReadOnly}
                            />
                            <button
                              onClick={() => commitRealStartTimeChange(pilot.id, getCurrentTimeString(timeDecimals))}
                              className="inline-flex items-center justify-center h-7 w-7 rounded bg-zinc-800 text-zinc-400 hover:text-[#FF4500] hover:bg-zinc-700 transition-colors"
                              title={t('times.now')}
                              disabled={isReadOnly}
                              type="button"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => commitRealStartTimeChange(pilot.id, '')}
                              className="text-zinc-500 hover:text-red-500 transition-colors p-0.5"
                              title={t('common.clear')}
                              disabled={isReadOnly}
                              type="button"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      )}
                        {lapsArray.map((lapIndex) => {
                          const lapTime = getLapTime(pilot.id, stage.id, lapIndex);
                          const lapTimeSource = sourceLapTime?.[pilot.id]?.[stage.id]?.[lapIndex] || '';
                          const prevLapTime = lapIndex > 0 ? getLapTime(pilot.id, stage.id, lapIndex - 1) : null;
                          const timingStartTime = getLapTimingStartTime({
                            stage,
                            pilotId: pilot.id,
                            pilot,
                            startTimes
                          });
                          const lapDuration = calculateLapDuration(lapTime, prevLapTime, timingStartTime, timeDecimals);

                          return (
                            <td key={lapIndex} className="p-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <TimingSourceIndicator source={lapTimeSource} />
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
                        {hasVariableLapCount && (
                          <td
                            className="p-2 text-center bg-[#18181B] z-10"
                            style={{ width: `${addLapColumnWidth}px`, minWidth: `${addLapColumnWidth}px`, position: 'sticky', right: `${addLapStickyRight}px` }}
                          >
                            <span className="block h-8" />
                          </td>
                        )}
                        <td
                          className="p-2 text-center bg-[#18181B] z-10"
                          style={{ width: `${nowColumnWidth}px`, minWidth: `${nowColumnWidth}px`, position: 'sticky', right: `${nowStickyRight}px` }}
                        >
                          <div className="flex items-center justify-center gap-1 flex-nowrap">
                            <button
                              onClick={() => setLapTime(
                                pilot.id,
                                stage.id,
                                getNextUnfilledLapIndex(pilot.id),
                                getCurrentTimeString(timeDecimals)
                              )}
                              className="inline-flex items-center justify-center h-8 w-8 rounded bg-zinc-800 text-zinc-400 hover:text-[#FF4500] hover:bg-zinc-700 transition-colors"
                              title={t('times.now')}
                              disabled={isReadOnly}
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                            <label className={`inline-flex items-center gap-1 ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                              <Checkbox
                                checked={alert}
                                onCheckedChange={(checked) => setStageAlert(pilot.id, stage.id, checked === true)}
                                disabled={isReadOnly}
                                className="h-3.5 w-3.5"
                              />
                              <TriangleAlert className="w-3 h-3 text-amber-400" />
                            </label>
                            <label className={`inline-flex items-center gap-1 ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                              <Checkbox
                                checked={sos}
                                onCheckedChange={(checked) => requestSosToggle(pilot.id, checked === true)}
                                disabled={isReadOnly}
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-[11px] text-zinc-400 uppercase">🆘</span>
                            </label>
                          </div>
                        </td>
                        <td
                          className="p-2 bg-[#18181B] z-20"
                          style={{ width: `${totalColumnWidth}px`, minWidth: `${totalColumnWidth}px`, position: 'sticky', right: 0 }}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <TimingSourceIndicator source={sourceFinishTime?.[pilot.id]?.[stage.id] || ''} />
                            <span className="text-white font-mono text-sm" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {times[pilot.id]?.[stage.id] || '-'}
                            </span>
                          </div>
                        </td>
                    </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
