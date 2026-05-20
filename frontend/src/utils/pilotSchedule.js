import { compareStagesBySchedule } from './stageSchedule.js';
import { isTransitStageType } from './stageTypes.js';

let pilotStageOffsetStateResolver = null;

export const setPilotStageOffsetResolver = (resolver) => {
  pilotStageOffsetStateResolver = typeof resolver === 'function' ? resolver : null;
};

export const getPilotTimeOffsetMinutes = (pilot) => {
  const parsed = parseInt(pilot?.timeOffsetMinutes, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const addMinutesToClockTime = (timeStr, minutesToAdd) => {
  if (!timeStr) return '';

  const parts = timeStr.split(':');
  if (parts.length < 2) return '';

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';

  const totalMinutes = (hours * 60 + minutes + minutesToAdd + 1440) % 1440;
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;

  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
};

const getResolvedStagePilotOffsets = (stagePilotOffsets = null, stages = null) => {
  const resolvedState = typeof pilotStageOffsetStateResolver === 'function'
    ? pilotStageOffsetStateResolver() || {}
    : {};

  return {
    stagePilotOffsets: stagePilotOffsets ?? resolvedState.stagePilotOffsets ?? {},
    stages: stages ?? resolvedState.stages ?? []
  };
};

const getLegacyStagePilotOffsetMinutes = (pilot) => getPilotTimeOffsetMinutes(pilot);

export const getPilotEffectiveStageOffsetMinutes = (stage, pilot, options = {}) => {
  const normalizedStageId = String(stage?.id || '').trim();
  if (!normalizedStageId) {
    return getLegacyStagePilotOffsetMinutes(pilot);
  }

  const { stagePilotOffsets, stages } = getResolvedStagePilotOffsets(options.stagePilotOffsets, options.stages);
  const normalizedPilotId = String(pilot?.id || '').trim();
  const pilotStages = stagePilotOffsets?.[normalizedPilotId];

  if (pilotStages && Object.prototype.hasOwnProperty.call(pilotStages, normalizedStageId)) {
    const explicitOffset = Number(pilotStages[normalizedStageId]);
    if (Number.isFinite(explicitOffset)) {
      return explicitOffset;
    }
  }

  const sortedStages = Array.isArray(stages)
    ? [...stages].sort(compareStagesBySchedule)
    : [];
  const currentIndex = sortedStages.findIndex((entry) => String(entry?.id || '').trim() === normalizedStageId);
  if (currentIndex >= 0 && pilotStages) {
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const previousStageId = String(sortedStages[index]?.id || '').trim();
      if (!previousStageId || !Object.prototype.hasOwnProperty.call(pilotStages, previousStageId)) {
        continue;
      }

      const fallbackOffset = Number(pilotStages[previousStageId]);
      if (Number.isFinite(fallbackOffset)) {
        return fallbackOffset;
      }
    }
  }

  return getLegacyStagePilotOffsetMinutes(pilot);
};

export const getPilotScheduledStartTime = (stage, pilot, stagePilotOffsets = null, stages = null) => {
  if (!stage || !stage.startTime) return '';
  return addMinutesToClockTime(
    stage.startTime,
    getPilotEffectiveStageOffsetMinutes(stage, pilot, { stagePilotOffsets, stages })
  );
};

export const getPilotScheduledEndTime = (stage, pilot, stagePilotOffsets = null, stages = null) => {
  if (!stage || !isTransitStageType(stage.type) || !stage.endTime) return '';
  return addMinutesToClockTime(
    stage.endTime,
    getPilotEffectiveStageOffsetMinutes(stage, pilot, { stagePilotOffsets, stages })
  );
};
