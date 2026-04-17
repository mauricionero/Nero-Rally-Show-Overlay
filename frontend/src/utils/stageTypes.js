export const SS_STAGE_TYPE = 'SS';
export const SUPER_PRIME_STAGE_TYPE = 'Super Prime';
export const LAP_RACE_STAGE_TYPE = 'Lap Race';
export const LIAISON_STAGE_TYPE = 'Liaison';
export const SERVICE_PARK_STAGE_TYPE = 'Service Park';

export const isLapRaceStageType = (type) => type === LAP_RACE_STAGE_TYPE;
export const isLapTimingStageType = (type) => (
  type === LAP_RACE_STAGE_TYPE || type === SUPER_PRIME_STAGE_TYPE
);

export const isTransitStageType = (type) => (
  type === LIAISON_STAGE_TYPE || type === SERVICE_PARK_STAGE_TYPE
);

export const isSpecialStageType = (type) => (
  type === SS_STAGE_TYPE || type === SUPER_PRIME_STAGE_TYPE
);

export const isManualStartStageType = (type) => type === SUPER_PRIME_STAGE_TYPE;

export const getStageShortCode = (type) => {
  if (type === SUPER_PRIME_STAGE_TYPE) return 'SSS';
  if (type === SS_STAGE_TYPE) return 'SS';
  return '';
};

export const getStageNumberLabel = (stage) => {
  if (!stage?.ssNumber || !isSpecialStageType(stage.type)) return '';
  return `${getStageShortCode(stage.type)}${stage.ssNumber}`;
};

export const getStageTitle = (stage, separator = ' - ') => {
  if (!stage) return '';

  const stageNumber = getStageNumberLabel(stage);
  if (!stageNumber) return stage.name || '';

  return stage.name ? `${stageNumber}${separator}${stage.name}` : stageNumber;
};
