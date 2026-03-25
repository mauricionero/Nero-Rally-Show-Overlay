export const OVERLAY_MOTION_CONFIG = Object.freeze({
  pilotMotionTransitionTime: 500,
  pilotMotionEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  pilotMotionScale: 1.2,
  pilotStatusExitTransitionTime: 100,
  pilotStatusEnterTransitionTime: 500,
  pilotStatusMotionDistance: 50
});

export const getPilotMotionConfig = (overrides = {}) => ({
  duration: Number(overrides.pilotMotionTransitionTime ?? OVERLAY_MOTION_CONFIG.pilotMotionTransitionTime),
  easing: overrides.pilotMotionEasing ?? OVERLAY_MOTION_CONFIG.pilotMotionEasing,
  scale: Number(overrides.pilotMotionScale ?? OVERLAY_MOTION_CONFIG.pilotMotionScale)
});

export const getPilotStatusMotionConfig = (overrides = {}) => {
  const exitDuration = Number(overrides.pilotStatusExitTransitionTime ?? OVERLAY_MOTION_CONFIG.pilotStatusExitTransitionTime);
  const enterDuration = Number(overrides.pilotStatusEnterTransitionTime ?? OVERLAY_MOTION_CONFIG.pilotStatusEnterTransitionTime);

  return {
    exitDuration,
    enterDuration,
    totalDuration: exitDuration + enterDuration,
    distance: Number(overrides.pilotStatusMotionDistance ?? OVERLAY_MOTION_CONFIG.pilotStatusMotionDistance),
    easing: overrides.pilotMotionEasing ?? OVERLAY_MOTION_CONFIG.pilotMotionEasing
  };
};
