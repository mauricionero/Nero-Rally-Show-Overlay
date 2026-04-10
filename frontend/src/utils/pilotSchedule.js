import {
  isLapRaceStageType,
  isManualStartStageType,
  isTransitStageType
} from './stageTypes.js';

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

export const getPilotScheduledStartTime = (stage, pilot) => {
  if (!stage || !stage.startTime) return '';
  return addMinutesToClockTime(stage.startTime, getPilotTimeOffsetMinutes(pilot));
};

export const getPilotScheduledEndTime = (stage, pilot) => {
  if (!stage || !isTransitStageType(stage.type) || !stage.endTime) return '';
  return addMinutesToClockTime(stage.endTime, getPilotTimeOffsetMinutes(pilot));
};
