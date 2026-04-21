/**
 * Timing source helpers centralize the local-only provenance rules for timing.
 *
 * These source flags are intentionally not part of normal delta sync. They are:
 * - derived locally from the actor/source role that applied the time
 * - persisted in localStorage
 * - included in snapshots for recovery/bootstrap
 *
 * Priority order:
 * mobile < times < setup
 */

export const TIMING_SOURCES = {
  MOBILE: 'mobile',
  TIMES: 'times',
  SETUP: 'setup'
};

const TIMING_SOURCE_PRIORITY = {
  '': 0,
  [TIMING_SOURCES.MOBILE]: 1,
  [TIMING_SOURCES.TIMES]: 2,
  [TIMING_SOURCES.SETUP]: 3
};

export const normalizeTimingSource = (value) => {
  const rawValue = String(value || '').trim().toLowerCase();
  const compactValue = rawValue.replace(/[^a-z0-9]/g, '');

  if (!rawValue) {
    return '';
  }

  if (
    rawValue === TIMING_SOURCES.MOBILE
    || rawValue === 'android-app'
    || rawValue === 'win-telemetry'
    || compactValue.includes('mobile')
    || compactValue.includes('android')
    || compactValue.includes('wintelemetry')
  ) {
    return TIMING_SOURCES.MOBILE;
  }

  if (rawValue === TIMING_SOURCES.TIMES || compactValue.includes('times')) {
    return TIMING_SOURCES.TIMES;
  }

  if (
    rawValue === TIMING_SOURCES.SETUP
    || compactValue.includes('setup')
    || compactValue.includes('manual')
    || compactValue.includes('self')
  ) {
    return TIMING_SOURCES.SETUP;
  }

  return '';
};

export const getTimingSourcePriority = (value) => (
  TIMING_SOURCE_PRIORITY[normalizeTimingSource(value)] || 0
);

export const canTimingSourceOverwrite = (currentSource, incomingSource) => (
  getTimingSourcePriority(incomingSource) >= getTimingSourcePriority(currentSource)
);

export const getHighestTimingSource = (sources = []) => (
  (Array.isArray(sources) ? sources : [])
    .reduce((highestSource, source) => (
      getTimingSourcePriority(source) > getTimingSourcePriority(highestSource)
        ? normalizeTimingSource(source)
        : highestSource
    ), '')
);

export const getTimingSourceLabel = (source) => {
  const normalizedSource = normalizeTimingSource(source);

  if (normalizedSource === TIMING_SOURCES.MOBILE) {
    return 'Mobile app';
  }

  if (normalizedSource === TIMING_SOURCES.TIMES) {
    return 'Times module';
  }

  if (normalizedSource === TIMING_SOURCES.SETUP) {
    return 'Setup & Configuration';
  }

  return '';
};
