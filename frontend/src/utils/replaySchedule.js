import { getStageDateTime } from './rallyHelpers.js';
import { compareStagesBySchedule } from './stageSchedule.js';
import { isLapTimingStageType, isSpecialStageType } from './stageTypes.js';
import { getStageTimingStats, roundSecondsUpToNextMinute } from './timingStats.js';

const MAX_REPLAY_DERIVED_STAGE_DURATION_SECONDS = 3 * 60 * 60;

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

export const isReplayTimedStage = (stage = null) => (
  isSpecialStageType(stage?.type) || isLapTimingStageType(stage?.type)
);

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
    .filter((stage) => isReplayTimedStage(stage))
    .sort(compareStagesBySchedule)[0] || null
);

export const buildReplayStageScheduleMap = ({
  stages = [],
  times = {},
  replayStartDate = '',
  replayStartTime = '',
  replayStageIntervalSeconds = 0
} = {}) => {
  const sortedCompetitiveStages = [...(Array.isArray(stages) ? stages : [])]
    .filter((stage) => isReplayTimedStage(stage))
    .sort(compareStagesBySchedule);
  const replayBaselineDateTime = getStageDateTime(replayStartDate, replayStartTime);
  const normalizedIntervalSeconds = getReplayIntervalSeconds(replayStageIntervalSeconds);
  const scheduleByStageId = new Map();

  if (!(replayBaselineDateTime instanceof Date) || Number.isNaN(replayBaselineDateTime.getTime()) || sortedCompetitiveStages.length === 0) {
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

      previousStage = stage;
      previousReplayStartDateTime = replayStartDateTime;
      if (Number.isFinite(getReplayDerivedDurationSeconds(currentStageStats))) {
        lastValidDerivedDurationSeconds = getReplayDerivedDurationSeconds(currentStageStats);
      }
    });
  });

  return scheduleByStageId;
};
