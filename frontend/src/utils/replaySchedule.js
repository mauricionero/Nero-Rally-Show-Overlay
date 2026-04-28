import { getStageDateTime } from './rallyHelpers.js';
import { isReplayDebugEnabled } from './debugFlags.js';
import { compareStagesBySchedule } from './stageSchedule.js';
import { getStageTitle, isLapTimingStageType, isSpecialStageType, SS_STAGE_TYPE } from './stageTypes.js';
import { getStageTimingStats, roundSecondsUpToNextMinute } from './timingStats.js';
import { formatDurationSeconds } from './timeFormat.js';

const MAX_REPLAY_DERIVED_STAGE_DURATION_SECONDS = 3 * 60 * 60;
let lastReplayScheduleCacheKey = '';
let lastReplayScheduleCacheValue = null;

const getReplayIntervalSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
};

const getStageScheduledDateTime = (stage = null) => {
  const dateTime = getStageDateTime(stage?.date, stage?.startTime || '');
  if (!(dateTime instanceof Date) || Number.isNaN(dateTime.getTime())) {
    return null;
  }

  return dateTime;
};

const getReplayDerivedDurationSeconds = (stageStats = null) => {
  if (!Number.isFinite(stageStats?.avg) || !Number.isFinite(stageStats?.deviation)) {
    return null;
  }

  const roundedDurationSeconds = roundSecondsUpToNextMinute((stageStats.avg + stageStats.deviation) / 1000);
  if (!Number.isFinite(roundedDurationSeconds) || roundedDurationSeconds <= 0) {
    return null;
  }

  if (roundedDurationSeconds > MAX_REPLAY_DERIVED_STAGE_DURATION_SECONDS) {
    return null;
  }

  return roundedDurationSeconds;
};

const pad2 = (value) => String(value).padStart(2, '0');

