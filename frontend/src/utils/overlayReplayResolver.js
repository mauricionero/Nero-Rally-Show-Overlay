import { getStageDateTime } from './rallyHelpers.js';
import { isReplayDebugEnabled } from './debugFlags.js';
import { getPilotTimeOffsetMinutes } from './pilotSchedule.js';
import { buildReplayStageScheduleMap, getFirstCompetitiveStage } from './replaySchedule.js';
import { getStageNumberLabel, getStageTitle } from './stageTypes.js';
import { formatDurationSeconds } from './timeFormat.js';

const parseYouTubeStartSeconds = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return 0;
  }

  if (/^\d+$/.test(rawValue)) {
    return Number(rawValue);
  }

  const hours = Number((rawValue.match(/(\d+)h/i) || [])[1] || 0);
  const minutes = Number((rawValue.match(/(\d+)m/i) || [])[1] || 0);
  const seconds = Number((rawValue.match(/(\d+)s/i) || [])[1] || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
};

export const getReplayVideoId = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  try {
    const url = new URL(rawValue);
    const host = url.hostname.toLowerCase();

    if (host.includes('youtu.be')) {
      return url.pathname.replace(/^\/+/, '').split('/')[0] || '';
    }

    if (url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/embed/')[1]?.split('/')[0] || '';
    }

    if (url.pathname.startsWith('/live/')) {
      return url.pathname.split('/live/')[1]?.split('/')[0] || '';
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      return url.searchParams.get('v') || '';
    }
  } catch {
    return '';
  }

  return '';
};

export const parseReplayTimestampToSeconds = (value) => {
  const parts = String(value || '').trim().split(':').map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }

  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }

  return null;
};

export const buildReplayEmbedUrl = (value, startSeconds = null) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  try {
    const url = new URL(rawValue);
    const host = url.hostname.toLowerCase();

    if (host.includes('youtu.be') || host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const videoId = getReplayVideoId(rawValue);
      if (!videoId) {
        return rawValue;
      }

      const resolvedStartSeconds = Number.isFinite(startSeconds)
        ? Math.max(0, Math.trunc(startSeconds))
        : parseYouTubeStartSeconds(url.searchParams.get('t') || url.searchParams.get('start'));
      const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
      embedUrl.searchParams.set('rel', '0');
      embedUrl.searchParams.set('autoplay', '1');
      embedUrl.searchParams.set('playsinline', '1');

      if (resolvedStartSeconds > 0) {
        embedUrl.searchParams.set('start', String(resolvedStartSeconds));
      }

      return embedUrl.toString();
    }

    return rawValue;
  } catch {
    return rawValue;
  }
};

export const getPilotEffectiveStageId = (pilot = {}, globalCurrentStageId = null) => {
  const pilotStageId = String(pilot?.currentStageId || '').trim();
  const fallbackStageId = String(globalCurrentStageId || '').trim();
  return pilotStageId || fallbackStageId || null;
};

export const getPilotReplayStartSeconds = (pilot = {}, stageId = null) => {
  const normalizedStageId = String(stageId || '').trim();
  if (!normalizedStageId) {
    return null;
  }

  return parseReplayTimestampToSeconds(pilot?.replayStageTimes?.[normalizedStageId] || '');
};

const clampReplaySeekSeconds = (value) => (
  Number.isFinite(value) ? Math.max(0, value) : 0
);

const formatReplayDebugSeconds = (value) => (
  Number.isFinite(value)
    ? formatDurationSeconds(value, 3, { fallback: 'n/a', showHoursIfNeeded: true, padMinutes: true })
    : 'n/a'
);

