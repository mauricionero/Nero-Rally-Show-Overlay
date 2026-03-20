import { sortPilotsByDisplayOrder } from './displayOrder.js';

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

export const hasStageDateTimePassed = (clockTime, stageDate, now = new Date()) => {
  const stageDateTime = getStageDateTime(stageDate, clockTime);
  if (!stageDateTime) return false;
  return now >= stageDateTime;
};

export const isPilotRetiredForStage = (pilotId, stageId, retiredStages) => {
  return !!retiredStages?.[pilotId]?.[stageId];
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

export const getRunningTime = (startTime, stageDate, now = new Date()) => {
  if (!startTime) return '00:00.000';
  
  try {
    const startDate = getStageDateTime(stageDate, startTime);
    if (!startDate) return '00:00.000';
    
    if (now < startDate) return '00:00.000';
    
    const diff = now - startDate;
    const totalSeconds = Math.floor(diff / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const ms = Math.floor((diff % 1000));
    
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  } catch (e) {
    return '00:00.000';
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
  now = new Date(),
  includeLabel = true,
  startLabel = 'Start',
  retiredLabel = 'Retired'
}) => {
  const startTime = startTimes[pilotId]?.[stageId] || '';
  const finishTime = times[pilotId]?.[stageId] || '';
  const retired = isPilotRetiredForStage(pilotId, stageId, retiredStages);
  const status = getPilotStatus(pilotId, stageId, startTimes, times, retiredStages, stageDate, now);
  const stageStartDateTime = getStageDateTime(stageDate, startTime);
  const remainingToStartMs = stageStartDateTime ? (stageStartDateTime.getTime() - now.getTime()) : null;
  const elapsedSinceStartMs = stageStartDateTime ? (now.getTime() - stageStartDateTime.getTime()) : null;
  const shouldShowStartCountdown = status === 'not_started'
    && startTime
    && remainingToStartMs !== null
    && remainingToStartMs > 0
    && remainingToStartMs <= 60000;
  const shouldShowRedSignal = status === 'not_started'
    && startTime
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
  } else if (status === 'racing' && startTime) {
    if (shouldShowGreenSignal) {
      label = startLabel;
    }
    timer = getRunningTime(startTime, stageDate, now);
    text = timer;
  } else if (status === 'finished' && finishTime) {
    timer = finishTime;
    label = retired ? 'RET' : '';
    text = retired && includeLabel ? `${finishTime} RET` : finishTime;
  } else if (startTime) {
    label = startLabel;
    timer = shouldShowStartCountdown ? formatCountdownTime(remainingToStartMs) : startTime;
    isCountdown = shouldShowStartCountdown;
    text = includeLabel ? `${startLabel}: ${startTime}` : startTime;
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
    startTime,
    finishTime,
    retired
  };
};

export const parseTime = (timeStr) => {
  if (!timeStr) return 0;
  
  try {
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    return parseFloat(timeStr) || 0;
  } catch (e) {
    return 0;
  }
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