const formatReplayDebugDateTime = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return 'n/a';
  }

  const localDateTime = `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;

  try {
    return `${localDateTime} local [${value.toISOString()}]`;
  } catch {
    return localDateTime;
  }
};

const formatReplayDebugDuration = (value) => (
  Number.isFinite(value)
    ? formatDurationSeconds(value, 3, { fallback: 'n/a', showHoursIfNeeded: true, padMinutes: true })
    : 'n/a'
);

const formatReplayDebugDurationMs = (value) => (
  Number.isFinite(value)
    ? formatDurationSeconds(value / 1000, 3, { fallback: 'n/a', showHoursIfNeeded: true, padMinutes: true })
    : 'n/a'
);

const logReplayStageSchedule = ({
  stage = null,
  competitive = true,
  originalScheduledDateTime = null,
  replayStartDateTime = null,
  scheduleMode = '',
  stageGapSeconds = null,
  derivedDurationSeconds = null,
  intervalSeconds = null,
  avgMs = null,
  deviationMs = null,
  reason = ''
} = {}) => {
  if (!isReplayDebugEnabled()) {
    return;
  }

  const stageLabel = stage ? getStageTitle(stage) : 'No stage';
  const stageId = String(stage?.id || 'n/a');
  const stageType = String(stage?.type || 'n/a');
  const offsetLabel = scheduleMode === 'baseline'
    ? formatReplayDebugDuration(0)
    : formatReplayDebugDuration(derivedDurationSeconds);
  const details = competitive
    ? `original=${formatReplayDebugDateTime(originalScheduledDateTime)} replayStart=${formatReplayDebugDateTime(replayStartDateTime)} mode=${String(scheduleMode || 'n/a')} calc=(avg=${formatReplayDebugDurationMs(avgMs)}, deviation=${formatReplayDebugDurationMs(deviationMs)}, offset=${offsetLabel}, interval=${formatReplayDebugDuration(intervalSeconds)}) gap=${formatReplayDebugDuration(stageGapSeconds)}`
    : `skipped=${String(reason || 'not-competitive')}`;

  console.log(
    `[ReplaySchedule] stage=${stageLabel} stageId=${stageId} type=${stageType} ${details}`
  );
};

export const isReplayTimedStage = (stage = null) => (
  isSpecialStageType(stage?.type) || isLapTimingStageType(stage?.type)
);

export const isReplayCompetitiveStage = (stage = null) => {
  if (!isReplayTimedStage(stage)) {
    return false;
  }

  if (stage?.type === SS_STAGE_TYPE) {
    const ssNumber = String(stage?.ssNumber ?? '').trim();
    return ssNumber !== '0';
  }

  return true;
};

const getReplayStageFamily = (stage = null) => {
  if (isSpecialStageType(stage?.type)) {
    return 'special';
  }

  if (isLapTimingStageType(stage?.type)) {
    return 'lap';
  }

  return '';
};

export const getFirstCompetitiveStage = (stages = []) => (
  [...(Array.isArray(stages) ? stages : [])]
    .filter((stage) => isReplayCompetitiveStage(stage))
    .sort(compareStagesBySchedule)[0] || null
);

export const buildReplayStageScheduleMap = ({
  stages = [],
  times = {},
  replayStartDate = '',
  replayStartTime = '',
  replayStageIntervalSeconds = 0
} = {}) => {
  const cacheKey = JSON.stringify({
    replayStartDate,
    replayStartTime,
    replayStageIntervalSeconds: getReplayIntervalSeconds(replayStageIntervalSeconds),
    stages: (Array.isArray(stages) ? stages : [])
      .map((stage) => ({
        id: String(stage?.id || ''),
        type: String(stage?.type || ''),
        ssNumber: String(stage?.ssNumber ?? ''),
        startTime: String(stage?.startTime || ''),
        endTime: String(stage?.endTime || ''),
        date: String(stage?.date || '')
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    times: Object.entries(times || {})
      .map(([pilotId, stageTimes]) => ({
        pilotId: String(pilotId),
        stages: Object.entries(stageTimes || {})
          .map(([stageId, time]) => `${String(stageId)}=${String(time || '')}`)
          .sort()
      }))
      .sort((left, right) => left.pilotId.localeCompare(right.pilotId))
  });

  if (cacheKey === lastReplayScheduleCacheKey && lastReplayScheduleCacheValue instanceof Map) {
    return lastReplayScheduleCacheValue;
  }

  const sortedStages = [...(Array.isArray(stages) ? stages : [])]
    .sort(compareStagesBySchedule);
  const sortedCompetitiveStages = sortedStages.filter((stage) => isReplayCompetitiveStage(stage));
  const replayBaselineDateTime = getStageDateTime(replayStartDate, replayStartTime);
  const normalizedIntervalSeconds = getReplayIntervalSeconds(replayStageIntervalSeconds);
  const scheduleByStageId = new Map();

  if (isReplayDebugEnabled()) {
    sortedStages
      .filter((stage) => isReplayTimedStage(stage) && !isReplayCompetitiveStage(stage))
      .forEach((stage) => {
        logReplayStageSchedule({
          stage,
          competitive: false,
          reason: stage?.type === SS_STAGE_TYPE && String(stage?.ssNumber ?? '').trim() === '0'
            ? 'SS0-shakedown'
            : 'not-competitive'
        });
      });
  }

  if (!(replayBaselineDateTime instanceof Date) || Number.isNaN(replayBaselineDateTime.getTime()) || sortedCompetitiveStages.length === 0) {
    lastReplayScheduleCacheKey = cacheKey;
    lastReplayScheduleCacheValue = scheduleByStageId;
    return scheduleByStageId;
  }

  const stageStatsById = new Map(
    sortedCompetitiveStages.map((stage) => [
      stage.id,
      getStageTimingStats({
        times,
        stageId: stage.id
      })
    ])
  );
  const stagesByFamily = sortedCompetitiveStages.reduce((map, stage) => {
    const family = getReplayStageFamily(stage);
    if (!family) {
      return map;
    }

    const existing = map.get(family) || [];
    existing.push(stage);
    map.set(family, existing);
    return map;
  }, new Map());

  stagesByFamily.forEach((familyStages) => {
    let previousStage = null;
    let previousReplayStartDateTime = null;
    let lastValidDerivedDurationSeconds = null;

    familyStages.forEach((stage, index) => {
      const currentStageStats = stageStatsById.get(stage.id) || { avg: null, deviation: null, count: 0 };
      const originalScheduledDateTime = getStageScheduledDateTime(stage);
      let replayStartDateTime = null;
      let scheduleMode = 'baseline';
      let derivedDurationSeconds = null;
      let intervalSeconds = 0;
      let stageGapSeconds = 0;

      if (index === 0) {
        replayStartDateTime = new Date(replayBaselineDateTime.getTime());
      } else if (previousStage && previousReplayStartDateTime) {
        const previousStageStats = stageStatsById.get(previousStage.id) || { avg: null, deviation: null, count: 0 };
        const previousDerivedDurationSeconds = getReplayDerivedDurationSeconds(previousStageStats);
        const currentDerivedDurationSeconds = getReplayDerivedDurationSeconds(currentStageStats);
        const fallbackDerivedDurationSeconds = Number.isFinite(previousDerivedDurationSeconds)
          ? previousDerivedDurationSeconds
          : Number.isFinite(lastValidDerivedDurationSeconds)
            ? lastValidDerivedDurationSeconds
            : Number.isFinite(currentDerivedDurationSeconds)
              ? currentDerivedDurationSeconds
              : null;

        if (Number.isFinite(fallbackDerivedDurationSeconds)) {
          derivedDurationSeconds = fallbackDerivedDurationSeconds;
          intervalSeconds = normalizedIntervalSeconds;
          stageGapSeconds = fallbackDerivedDurationSeconds + normalizedIntervalSeconds;
          scheduleMode = Number.isFinite(previousDerivedDurationSeconds)
            ? 'avg-deviation-interval'
            : Number.isFinite(lastValidDerivedDurationSeconds)
              ? 'carry-forward-avg-deviation-interval'
              : 'current-stage-avg-deviation-interval';
        } else {
          intervalSeconds = normalizedIntervalSeconds;
          stageGapSeconds = normalizedIntervalSeconds;
          scheduleMode = (
            Number.isFinite(previousStageStats.avg) || Number.isFinite(previousStageStats.deviation)
          )
            ? 'interval-only-invalid-duration'
            : 'interval-only';
        }

        replayStartDateTime = new Date(previousReplayStartDateTime.getTime() + (stageGapSeconds * 1000));
      }

      scheduleByStageId.set(stage.id, {
        replayStartDateTime,
        originalScheduledDateTime,
        scheduleMode,
        avgMs: currentStageStats.avg,
        deviationMs: currentStageStats.deviation,
        sampleCount: currentStageStats.count,
        derivedDurationSeconds,
        intervalSeconds,
        stageGapSeconds
      });

      logReplayStageSchedule({
        stage,
        competitive: true,
        originalScheduledDateTime,
        replayStartDateTime,
        scheduleMode,
        stageGapSeconds,
        derivedDurationSeconds,
        intervalSeconds,
        avgMs: currentStageStats.avg,
        deviationMs: currentStageStats.deviation
      });

      previousStage = stage;
      previousReplayStartDateTime = replayStartDateTime;
      const currentStageDerivedDurationSeconds = getReplayDerivedDurationSeconds(currentStageStats);
      if (Number.isFinite(currentStageDerivedDurationSeconds)) {
        lastValidDerivedDurationSeconds = currentStageDerivedDurationSeconds;
      }
    });
  });

  lastReplayScheduleCacheKey = cacheKey;
  lastReplayScheduleCacheValue = scheduleByStageId;
  return scheduleByStageId;
};