const formatReplayDebugDateTime = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return 'n/a';
  }

  const pad2 = (item) => String(item).padStart(2, '0');
  const localDateTime = `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;

  try {
    return `${localDateTime} local [${value.toISOString()}]`;
  } catch {
    return localDateTime;
  }
};

const logReplayCalculation = ({
  pilot = {},
  effectiveStageId = null,
  currentStage = null,
  firstCompetitiveStage = null,
  replayStartDate = '',
  replayStartTime = '',
  replayStageIntervalSeconds = 0,
  loadingBufferSeconds = 0,
  currentStageReplaySeconds = null,
  replayBaselineEventDateTime = null,
  firstCompetitiveStageOriginalScheduledDateTime = null,
  currentStageOriginalScheduledDateTime = null,
  currentStageReplayBaseDateTime = null,
  currentStageReplayDateTime = null,
  currentStageReplayScheduleMode = '',
  currentStageReplayGapSeconds = null,
  currentStageReplayAvgMs = null,
  currentStageReplayDeviationMs = null,
  currentStageDeltaSeconds = null,
  currentStageDeltaWithOffsetSeconds = null,
  eventElapsedSeconds = null,
  eventElapsedWithOffsetSeconds = null,
  seekSeconds = null,
  mode = 'fallback'
} = {}) => {
  if (!isReplayDebugEnabled()) {
    return;
  }

  const pilotLabel = [
    pilot?.carNumber ? `#${pilot.carNumber}` : '',
    String(pilot?.name || '').trim()
  ].filter(Boolean).join(' ') || String(pilot?.id || 'unknown');
  const stageLabel = currentStage ? getStageTitle(currentStage) : 'No stage';
  const calculatingForLabel = currentStage
    ? (getStageNumberLabel(currentStage) || getStageTitle(currentStage))
    : 'No stage';
  const firstCompetitiveStageLabel = firstCompetitiveStage ? getStageTitle(firstCompetitiveStage) : 'No first competitive stage';
  const pilotOffsetSeconds = getPilotTimeOffsetMinutes(pilot) * 60;
  const chapterTime = formatReplayDebugSeconds(currentStageReplaySeconds);
  const stageReplayStartTime = formatReplayDebugDateTime(currentStageReplayDateTime);
  const stageReplayBaseTime = formatReplayDebugDateTime(currentStageReplayBaseDateTime);
  const originalStageTime = formatReplayDebugDateTime(currentStageOriginalScheduledDateTime);
  const firstCompetitiveOriginalTime = formatReplayDebugDateTime(firstCompetitiveStageOriginalScheduledDateTime);
  const replayBaseTime = formatReplayDebugDateTime(replayBaselineEventDateTime);
  const stageGapTime = formatReplayDebugSeconds(currentStageReplayGapSeconds);
  const avgTime = formatReplayDebugSeconds(Number.isFinite(currentStageReplayAvgMs) ? currentStageReplayAvgMs / 1000 : null);
  const deviationTime = formatReplayDebugSeconds(Number.isFinite(currentStageReplayDeviationMs) ? currentStageReplayDeviationMs / 1000 : null);
  const pilotOffsetTime = formatReplayDebugSeconds(pilotOffsetSeconds);
  const deltaTime = formatReplayDebugSeconds(currentStageDeltaSeconds);
  const eventElapsedTime = formatReplayDebugSeconds(eventElapsedSeconds);
  const eventElapsedWithOffsetTime = formatReplayDebugSeconds(eventElapsedWithOffsetSeconds);
  const loadingBufferTime = formatReplayDebugSeconds(loadingBufferSeconds);
  const seekTime = formatReplayDebugSeconds(seekSeconds);

  console.log(
    `[ReplayCalc] pilot=${pilotLabel} mode=${mode} stage=${stageLabel} stageId=${effectiveStageId || 'n/a'}\n` +
    `  firstCompetitive=${firstCompetitiveStageLabel}\n` +
    `  calculatingFor=${calculatingForLabel}\n` +
    `  replayBase=${String(replayStartDate || 'n/a')} ${String(replayStartTime || 'n/a')} | eventReplayStart=${replayBaseTime} | firstCompetitiveOriginal=${firstCompetitiveOriginalTime}\n` +
    `  stageSchedule=original=${originalStageTime} baseReplayStart=${stageReplayBaseTime} pilotAdjustedStart=${stageReplayStartTime} mode=${String(currentStageReplayScheduleMode || 'n/a')} ` +
    `calc=(avg=${avgTime}, deviation=${deviationTime}, stageOffset=${stageGapTime}, interval=${formatReplayDebugSeconds(replayStageIntervalSeconds)})\n` +
    `  chapter=${chapterTime} | pilotOffset=${pilotOffsetTime} | firstChapter=${formatReplayDebugSeconds(0)}\n` +
    `  delta=${deltaTime} | deltaWithOffset=${formatReplayDebugSeconds(currentStageDeltaWithOffsetSeconds)} (pilot offset already applied to base replay start) | elapsed=${eventElapsedTime} | elapsedWithOffset=${eventElapsedWithOffsetTime}\n` +
    `  buffer=${loadingBufferTime} | seek=${seekTime}`
  );
};

