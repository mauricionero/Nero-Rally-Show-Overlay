import React, { useMemo, useState } from 'react';
import { useRallyMeta, useRallyTiming, useRallyWs } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { TimeInput } from '../TimeInput.jsx';
import StatusPill from '../StatusPill.jsx';
import CurrentStageCard from './CurrentStageCard.jsx';
import { arrivalTimeToTotal, totalTimeToArrival } from '../../utils/timeConversion';
import { compareStagesBySchedule, formatStageScheduleRange } from '../../utils/stageSchedule.js';
import { getPilotScheduledEndTime, getPilotScheduledStartTime } from '../../utils/pilotSchedule.js';
import { getCategoryDisplayOrder } from '../../utils/displayOrder.js';
import { formatClockFromDate, formatMsAsShortTime, getTimePlaceholder } from '../../utils/timeFormat.js';
import { X, Clock, Flag, RotateCcw, Car, Timer, ChevronDown, Lock, Unlock, RefreshCw } from 'lucide-react';
import LapRaceStageCard from './LapRaceStageCard.jsx';
import {
  getStageNumberLabel,
  isLapRaceStageType,
  isManualStartStageType,
  isSpecialStageType,
  isTransitStageType,
  SUPER_PRIME_STAGE_TYPE
} from '../../utils/stageTypes.js';

const getDisplayedStageSchedule = (stage) => {
  if (!stage) return '';

  const stageDate = stage.date || '';
  const stageTime = isTransitStageType(stage.type)
    ? formatStageScheduleRange(stage)
    : (stage.startTime || '');

  if (stageDate && stageTime) {
    return `${stageDate} ${stageTime}`;
  }

  return stageDate || stageTime;
};

const formatClockInput = (value) => {
  const digits = value.replace(/\D/g, '').slice(-4);

  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const isValidClockTime = (value) => /^\d{2}:\d{2}$/.test(value);

const parseClockTimeToSeconds = (value) => {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length < 2) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  let seconds = 0;

  if (parts.length >= 3) {
    const [secs, ms] = parts[2].split('.');
    seconds = Number(secs) + (ms ? Number(`0.${ms}`) : 0);
  }

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
};

const parseTotalTimeToMs = (timeStr) => {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const hours = parts.length === 3 ? parseInt(parts[0]) : 0;
  const mins = parts.length === 3 ? parseInt(parts[1]) : parseInt(parts[0]);
  const secsAndMs = parts.length === 3 ? parts[2] : parts[1];
  const [secs, ms] = secsAndMs.split('.');
  if (!Number.isFinite(mins)) return null;
  return (hours * 3600 + mins * 60 + parseFloat(secs || 0) + parseFloat(`0.${ms || 0}`)) * 1000;
};

const getPilotStartOrderForTimes = (pilot) => {
  const numericValue = Number(pilot?.startOrder);

  if (!Number.isFinite(numericValue) || numericValue >= 999) {
    return null;
  }

  return numericValue;
};

const getPilotOffsetMinutesForTimes = (pilot) => {
  const numericValue = Number(pilot?.timeOffsetMinutes);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue;
};

const comparePilotsForTimes = (a, b, categoryOrderById) => {
  const offsetA = getPilotOffsetMinutesForTimes(a);
  const offsetB = getPilotOffsetMinutesForTimes(b);

  if (offsetA !== null && offsetB !== null && offsetA !== offsetB) {
    return offsetA - offsetB;
  }

  if (offsetA !== null && offsetB === null) return -1;
  if (offsetA === null && offsetB !== null) return 1;

  const startOrderA = getPilotStartOrderForTimes(a);
  const startOrderB = getPilotStartOrderForTimes(b);

  if (startOrderA !== null && startOrderB !== null && startOrderA !== startOrderB) {
    return startOrderA - startOrderB;
  }

  if (startOrderA !== null && startOrderB === null) return -1;
  if (startOrderA === null && startOrderB !== null) return 1;

  const categoryOrderA = categoryOrderById.get(a?.categoryId) ?? Number.MAX_SAFE_INTEGER;
  const categoryOrderB = categoryOrderById.get(b?.categoryId) ?? Number.MAX_SAFE_INTEGER;

  if (categoryOrderA !== categoryOrderB) {
    return categoryOrderA - categoryOrderB;
  }

  return (a?.name || '').localeCompare(b?.name || '');
};

const pilotTimingGridStyle = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))'
};

const getLineSyncStatusText = (t, status) => {
  switch (status) {
    case 'pending':
      return t('times.syncLinePending');
    case 'updated':
      return t('times.syncLineUpdated');
    case 'no_change':
      return t('times.syncLineNoChange');
    case 'no_data':
      return t('times.syncLineNoData');
    case 'error':
      return t('times.syncLineError');
    default:
      return '';
  }
};

