const isPlainObject = (value) => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
);

const assignIfDefined = (value, setter, transform = (next) => next) => {
  if (value === undefined || typeof setter !== 'function') {
    return false;
  }

  setter(transform(value));
  return true;
};

const normalizeTimeDecimals = (value) => (
  Math.min(3, Math.max(0, Math.trunc(Number(value) || 0)))
);

const normalizeReplayStageIntervalSeconds = (value) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue >= 0 ? Math.trunc(nextValue) : 0;
};

export const buildRallyConfigExportPayload = ({
  loadFromStorage,
  loadSplitStageTimingMapFromStorage,
  getPilotTelemetrySnapshot,
  dataVersion,
  normalizeRaceTypes
} = {}) => {
  const readStorage = typeof loadFromStorage === 'function'
    ? loadFromStorage
    : (() => undefined);
  const readSplitStageTimingMap = typeof loadSplitStageTimingMapFromStorage === 'function'
    ? loadSplitStageTimingMapFromStorage
    : (() => ({ map: {} }));
  const readTelemetrySnapshot = typeof getPilotTelemetrySnapshot === 'function'
    ? getPilotTelemetrySnapshot
    : (() => ({}));
  const normalizeRaceTypesValue = typeof normalizeRaceTypes === 'function'
    ? normalizeRaceTypes
    : ((value) => (isPlainObject(value) ? value : {}));

  return {
    eventName: readStorage('rally_event_name', ''),
    positions: readStorage('rally_positions', {}),
    lapTimes: readStorage('rally_lap_times', {}),
    stagePilots: readStorage('rally_stage_pilots', {}),
    pilots: readStorage('rally_pilots', []),
    pilotsTelemetry: readTelemetrySnapshot(),
    categories: readStorage('rally_categories', []),
    stages: readStorage('rally_stages', []),
    times: readSplitStageTimingMap('rally_times_stage_', 'rally_times').map,
    arrivalTimes: readStorage('rally_arrival_times', {}),
    startTimes: readStorage('rally_start_times', {}),
    realStartTimes: readStorage('rally_real_start_times', {}),
    stagePilotOffsets: readStorage('rally_stage_pilot_offsets', {}),
    sourceFinishTime: readStorage('rally_source_finish_time', {}),
    sourceLapTime: readStorage('rally_source_lap_time', {}),
    retiredStages: readStorage('rally_retired_stages', {}),
    stageAlerts: readStorage('rally_stage_alerts', {}),
    stageSos: readStorage('rally_stage_sos', {}),
    timeDecimals: readStorage('rally_time_decimals', 1),
    streamConfigs: readStorage('rally_stream_configs', {}),
    globalAudio: readStorage('rally_global_audio', { volume: 100, muted: false }),
    cameras: readStorage('rally_cameras', []),
    externalMedia: readStorage('rally_external_media', []),
    mapPlacemarks: readStorage('rally_map_placemarks', []),
    transitionImageUrl: readStorage('rally_transition_image', ''),
    currentStageId: readStorage('rally_current_stage', null),
    eventIsOver: readStorage('rally_event_is_over', false) === true,
    raceTypes: normalizeRaceTypesValue(readStorage('rally_race_types', {})),
    eventReplayStartDate: readStorage('rally_event_replay_start_date', ''),
    eventReplayStartTime: readStorage('rally_event_replay_start_time', ''),
    eventReplayStageIntervalSeconds: normalizeReplayStageIntervalSeconds(
      readStorage('rally_event_replay_stage_interval_seconds', 0)
    ),
    chromaKey: readStorage('rally_chroma_key', '#000000'),
    mapUrl: readStorage('rally_map_url', ''),
    logoUrl: readStorage('rally_logo_url', ''),
    dataVersion,
    exportDate: new Date().toISOString()
  };
};

