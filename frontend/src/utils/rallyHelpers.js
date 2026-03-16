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

export const getPilotStatus = (pilotId, stageId, startTimes, times, stageDate, now = new Date()) => {
  const startTime = startTimes[pilotId]?.[stageId];
  const finishTime = times[pilotId]?.[stageId];
  
  if (finishTime) {
    return 'finished';
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

export const sortPilotsByStatus = (pilots, stageId, startTimes, times, stageDate, now = new Date()) => {
  const statusOrder = { racing: 0, finished: 1, not_started: 2 };
  
  return [...pilots].sort((a, b) => {
    const statusA = getPilotStatus(a.id, stageId, startTimes, times, stageDate, now);
    const statusB = getPilotStatus(b.id, stageId, startTimes, times, stageDate, now);
    
    if (statusOrder[statusA] !== statusOrder[statusB]) {
      return statusOrder[statusA] - statusOrder[statusB];
    }
    
    // Within same status, sort by time
    if (statusA === 'finished') {
      const timeA = parseTime(times[a.id]?.[stageId]);
      const timeB = parseTime(times[b.id]?.[stageId]);
      return timeA - timeB;
    }
    
    return 0;
  });
};
