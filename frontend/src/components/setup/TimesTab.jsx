import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRallyMeta, useRallyTiming, useRallyWs } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { TimeInput } from '../TimeInput.jsx';
import TimingSourceIndicator from '../TimingSourceIndicator.jsx';
import StatusPill from '../StatusPill.jsx';
import CurrentStageCard from './CurrentStageCard.jsx';
import DebugIdText from './DebugIdText.jsx';
import { arrivalTimeToTotal, totalTimeToArrival } from '../../utils/timeConversion';
import { compareStagesBySchedule, formatStageScheduleRange } from '../../utils/stageSchedule.js';
import { getPilotScheduledEndTime, getPilotScheduledStartTime } from '../../utils/pilotSchedule.js';
import { getCategoryDisplayOrder } from '../../utils/displayOrder.js';
import { formatClockFromDate, formatMsAsShortTime, getTimePlaceholder } from '../../utils/timeFormat.js';
import { getLapRaceVisibleLapCount, getLapRaceStageMetaParts } from '../../utils/rallyHelpers.js';
import { calculateAverageAndDeviation, parseDurationStringToMs } from '../../utils/timingStats.js';
import { TriangleAlert, X, Clock, Clock3, Flag, RotateCcw, Car, Timer, ChevronDown, Lock, Unlock, RefreshCw, Check, CheckCheck, CircleX, Download } from 'lucide-react';
import LapRaceStageCard from './LapRaceStageCard.jsx';
import RollingClockInput from '../RollingClockInput.jsx';
import {
  getStageNumberLabel,
  isLapTimingStageType,
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

const isValidClockTime = (value) => /^\d{2}:\d{2}(?::\d{2})?$/.test(value);
const isValidRealClockTime = (value) => /^\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value);

const escapeCsvValue = (value) => {
  const stringValue = String(value ?? '');
  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
};

const normalizeCsvFileNamePart = (value) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'stage'
);

const SosDeliveryIndicator = ({ status, tooltipText }) => {
  if (!status) {
    return null;
  }

  if (status === 'sending') {
    return <Clock3 className="w-3.5 h-3.5 text-zinc-400" aria-label={tooltipText} />;
  }

  if (status === 'sent') {
    return <Check className="w-3.5 h-3.5 text-zinc-300" aria-label={tooltipText} />;
  }

  if (status === 'acked') {
    return <CheckCheck className="w-3.5 h-3.5 text-[#22C55E]" aria-label={tooltipText} />;
  }

  if (status === 'error') {
    return <CircleX className="w-3.5 h-3.5 text-red-500" aria-label={tooltipText} />;
  }

  return null;
};

const getEffectiveSosStatus = (sosLevel, sosDelivery) => {
  const normalizedLevel = Number(sosLevel || 0);
  const deliveryStatus = String(sosDelivery?.status || '').trim();

  if (deliveryStatus === 'error') {
    return 'error';
  }

  if (deliveryStatus === 'acked' || normalizedLevel >= 3) {
    return 'acked';
  }

  if (deliveryStatus === 'sent' || normalizedLevel >= 2) {
    return 'sent';
  }

  if (deliveryStatus === 'sending' || normalizedLevel >= 1) {
    return 'sending';
  }

  return '';
};