export const applyRallyConfigImportPayload = (data, setters = {}) => {
  if (!isPlainObject(data)) {
    return false;
  }

  const normalizePilotArrayPayload = typeof setters.normalizePilotArrayPayload === 'function'
    ? setters.normalizePilotArrayPayload
    : ((value) => (Array.isArray(value) ? value : []));
  const normalizeRaceTypes = typeof setters.normalizeRaceTypes === 'function'
    ? setters.normalizeRaceTypes
    : ((value) => (isPlainObject(value) ? value : {}));
  const applyPilotTelemetryState = typeof setters.applyPilotTelemetryState === 'function'
    ? setters.applyPilotTelemetryState
    : null;

  assignIfDefined(data.pilots, setters.setPilots, normalizePilotArrayPayload);

  const importedPilotTelemetry = data.pilotsTelemetry ?? data.pilotTelemetry;
  if (applyPilotTelemetryState) {
    if (importedPilotTelemetry !== undefined) {
      applyPilotTelemetryState(importedPilotTelemetry);
    } else {
      applyPilotTelemetryState({});
    }
  }

  assignIfDefined(data.categories, setters.setCategories, (value) => (Array.isArray(value) ? value : []));
  assignIfDefined(data.stages, setters.setStages, (value) => (Array.isArray(value) ? value : []));
  assignIfDefined(data.times, setters.setTimes, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.arrivalTimes, setters.setArrivalTimes, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.startTimes, setters.setStartTimes, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.realStartTimes, setters.setRealStartTimes, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.stagePilotOffsets, setters.setStagePilotOffsets, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.sourceFinishTime, setters.setSourceFinishTime, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.sourceLapTime, setters.setSourceLapTime, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.retiredStages, setters.setRetiredStages, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.stageAlerts, setters.setStageAlerts, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.stageSos, setters.setStageSosState, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.timeDecimals, setters.setTimeDecimals, normalizeTimeDecimals);
  assignIfDefined(data.streamConfigs, setters.setStreamConfigs, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.globalAudio, setters.setGlobalAudio, (value) => (
    isPlainObject(value) ? value : { volume: 100, muted: false }
  ));
  assignIfDefined(data.cameras, setters.setCameras, (value) => (Array.isArray(value) ? value : []));
  assignIfDefined(data.externalMedia, setters.setExternalMedia, (value) => (Array.isArray(value) ? value : []));
  assignIfDefined(data.mapPlacemarks, setters.setMapPlacemarks, (value) => (Array.isArray(value) ? value : []));
  assignIfDefined(data.transitionImageUrl, setters.setTransitionImageUrl, (value) => String(value || ''));
  assignIfDefined(data.currentStageId, setters.setCurrentStageId);
  assignIfDefined(data.eventIsOver, setters.setEventIsOver, (value) => value === true);
  assignIfDefined(data.raceTypes, setters.setRaceTypes, normalizeRaceTypes);
  assignIfDefined(data.eventReplayStartDate, setters.setEventReplayStartDate, (value) => String(value || ''));
  assignIfDefined(data.eventReplayStartTime, setters.setEventReplayStartTime, (value) => String(value || ''));
  assignIfDefined(data.eventReplayStageIntervalSeconds, setters.setEventReplayStageIntervalSeconds, normalizeReplayStageIntervalSeconds);
  assignIfDefined(data.chromaKey, setters.setChromaKey, (value) => String(value || ''));
  assignIfDefined(data.mapUrl, setters.setMapUrl, (value) => String(value || ''));
  assignIfDefined(data.logoUrl, setters.setLogoUrl, (value) => String(value || ''));
  assignIfDefined(data.eventName, setters.setEventName, (value) => String(value || ''));
  assignIfDefined(data.positions, setters.setPositions, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.lapTimes, setters.setLapTimes, (value) => (isPlainObject(value) ? value : {}));
  assignIfDefined(data.stagePilots, setters.setStagePilots, (value) => (isPlainObject(value) ? value : {}));

  return true;
};
