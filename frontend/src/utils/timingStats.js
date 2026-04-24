export const calculateAverageAndDeviation = (values = []) => {
  const normalizedValues = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
  const count = normalizedValues.length;

  if (count === 0) {
    return {
      avg: null,
      deviation: null,
      count: 0
    };
  }

  const avg = normalizedValues.reduce((sum, value) => sum + value, 0) / count;
  const variance = normalizedValues.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / count;

  return {
    avg,
    deviation: Math.sqrt(variance),
    count
  };
};

export const parseDurationStringToMs = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return null;
  }

  const parts = rawValue.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const hasHours = parts.length === 3;
  const hours = hasHours ? Number(parts[0]) : 0;
  const minutes = Number(parts[hasHours ? 1 : 0]);
  const seconds = Number(parts[hasHours ? 2 : 1]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
};

export const getStageTimingValuesMs = ({ times = {}, stageId = null } = {}) => {
  const normalizedStageId = String(stageId || '').trim();
  if (!normalizedStageId || !times || typeof times !== 'object') {
    return [];
  }

  return Object.values(times)
    .map((pilotTimes) => {
      const parsedMs = parseDurationStringToMs(pilotTimes?.[normalizedStageId] || '');
      if (!Number.isFinite(parsedMs) || parsedMs <= 0) {
        return null;
      }

      return parsedMs;
    })
    .filter((value) => Number.isFinite(value));
};

export const getStageTimingStats = ({ times = {}, stageId = null } = {}) => {
  const values = getStageTimingValuesMs({ times, stageId });
  return {
    values,
    ...calculateAverageAndDeviation(values)
  };
};

export const roundSecondsUpToNextMinute = (value) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.ceil(value / 60) * 60;
};
