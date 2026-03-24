export const clampTimeDecimals = (value, fallback = 3) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(3, Math.max(0, Math.trunc(numericValue)));
};

const getFractionText = (roundedValue, wholeSeconds, decimals) => {
  if (decimals <= 0) {
    return '';
  }

  const multiplier = 10 ** decimals;
  const fractionValue = Math.round((roundedValue - wholeSeconds) * multiplier);
  return `.${String(fractionValue).padStart(decimals, '0')}`;
};

export const getTimePlaceholder = (format = 'total', decimals = 3) => {
  const safeDecimals = clampTimeDecimals(decimals);
  const fraction = safeDecimals > 0 ? `.${'0'.repeat(safeDecimals)}` : '';

  if (format === 'clock') {
    return `HH:MM:SS${fraction}`;
  }

  return `MM:SS${fraction}`;
};

export const formatDurationSeconds = (totalSeconds, decimals = 3, options = {}) => {
  const {
    fallback = '-',
    showHoursIfNeeded = false,
    padMinutes = false
  } = options;

  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return fallback;
  }

  const safeDecimals = clampTimeDecimals(decimals);
  const roundedValue = Number(totalSeconds.toFixed(safeDecimals));
  const wholeSeconds = Math.floor(roundedValue);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutesWithinHour = Math.floor((wholeSeconds % 3600) / 60);
  const totalMinutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  const secondText = `${String(seconds).padStart(2, '0')}${getFractionText(roundedValue, wholeSeconds, safeDecimals)}`;

  if (showHoursIfNeeded && hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutesWithinHour).padStart(2, '0')}:${secondText}`;
  }

  const minuteValue = showHoursIfNeeded ? totalMinutes : totalMinutes;
  const minuteText = padMinutes ? String(minuteValue).padStart(2, '0') : String(minuteValue);
  return `${minuteText}:${secondText}`;
};

export const formatDurationMs = (ms, decimals = 3, options = {}) => {
  if (!Number.isFinite(ms)) {
    return options.fallback ?? '-';
  }

  return formatDurationSeconds(ms / 1000, decimals, options);
};

export const formatClockFromTotalSeconds = (totalSeconds, decimals = 3, fallback = '') => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return fallback;
  }

  const safeDecimals = clampTimeDecimals(decimals);
  const roundedValue = Number(totalSeconds.toFixed(safeDecimals));
  const wholeSeconds = Math.floor(roundedValue);
  const hours = Math.floor(wholeSeconds / 3600) % 24;
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${getFractionText(roundedValue, wholeSeconds, safeDecimals)}`;
};

export const formatClockFromDate = (date = new Date(), decimals = 3) => {
  const safeDecimals = clampTimeDecimals(decimals);
  const totalSeconds = (
    date.getHours() * 3600
    + date.getMinutes() * 60
    + date.getSeconds()
    + (date.getMilliseconds() / 1000)
  );

  return formatClockFromTotalSeconds(totalSeconds, safeDecimals, '');
};

export const formatSecondsValue = (seconds, decimals = 3, fallback = '-') => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return fallback;
  }

  return Number(seconds).toFixed(clampTimeDecimals(decimals));
};

export const formatMsAsShortTime = (ms, fallback = '--') => {
  if (!Number.isFinite(ms)) return fallback;
  const roundedSeconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(roundedSeconds / 60);
  const secs = roundedSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};