const PilotStatusBadges = ({ pilotId, stageId, compact = false }) => {
  const { t } = useTranslation();
  const { retiredStages, stageAlerts, stageSos } = useRallyTiming();
  const { getSosDeliveryStatus } = useRallyWs();
  const retired = !!retiredStages?.[pilotId]?.[stageId];
  const alert = !!stageAlerts?.[pilotId]?.[stageId];
  const sosLevel = Number(stageSos?.[pilotId]?.[stageId] || 0);
  const sos = sosLevel > 0;
  const sosDelivery = getSosDeliveryStatus(pilotId, stageId);

  if (!retired && !alert && !sos) {
    return null;
  }

  const badgeClassName = compact
    ? 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold'
    : 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold';

  const effectiveSosStatus = getEffectiveSosStatus(sosLevel, sosDelivery);

  const sosTooltipText = effectiveSosStatus === 'sending'
    ? t('status.sosDeliverySending')
    : effectiveSosStatus === 'sent'
      ? t('status.sosDeliverySent')
      : effectiveSosStatus === 'acked'
        ? t('status.sosDeliveryAcked')
        : effectiveSosStatus === 'error'
          ? (sosDelivery?.errorMessage || t('status.sosDeliveryError'))
          : t('status.sosTooltip');

  return (
    <div className="flex flex-wrap items-center gap-1 max-w-full min-w-0">
      {retired && (
        <span className={`${badgeClassName} bg-red-500/20 text-red-400`}>
          RET
        </span>
      )}
      {alert && (
        <span className={`${badgeClassName} bg-amber-500/20 text-amber-300`}>
          <span aria-hidden="true">⚠️</span>
        </span>
      )}
      {sos && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`${badgeClassName} bg-red-500/20 text-red-300`}>
                <span aria-hidden="true">🆘</span>
                {effectiveSosStatus && (
                  <SosDeliveryIndicator
                    status={effectiveSosStatus}
                    tooltipText={sosTooltipText}
                  />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-[#111827] text-white border border-[#374151]">
              <div className="text-xs">{sosTooltipText}</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

const getEffectiveIdealStartTime = (stage, pilot, storedValue = '') => (
  storedValue || getPilotScheduledStartTime(stage, pilot)
);

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

const parseTotalTimeToMs = (timeStr) => parseDurationStringToMs(timeStr);

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

const buildStageSosCountMap = (stageSos = {}) => {
  const counts = new Map();

  Object.values(stageSos || {}).forEach((pilotStages) => {
    Object.entries(pilotStages || {}).forEach(([stageId, level]) => {
      if (Number(level || 0) <= 0) {
        return;
      }

      counts.set(stageId, (counts.get(stageId) || 0) + 1);
    });
  });

  return counts;
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

function TimedStageCard({ stage, sortedPilots, categoryMap, categoryOrderById, pilotById, manualStartTime = false, layout = 'cards', isReadOnly = false, firstColumnWidth = 130, showDebugIds = false }) {
  const { t } = useTranslation();
  const showLineSyncRequest = typeof window !== 'undefined' && window.location?.pathname !== '/times';
  const {
    setTime,
    setArrivalTime,
    setStartTime,
    setRealStartTime,
    setRetiredFromStage,
    setStageAlert,
    setStageSos,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    sourceFinishTime,
    retiredStages,
    stageAlerts,
    stageSos,
    timeDecimals
  } = useRallyTiming();
  const { clientRole, wsConnectionStatus, lineSyncResults, requestTimingLineSync, getSosDeliveryStatus } = useRallyWs();
  const statusControlsReadOnly = isReadOnly || clientRole === 'times';
  const sosControlsReadOnly = isReadOnly;
  const [pendingSosToggle, setPendingSosToggle] = useState(null);
  const getSosDeliveryTooltip = (delivery) => {
    if (!delivery?.status) {
      return '';
    }

    if (delivery.status === 'sending') {
      return t('status.sosDeliverySending');
    }

    if (delivery.status === 'sent') {
      return t('status.sosDeliverySent');
    }

    if (delivery.status === 'acked') {
      return t('status.sosDeliveryAcked');
    }

    if (delivery.status === 'error') {
      return delivery.errorMessage || t('status.sosDeliveryError');
    }

    return '';
  };

  const stagePilotRows = useMemo(() => (
    sortedPilots.map((pilot) => {
      const category = categoryMap.get(pilot.categoryId);
      const totalTime = times[pilot.id]?.[stage.id] || '';
      const arrivalTimeValue = arrivalTimes[pilot.id]?.[stage.id] || '';
      const storedStartTimeValue = startTimes[pilot.id]?.[stage.id] || '';
      const idealStartTimeValue = manualStartTime
        ? getEffectiveIdealStartTime(stage, pilot, storedStartTimeValue)
        : getPilotScheduledStartTime(stage, pilot);
      const isPersistedIdealStartTime = Boolean(storedStartTimeValue)
        && idealStartTimeValue === storedStartTimeValue;
      const realStartTimeValue = realStartTimes[pilot.id]?.[stage.id] || '';
      const finishTimeSource = sourceFinishTime[pilot.id]?.[stage.id] || '';
      const retired = !!retiredStages[pilot.id]?.[stage.id];
      const alert = !!stageAlerts?.[pilot.id]?.[stage.id];
      const sosLevel = Number(stageSos?.[pilot.id]?.[stage.id] || 0);
      const sos = sosLevel > 0;
      const sosDelivery = getSosDeliveryStatus(pilot.id, stage.id);
      const effectiveSosStatus = getEffectiveSosStatus(sosLevel, sosDelivery);
      const totalMs = parseTotalTimeToMs(totalTime);
      const idealSeconds = parseClockTimeToSeconds(idealStartTimeValue);
      const realSeconds = parseClockTimeToSeconds(realStartTimeValue);
      const lineSync = lineSyncResults?.[`${pilot.id}:${stage.id}`] || null;

      return {
        pilot,
        category,
        totalTime,
        arrivalTimeValue,
        storedStartTimeValue,
        isPersistedIdealStartTime,
        idealStartTimeValue,
        realStartTimeValue,
        finishTimeSource,
        retired,
        alert,
        sos,
        sosLevel,
        sosDelivery,
        effectiveSosStatus,
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
    sourceFinishTime,
    retiredStages,
    stageAlerts,
    stageSos,
    lineSyncResults,
    getSosDeliveryStatus
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

        const { avg, deviation } = calculateAverageAndDeviation(values);

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
      ? getEffectiveIdealStartTime(stage, pilot, startTimes[pilotId]?.[stage.id] || '')
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
      ? getEffectiveIdealStartTime(stage, pilot, startTimes[pilotId]?.[stage.id] || '')
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
      ? getEffectiveIdealStartTime(stage, pilot, startTimes[pilotId]?.[stage.id] || '')
      : getPilotScheduledStartTime(stage, pilot);
    if (isValidClockTime(startTime) && value) {
      const arrivalTime = totalTimeToArrival(value, startTime, timeDecimals);
      if (arrivalTime) {
        setArrivalTime(pilotId, stage.id, arrivalTime);
      }
    }
  };

  const commitStartTimeChange = (pilotId, value) => {
    if (isReadOnly) return;
    const nextStartTime = value || '';
    const previousStoredStartTime = startTimes[pilotId]?.[stage.id] || '';
    const pilot = pilotById.get(pilotId);
    const derivedStartTime = getPilotScheduledStartTime(stage, pilot);
    const effectiveStartTime = nextStartTime === ''
      ? ''
      : (isValidClockTime(nextStartTime) ? nextStartTime : previousStoredStartTime || derivedStartTime);

    if (effectiveStartTime === previousStoredStartTime) {
      return;
    }

    setStartTime(pilotId, stage.id, effectiveStartTime);

    if (!isValidClockTime(effectiveStartTime)) {
      return;
    }

    const currentArrivalTime = arrivalTimes[pilotId]?.[stage.id] || '';
    const currentTotalTime = times[pilotId]?.[stage.id] || '';

    if (currentArrivalTime) {
      const totalTime = arrivalTimeToTotal(currentArrivalTime, effectiveStartTime, timeDecimals);
      if (totalTime) {
        setTime(pilotId, stage.id, totalTime);
      }
      return;
    }

    if (currentTotalTime) {
      const arrivalTime = totalTimeToArrival(currentTotalTime, effectiveStartTime, timeDecimals);
      if (arrivalTime) {
        setArrivalTime(pilotId, stage.id, arrivalTime);
      }
    }
  };

  const commitRealStartTimeChange = (pilotId, value) => {
    if (isReadOnly) return;
    const nextRealStartTime = value || '';
    const previousStoredRealStartTime = realStartTimes[pilotId]?.[stage.id] || '';

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

  const getCurrentIdealClockString = () => formatClockFromDate(new Date(), 0).slice(0, 5);
  const getCurrentRealClockString = () => formatClockFromDate(new Date(), timeDecimals);

  const requestSosToggle = (pilotId, nextValue) => {
    if (sosControlsReadOnly) return;

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

  const cancelSosToggle = () => {
    setPendingSosToggle(null);
  };

  return (
    <div className="space-y-3">
      <AlertDialog open={Boolean(pendingSosToggle)} onOpenChange={(open) => { if (!open) cancelSosToggle(); }}>
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
            <AlertDialogCancel onClick={cancelSosToggle} className="border-zinc-700 text-white bg-transparent hover:bg-zinc-800">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSosToggle} className="bg-red-500 hover:bg-red-600 text-white">
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                <th
                  className="text-left text-white uppercase font-bold p-1 sm:p-2 sticky left-0 z-10 bg-[#0B0B0F] border-r border-zinc-800"
                  style={{ fontFamily: 'Barlow Condensed, sans-serif', width: `${firstColumnWidth}px`, minWidth: `${firstColumnWidth}px` }}
                >
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
                  ⚠️Alert
                </th>
                <th className="text-left text-zinc-400 uppercase font-bold p-1 sm:p-2 min-w-[90px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  🆘 {t('status.sos')}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                  const {
                  pilot,
                  category,
                  idealStartTimeValue,
                  isPersistedIdealStartTime,
                  realStartTimeValue,
              retired,
                  alert,
                  sos,
                  sosLevel,
                  sosDelivery,
                  effectiveSosStatus,
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
                    <td
                      className="pl-0 pr-1 py-1 sm:pl-0.5 sm:pr-2 sm:py-2 sticky left-0 z-[1] bg-[#0B0B0F] border-r border-zinc-800"
                      style={{ width: `${firstColumnWidth}px`, minWidth: `${firstColumnWidth}px` }}
                    >
                      <div
                        className="flex flex-wrap items-center gap-1.5 pl-0 pr-1 py-0.5"
                        style={{ borderLeft: `2px solid ${category?.color || 'transparent'}` }}
                      >
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                          {pilot.carNumber && (
                            <span className="bg-[#FF4500] text-white text-xs font-bold px-1 py-0.5 rounded">
                              {pilot.carNumber}
                            </span>
                          )}
                        </div>
                        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
                          <PilotStatusBadges
                            pilotId={pilot.id}
                            stageId={stage.id}
                            compact
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-1 sm:p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-white font-bold text-sm uppercase whitespace-pre-line" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {(pilot.name || '').split(' / ').join('\n').split('/').join('\n')}
                        </span>
                        {showDebugIds && <DebugIdText id={pilot.id} />}
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
                      </div>
                    </td>
                    <td className="p-1 sm:p-2">
                      <div className="flex items-center gap-1">
                        {manualStartTime ? (
                          <>
                            <RollingClockInput
                              value={idealStartTimeValue}
                              onCommit={(nextValue) => commitStartTimeChange(pilot.id, nextValue)}
                              showSeconds={false}
                              placeholder={t('times.placeholder.shortTime')}
                              className={`bg-[#18181B] border-zinc-700 text-center font-mono text-xs h-7 w-24 ${isPersistedIdealStartTime ? 'text-white' : 'text-zinc-400'}`}
                              readOnly={isReadOnly}
                            />
                            <button
                              onClick={() => commitStartTimeChange(pilot.id, getCurrentIdealClockString())}
                              type="button"
                              className={`h-7 w-7 flex-shrink-0 transition-colors bg-zinc-800 hover:bg-zinc-700 rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500]'}`}
                              title={t('times.now')}
                              disabled={isReadOnly}
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => commitStartTimeChange(pilot.id, '')}
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
                            className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-zinc-400 h-7 w-24"
                          />
                        )}
                      </div>
                    </td>
                      <td className="p-1 sm:p-2">
                        <div className="flex items-center gap-1">
                            <RollingClockInput
                              value={realStartTimeValue}
                              onCommit={(nextValue) => commitRealStartTimeChange(pilot.id, nextValue)}
                              showSeconds
                              decimals={timeDecimals}
                              placeholder={getTimePlaceholder('clock', timeDecimals)}
                              className={`bg-[#18181B] border-zinc-700 text-center font-mono text-xs h-7 w-32 ${realStartTimeValue ? 'text-white' : 'text-zinc-400'}`}
                              readOnly={isReadOnly}
                            />
                          <button
                            onClick={() => commitRealStartTimeChange(pilot.id, getCurrentRealClockString())}
                            type="button"
                            className={`h-7 w-7 flex-shrink-0 transition-colors bg-zinc-800 hover:bg-zinc-700 rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500]'}`}
                            title={t('times.now')}
                            disabled={isReadOnly}
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => commitRealStartTimeChange(pilot.id, '')}
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
                        <TimingSourceIndicator source={row.finishTimeSource} />
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
                        <label className={`flex items-center gap-2 ${statusControlsReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <Checkbox
                            checked={retired}
                            onCheckedChange={(checked) => setRetiredFromStage(pilot.id, stage.id, checked === true)}
                            disabled={statusControlsReadOnly}
                          />
                          <span className="text-[11px] text-zinc-400 uppercase">{t('status.retired')}</span>
                        </label>
                      </td>
                    <td className="p-1 sm:p-2">
                        <label className={`flex items-center gap-2 ${statusControlsReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <Checkbox
                            checked={alert}
                            onCheckedChange={(checked) => setStageAlert(pilot.id, stage.id, checked === true)}
                            disabled={statusControlsReadOnly}
                          />
                          <span className="text-[11px] text-zinc-400 uppercase">⚠️</span>
                        </label>
                      </td>
                    <td className="p-1 sm:p-2">
                        <label className={`flex items-center gap-2 ${sosControlsReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <Checkbox
                            checked={sos}
                            onCheckedChange={(checked) => requestSosToggle(pilot.id, checked === true)}
                            disabled={sosControlsReadOnly}
                          />
                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 uppercase">
                            <span>🆘</span>
                            {effectiveSosStatus && (
                              <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center">
                                      <SosDeliveryIndicator
                                        status={effectiveSosStatus}
                                        tooltipText={getSosDeliveryTooltip(
                                          effectiveSosStatus === 'error'
                                            ? sosDelivery
                                            : { status: effectiveSosStatus }
                                        )}
                                      />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-[#111827] text-white border border-[#374151]">
                                    <div className="text-xs">
                                      {getSosDeliveryTooltip(
                                        effectiveSosStatus === 'error'
                                          ? sosDelivery
                                          : { status: effectiveSosStatus }
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </span>
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
                  isPersistedIdealStartTime,
                  realStartTimeValue,
              retired,
              alert,
              sos,
              sosLevel,
              sosDelivery,
              hasRecordedTime,
              totalTime,
              avgMs,
              deviationMs,
              isJumpStart,
              lineSync,
              arrivalTimeValue,
              finishTimeSource
            } = row;
            const lineSyncText = lineSync ? getLineSyncStatusText(t, lineSync.status) : '';

            return (
            <Card key={pilot.id} className={`bg-[#09090B] border-zinc-700 relative ${isReadOnly ? 'opacity-80' : ''}`}>
                {category && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l" style={{ backgroundColor: category.color }} />
                )}
                <CardContent className="p-2 pl-3">
                  {/* Pilot Header */}
                  <div className="flex flex-wrap items-start gap-2 mb-2.5 min-w-0">
                    <div className="flex min-w-[132px] max-w-[176px] flex-wrap items-center gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                        {pilot.carNumber && (
                          <span className="bg-[#FF4500] text-white text-xs font-bold px-1 py-0.5 rounded">
                            {pilot.carNumber}
                          </span>
                        )}
                      </div>
                      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
                        <PilotStatusBadges
                          pilotId={pilot.id}
                          stageId={stage.id}
                          compact
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-white font-bold text-sm uppercase whitespace-pre-line" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {(pilot.name || '').split(' / ').join('\n').split('/').join('\n')}
                        </span>
                        {showDebugIds && <DebugIdText id={pilot.id} />}
                      </div>
                    </div>
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
                  </div>
                  
                  {/* Ideal + Real Start Time */}
                  <div className="mb-2">
                    <div className="grid grid-cols-2 gap-0.5">
                      <div>
                        <Label className="text-xs text-zinc-400">{t('times.startTime')}</Label>
                        <div className="flex items-center gap-1">
                          {manualStartTime ? (
                            <>
                            <RollingClockInput
                              value={idealStartTimeValue}
                              onCommit={(nextValue) => commitStartTimeChange(pilot.id, nextValue)}
                              showSeconds={false}
                              placeholder={t('times.placeholder.shortTime')}
                              className={`bg-[#18181B] border-zinc-700 text-center font-mono text-xs h-7 flex-1 ${isPersistedIdealStartTime ? 'text-white' : 'text-zinc-400'}`}
                              readOnly={isReadOnly}
                            />
                              <button
                                onClick={() => commitStartTimeChange(pilot.id, getCurrentIdealClockString())}
                                type="button"
                                className={`h-7 w-7 flex-shrink-0 transition-colors rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500] bg-zinc-800 hover:bg-zinc-700'}`}
                                title={t('times.now')}
                                disabled={isReadOnly}
                              >
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => commitStartTimeChange(pilot.id, '')}
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
                            <RollingClockInput
                              value={realStartTimeValue}
                              onCommit={(nextValue) => commitRealStartTimeChange(pilot.id, nextValue)}
                              showSeconds
                              decimals={timeDecimals}
                              placeholder={getTimePlaceholder('clock', timeDecimals)}
                              className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                              readOnly={isReadOnly}
                            />
                            <button
                              onClick={() => commitRealStartTimeChange(pilot.id, getCurrentRealClockString())}
                              type="button"
                              className={`h-7 w-7 flex-shrink-0 transition-colors rounded flex items-center justify-center ${isReadOnly ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed' : 'text-zinc-400 hover:text-[#FF4500] bg-zinc-800 hover:bg-zinc-700'}`}
                              title={t('times.now')}
                              disabled={isReadOnly}
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => commitRealStartTimeChange(pilot.id, '')}
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
                  <TimingSourceIndicator source={finishTimeSource} />
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
                <label className={`flex items-center gap-2 ${statusControlsReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <Checkbox
                    checked={retired}
                    onCheckedChange={(checked) => setRetiredFromStage(pilot.id, stage.id, checked === true)}
                    disabled={statusControlsReadOnly}
                  />
                  <span className="text-[11px] text-zinc-400 uppercase">{t('status.retired')}</span>
                </label>
                <label className={`flex items-center gap-2 ${statusControlsReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <Checkbox
                    checked={alert}
                    onCheckedChange={(checked) => setStageAlert(pilot.id, stage.id, checked === true)}
                    disabled={statusControlsReadOnly}
                  />
                  <span className="text-[11px] text-zinc-400 uppercase">⚠️</span>
                </label>
                <label className={`flex items-center gap-2 ${sosControlsReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <Checkbox
                    checked={sos}
                    onCheckedChange={(checked) => requestSosToggle(pilot.id, checked === true)}
                    disabled={sosControlsReadOnly}
                  />
                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 uppercase">
                    <span>🆘</span>
                    {sosDelivery?.status && (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center">
                              <SosDeliveryIndicator
                                status={sosDelivery.status}
                                tooltipText={getSosDeliveryTooltip(sosDelivery)}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-[#111827] text-white border border-[#374151]">
                            <div className="text-xs">{getSosDeliveryTooltip(sosDelivery)}</div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </span>
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
function LiaisonStageCard({ stage, sortedPilots, categoryMap, layout = 'cards', isReadOnly = false, firstColumnWidth = 130, showDebugIds = false }) {
  const { t } = useTranslation();
  const stageSortedPilots = sortedPilots;

  if (layout === 'table') {
    return (
      <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-700">
                <th
                  className="text-left text-white uppercase font-bold p-1 sm:p-2 sticky left-0 z-10 bg-[#0B0B0F] border-r border-zinc-800"
                  style={{ fontFamily: 'Barlow Condensed, sans-serif', width: `${firstColumnWidth}px`, minWidth: `${firstColumnWidth}px` }}
                >
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
                  <td
                    className="p-1 sm:p-2 sticky left-0 z-[1] bg-[#0B0B0F] border-r border-zinc-800"
                    style={{ width: `${firstColumnWidth}px`, minWidth: `${firstColumnWidth}px` }}
                  >
                    <div
                      className="flex items-center gap-1.5 px-1.5 py-0.5"
                      style={{ borderLeft: `2px solid ${category?.color || 'transparent'}` }}
                    >
                      <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                    </div>
                  </td>
                  <td className="p-1 sm:p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-white font-bold text-sm uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {pilot.name}
                      </span>
                      {showDebugIds && <DebugIdText id={pilot.id} />}
                    </div>
                  </td>
                    <td className="p-1 sm:p-2">
                      <Input
                        value={inferredStartTime}
                        readOnly
                        placeholder="--:--"
                            className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-zinc-400 h-7 w-24"
                      />
                    </td>
                    <td className="p-1 sm:p-2">
                      <Input
                        value={inferredEndTime}
                        readOnly
                        placeholder="--:--"
                        className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-zinc-400 h-7 w-24"
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
                <div className="flex flex-1 min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 text-white font-bold text-sm uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {pilot.name}
                  </span>
                  {showDebugIds && <DebugIdText id={pilot.id} />}
                </div>
              </div>
              
              {/* Start Time */}
              <div className="mb-2">
                <Label className="text-xs text-zinc-400">{t('times.startTime')}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={inferredStartTime}
                    readOnly
                    placeholder="--:--"
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-zinc-400 h-7 flex-1"
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
  compactStagePadding = false,
  tableFirstColumnWidth = 90,
  showDebugIds = false
}) {
  const { t } = useTranslation();
  const { pilots, stages, categories, currentStageId } = useRallyMeta();
  const {
    stageSos,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    lapTimes,
    getStagePilots
  } = useRallyTiming();
  const [showCompetitiveStagesOnly, setShowCompetitiveStagesOnly] = useState(true);
  const [showTimesAsCards, setShowTimesAsCards] = useState(false);
  const categoryOrderById = useMemo(() => (
    new Map(categories.map((category, index) => [category.id, getCategoryDisplayOrder(category, index + 1)]))
  ), [categories]);
  const stageSosCountByStageId = useMemo(() => buildStageSosCountMap(stageSos), [stageSos]);
  const sortedPilots = useMemo(() => (
    [...pilots].sort((a, b) => comparePilotsForTimes(a, b, categoryOrderById))
  ), [pilots, categoryOrderById]);
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const pilotById = useMemo(() => new Map(pilots.map((pilot) => [pilot.id, pilot])), [pilots]);
  const getLapRaceMetaText = useCallback((stage) => (
    getLapRaceStageMetaParts({
      stage,
      lapsLabel: t('scene3.laps').toLowerCase(),
      passesLabel: t('theRace.finishLinePassesShort'),
      maxTimeLabel: t('theRace.lapRaceMaxTimeMinutes')
    }).join(' • ')
  ), [t]);

  const handleExportStageCsv = useCallback((stage) => {
    if (!stage?.id) {
      return;
    }

    const selectedPilotIds = new Set(getStagePilots(stage.id));
    const stagePilots = sortedPilots.filter((pilot) => selectedPilotIds.has(pilot.id));
    const stageStartTime = stage.startTime || '';
    const isLapStage = isLapTimingStageType(stage.type);
    const isTransitStage = isTransitStageType(stage.type);
    const lapCount = isLapStage
      ? Math.max(
          getLapRaceVisibleLapCount(stage),
          stagePilots.reduce((maxCount, pilot) => Math.max(
            maxCount,
            Array.isArray(lapTimes?.[pilot.id]?.[stage.id]) ? lapTimes[pilot.id][stage.id].length : 0
          ), 0),
          1
        )
      : 0;
    const countLabel = stage.type === SUPER_PRIME_STAGE_TYPE ? t('times.pass') : t('times.lap');

    const headers = [
      'Pilot',
      'Car Number',
      'Start Order',
      'Category',
      'Stage Start Time',
      'Pilot Start Time'
    ];

    if (isTransitStage) {
      headers.push('End Time');
    } else {
      headers.push('Real Start Time', 'Jump Start');

      if (isLapStage) {
        for (let index = 0; index < lapCount; index += 1) {
          headers.push(`${countLabel} ${index + 1}`);
        }
      } else {
        headers.push('Arrival Time');
      }

      headers.push('Total Time');
    }

    const rows = stagePilots.map((pilot) => {
      const category = categories.find((entry) => entry.id === pilot.categoryId);
      const pilotStartTime = startTimes?.[pilot.id]?.[stage.id]
        || getPilotScheduledStartTime(stage, pilot)
        || stageStartTime
        || '';
      const realStartTime = realStartTimes?.[pilot.id]?.[stage.id] || '';
      const pilotStartSeconds = parseClockTimeToSeconds(pilotStartTime);
      const realStartSeconds = parseClockTimeToSeconds(realStartTime);
      const jumpStart = Number.isFinite(pilotStartSeconds)
        && Number.isFinite(realStartSeconds)
        && realStartSeconds < pilotStartSeconds
        ? 'YES'
        : 'NO';
      const row = [
        pilot.name || '',
        pilot.carNumber || '',
        pilot.startOrder ?? '',
        category?.name || '',
        stageStartTime,
        pilotStartTime
      ];

      if (isTransitStage) {
        row.push(getPilotScheduledEndTime(stage, pilot) || '');
        return row;
      }

      row.push(realStartTime, jumpStart);

      if (isLapStage) {
        const pilotLaps = Array.isArray(lapTimes?.[pilot.id]?.[stage.id]) ? lapTimes[pilot.id][stage.id] : [];
        for (let index = 0; index < lapCount; index += 1) {
          row.push(pilotLaps[index] || '');
        }
      } else {
        row.push(arrivalTimes?.[pilot.id]?.[stage.id] || '');
      }

      row.push(times?.[pilot.id]?.[stage.id] || '');
      return row;
    });

    const content = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(','))
    ].join('\n');

    const filenameParts = [
      'rally-stage',
      getStageNumberLabel(stage) || stage.id || 'stage',
      stage.name || ''
    ].filter(Boolean).map(normalizeCsvFileNamePart);
    const filename = `${filenameParts.join('-')}.csv`;

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [arrivalTimes, categories, getStagePilots, lapTimes, realStartTimes, sortedPilots, stageSos, startTimes, t, times]);

  const sortedStages = useMemo(() => {
    const visibleStages = showCompetitiveStagesOnly
      ? stages.filter((stage) => isSpecialStageType(stage.type) || isLapTimingStageType(stage.type))
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
      {showCurrentStageCard && <CurrentStageCard showDebugIds={showDebugIds} />}

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
        const stageHasSos = (stageSosCountByStageId.get(stage.id) || 0) > 0;
        const stageCardClassName = stageHasSos
          ? `bg-[#18181B] border-red-500/60 shadow-[0_0_0_1px_rgba(239,68,68,0.22)] ${accentClass}`
          : `bg-[#18181B] border-zinc-800 ${accentClass}`;
        
        return (
          <Card key={stage.id} className={stageCardClassName}>
            <CardHeader className={`transition-colors ${stageHasSos ? 'bg-red-500/10 border-b border-red-500/30' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => handleStageHeaderSelect(stage.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {activeStageId === stage.id ? (
                      <Unlock className="w-4 h-4 text-[#22C55E]" />
                    ) : (
                      <Lock className="w-4 h-4 text-zinc-500" />
                    )}
                    {isSpecialStageType(stage.type) && stage.ssNumber && <span className="text-[#FF4500]">{getStageNumberLabel(stage)}</span>}
                    <span className="truncate">{stage.name}</span>
                    {showDebugIds && <DebugIdText id={stage.id} />}
                    {isLapTimingStageType(stage.type) && getLapRaceMetaText(stage) && (
                      <span className="text-sm text-zinc-400 font-normal">({getLapRaceMetaText(stage)})</span>
                    )}
                  </CardTitle>
                  {!isLapTimingStageType(stage.type) && getDisplayedStageSchedule(stage) && (
                    <CardDescription className="text-zinc-400 mt-1">
                      {t('times.scheduled')}: {getDisplayedStageSchedule(stage)}
                    </CardDescription>
                  )}
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportStageCsv(stage)}
                    className="h-8 border-zinc-700 bg-[#09090B] px-2 text-zinc-200 hover:bg-zinc-800 hover:text-white"
                    title={`${stage.name} CSV`}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    CSV
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleStageHeaderSelect(stage.id)}
                    className="inline-flex items-center justify-center"
                    aria-label={isOpen ? 'Collapse stage' : 'Expand stage'}
                  >
                    <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className={compactStagePadding ? 'p-2' : undefined}>
                {isSpecialStageType(stage.type) && !isLapTimingStageType(stage.type) && (
                  <TimedStageCard
                    stage={stage}
                    sortedPilots={sortedPilots}
                    categoryMap={categoryMap}
                    categoryOrderById={categoryOrderById}
                    pilotById={pilotById}
                    manualStartTime
                    layout={showTimesAsCards ? 'cards' : 'table'}
                    isReadOnly={activeStageId !== undefined ? activeStageId !== stage.id : false}
                    firstColumnWidth={tableFirstColumnWidth}
                    showDebugIds={showDebugIds}
                  />
                )}
                {isTransitStageType(stage.type) && (
                  <LiaisonStageCard
                    stage={stage}
                    sortedPilots={sortedPilots}
                    categoryMap={categoryMap}
                    layout={showTimesAsCards ? 'cards' : 'table'}
                    isReadOnly={activeStageId !== undefined ? activeStageId !== stage.id : false}
                    firstColumnWidth={tableFirstColumnWidth}
                    showDebugIds={showDebugIds}
                  />
                )}
                {isLapTimingStageType(stage.type) && (
                  <LapRaceStageCard
                    stage={stage}
                    pilots={pilots}
                    sortedPilots={sortedPilots}
                    categoryMap={categoryMap}
                    categoryOrderById={categoryOrderById}
                    comparePilotsForTimes={comparePilotsForTimes}
                    isReadOnly={activeStageId !== undefined ? activeStageId !== stage.id : false}
                    showDebugIds={showDebugIds}
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