// Helper to get current time in HH:MM:SS.mmm format
const getCurrentTimeString = (timeDecimals) => formatClockFromDate(new Date(), timeDecimals);

const getStageTypeIcon = (type) => {
  switch (type) {
    case 'SS': return Flag;
    case SUPER_PRIME_STAGE_TYPE: return Flag;
    case 'Lap Race': return RotateCcw;
    case 'Liaison': return Car;
    case 'Service Park': return Timer;
    default: return Flag;
  }
};

const getStageTypeColor = (type) => {
  switch (type) {
    case 'SS': return 'border-l-[#FF4500]';
    case SUPER_PRIME_STAGE_TYPE: return 'border-l-orange-400';
    case 'Lap Race': return 'border-l-[#FACC15]';
    case 'Liaison': return 'border-l-blue-400';
    case 'Service Park': return 'border-l-green-400';
    default: return 'border-l-zinc-400';
  }
};

function TimedStageCard({ stage, sortedPilots, categoryMap, categoryOrderById, pilotById, manualStartTime = false, layout = 'cards', isReadOnly = false }) {
  const { t } = useTranslation();
  const showLineSyncRequest = typeof window !== 'undefined' && window.location?.pathname !== '/times';
  const {
    setTime,
    setArrivalTime,
    setStartTime,
    setRealStartTime,
    setRetiredFromStage,
    setStageAlert,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    retiredStages,
    stageAlerts,
    timeDecimals
  } = useRallyTiming();
  const { wsConnectionStatus, lineSyncResults, requestTimingLineSync } = useRallyWs();

  const stagePilotRows = useMemo(() => (
    sortedPilots.map((pilot) => {
      const category = categoryMap.get(pilot.categoryId);
      const totalTime = times[pilot.id]?.[stage.id] || '';
      const arrivalTimeValue = arrivalTimes[pilot.id]?.[stage.id] || '';
      const manualStartTimeValue = startTimes[pilot.id]?.[stage.id] || '';
      const idealStartTimeValue = manualStartTime
        ? manualStartTimeValue
        : getPilotScheduledStartTime(stage, pilot);
      const realStartTimeValue = realStartTimes[pilot.id]?.[stage.id] || '';
      const retired = !!retiredStages[pilot.id]?.[stage.id];
      const alert = !!stageAlerts?.[pilot.id]?.[stage.id];
      const totalMs = parseTotalTimeToMs(totalTime);
      const idealSeconds = parseClockTimeToSeconds(idealStartTimeValue);
      const realSeconds = parseClockTimeToSeconds(realStartTimeValue);
      const lineSync = lineSyncResults?.[`${pilot.id}:${stage.id}`] || null;

      return {
        pilot,
        category,
        totalTime,
        arrivalTimeValue,
        idealStartTimeValue,
        realStartTimeValue,
        retired,
        alert,
        totalMs,
        hasRecordedTime: Boolean(totalTime),
        hasTimingData: Boolean(totalTime || arrivalTimeValue),
        isJumpStart: Number.isFinite(idealSeconds) && Number.isFinite(realSeconds)
          ? realSeconds < idealSeconds
          : false,
        lineSync
      };
    })
  ), [
    sortedPilots,
    categoryMap,
    manualStartTime,
    stage,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    retiredStages,
    stageAlerts,
    lineSyncResults
  ]);

  const categoryStats = useMemo(() => {
    const statsByCategory = new Map();
    const fallbackCategory = { id: 'uncategorized', name: t('categories.noCategory'), color: '#71717A' };

    stagePilotRows.forEach((row) => {
      const category = row.category || fallbackCategory;

      const existing = statsByCategory.get(category.id) || {
        category,
        values: []
      };

      if (Number.isFinite(row.totalMs)) {
        existing.values.push(row.totalMs);
      }
      statsByCategory.set(category.id, existing);
    });

    const stats = Array.from(statsByCategory.values())
      .map((entry) => {
        const values = entry.values;
        const count = values.length;
        if (count === 0) {
          return {
            category: entry.category,
            avg: null,
            deviation: null,
            order: categoryOrderById.get(entry.category.id) ?? Number.MAX_SAFE_INTEGER
          };
        }

        const avg = values.reduce((sum, val) => sum + val, 0) / count;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / count;
        const deviation = Math.sqrt(variance);

        return {
          category: entry.category,
          avg,
          deviation,
          order: categoryOrderById.get(entry.category.id) ?? Number.MAX_SAFE_INTEGER
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);

    return stats;
  }, [stagePilotRows, categoryOrderById, t]);

  const categoryStatsById = useMemo(() => (
    new Map(categoryStats.map((stat) => [stat.category.id, stat]))
  ), [categoryStats]);

  const displayRows = useMemo(() => (
    stagePilotRows.map((row) => {
      const categoryStatsForRow = row.category ? categoryStatsById.get(row.category.id) : null;
      const avgMs = categoryStatsForRow?.avg;
      const deviationMs = categoryStatsForRow?.deviation;

      return {
        ...row,
        avgMs,
        deviationMs,
      };
    })
  ), [stagePilotRows, categoryStatsById]);

  const handleArrivalTimeChange = (pilotId, value) => {
    if (isReadOnly) return;
    setArrivalTime(pilotId, stage.id, value);
    const pilot = pilotById.get(pilotId);
    const startTime = manualStartTime
      ? (startTimes[pilotId]?.[stage.id] || '')
      : getPilotScheduledStartTime(stage, pilot);
    if (isValidClockTime(startTime) && value) {
      const totalTime = arrivalTimeToTotal(value, startTime, timeDecimals);
      if (totalTime) {
        setTime(pilotId, stage.id, totalTime);
      }
    }
  };

  const handleSetArrivalTimeNow = (pilotId) => {
    if (isReadOnly) return;

    const currentTime = getCurrentTimeString(timeDecimals);
    setArrivalTime(pilotId, stage.id, currentTime);

    const pilot = pilotById.get(pilotId);
    const startTime = manualStartTime
      ? (startTimes[pilotId]?.[stage.id] || '')
      : getPilotScheduledStartTime(stage, pilot);

    if (isValidClockTime(startTime)) {
      const totalTime = arrivalTimeToTotal(currentTime, startTime, timeDecimals);
      if (totalTime) {
        setTime(pilotId, stage.id, totalTime);
      }
    }
  };

  const handleTotalTimeChange = (pilotId, value) => {
    if (isReadOnly) return;
    setTime(pilotId, stage.id, value);
    const pilot = pilotById.get(pilotId);
    const startTime = manualStartTime
      ? (startTimes[pilotId]?.[stage.id] || '')
      : getPilotScheduledStartTime(stage, pilot);
    if (isValidClockTime(startTime) && value) {
      const arrivalTime = totalTimeToArrival(value, startTime, timeDecimals);
      if (arrivalTime) {
        setArrivalTime(pilotId, stage.id, arrivalTime);
      }
    }
  };

  const handleStartTimeChange = (pilotId, value) => {
    if (isReadOnly) return;
    const nextStartTime = formatClockInput(value);
    setStartTime(pilotId, stage.id, nextStartTime);

    if (!isValidClockTime(nextStartTime)) {
      return;
    }

    const currentArrivalTime = arrivalTimes[pilotId]?.[stage.id] || '';
    const currentTotalTime = times[pilotId]?.[stage.id] || '';

    if (currentArrivalTime) {
      const totalTime = arrivalTimeToTotal(currentArrivalTime, nextStartTime, timeDecimals);
      if (totalTime) {
        setTime(pilotId, stage.id, totalTime);
      }
      return;
    }

    if (currentTotalTime) {
      const arrivalTime = totalTimeToArrival(currentTotalTime, nextStartTime, timeDecimals);
      if (arrivalTime) {
        setArrivalTime(pilotId, stage.id, arrivalTime);
      }
    }
  };

  const handleRealStartTimeChange = (pilotId, value) => {
    if (isReadOnly) return;
    setRealStartTime(pilotId, stage.id, value);
  };

  return (
    <div className="space-y-3">
      {categoryStats.length > 0 && (
        <div className="flex items-center gap-3 bg-[#09090B] border border-zinc-700 rounded px-3 py-2">
          <div className="text-xs font-bold text-white uppercase">{t('times.avg')}</div>
          <div className="flex flex-wrap gap-2">
            {categoryStats.map((stat) => (
              <div
                key={stat.category.id}
                className="text-xs text-zinc-200 bg-[#18181B] border border-zinc-700 rounded px-2 py-1"
              >
                <span className="font-bold" style={{ color: stat.category.color }}>
                  {stat.category.name}
                </span>
                <span className="ml-2 font-mono">
                  {formatMsAsShortTime(stat.avg)} ± {formatMsAsShortTime(stat.deviation)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {layout === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left text-white uppercase font-bold p-1 sm:p-2 w-[90px] sticky left-0 z-10 bg-[#0B0B0F] border-r border-zinc-800" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  #
                </th>
                <th className="text-left text-white uppercase font-bold p-1 sm:p-2 min-w-[200px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('scene3.pilot')}
                </th>
                <th className="text-left text-zinc-400 uppercase font-bold p-1 sm:p-2 min-w-[160px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('times.startTime')}
                </th>
                <th className="text-left text-zinc-400 uppercase font-bold p-1 sm:p-2 min-w-[160px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('times.realStartTime')}
                </th>
                <th className="text-left text-zinc-400 uppercase font-bold p-1 sm:p-2 min-w-[180px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('times.arrivalTime')}
                </th>
                <th className="text-left text-zinc-400 uppercase font-bold p-1 sm:p-2 min-w-[140px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('times.totalTime')}
                </th>
                <th className="text-left text-zinc-400 uppercase font-bold p-1 sm:p-2 min-w-[90px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('status.retired')}
                </th>
                <th className="text-left text-zinc-400 uppercase font-bold p-1 sm:p-2 min-w-[90px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('status.alert')}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const {
                  pilot,
                  category,
                  idealStartTimeValue,
                  realStartTimeValue,
                  retired,
                  alert,
                  hasRecordedTime,
                  totalTime,
                  avgMs,
                  deviationMs,
                  isJumpStart,
                  lineSync,
                  arrivalTimeValue
                } = row;
                const lineSyncText = lineSync ? getLineSyncStatusText(t, lineSync.status) : '';

                return (
                  <tr key={pilot.id} className="border-b border-zinc-800 hover:bg-white/5">
                    <td className="p-1 sm:p-2 sticky left-0 z-[1] bg-[#0B0B0F] border-r border-zinc-800">
                      <div
                        className="flex items-center gap-1.5 px-1.5 py-0.5"
                        style={{ borderLeft: `2px solid ${category?.color || 'transparent'}` }}
                      >
                        <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                        {pilot.carNumber && (
                          <span className="bg-[#FF4500] text-white text-xs font-bold px-1 py-0.5 rounded">
                            {pilot.carNumber}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-1 sm:p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-white font-bold text-sm uppercase whitespace-pre-line" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {(pilot.name || '').split(' / ').join('\n').split('/').join('\n')}
                        </span>
                        {showLineSyncRequest && (
                          <>
                            <button
                              onClick={() => requestTimingLineSync(pilot.id, stage.id)}
                              className={`h-6 w-6 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 ${wsConnectionStatus !== 'connected' ? 'opacity-60 cursor-not-allowed' : ''}`}
                              title={t('times.syncLine')}
                              disabled={wsConnectionStatus !== 'connected' || !showLineSyncRequest}
                              type="button"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            {lineSync && (
                              <StatusPill
                                variant="info"
                                text={t('status.info')}
                                className={`text-[10px] ${lineSync.status === 'pending' ? 'animate-pulse' : ''}`}
                                tooltipTitle={t('times.syncLine')}
                                tooltipText={lineSyncText}
                              />
                            )}
                          </>
                        )}
                        {isJumpStart && (
                          <StatusPill
                            variant="jumpStart"
                            text={t('status.jumpStart')}
                            className="text-xs"
                            tooltipTitle={t('times.jumpStart')}
                            tooltipText={t('times.jumpStartTooltip')}
                          />
                        )}
                        {alert && (
                          <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {t('status.alert')}
                          </span>
                        )}
                        {retired && (
                          <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            RET
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-1 sm:p-2">
                      <div className="flex items-center gap-1">
                        {manualStartTime ? (
                          <>
                            <Input
                              value={idealStartTimeValue}
                              onChange={(e) => handleStartTimeChange(pilot.id, e.target.value)}
                              placeholder={t('times.placeholder.shortTime')}
                              className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 w-24"
                              inputMode="numeric"
                              readOnly={isReadOnly}
                            />
                            <button
                              onClick={() => handleStartTimeChange(pilot.id, new Date().toTimeString().slice(0, 5))}
                              type="button"
                              className={`h-7 w-7 flex-shrink-0 transition-colors bg-zinc-800 hover:bg-zinc-700 rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500]'}`}
                              title={t('times.now')}
                              disabled={isReadOnly}
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleStartTimeChange(pilot.id, '')}
                              type="button"
                              className={`h-7 w-4 flex-shrink-0 transition-colors flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-500 hover:text-red-500'}`}
                              title={t('common.clear')}
                              disabled={isReadOnly}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <Input
                            value={idealStartTimeValue}
                            readOnly
                            placeholder="--:--"
                            className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 w-24"
                          />
                        )}
                      </div>
                    </td>
                    <td className="p-1 sm:p-2">
                      <div className="flex items-center gap-1">
                        <TimeInput
                          value={realStartTimeValue}
                          onChange={(val) => handleRealStartTimeChange(pilot.id, val)}
                          placeholder={getTimePlaceholder('clock', timeDecimals)}
                          format="clock"
                          decimals={timeDecimals}
                          className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 w-32"
                          readOnly={isReadOnly}
                        />
                        <button
                          onClick={() => handleRealStartTimeChange(pilot.id, getCurrentTimeString(timeDecimals))}
                          type="button"
                          className={`h-7 w-7 flex-shrink-0 transition-colors bg-zinc-800 hover:bg-zinc-700 rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500]'}`}
                          title={t('times.now')}
                          disabled={isReadOnly}
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRealStartTimeChange(pilot.id, '')}
                          type="button"
                          className={`h-7 w-4 flex-shrink-0 transition-colors flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-500 hover:text-red-500'}`}
                          title={t('common.clear')}
                          disabled={isReadOnly}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="p-1 sm:p-2">
                      <div className="flex items-center gap-1">
                        <TimeInput
                          value={arrivalTimeValue}
                          onChange={(val) => handleArrivalTimeChange(pilot.id, val)}
                          placeholder={getTimePlaceholder('clock', timeDecimals)}
                          format="clock"
                          decimals={timeDecimals}
                          className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 w-28"
                          readOnly={isReadOnly}
                        />
                        <button
                          onClick={() => handleSetArrivalTimeNow(pilot.id)}
                          type="button"
                          className={`h-7 w-7 flex-shrink-0 transition-colors bg-zinc-800 hover:bg-zinc-700 rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500]'}`}
                          title={t('times.now')}
                          disabled={isReadOnly}
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setArrivalTime(pilot.id, stage.id, '');
                            setTime(pilot.id, stage.id, '');
                          }}
                          type="button"
                          className={`h-7 w-4 flex-shrink-0 transition-colors flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-500 hover:text-red-500'}`}
                          title={t('common.clear')}
                          disabled={isReadOnly}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="p-1 sm:p-2">
                      <TimeInput
                        value={totalTime}
                        onChange={(val) => handleTotalTimeChange(pilot.id, val)}
                        placeholder={getTimePlaceholder('total', timeDecimals)}
                        format="total"
                        decimals={timeDecimals}
                        className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 w-28"
                        readOnly={isReadOnly}
                      />
                    </td>
                    <td className="p-1 sm:p-2">
                        <label className={`flex items-center gap-2 ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <Checkbox
                            checked={retired}
                            onCheckedChange={(checked) => setRetiredFromStage(pilot.id, stage.id, checked === true)}
                            disabled={isReadOnly}
                          />
                          <span className="text-[11px] text-zinc-400 uppercase">{t('status.retired')}</span>
                        </label>
                      </td>
                      <td className="p-1 sm:p-2">
                        <label className={`flex items-center gap-2 ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <Checkbox
                            checked={alert}
                            onCheckedChange={(checked) => setStageAlert(pilot.id, stage.id, checked === true)}
                            disabled={isReadOnly}
                          />
                          <span className="text-[11px] text-zinc-400 uppercase">{t('status.alert')}</span>
                        </label>
                      </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-2" style={pilotTimingGridStyle}>
          {displayRows.map((row) => {
            const {
              pilot,
              category,
              idealStartTimeValue,
              realStartTimeValue,
              retired,
              alert,
              hasRecordedTime,
              totalTime,
              avgMs,
              deviationMs,
              isJumpStart,
              lineSync,
              arrivalTimeValue
            } = row;
            const lineSyncText = lineSync ? getLineSyncStatusText(t, lineSync.status) : '';

            return (
            <Card key={pilot.id} className={`bg-[#09090B] border-zinc-700 relative ${isReadOnly ? 'opacity-80' : ''}`}>
                {category && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l" style={{ backgroundColor: category.color }} />
                )}
                <CardContent className="p-2 pl-3">
                  {/* Pilot Header */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2.5 min-w-0">
                    <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                    {pilot.carNumber && (
                      <span className="bg-[#FF4500] text-white text-xs font-bold px-1 py-0.5 rounded">
                        {pilot.carNumber}
                      </span>
                    )}
                    <span className="flex-1 min-w-0 text-white font-bold text-sm uppercase whitespace-pre-line" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      {(pilot.name || '').split(' / ').join('\n').split('/').join('\n')}
                    </span>
                    {showLineSyncRequest && (
                      <>
                        <button
                          onClick={() => requestTimingLineSync(pilot.id, stage.id)}
                          className={`h-6 w-6 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 ${wsConnectionStatus !== 'connected' ? 'opacity-60 cursor-not-allowed' : ''}`}
                          title={t('times.syncLine')}
                          disabled={wsConnectionStatus !== 'connected' || !showLineSyncRequest}
                          type="button"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        {lineSync && (
                          <StatusPill
                            variant="info"
                            text={t('status.info')}
                            className={`text-[10px] ${lineSync.status === 'pending' ? 'animate-pulse' : ''}`}
                            tooltipTitle={t('times.syncLine')}
                            tooltipText={lineSyncText}
                          />
                        )}
                      </>
                    )}
                    {isJumpStart && (
                      <StatusPill
                        variant="jumpStart"
                        text={t('status.jumpStart')}
                        className="text-xs"
                        tooltipTitle={t('times.jumpStart')}
                        tooltipText={t('times.jumpStartTooltip')}
                      />
                    )}
                    {alert && (
                      <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {t('status.alert')}
                      </span>
                    )}
                    {retired && (
                      <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
                        RET
                      </span>
                    )}
                  </div>
                  
                  {/* Ideal + Real Start Time */}
                  <div className="mb-2">
                    <div className="grid grid-cols-2 gap-0.5">
                      <div>
                        <Label className="text-xs text-zinc-400">{t('times.startTime')}</Label>
                        <div className="flex items-center gap-1">
                          {manualStartTime ? (
                            <>
                              <Input
                                value={idealStartTimeValue}
                                onChange={(e) => handleStartTimeChange(pilot.id, e.target.value)}
                                placeholder={t('times.placeholder.shortTime')}
                                className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                                inputMode="numeric"
                                readOnly={isReadOnly}
                              />
                              <button
                                onClick={() => handleStartTimeChange(pilot.id, new Date().toTimeString().slice(0, 5))}
                                type="button"
                                className={`h-7 w-7 flex-shrink-0 transition-colors rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500] bg-zinc-800 hover:bg-zinc-700'}`}
                                title={t('times.now')}
                                disabled={isReadOnly}
                              >
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleStartTimeChange(pilot.id, '')}
                                type="button"
                                className={`h-7 w-4 flex-shrink-0 transition-colors flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-500 hover:text-red-500'}`}
                                title={t('common.clear')}
                                disabled={isReadOnly}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <Input
                              value={idealStartTimeValue}
                              readOnly
                              placeholder="--:--"
                              className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7"
                            />
                          )}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-400">{t('times.realStartTime')}</Label>
                        <div className="flex items-center gap-1">
                          <TimeInput
                            value={realStartTimeValue}
                            onChange={(val) => handleRealStartTimeChange(pilot.id, val)}
                            placeholder={getTimePlaceholder('clock', timeDecimals)}
                            format="clock"
                            decimals={timeDecimals}
                            className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                            readOnly={isReadOnly}
                          />
                          <button
                            onClick={() => handleRealStartTimeChange(pilot.id, getCurrentTimeString(timeDecimals))}
                            type="button"
                            className={`h-7 w-7 flex-shrink-0 transition-colors rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500] bg-zinc-800 hover:bg-zinc-700'}`}
                            title={t('times.now')}
                            disabled={isReadOnly}
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRealStartTimeChange(pilot.id, '')}
                            type="button"
                            className={`h-7 w-4 flex-shrink-0 transition-colors flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-500 hover:text-red-500'}`}
                            title={t('common.clear')}
                            disabled={isReadOnly}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Arrival Time */}
                  <div className="mb-2">
                    <Label className="text-xs text-zinc-400">{t('times.arrivalTime')}</Label>
                    <div className="flex items-center gap-1">
                  <TimeInput
                    value={arrivalTimeValue}
                    onChange={(val) => handleArrivalTimeChange(pilot.id, val)}
                    placeholder={getTimePlaceholder('clock', timeDecimals)}
                    format="clock"
                    decimals={timeDecimals}
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                    readOnly={isReadOnly}
                  />
                  <button
                    onClick={() => handleSetArrivalTimeNow(pilot.id)}
                    type="button"
                    className={`h-7 w-7 flex-shrink-0 transition-colors rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500] bg-zinc-800 hover:bg-zinc-700'}`}
                    title={t('times.now')}
                    disabled={isReadOnly}
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                  <button
                        onClick={() => {
                          setArrivalTime(pilot.id, stage.id, '');
                          setTime(pilot.id, stage.id, '');
                        }}
                    type="button"
                    className={`h-7 w-4 flex-shrink-0 transition-colors flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-500 hover:text-red-500'}`}
                    title={t('common.clear')}
                    disabled={isReadOnly}
                  >
                    <X className="w-3 h-3" />
                  </button>
                    </div>
                  </div>
                  
                  {/* Total Time */}
                  <div>
                    <Label className="text-xs text-zinc-400">{t('times.totalTime')}</Label>
                    <div className="flex items-center gap-1">
                  <TimeInput
                    value={totalTime}
                    onChange={(val) => handleTotalTimeChange(pilot.id, val)}
                    placeholder={getTimePlaceholder('total', timeDecimals)}
                    format="total"
                    decimals={timeDecimals}
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                    readOnly={isReadOnly}
                  />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                <label className={`flex items-center gap-2 ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <Checkbox
                    checked={retired}
                    onCheckedChange={(checked) => setRetiredFromStage(pilot.id, stage.id, checked === true)}
                    disabled={isReadOnly}
                  />
                  <span className="text-[11px] text-zinc-400 uppercase">{t('status.retired')}</span>
                </label>
                <label className={`flex items-center gap-2 ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <Checkbox
                    checked={alert}
                    onCheckedChange={(checked) => setStageAlert(pilot.id, stage.id, checked === true)}
                    disabled={isReadOnly}
                  />
                  <span className="text-[11px] text-zinc-400 uppercase">{t('status.alert')}</span>
                </label>
                    {retired && (
                      <span className={`text-[11px] font-bold uppercase ${hasRecordedTime ? 'text-amber-400' : 'text-red-400'}`}>
                        {hasRecordedTime ? `${t('status.retired')} + ${t('times.totalTime')}` : t('status.retired')}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Liaison/Service Park Stage Component - Simple start/end per pilot
function LiaisonStageCard({ stage, sortedPilots, categoryMap, layout = 'cards', isReadOnly = false }) {
  const { t } = useTranslation();
  const stageSortedPilots = sortedPilots;

  if (layout === 'table') {
    return (
      <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left text-white uppercase font-bold p-1 sm:p-2 w-[90px] sticky left-0 z-10 bg-[#0B0B0F] border-r border-zinc-800" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  #
                </th>
                <th className="text-left text-white uppercase font-bold p-1 sm:p-2 min-w-[200px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('scene3.pilot')}
                </th>
                <th className="text-left text-zinc-400 uppercase font-bold p-1 sm:p-2 min-w-[180px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('times.startTime')}
                </th>
                <th className="text-left text-zinc-400 uppercase font-bold p-1 sm:p-2 min-w-[180px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('times.endTime')}
                </th>
            </tr>
          </thead>
          <tbody>
            {stageSortedPilots.map((pilot) => {
              const category = categoryMap.get(pilot.categoryId);
              const inferredStartTime = getPilotScheduledStartTime(stage, pilot);
              const inferredEndTime = getPilotScheduledEndTime(stage, pilot);
              return (
                <tr key={pilot.id} className="border-b border-zinc-800 hover:bg-white/5">
                  <td className="p-1 sm:p-2 sticky left-0 z-[1] bg-[#0B0B0F] border-r border-zinc-800">
                    <div
                      className="flex items-center gap-1.5 px-1.5 py-0.5"
                      style={{ borderLeft: `2px solid ${category?.color || 'transparent'}` }}
                    >
                      <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                    </div>
                  </td>
                  <td className="p-1 sm:p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {pilot.name}
                      </span>
                    </div>
                  </td>
                    <td className="p-1 sm:p-2">
                      <Input
                        value={inferredStartTime}
                        readOnly
                        placeholder="--:--"
                        className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 w-24"
                      />
                    </td>
                    <td className="p-1 sm:p-2">
                      <Input
                        value={inferredEndTime}
                        readOnly
                        placeholder="--:--"
                        className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 w-24"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="grid gap-2" style={pilotTimingGridStyle}>
      {stageSortedPilots.map((pilot) => {
        const category = categoryMap.get(pilot.categoryId);
        const inferredStartTime = getPilotScheduledStartTime(stage, pilot);
        const inferredEndTime = getPilotScheduledEndTime(stage, pilot);
        return (
          <Card key={pilot.id} className={`bg-[#09090B] border-zinc-700 relative ${isReadOnly ? 'opacity-80' : ''}`}>
            {category && (
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l" style={{ backgroundColor: category.color }} />
            )}
            <CardContent className="p-2 pl-3">
              {/* Pilot Header */}
              <div className="flex items-center gap-1.5 mb-2.5 min-w-0">
                <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                <span className="flex-1 min-w-0 text-white font-bold text-sm uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {pilot.name}
                </span>
              </div>
              
              {/* Start Time */}
              <div className="mb-2">
                <Label className="text-xs text-zinc-400">{t('times.startTime')}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={inferredStartTime}
                    readOnly
                    placeholder="--:--"
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                  />
                </div>
              </div>
              
              {/* End Time */}
              <div>
                <Label className="text-xs text-zinc-400">{t('times.endTime')}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={inferredEndTime}
                    readOnly
                    placeholder="--:--"
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}


export default function TimesTab({
  onStageSelect,
  activeStageId,
  openStageIds: controlledOpenStageIds,
  onOpenStageIdsChange,
  showCurrentStageCard = true,
  defaultOpenStageIds,
  showStageAccent = true,
  compactStagePadding = false
}) {
  const { t } = useTranslation();
  const { pilots, stages, categories, currentStageId } = useRallyMeta();
  const [showCompetitiveStagesOnly, setShowCompetitiveStagesOnly] = useState(true);
  const [showTimesAsCards, setShowTimesAsCards] = useState(false);
  const categoryOrderById = useMemo(() => (
    new Map(categories.map((category, index) => [category.id, getCategoryDisplayOrder(category, index + 1)]))
  ), [categories]);
  const sortedPilots = useMemo(() => (
    [...pilots].sort((a, b) => comparePilotsForTimes(a, b, categoryOrderById))
  ), [pilots, categoryOrderById]);
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const pilotById = useMemo(() => new Map(pilots.map((pilot) => [pilot.id, pilot])), [pilots]);

  const sortedStages = useMemo(() => {
    const visibleStages = showCompetitiveStagesOnly
      ? stages.filter((stage) => isSpecialStageType(stage.type) || isLapRaceStageType(stage.type))
      : stages;

    return [...visibleStages].sort(compareStagesBySchedule);
  }, [stages, showCompetitiveStagesOnly]);
  const [openStageIdsState, setOpenStageIdsState] = useState(() => (
    defaultOpenStageIds
      ? [...defaultOpenStageIds]
      : (currentStageId ? [currentStageId] : [])
  ));
  const openStageIds = controlledOpenStageIds ?? openStageIdsState;
  const setOpenStageIds = onOpenStageIdsChange ?? setOpenStageIdsState;

  const handleStageHeaderSelect = (stageId) => {
    setOpenStageIds([stageId]);
  };

  if (pilots.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        {t('times.addPilotsFirst')}
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        {t('times.addStagesFirst')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showCurrentStageCard && <CurrentStageCard />}

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-800 bg-[#18181B] px-4 py-3">
        <div className="flex items-center gap-3">
          <Checkbox
            id="times-competitive-only"
            checked={showCompetitiveStagesOnly}
            onCheckedChange={(checked) => setShowCompetitiveStagesOnly(checked === true)}
          />
          <Label htmlFor="times-competitive-only" className="text-sm text-white cursor-pointer">
            {t('times.showCompetitiveStagesOnly')}
          </Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox
            id="times-view-table"
            checked={showTimesAsCards}
            onCheckedChange={(checked) => setShowTimesAsCards(checked === true)}
          />
          <Label htmlFor="times-view-table" className="text-sm text-white cursor-pointer">
            {t('times.showTimesAsCards')}
          </Label>
        </div>
      </div>

      {sortedStages.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          {t('times.noCompetitiveStages')}
        </div>
      )}

      {sortedStages.map((stage) => {
        const Icon = getStageTypeIcon(stage.type);
        const borderColor = getStageTypeColor(stage.type);
        const accentClass = showStageAccent ? `border-l-4 ${borderColor}` : '';
        const isOpen = openStageIds.includes(stage.id);
        
        return (
          <Card key={stage.id} className={`bg-[#18181B] border-zinc-800 ${accentClass}`}>
            <button
              type="button"
              onClick={() => handleStageHeaderSelect(stage.id)}
              className="w-full text-left"
            >
              <CardHeader className="cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {activeStageId === stage.id ? (
                        <Unlock className="w-4 h-4 text-[#22C55E]" />
                      ) : (
                        <Lock className="w-4 h-4 text-zinc-500" />
                      )}
                      {isSpecialStageType(stage.type) && stage.ssNumber && <span className="text-[#FF4500]">{getStageNumberLabel(stage)}</span>}
                      <span className="truncate">{stage.name}</span>
                      {isLapRaceStageType(stage.type) && (
                        <span className="text-sm text-zinc-400 font-normal">({stage.numberOfLaps} {t('scene3.laps').toLowerCase()})</span>
                      )}
                    </CardTitle>
                    {!isLapRaceStageType(stage.type) && getDisplayedStageSchedule(stage) && (
                      <CardDescription className="text-zinc-400 mt-1">
                        {t('times.scheduled')}: {getDisplayedStageSchedule(stage)}
                      </CardDescription>
                    )}
                  </div>
                  <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </button>
            {isOpen && (
              <CardContent className={compactStagePadding ? 'p-2' : undefined}>
                {isSpecialStageType(stage.type) && (
                  <TimedStageCard
                    stage={stage}
                    sortedPilots={sortedPilots}
                    categoryMap={categoryMap}
                    categoryOrderById={categoryOrderById}
                    pilotById={pilotById}
                    manualStartTime={isManualStartStageType(stage.type)}
                    layout={showTimesAsCards ? 'cards' : 'table'}
                    isReadOnly={activeStageId !== undefined ? activeStageId !== stage.id : false}
                  />
                )}
                {isTransitStageType(stage.type) && (
                  <LiaisonStageCard
                    stage={stage}
                    sortedPilots={sortedPilots}
                    categoryMap={categoryMap}
                    layout={showTimesAsCards ? 'cards' : 'table'}
                    isReadOnly={activeStageId !== undefined ? activeStageId !== stage.id : false}
                  />
                )}
                {isLapRaceStageType(stage.type) && (
                  <LapRaceStageCard
                    stage={stage}
                    pilots={pilots}
                    sortedPilots={sortedPilots}
                    categoryMap={categoryMap}
                    categoryOrderById={categoryOrderById}
                    comparePilotsForTimes={comparePilotsForTimes}
                    isReadOnly={activeStageId !== undefined ? activeStageId !== stage.id : false}
                  />
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