const logReplayResolvedUrl = ({
  pilot = {},
  mode = 'live',
  effectiveStageId = null,
  replayStartSeconds = null,
  streamUrl = '',
  baseUrl = ''
} = {}) => {
  if (!isReplayDebugEnabled()) {
    return;
  }

  const pilotLabel = [
    pilot?.carNumber ? `#${pilot.carNumber}` : '',
    String(pilot?.name || '').trim()
  ].filter(Boolean).join(' ') || String(pilot?.id || 'unknown');

  console.log(
    `[ReplayCalc] pilot=${pilotLabel} mode=${mode} stageId=${effectiveStageId || 'n/a'} ` +
    `seek=${formatReplayDebugSeconds(replayStartSeconds)} baseUrl=${String(baseUrl || 'n/a')} iframeUrl=${String(streamUrl || 'n/a')}`
  );
};

const getReplayBaselineEventDateTime = (replayStartDate = '', replayStartTime = '') => {
  const dateTime = getStageDateTime(replayStartDate, replayStartTime);
  if (!(dateTime instanceof Date) || Number.isNaN(dateTime.getTime())) {
    return null;
  }

  return dateTime;
};

export const getPilotReplaySeekSeconds = ({
  pilot = {},
  stages = [],
  times = {},
  globalCurrentStageId = null,
  now = new Date(),
  replayStartDate = '',
  replayStartTime = '',
  replayStageIntervalSeconds = 0,
  replayStageScheduleById = null,
  loadingBufferSeconds = 3
} = {}) => {
  const effectiveStageId = getPilotEffectiveStageId(pilot, globalCurrentStageId);
  const currentStage = (Array.isArray(stages) ? stages : []).find((stage) => stage.id === effectiveStageId) || null;
  const firstCompetitiveStage = getFirstCompetitiveStage(stages);
  const currentStageReplaySeconds = getPilotReplayStartSeconds(pilot, effectiveStageId);
  const pilotOffsetSeconds = getPilotTimeOffsetMinutes(pilot) * 60;
  const replayBaselineEventDateTime = getReplayBaselineEventDateTime(replayStartDate, replayStartTime);
  const resolvedReplayStageScheduleById = replayStageScheduleById instanceof Map
    ? replayStageScheduleById
    : buildReplayStageScheduleMap({
      stages,
      times,
      replayStartDate,
      replayStartTime,
      replayStageIntervalSeconds
    });
  const firstCompetitiveStageSchedule = resolvedReplayStageScheduleById.get(firstCompetitiveStage?.id);
  const currentStageSchedule = resolvedReplayStageScheduleById.get(currentStage?.id);
  const firstCompetitiveStageOriginalScheduledDateTime = firstCompetitiveStageSchedule?.originalScheduledDateTime || null;
  const currentStageOriginalScheduledDateTime = currentStageSchedule?.originalScheduledDateTime || null;
  const currentStageReplayBaseDateTime = currentStageSchedule?.replayStartDateTime || null;
  const currentStageReplayDateTime = currentStageReplayBaseDateTime
    ? new Date(currentStageReplayBaseDateTime.getTime() + (pilotOffsetSeconds * 1000))
    : null;
  const currentStageDeltaSeconds = currentStageReplayDateTime
    ? ((now.getTime() - currentStageReplayDateTime.getTime()) / 1000)
    : null;
  const eventElapsedSeconds = replayBaselineEventDateTime
    ? ((now.getTime() - replayBaselineEventDateTime.getTime()) / 1000)
    : null;
  const eventElapsedWithOffsetSeconds = Number.isFinite(eventElapsedSeconds)
    ? eventElapsedSeconds - pilotOffsetSeconds
    : null;
  let seekMode = 'loading-buffer-only';
  let seekSeconds = clampReplaySeekSeconds(loadingBufferSeconds);

  if (Number.isFinite(currentStageReplaySeconds) && Number.isFinite(currentStageDeltaSeconds)) {
    seekMode = 'stage-chapter';
    seekSeconds = clampReplaySeekSeconds(currentStageReplaySeconds + currentStageDeltaSeconds + loadingBufferSeconds);
    logReplayCalculation({
      pilot,
      effectiveStageId,
      currentStage,
      firstCompetitiveStage,
      replayStartDate,
      replayStartTime,
      replayStageIntervalSeconds,
      loadingBufferSeconds,
      currentStageReplaySeconds,
      replayBaselineEventDateTime,
      firstCompetitiveStageOriginalScheduledDateTime,
      currentStageOriginalScheduledDateTime,
      currentStageReplayBaseDateTime,
      currentStageReplayDateTime,
      currentStageReplayScheduleMode: currentStageSchedule?.scheduleMode || '',
      currentStageReplayGapSeconds: currentStageSchedule?.stageGapSeconds,
      currentStageReplayAvgMs: currentStageSchedule?.avgMs,
      currentStageReplayDeviationMs: currentStageSchedule?.deviationMs,
      currentStageDeltaSeconds,
      currentStageDeltaWithOffsetSeconds: currentStageDeltaSeconds,
      eventElapsedSeconds,
      eventElapsedWithOffsetSeconds,
      seekSeconds,
      mode: seekMode
    });
    return seekSeconds;
  }

  if (Number.isFinite(currentStageDeltaSeconds)) {
    seekMode = 'stage-baseline';
    seekSeconds = clampReplaySeekSeconds(currentStageDeltaSeconds + loadingBufferSeconds);
    logReplayCalculation({
      pilot,
      effectiveStageId,
      currentStage,
      firstCompetitiveStage,
      replayStartDate,
      replayStartTime,
      replayStageIntervalSeconds,
      loadingBufferSeconds,
      currentStageReplaySeconds,
      replayBaselineEventDateTime,
      firstCompetitiveStageOriginalScheduledDateTime,
      currentStageOriginalScheduledDateTime,
      currentStageReplayBaseDateTime,
      currentStageReplayDateTime,
      currentStageReplayScheduleMode: currentStageSchedule?.scheduleMode || '',
      currentStageReplayGapSeconds: currentStageSchedule?.stageGapSeconds,
      currentStageReplayAvgMs: currentStageSchedule?.avgMs,
      currentStageReplayDeviationMs: currentStageSchedule?.deviationMs,
      currentStageDeltaSeconds,
      currentStageDeltaWithOffsetSeconds: currentStageDeltaSeconds,
      eventElapsedSeconds,
      eventElapsedWithOffsetSeconds,
      seekSeconds,
      mode: seekMode
    });
    return seekSeconds;
  }

  if (Number.isFinite(eventElapsedWithOffsetSeconds)) {
    seekMode = 'event-baseline';
    seekSeconds = clampReplaySeekSeconds(eventElapsedWithOffsetSeconds + loadingBufferSeconds);
    logReplayCalculation({
      pilot,
      effectiveStageId,
      currentStage,
      firstCompetitiveStage,
      replayStartDate,
      replayStartTime,
      replayStageIntervalSeconds,
      loadingBufferSeconds,
      currentStageReplaySeconds,
      replayBaselineEventDateTime,
      firstCompetitiveStageOriginalScheduledDateTime,
      currentStageOriginalScheduledDateTime,
      currentStageReplayBaseDateTime,
      currentStageReplayDateTime,
      currentStageReplayScheduleMode: currentStageSchedule?.scheduleMode || '',
      currentStageReplayGapSeconds: currentStageSchedule?.stageGapSeconds,
      currentStageReplayAvgMs: currentStageSchedule?.avgMs,
      currentStageReplayDeviationMs: currentStageSchedule?.deviationMs,
      currentStageDeltaSeconds,
      currentStageDeltaWithOffsetSeconds: currentStageDeltaSeconds,
      eventElapsedSeconds,
      eventElapsedWithOffsetSeconds,
      seekSeconds,
      mode: seekMode
    });
    return seekSeconds;
  }

  logReplayCalculation({
    pilot,
    effectiveStageId,
    currentStage,
    firstCompetitiveStage,
    replayStartDate,
    replayStartTime,
    replayStageIntervalSeconds,
    loadingBufferSeconds,
    currentStageReplaySeconds,
    replayBaselineEventDateTime,
    firstCompetitiveStageOriginalScheduledDateTime,
    currentStageOriginalScheduledDateTime,
    currentStageReplayBaseDateTime,
    currentStageReplayDateTime,
    currentStageReplayScheduleMode: currentStageSchedule?.scheduleMode || '',
    currentStageReplayGapSeconds: currentStageSchedule?.stageGapSeconds,
    currentStageReplayAvgMs: currentStageSchedule?.avgMs,
    currentStageReplayDeviationMs: currentStageSchedule?.deviationMs,
    currentStageDeltaSeconds,
    currentStageDeltaWithOffsetSeconds: currentStageDeltaSeconds,
    eventElapsedSeconds,
    eventElapsedWithOffsetSeconds,
    seekSeconds,
    mode: seekMode
  });
  return seekSeconds;
};

