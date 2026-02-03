// Helper functions for pilot status and timing

export const getPilotStatus = (pilotId, stageId, startTimes, times) => {
  const startTime = startTimes[pilotId]?.[stageId];
  const finishTime = times[pilotId]?.[stageId];
  
  if (finishTime) {
    return 'finished';
  }
  
  if (!startTime) {
    return 'not_started';
  }
  
  const now = new Date();
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);
  
  if (now >= startDate) {
    return 'racing';
  }
  
  return 'not_started';
};

export const getRunningTime = (startTime) => {
  if (!startTime) return '00:00.000';
  
  try {
    const now = new Date();
    const [hours, minutes] = startTime.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    
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

export const sortPilotsByStatus = (pilots, stageId, startTimes, times) => {
  const statusOrder = { racing: 0, finished: 1, not_started: 2 };
  
  return [...pilots].sort((a, b) => {
    const statusA = getPilotStatus(a.id, stageId, startTimes, times);
    const statusB = getPilotStatus(b.id, stageId, startTimes, times);
    
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
