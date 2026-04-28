import { sortPilotsByDisplayOrder } from './displayOrder.js';
import { clampTimeDecimals, formatDurationMs, formatDurationSeconds } from './timeFormat.js';
import { getPilotScheduledEndTime, getPilotScheduledStartTime } from './pilotSchedule.js';
import { isLapTimingStageType, isSpecialStageType, isTransitStageType, SUPER_PRIME_STAGE_TYPE } from './stageTypes.js';

// Helper functions for pilot status and timing

export const getReferenceNow = (debugDate, now = new Date()) => {
  if (!debugDate) return now;

  const match = debugDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return now;

  const referenceNow = new Date(now);
  referenceNow.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return referenceNow;
};

export const getStageDateTime = (stageDate, clockTime) => {
  if (!clockTime) return null;

  const parts = clockTime.split(':');
  if (parts.length < 2) return null;

  const [hours, minutes] = parts.map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const date = stageDate ? new Date(`${stageDate}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return null;

  date.setHours(hours, minutes, 0, 0);
  return date;
};

const pad2 = (value) => String(value).padStart(2, '0');

const formatClockTimeFromDate = (dateTime = null) => {
  if (!(dateTime instanceof Date) || Number.isNaN(dateTime.getTime())) {
    return '';
  }

  return `${pad2(dateTime.getHours())}:${pad2(dateTime.getMinutes())}`;
};

export const getResolvedStageStartDateTime = ({
  stageId = '',
  stageDate = '',
  startTime = '',
  replayStageScheduleById = null
} = {}) => {
  const normalizedStageId = String(stageId || '').trim();
  if (replayStageScheduleById instanceof Map && normalizedStageId) {
    const replayStageSchedule = replayStageScheduleById.get(normalizedStageId);
    if (replayStageSchedule?.replayStartDateTime instanceof Date && !Number.isNaN(replayStageSchedule.replayStartDateTime.getTime())) {
      return replayStageSchedule.replayStartDateTime;
    }
  }

  return getStageDateTime(stageDate, startTime);
};

export const getResolvedStageFinishDateTime = ({
  stageId = '',
  stageDate = '',
  startTime = '',
  finishTime = '',
  replayStageScheduleById = null
} = {}) => {
  const resolvedStartDateTime = getResolvedStageStartDateTime({
    stageId,
    stageDate,
    startTime,
    replayStageScheduleById
  });
  const finishSeconds = parseClockTimeToSeconds(finishTime, 'duration');

  if (!(resolvedStartDateTime instanceof Date) || Number.isNaN(resolvedStartDateTime.getTime())) {
    return null;
  }

  if (!Number.isFinite(finishSeconds) || finishSeconds <= 0) {
    return null;
  }

  return new Date(resolvedStartDateTime.getTime() + (finishSeconds * 1000));
};

export const hasStageDateTimePassed = (clockTime, stageDate, now = new Date()) => {
  const stageDateTime = getStageDateTime(stageDate, clockTime);
  if (!stageDateTime) return false;
  return now >= stageDateTime;
};

export const isPilotRetiredForStage = (pilotId, stageId, retiredStages) => {
  return !!retiredStages?.[pilotId]?.[stageId];
};

export const isPilotAlertForStage = (pilotId, stageId, stageAlerts) => {
  return !!stageAlerts?.[pilotId]?.[stageId];
};

export const parseClockTimeToSeconds = (value, mode = 'clock') => {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length < 2) return null;

  const safeMode = mode === 'duration' ? 'duration' : 'clock';

  if (safeMode === 'duration') {
    if (parts.length === 2) {
      const minutes = Number(parts[0]);
      const [secs, fraction = ''] = parts[1].split('.');
      const seconds = Number(secs) + (fraction ? Number(`0.${fraction}`) : 0);

      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return null;
      }

      return (minutes * 60) + seconds;
    }

    if (parts.length >= 3) {
      const hours = Number(parts[0]);
      const minutes = Number(parts[1]);
      const [secs, fraction = ''] = parts[2].split('.');
      const seconds = Number(secs) + (fraction ? Number(`0.${fraction}`) : 0);

      if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return null;
      }

      return (hours * 3600) + (minutes * 60) + seconds;
    }

    return null;
  }

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

export const isJumpStartForStage = (pilotId, stageId, startTimes, realStartTimes) => {
  const ideal = startTimes?.[pilotId]?.[stageId];
  const real = realStartTimes?.[pilotId]?.[stageId];
  const idealSeconds = parseClockTimeToSeconds(ideal);
  const realSeconds = parseClockTimeToSeconds(real);

  if (!Number.isFinite(idealSeconds) || !Number.isFinite(realSeconds)) {
    return false;
  }

  return realSeconds < idealSeconds;
};

export const getPilotStatus = (pilotId, stageId, startTimes, times, retiredStages, stageDate, now = new Date()) => {
  const startTime = startTimes[pilotId]?.[stageId];
  const finishTime = times[pilotId]?.[stageId];
  const retired = isPilotRetiredForStage(pilotId, stageId, retiredStages);
  
  if (finishTime) {
    return 'finished';
  }

  if (retired) {
    return 'retired';
  }
  
  if (!startTime) {
    return 'not_started';
  }
  
  if (hasStageDateTimePassed(startTime, stageDate, now)) {
    return 'racing';
  }
  
  return 'not_started';
};

const getZeroDurationText = (decimals = 3) => (
  `00:00${clampTimeDecimals(decimals) > 0 ? `.${'0'.repeat(clampTimeDecimals(decimals))}` : ''}`
);

export const getRunningTime = (startTime, stageDate, now = new Date(), decimals = 3, stageStartDateTime = null) => {
  if (!startTime && !(stageStartDateTime instanceof Date)) return getZeroDurationText(decimals);
  
  try {
    const startDate = stageStartDateTime instanceof Date && !Number.isNaN(stageStartDateTime.getTime())
      ? stageStartDateTime
      : getStageDateTime(stageDate, startTime);
    if (!startDate) return getZeroDurationText(decimals);
    
    if (now < startDate) return getZeroDurationText(decimals);
    
    const diff = now - startDate;
    return formatDurationSeconds(diff / 1000, decimals, { fallback: getZeroDurationText(decimals), padMinutes: true });
  } catch (e) {
    return getZeroDurationText(decimals);
  }
};

const formatCountdownTime = (remainingMs) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const startInformationTime = ({
  pilotId,
  stageId,
  startTimes,
  times,
  retiredStages,
  stageDate,
  stageFinishDateTime = null,
  replayStageScheduleById = null,
  now = new Date(),
  decimals = 3,
  includeLabel = true,
  startLabel = 'Start',
  retiredLabel = 'Retired'
}) => {
  const startTime = startTimes[pilotId]?.[stageId] || '';
  const finishTime = times[pilotId]?.[stageId] || '';
  const retired = isPilotRetiredForStage(pilotId, stageId, retiredStages);
  const stageStartDateTime = getResolvedStageStartDateTime({
    stageId,
    stageDate,
    startTime,
    replayStageScheduleById
  });
  const resolvedStageFinishDateTime = stageFinishDateTime instanceof Date && !Number.isNaN(stageFinishDateTime.getTime())
    ? stageFinishDateTime
    : getResolvedStageFinishDateTime({
        stageId,
        stageDate,
        startTime,
        finishTime,
        replayStageScheduleById
      });
  return getStartInformationFromValues({
    startTime,
    finishTime,
    retired,
    stageDate,
    stageStartDateTime,
    stageFinishDateTime: resolvedStageFinishDateTime,
    now,
    decimals,
    includeLabel,
    startLabel,
    retiredLabel
  });
};

export const getStartInformationFromValues = ({
  startTime = '',
  finishTime = '',
  retired = false,
  stageDate,
  stageStartDateTime = null,
  stageFinishDateTime = null,
  now = new Date(),
  decimals = 3,
  includeLabel = true,
  startLabel = 'Start',
  retiredLabel = 'Retired'
}) => {
  const resolvedStageStartDateTime = stageStartDateTime instanceof Date && !Number.isNaN(stageStartDateTime.getTime())
    ? stageStartDateTime
    : getStageDateTime(stageDate, startTime);
  const resolvedStageFinishDateTime = stageFinishDateTime instanceof Date && !Number.isNaN(stageFinishDateTime.getTime())
    ? stageFinishDateTime
    : null;
  const resolvedStartTime = resolvedStageStartDateTime
    ? formatClockTimeFromDate(resolvedStageStartDateTime)
    : startTime;
  const shouldUseReplayFinishGate = resolvedStageFinishDateTime instanceof Date;
  const remainingToStartMs = resolvedStageStartDateTime ? (resolvedStageStartDateTime.getTime() - now.getTime()) : null;
  const elapsedSinceStartMs = resolvedStageStartDateTime ? (now.getTime() - resolvedStageStartDateTime.getTime()) : null;
  let status = 'not_started';

  if (finishTime) {
    if (shouldUseReplayFinishGate) {
      if (now >= resolvedStageFinishDateTime) {
        status = 'finished';
      } else if (resolvedStageStartDateTime && now >= resolvedStageStartDateTime) {
        status = 'racing';
      } else {
        status = 'not_started';
      }
    } else {
      status = 'finished';
    }
  } else if (retired) {
    status = 'retired';
  } else if (resolvedStageStartDateTime && now >= resolvedStageStartDateTime) {
    status = 'racing';
  }

  const shouldShowStartCountdown = status === 'not_started'
    && resolvedStartTime
    && remainingToStartMs !== null
    && remainingToStartMs > 0
    && remainingToStartMs <= 60000;
  const shouldShowRedSignal = status === 'not_started'
    && resolvedStartTime
    && remainingToStartMs !== null
    && remainingToStartMs > 0
    && remainingToStartMs <= 5000;
  const shouldShowGreenSignal = status === 'racing'
    && elapsedSinceStartMs !== null
    && elapsedSinceStartMs >= 0
    && elapsedSinceStartMs < 5000;
  const signal = shouldShowRedSignal
    ? {
        mode: 'red',
        activeCount: Math.max(1, Math.ceil(remainingToStartMs / 1000)),
        totalCount: 5
      }
    : shouldShowGreenSignal
      ? {
          mode: 'green',
          seconds: Math.min(4, Math.max(0, Math.floor((elapsedSinceStartMs || 0) / 1000))),
          activeCount: 5,
          totalCount: 5
        }
      : null;

  let label = '';
  let timer = '';
  let text = '';
  let isCountdown = false;

  if (status === 'retired') {
    label = retiredLabel;
    text = includeLabel ? retiredLabel : '';
  } else if (status === 'racing' && resolvedStartTime) {
    if (shouldShowGreenSignal) {
      label = startLabel;
    }
    timer = getRunningTime(resolvedStartTime, stageDate, now, decimals, resolvedStageStartDateTime);
    text = timer;
  } else if (status === 'finished' && finishTime) {
    timer = finishTime;
    label = retired ? 'RET' : '';
    text = retired && includeLabel ? `${finishTime} RET` : finishTime;
  } else if (resolvedStartTime) {
    label = startLabel;
    timer = shouldShowStartCountdown ? formatCountdownTime(remainingToStartMs) : resolvedStartTime;
    isCountdown = shouldShowStartCountdown;
    text = includeLabel ? `${startLabel}: ${resolvedStartTime}` : resolvedStartTime;
    if (shouldShowStartCountdown) {
      text = includeLabel ? `${startLabel}: ${timer}` : timer;
    }
  }

  return {
    status,
    label,
    timer,
    text,
    isCountdown,
    signal,
    startTime: resolvedStartTime,
    finishTime,
    retired,
    stageStartDateTime: resolvedStageStartDateTime
  };
};

export const parseTime = (timeStr) => {
  if (!timeStr) return 0;
  
  try {
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      const seconds = parseFloat(parts[2]) || 0;
      return (hours * 3600) + (minutes * 60) + seconds;
    }
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    return parseFloat(timeStr) || 0;
  } catch (e) {
    return 0;
  }
};

export const getPilotStageStartTime = (pilotId, stage, startTimes = {}) => (
  startTimes?.[pilotId]?.[stage?.id] || stage?.startTime || ''
);

export const getLapRaceTotalTimeMode = (stage) => (
  stage?.lapRaceTotalTimeMode || 'cumulative'
);

export const getLapRaceActualStartTime = (stage) => (
  stage?.realStartTime || ''
);

export const getLapTimingStartTime = ({
  stage,
  pilotId = '',
  pilot = null,
  startTimes = {}
} = {}) => {
  if (!stage) {
    return '';
  }

  if (stage.type === SUPER_PRIME_STAGE_TYPE) {
    return startTimes?.[pilotId]?.[stage.id]
      || getPilotScheduledStartTime(stage, pilot)
      || stage?.startTime
      || getLapRaceActualStartTime(stage)
      || '';
  }

  return getLapRaceActualStartTime(stage);
};

export const getLapRaceStageClockText = ({
  stage,
  now = new Date(),
  decimals = 3,
  isFinished = false
} = {}) => {
  const actualStartTime = getLapRaceActualStartTime(stage);
  if (!actualStartTime || isFinished) {
    return '';
  }

  if (!hasStageDateTimePassed(actualStartTime, stage?.date, now)) {
    return actualStartTime;
  }

  return getRunningTime(actualStartTime, stage?.date, now, decimals);
};

export const getLapRaceConfiguredLapCount = (stage) => {
  const value = Number(stage?.numberOfLaps || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export const getLapRaceVisibleLapCount = (stage) => {
  const configuredLapCount = getLapRaceConfiguredLapCount(stage);
  return configuredLapCount > 0 ? configuredLapCount : 1;
};

export const getLapRaceStageMetaParts = ({
  stage,
  lapsLabel = 'laps',
  passesLabel = 'passes',
  maxTimeLabel = 'Max Time'
} = {}) => {
  if (!stage || !isLapTimingStageType(stage.type)) {
    return [];
  }

  const parts = [];
  const configuredLapCount = getLapRaceConfiguredLapCount(stage);
  const maxTimeMinutes = Number(stage.lapRaceMaxTimeMinutes || 0);
  const countLabel = stage.type === SUPER_PRIME_STAGE_TYPE ? passesLabel : lapsLabel;

  if (configuredLapCount > 0) {
    parts.push(`${configuredLapCount} ${countLabel}`);
  }

  if (stage.type === SUPER_PRIME_STAGE_TYPE) {
    return parts;
  }

  if (Number.isFinite(maxTimeMinutes) && maxTimeMinutes > 0) {
    parts.push(`${maxTimeLabel}: ${maxTimeMinutes} min`);
  }

  return parts;
};

export const normalizeLapTimingBaselineClock = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return '';
  }

  const parts = normalizedValue.split(':');
  if (parts.length === 2) {
    return `${normalizedValue}:00`;
  }

  return normalizedValue;
};

export const getLapRaceLapDurations = (lapEntries = [], startTime = '') => {
  const safeLapEntries = Array.isArray(lapEntries) ? lapEntries : [];
  const normalizedStartTime = normalizeLapTimingBaselineClock(startTime);
  let previousSeconds = Number.isFinite(parseTime(normalizedStartTime)) ? parseTime(normalizedStartTime) : null;

  return safeLapEntries.map((lapTime) => {
    if (!lapTime || !String(lapTime).trim()) {
      return null;
    }

    const currentSeconds = parseTime(lapTime);
    if (!Number.isFinite(currentSeconds)) {
      previousSeconds = currentSeconds;
      return null;
    }

    if (!Number.isFinite(previousSeconds)) {
      previousSeconds = currentSeconds;
      return null;
    }

    const durationMs = Math.max(0, (currentSeconds - previousSeconds) * 1000);
    previousSeconds = currentSeconds;
    return durationMs;
  });
};

export const getLastFilledLapIndex = (lapEntries = []) => {
  const safeLapEntries = Array.isArray(lapEntries) ? lapEntries : [];
  for (let index = safeLapEntries.length - 1; index >= 0; index -= 1) {
    if (String(safeLapEntries[index] || '').trim()) {
      return index;
    }
  }
  return -1;
};

export const getLapRaceStoredTotalTimeSeconds = ({
  lapEntries = [],
  startTime = '',
  mode = 'cumulative'
} = {}) => {
  const safeLapEntries = Array.isArray(lapEntries) ? lapEntries : [];
  const lapDurations = getLapRaceLapDurations(safeLapEntries, startTime)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (lapDurations.length === 0) {
    return null;
  }

  if (mode === 'bestLap') {
    return Math.min(...lapDurations) / 1000;
  }

  const lastFilledLapIndex = getLastFilledLapIndex(safeLapEntries);
  if (lastFilledLapIndex < 0) {
    return null;
  }

  const normalizedStartTime = normalizeLapTimingBaselineClock(startTime);
  const startSeconds = Number.isFinite(parseTime(normalizedStartTime)) ? parseTime(normalizedStartTime) : null;
  const lastLapClock = safeLapEntries[lastFilledLapIndex] || '';
  const lastLapSeconds = Number.isFinite(parseTime(lastLapClock)) ? parseTime(lastLapClock) : null;

  if (!Number.isFinite(startSeconds) || !Number.isFinite(lastLapSeconds)) {
    return null;
  }

  return Math.max(0, lastLapSeconds - startSeconds);
};

export const getLapRacePilotStageInfo = ({
  pilotId,
  pilot = null,
  stage,
  startTimes = {},
  times = {},
  lapTimes = {},
  retiredStages = {},
  now = new Date(),
  timeDecimals = 3
} = {}) => {
  const safeStage = stage || {};
  const stageId = safeStage.id;
  const totalTimeMode = getLapRaceTotalTimeMode(safeStage);
  const scheduledStartTime = startTimes?.[pilotId]?.[stageId]
    || getPilotScheduledStartTime(safeStage, pilot)
    || safeStage.startTime
    || '';
  const startTime = getLapTimingStartTime({
    stage: safeStage,
    pilotId,
    pilot,
    startTimes
  });
  const finishTime = times?.[pilotId]?.[stageId] || '';
  const retired = isPilotRetiredForStage(pilotId, stageId, retiredStages);
  const pilotLaps = Array.isArray(lapTimes?.[pilotId]?.[stageId]) ? lapTimes[pilotId][stageId] : [];
  const lastFilledLapIndex = getLastFilledLapIndex(pilotLaps);
  const completedLaps = lastFilledLapIndex >= 0 ? lastFilledLapIndex + 1 : 0;
  const totalLaps = getLapRaceConfiguredLapCount(safeStage);
  const startPassed = startTime ? hasStageDateTimePassed(startTime, safeStage.date, now) : false;
  const isFinished = Boolean(finishTime) || (totalLaps > 0 ? lastFilledLapIndex === totalLaps - 1 : false);
  const status = retired
    ? 'retired'
    : isFinished
      ? 'finished'
      : startPassed
        ? 'racing'
        : 'not_started';

  const startSeconds = Number.isFinite(parseTime(startTime)) ? parseTime(startTime) : null;
  const lastLapClock = lastFilledLapIndex >= 0 ? (pilotLaps[lastFilledLapIndex] || '') : '';
  const lastLapSeconds = Number.isFinite(parseTime(lastLapClock)) ? parseTime(lastLapClock) : null;
  const recordedStageMs = (() => {
    if (finishTime) {
      return Math.max(0, parseTime(finishTime) * 1000);
    }
    if (Number.isFinite(startSeconds) && Number.isFinite(lastLapSeconds)) {
      return Math.max(0, (lastLapSeconds - startSeconds) * 1000);
    }
    return 0;
  })();
  const runningStageMs = (() => {
    if (status !== 'racing' || completedLaps > 0) {
      return 0;
    }
    const startDateTime = getStageDateTime(safeStage.date, startTime);
    if (!startDateTime) {
      return 0;
    }
    return Math.max(0, now.getTime() - startDateTime.getTime());
  })();
  const stageTotalMs = status === 'finished'
    ? recordedStageMs
    : status === 'racing'
      ? (completedLaps > 0 ? recordedStageMs : runningStageMs)
      : recordedStageMs;
  const stageTotalText = stageTotalMs > 0
    ? formatDurationMs(stageTotalMs, timeDecimals, { fallback: '' })
    : '';

  return {
    pilotId,
    stage: safeStage,
    totalTimeMode,
    startTime,
    scheduledStartTime,
    finishTime,
    retired,
    status,
    isFinished,
    isRacing: status === 'racing',
    hasStarted: startPassed,
    completedLaps,
    totalLaps,
    lastFilledLapIndex,
    pilotLaps,
    lapDurations: getLapRaceLapDurations(pilotLaps, startTime),
    recordedStageMs,
    stageTotalMs,
    stageTotalText,
    hasTime: stageTotalMs > 0 || completedLaps > 0 || status === 'racing'
  };
};

export const getPilotStageTimingInfo = ({
  pilotId,
  pilot = null,
  stage,
  startTimes = {},
  times = {},
  lapTimes = {},
  retiredStages = {},
  replayStageScheduleById = null,
  now = new Date(),
  timeDecimals = 3,
  includeLabel = true,
  startLabel = 'Start',
  retiredLabel = 'Retired'
} = {}) => {
  if (!pilotId || !stage?.id) {
    return {
      stageType: '',
      status: 'not_started',
      displayText: '',
      hasTime: false,
      isFinished: false,
      isRacing: false,
      retired: false
    };
  }

  if (isLapTimingStageType(stage.type)) {
    const lapInfo = getLapRacePilotStageInfo({
      pilotId,
      pilot,
      stage,
      startTimes,
      times,
      lapTimes,
      retiredStages,
      now,
      timeDecimals
    });

    const startInfo = getStartInformationFromValues({
      startTime: lapInfo.startTime || '',
      finishTime: '',
      retired: lapInfo.retired,
      stageDate: stage.date,
      stageStartDateTime: getResolvedStageStartDateTime({
        stageId: stage.id,
        stageDate: stage.date,
        startTime: lapInfo.startTime || '',
        replayStageScheduleById
      }),
      now,
      decimals: timeDecimals,
      includeLabel,
      startLabel,
      retiredLabel
    });

    const lapSummaryText = lapInfo.totalLaps > 0
      ? `${lapInfo.completedLaps}/${lapInfo.totalLaps}`
      : String(lapInfo.completedLaps || 0);

    let displayText = '';
    const resolvedTotalTimeText = lapInfo.finishTime || lapInfo.stageTotalText || '';
    if (lapInfo.status === 'not_started' || (lapInfo.retired && !lapInfo.stageTotalText)) {
      displayText = startInfo.text || '-';
    } else {
      displayText = resolvedTotalTimeText || startInfo.text || '';
    }

    return {
      ...lapInfo,
      stageType: 'lap',
      timeInfo: startInfo,
      displayText,
      lapSummaryText,
    totalTimeMs: lapInfo.stageTotalMs,
    totalTimeText: resolvedTotalTimeText,
    totalTimeMode: lapInfo.totalTimeMode
  };
  }

  if (isSpecialStageType(stage.type)) {
    const stageFinishDateTime = getResolvedStageFinishDateTime({
      stageId: stage.id,
      stageDate: stage.date,
      startTime: startTimes?.[pilotId]?.[stage.id] || getPilotScheduledStartTime(stage, pilot) || '',
      finishTime: times?.[pilotId]?.[stage.id] || '',
      replayStageScheduleById
    });
    const startInfo = startInformationTime({
      pilotId,
      stageId: stage.id,
      startTimes,
      times,
      retiredStages,
      stageDate: stage.date,
      stageFinishDateTime,
      replayStageScheduleById,
      now,
      decimals: timeDecimals,
      includeLabel,
      startLabel,
      retiredLabel
    });

    return {
      ...startInfo,
      stageType: 'special',
      displayText: startInfo.text || '',
      totalTimeMs: startInfo.status === 'finished'
        ? Math.max(0, parseTime(startInfo.finishTime) * 1000)
        : (startInfo.status === 'racing' && startInfo.timer
          ? Math.max(0, parseTime(startInfo.timer) * 1000)
          : 0),
      totalTimeText: startInfo.timer || '',
      hasTime: Boolean(startInfo.finishTime || startInfo.startTime),
      isFinished: startInfo.status === 'finished',
      isRacing: startInfo.status === 'racing'
    };
  }

  const startTime = startTimes?.[pilotId]?.[stage.id] || getPilotScheduledStartTime(stage, pilot) || '';
  const endTime = getPilotScheduledEndTime(stage, pilot) || '';
  const retired = isPilotRetiredForStage(pilotId, stage.id, retiredStages);

  let status = 'not_started';
  if (retired) {
    status = 'retired';
  } else if (endTime && hasStageDateTimePassed(endTime, stage.date, now)) {
    status = 'finished';
  } else if (startTime && hasStageDateTimePassed(startTime, stage.date, now)) {
    status = 'racing';
  }

  const displayText = `${startTime || ''}${startTime || endTime ? ' -> ' : ''}${endTime || ''}`.trim() || '-';

  return {
    stageType: isTransitStageType(stage.type) ? 'transit' : 'other',
    status,
    displayText,
    startTime,
    endTime,
    retired,
    hasTime: Boolean(startTime || endTime),
    isFinished: status === 'finished',
    isRacing: status === 'racing',
    totalTimeMs: 0,
    totalTimeText: '',
    timeInfo: null
  };
};

export const buildLapRaceLeaderboard = ({
  pilots = [],
  stage,
  lapTimes = {},
  stagePilots = {},
  startTimes = {},
  times = {},
  retiredStages = {},
  now = new Date(),
  timeDecimals = 3,
  fallbackOrderByPilotId = new Map()
} = {}) => {
  if (!stage?.id || !isLapTimingStageType(stage.type)) {
    return [];
  }

  const selectedPilotIds = stagePilots?.[stage.id] || pilots.map((pilot) => pilot.id);
  const selectedPilots = pilots.filter((pilot) => selectedPilotIds.includes(pilot.id));

  return selectedPilots
    .map((pilot) => ({
      pilot,
      ...getPilotStageTimingInfo({
        pilotId: pilot.id,
        pilot,
        stage,
        startTimes,
        times,
        lapTimes,
        retiredStages,
        now,
        timeDecimals,
        includeLabel: false
      })
    }))
    .sort((left, right) => {
      if (left.retired !== right.retired) {
        return left.retired ? 1 : -1;
      }

      if (right.completedLaps !== left.completedLaps) {
        return right.completedLaps - left.completedLaps;
      }

      const leftSortMs = left.stageTotalMs > 0 ? left.stageTotalMs : Number.MAX_SAFE_INTEGER;
      const rightSortMs = right.stageTotalMs > 0 ? right.stageTotalMs : Number.MAX_SAFE_INTEGER;
      if (leftSortMs !== rightSortMs) {
        return leftSortMs - rightSortMs;
      }

      return (fallbackOrderByPilotId.get(left.pilot.id) ?? Number.MAX_SAFE_INTEGER)
        - (fallbackOrderByPilotId.get(right.pilot.id) ?? Number.MAX_SAFE_INTEGER);
    })
    .map((entry, index) => ({
      ...entry,
      position: index + 1,
      sortTime: entry.stageTotalMs > 0 ? entry.stageTotalMs : Number.MAX_SAFE_INTEGER,
      totalTimeMs: entry.stageTotalMs,
      totalTimeText: entry.stageTotalText
    }));
};

export const sortPilotsByStatus = (pilots, categories, stageId, startTimes, times, retiredStages, stageDate, now = new Date()) => {
  const statusOrder = { racing: 0, finished: 1, not_started: 2, retired: 3 };
  const fallbackSortedPilots = sortPilotsByDisplayOrder(pilots, categories);
  const fallbackIndexByPilotId = new Map(fallbackSortedPilots.map((pilot, index) => [pilot.id, index]));
  
  return [...pilots].sort((a, b) => {
    const statusA = getPilotStatus(a.id, stageId, startTimes, times, retiredStages, stageDate, now);
    const statusB = getPilotStatus(b.id, stageId, startTimes, times, retiredStages, stageDate, now);
    const retiredA = isPilotRetiredForStage(a.id, stageId, retiredStages);
    const retiredB = isPilotRetiredForStage(b.id, stageId, retiredStages);
    
    if (statusOrder[statusA] !== statusOrder[statusB]) {
      return statusOrder[statusA] - statusOrder[statusB];
    }

    if (retiredA !== retiredB) {
      return retiredA ? 1 : -1;
    }
    
    // Within same status, sort by time
    if (statusA === 'finished') {
      const timeA = parseTime(times[a.id]?.[stageId]);
      const timeB = parseTime(times[b.id]?.[stageId]);
      if (timeA !== timeB) {
        return timeA - timeB;
      }
    }

    return (fallbackIndexByPilotId.get(a.id) ?? Number.MAX_SAFE_INTEGER)
      - (fallbackIndexByPilotId.get(b.id) ?? Number.MAX_SAFE_INTEGER);
  });
};