export const resolvePilotOverlayPlayback = ({
  pilot = {},
  globalCurrentStageId = null,
  eventIsOver = false,
  stages = [],
  times = {},
  now = new Date(),
  replayStartDate = '',
  replayStartTime = '',
  replayStageIntervalSeconds = 0,
  replayStageScheduleById = null
} = {}) => {
  const liveStreamUrl = String(pilot?.streamUrl || '').trim();
  const replayVideoUrl = String(pilot?.replayVideoUrl || '').trim();
  const effectiveStageId = getPilotEffectiveStageId(pilot, globalCurrentStageId);
  const replayStartSeconds = getPilotReplaySeekSeconds({
    pilot,
    stages,
    times,
    globalCurrentStageId,
    now,
    replayStartDate,
    replayStartTime,
    replayStageIntervalSeconds,
    replayStageScheduleById
  });

  if (eventIsOver && replayVideoUrl) {
    const streamUrl = buildReplayEmbedUrl(replayVideoUrl, replayStartSeconds);
    logReplayResolvedUrl({
      pilot,
      mode: 'replay',
      effectiveStageId,
      replayStartSeconds,
      streamUrl,
      baseUrl: replayVideoUrl
    });
    return {
      mode: 'replay',
      streamUrl,
      hasVideo: Boolean(streamUrl),
      baseUrl: replayVideoUrl,
      effectiveStageId,
      replayStartSeconds
    };
  }

  logReplayResolvedUrl({
    pilot,
    mode: 'live',
    effectiveStageId,
    replayStartSeconds: null,
    streamUrl: liveStreamUrl,
    baseUrl: liveStreamUrl
  });

  return {
    mode: 'live',
    streamUrl: liveStreamUrl,
    hasVideo: Boolean(liveStreamUrl),
    baseUrl: liveStreamUrl,
    effectiveStageId,
    replayStartSeconds: null
  };
};

export const buildPilotOverlayPlaybackMap = ({
  pilots = [],
  globalCurrentStageId = null,
  eventIsOver = false,
  stages = [],
  times = {},
  now = new Date(),
  replayStartDate = '',
  replayStartTime = '',
  replayStageIntervalSeconds = 0
} = {}) => {
  const replayStageScheduleById = eventIsOver
    ? buildReplayStageScheduleMap({
      stages,
      times,
      replayStartDate,
      replayStartTime,
      replayStageIntervalSeconds
    })
    : null;

  return new Map(
    (Array.isArray(pilots) ? pilots : []).map((pilot) => [
      pilot.id,
      resolvePilotOverlayPlayback({
        pilot,
        globalCurrentStageId,
        eventIsOver,
        stages,
        times,
        now,
        replayStartDate,
        replayStartTime,
        replayStageIntervalSeconds,
        replayStageScheduleById
      })
    ])
  );
};
