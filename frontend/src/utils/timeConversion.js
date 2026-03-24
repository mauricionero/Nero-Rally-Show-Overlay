import { clampTimeDecimals, formatClockFromTotalSeconds, formatDurationSeconds, getTimePlaceholder } from './timeFormat.js';

// Time conversion utilities

export const normalizeTimingInput = (value, decimals = 3) => {
  if (typeof value !== 'string') {
    return value ?? '';
  }

  const safeDecimals = clampTimeDecimals(decimals);

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const officialDurationMatch = trimmed.match(/^(\d+)\.(\d{2}),(\d{1,3})$/);
  if (officialDurationMatch) {
    const [, minutes, seconds, fraction] = officialDurationMatch;
    const normalizedOfficial = `${parseInt(minutes, 10)}:${seconds}.${fraction}`;
    return safeDecimals === 0
      ? normalizedOfficial.replace(/\.\d+$/, '')
      : normalizedOfficial.replace(/\.(\d+)/, (_, fraction) => `.${fraction.slice(0, safeDecimals)}`);
  }

  const normalized = trimmed.replace(/,/g, '.');

  if (safeDecimals === 0) {
    return normalized.replace(/\.(\d*)/g, '');
  }

  return normalized.replace(/\.(\d+)/g, (_, fraction) => `.${fraction.slice(0, safeDecimals)}`);
};

export const arrivalTimeToTotal = (arrivalTime, startTime, decimals = 3) => {
  if (!arrivalTime || !startTime) return '';
  
  try {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const arrivalParts = arrivalTime.split(':');
    const arrivalHours = parseInt(arrivalParts[0]);
    const arrivalMinutes = parseInt(arrivalParts[1]);
    const arrivalSeconds = parseFloat(arrivalParts[2] || 0);
    
    const startTotalSeconds = startHours * 3600 + startMinutes * 60;
    const arrivalTotalSeconds = arrivalHours * 3600 + arrivalMinutes * 60 + arrivalSeconds;
    
    let diffSeconds = arrivalTotalSeconds - startTotalSeconds;
    if (diffSeconds < 0) diffSeconds += 24 * 3600; // Handle day rollover

    return formatDurationSeconds(diffSeconds, decimals, { fallback: '' });
  } catch (e) {
    return '';
  }
};

export const totalTimeToArrival = (totalTime, startTime, decimals = 3) => {
  if (!totalTime || !startTime) return '';
  
  try {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const totalParts = totalTime.split(':');
    const totalMinutes = parseInt(totalParts[0]);
    const totalSeconds = parseFloat(totalParts[1] || 0);
    
    const startTotalSeconds = startHours * 3600 + startMinutes * 60;
    const durationSeconds = totalMinutes * 60 + totalSeconds;
    const arrivalTotalSeconds = startTotalSeconds + durationSeconds;

    return formatClockFromTotalSeconds(arrivalTotalSeconds, decimals, '');
  } catch (e) {
    return '';
  }
};

export const getTimeInputPlaceholder = (format = 'total', decimals = 3) => (
  getTimePlaceholder(format, decimals)
);
