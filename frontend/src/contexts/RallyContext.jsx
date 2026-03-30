import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getWebSocketProvider, generateChannelKey, parseChannelKey, PROVIDER_NAME } from '../utils/websocketProvider';
import WsMessageReceiver from '../utils/wsMessageReceiver.js';
import { getPilotScheduledStartTime } from '../utils/pilotSchedule.js';
import { compareStagesBySchedule } from '../utils/stageSchedule.js';
import { isLapRaceStageType, isManualStartStageType, isSpecialStageType } from '../utils/stageTypes.js';
import { normalizeLatLongString, parseLatLongString } from '../utils/pilotMapMarkers.js';
import { normalizePilotId } from '../utils/pilotIdentity.js';
import { compressMapPlacemarkForTransport } from '../utils/mapPlacemarkCompression.js';

const RallyContext = createContext();
const RallyConfigContext = createContext();
const RallyMetaContext = createContext();
const RallyTimingContext = createContext();
const RallyWsContext = createContext();

export const useRally = () => {
  const context = useContext(RallyContext);
  if (!context) {
    throw new Error('useRally must be used within RallyProvider');
  }
  return context;
};

export const useRallyConfig = () => {
  const context = useContext(RallyConfigContext);
  if (!context) {
    throw new Error('useRallyConfig must be used within RallyProvider');
  }
  return context;
};

export const useRallyMeta = () => {
  const context = useContext(RallyMetaContext);
  if (!context) {
    throw new Error('useRallyMeta must be used within RallyProvider');
  }
  return context;
};

export const useRallyTiming = () => {
  const context = useContext(RallyTimingContext);
  if (!context) {
    throw new Error('useRallyTiming must be used within RallyProvider');
  }
  return context;
};

export const useRallyWs = () => {
  const context = useContext(RallyWsContext);
  if (!context) {
    throw new Error('useRallyWs must be used within RallyProvider');
  }
  return context;
};

const loadFromStorage = (key, defaultValue) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error loading ${key} from localStorage:`, error);
    return defaultValue;
  }
};

const loadSplitStageTimingMapFromStorage = (storagePrefix, legacyKey = null) => {
  const merged = legacyKey ? loadFromStorage(legacyKey, {}) : {};

  if (typeof window === 'undefined' || !window.localStorage) {
    return { map: merged, stageIds: new Set() };
  }

  const stageIds = new Set();

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const storageKey = window.localStorage.key(i);
    if (!storageKey || !storageKey.startsWith(storagePrefix)) {
      continue;
    }

    const stageId = storageKey.slice(storagePrefix.length);
    if (!stageId) {
      continue;
    }

    stageIds.add(stageId);

    const stageMap = loadFromStorage(storageKey, {});
    Object.entries(stageMap || {}).forEach(([pilotId, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }

      merged[pilotId] = {
        ...(merged[pilotId] || {}),
        [stageId]: value
      };
    });
  }

  return { map: merged, stageIds };
};

const STORAGE_DOMAIN_VERSION_KEYS = {
  meta: 'rally_meta_version',
  pilots: 'rally_pilots_version',
  pilotTelemetry: 'rally_pilot_telemetry_version',
  categories: 'rally_categories_version',
  stages: 'rally_stages_version',
  timingCore: 'rally_timing_core_version',
  timingExtra: 'rally_timing_extra_version',
  maps: 'rally_maps_version',
  streams: 'rally_streams_version',
  media: 'rally_media_version'
};
const PERIODIC_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const SETUP_PATCH_MESSAGE_MAX_BYTES = 45000;
const TIMING_PATCH_DEFAULT_VALUES = {
  times: '',
  arrivalTimes: '',
  startTimes: '',
  realStartTimes: '',
  lapTimes: [],
  positions: null,
  stagePilots: [],
  retiredStages: false,
  stageAlerts: false
};
const SETUP_TIMING_SECTION_SET = new Set(Object.keys(TIMING_PATCH_DEFAULT_VALUES));
const TIMES_ROLE_TIMING_SECTION_KEYS = [
  'times',
  'arrivalTimes',
  'startTimes',
  'realStartTimes',
  'lapTimes'
];
const TIMES_ROLE_TIMING_SECTION_SET = new Set(TIMES_ROLE_TIMING_SECTION_KEYS);

const ALL_STORAGE_DOMAINS = Object.keys(STORAGE_DOMAIN_VERSION_KEYS);

const createEntityId = (prefix = '') => {
  const rawId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return prefix ? `${prefix}_${rawId}` : rawId;
};

const ensureUniqueEntityIds = (items, prefix) => {
  const seenIds = new Set();
  let changed = false;

  const repairedItems = items.map((item) => {
    if (!item?.id || seenIds.has(item.id)) {
      changed = true;
      return {
        ...item,
        id: createEntityId(prefix)
      };
    }

    seenIds.add(item.id);
    return item;
  });

  return changed ? repairedItems : items;
};

const pruneEmptyNestedValues = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => (
      item && typeof item === 'object'
        ? pruneEmptyNestedValues(item)
        : item
    ));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const nextObject = {};

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (nestedValue === '' || nestedValue === null || nestedValue === undefined) {
      return;
    }

    const prunedValue = pruneEmptyNestedValues(nestedValue);

    if (Array.isArray(prunedValue)) {
      nextObject[key] = prunedValue;
      return;
    }

    if (prunedValue && typeof prunedValue === 'object') {
      if (Object.keys(prunedValue).length > 0) {
        nextObject[key] = prunedValue;
      }
      return;
    }

    nextObject[key] = prunedValue;
  });

  return nextObject;
};

const mergeMapPlacemarksById = (currentPlacemarks = [], incomingPlacemark = null) => {
  if (!incomingPlacemark?.id) {
    return Array.isArray(currentPlacemarks) ? currentPlacemarks : [];
  }

  const nextPlacemarks = Array.isArray(currentPlacemarks) ? [...currentPlacemarks] : [];
  const existingIndex = nextPlacemarks.findIndex((placemark) => placemark?.id === incomingPlacemark.id);

  if (existingIndex >= 0) {
    nextPlacemarks[existingIndex] = {
      ...nextPlacemarks[existingIndex],
      ...incomingPlacemark
    };
    return nextPlacemarks;
  }

  nextPlacemarks.push(incomingPlacemark);
  return nextPlacemarks;
};

const mergeStagesById = (currentStages = [], incomingStage = null) => {
  if (!incomingStage?.id) {
    return Array.isArray(currentStages) ? currentStages : [];
  }

  const nextStages = Array.isArray(currentStages) ? [...currentStages] : [];
  const existingIndex = nextStages.findIndex((stage) => stage?.id === incomingStage.id);

  if (existingIndex >= 0) {
    nextStages[existingIndex] = {
      ...nextStages[existingIndex],
      ...incomingStage
    };
    return nextStages;
  }

  nextStages.push(incomingStage);
  return nextStages;
};

const mergeEntityArrayItemById = (currentItems = [], id, changes = {}) => {
  if (!id) {
    return Array.isArray(currentItems) ? currentItems : [];
  }

  const nextItems = Array.isArray(currentItems) ? [...currentItems] : [];
  const existingIndex = nextItems.findIndex((item) => item?.id === id);

  if (existingIndex >= 0) {
    nextItems[existingIndex] = {
      ...nextItems[existingIndex],
      ...changes,
      id
    };
    return nextItems;
  }

  nextItems.push({
    id,
    ...changes
  });
  return nextItems;
};

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const areValuesEqual = (left, right) => {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => areValuesEqual(value, right[index]));
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every((key) => areValuesEqual(left[key], right[key]));
  }

  return false;
};

const getChangedObjectFields = (previousValue = {}, nextValue = {}, ignoredKeys = []) => {
  const ignored = new Set(Array.isArray(ignoredKeys) ? ignoredKeys : []);
  const previousObject = isPlainObject(previousValue) ? previousValue : {};
  const nextObject = isPlainObject(nextValue) ? nextValue : {};
  const changed = {};
  const allKeys = new Set([
    ...Object.keys(previousObject),
    ...Object.keys(nextObject)
  ]);

  allKeys.forEach((key) => {
    if (ignored.has(key)) {
      return;
    }

    if (!areValuesEqual(previousObject[key], nextObject[key])) {
      changed[key] = nextObject[key];
    }
  });

  return changed;
};

const diffEntityArrayEntries = (section, previousItems = [], nextItems = []) => {
  const previousMap = new Map(
    (Array.isArray(previousItems) ? previousItems : [])
      .filter((item) => item?.id)
      .map((item) => [item.id, item])
  );
  const nextMap = new Map(
    (Array.isArray(nextItems) ? nextItems : [])
      .filter((item) => item?.id)
      .map((item) => [item.id, item])
  );
  const entries = [];

  previousMap.forEach((item, id) => {
    if (!nextMap.has(id)) {
      entries.push({
        kind: 'entity',
        section,
        id,
        op: 'delete'
      });
    }
  });

  nextMap.forEach((item, id) => {
    const previousItem = previousMap.get(id);

    if (!previousItem) {
      entries.push({
        kind: 'entity',
        section,
        id,
        op: 'upsert',
        changes: getChangedObjectFields({}, item, ['id'])
      });
      return;
    }

    const changes = getChangedObjectFields(previousItem, item, ['id']);
    if (Object.keys(changes).length > 0) {
      entries.push({
        kind: 'entity',
        section,
        id,
        op: 'upsert',
        changes
      });
    }
  });

  return entries;
};

const diffKeyedEntityEntries = (section, previousItems = {}, nextItems = {}) => {
  const previousMap = isPlainObject(previousItems) ? previousItems : {};
  const nextMap = isPlainObject(nextItems) ? nextItems : {};
  const ids = new Set([
    ...Object.keys(previousMap),
    ...Object.keys(nextMap)
  ]);
  const entries = [];

  ids.forEach((id) => {
    const previousValue = previousMap[id];
    const nextValue = nextMap[id];

    if (nextValue === undefined) {
      entries.push({
        kind: 'entity',
        section,
        id,
        op: 'delete'
      });
      return;
    }

    if (previousValue === undefined) {
      entries.push({
        kind: 'entity',
        section,
        id,
        op: 'upsert',
        changes: isPlainObject(nextValue) ? getChangedObjectFields({}, nextValue) : { value: nextValue }
      });
      return;
    }

    const changes = isPlainObject(nextValue) && isPlainObject(previousValue)
      ? getChangedObjectFields(previousValue, nextValue)
      : (!areValuesEqual(previousValue, nextValue) ? { value: nextValue } : {});

    if (Object.keys(changes).length > 0) {
      entries.push({
        kind: 'entity',
        section,
        id,
        op: 'upsert',
        changes
      });
    }
  });

  return entries;
};

const diffTimingLineEntries = (section, previousValue, nextValue) => {
  const entries = [];
  const defaultValue = TIMING_PATCH_DEFAULT_VALUES[section];

  if (section === 'stagePilots') {
    const stageIds = new Set([
      ...Object.keys(previousValue || {}),
      ...Object.keys(nextValue || {})
    ]);

    stageIds.forEach((stageId) => {
      const previousStageValue = previousValue?.[stageId] ?? defaultValue;
      const nextStageValue = nextValue?.[stageId] ?? defaultValue;

      if (!areValuesEqual(previousStageValue, nextStageValue)) {
        entries.push({
          kind: 'timing-line',
          section,
          pilotId: null,
          stageId,
          value: nextStageValue
        });
      }
    });

    return entries;
  }

  const pilotIds = new Set([
    ...Object.keys(previousValue || {}),
    ...Object.keys(nextValue || {})
  ]);

  pilotIds.forEach((pilotId) => {
    const previousPilotStages = previousValue?.[pilotId] || {};
    const nextPilotStages = nextValue?.[pilotId] || {};
    const stageIds = new Set([
      ...Object.keys(previousPilotStages),
      ...Object.keys(nextPilotStages)
    ]);

    stageIds.forEach((stageId) => {
      const previousStageValue = previousPilotStages?.[stageId] ?? defaultValue;
      const nextStageValue = nextPilotStages?.[stageId] ?? defaultValue;

      if (!areValuesEqual(previousStageValue, nextStageValue)) {
        entries.push({
          kind: 'timing-line',
          section,
          pilotId,
          stageId,
          value: nextStageValue
        });
      }
    });
  });

  return entries;
};

const chunkEntriesByApproximateSize = (entries = [], maxBytes = SETUP_PATCH_MESSAGE_MAX_BYTES) => {
  const safeEntries = Array.isArray(entries) ? entries : [];

  if (safeEntries.length === 0) {
    return [];
  }

  const chunks = [];
  let currentChunk = [];
  let currentSize = 2;

  safeEntries.forEach((entry) => {
    const entrySize = JSON.stringify(entry).length + (currentChunk.length > 0 ? 1 : 0);
    if (currentChunk.length > 0 && (currentSize + entrySize) > maxBytes) {
      chunks.push(currentChunk);
      currentChunk = [entry];
      currentSize = JSON.stringify(entry).length + 2;
      return;
    }

    currentChunk.push(entry);
    currentSize += entrySize;
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

const buildSetupPatchEntryKey = (entry = {}) => {
  if (entry.kind === 'meta') {
    return `meta:${entry.field}`;
  }

  if (entry.kind === 'timing-line') {
    return `timing:${entry.section}:${entry.pilotId ?? '_'}:${entry.stageId ?? '_'}`;
  }

  return `entity:${entry.section}:${entry.id ?? '_'}`;
};

const mergeSetupPatchEntries = (existingEntry = null, incomingEntry = null) => {
  if (!incomingEntry) {
    return existingEntry;
  }

  if (!existingEntry) {
    return incomingEntry;
  }

  if (incomingEntry.kind === 'meta' || incomingEntry.kind === 'timing-line') {
    return incomingEntry;
  }

  if (incomingEntry.op === 'delete') {
    return incomingEntry;
  }

  if (existingEntry.op === 'delete') {
    return incomingEntry;
  }

  return {
    ...existingEntry,
    ...incomingEntry,
    changes: {
      ...(existingEntry.changes || {}),
      ...(incomingEntry.changes || {})
    }
  };
};

const normalizeMessageSource = (source) => String(source || '').trim().toLowerCase();
const TRUSTED_PILOT_TELEMETRY_SOURCES = new Set(['android-app', 'setup-relay']);

const buildPilotTelemetryPayload = (telemetry = {}) => {
  const payload = {};

  if (telemetry.latLong !== undefined) payload.latLong = telemetry.latLong;
  if (telemetry.latlongTimestamp !== undefined) payload.latlongTimestamp = telemetry.latlongTimestamp;
  if (telemetry.lastLatLongUpdatedAt !== undefined) payload.lastLatLongUpdatedAt = telemetry.lastLatLongUpdatedAt;
  if (telemetry.speed !== undefined) payload.speed = telemetry.speed;
  if (telemetry.heading !== undefined) payload.heading = telemetry.heading;
  if (telemetry.lastTelemetryAt !== undefined) payload.lastTelemetryAt = telemetry.lastTelemetryAt;

  return payload;
};

const getStageLinkedMapPlacemarks = (stages = [], mapPlacemarks = []) => {
  const linkedPlacemarkIds = new Set(
    (Array.isArray(stages) ? stages : [])
      .map((stage) => stage?.mapPlacemarkId)
      .filter(Boolean)
  );

  return (Array.isArray(mapPlacemarks) ? mapPlacemarks : []).filter((placemark) => linkedPlacemarkIds.has(placemark?.id));
};

export const RallyProvider = ({ children }) => {
  // Event configuration
  const [eventName, setEventName] = useState(() => loadFromStorage('rally_event_name', ''));
  const [positions, setPositions] = useState(() => loadFromStorage('rally_positions', {})); // pilotId -> stageId -> position
  const [lapTimes, setLapTimes] = useState(() => loadFromStorage('rally_lap_times', {})); // pilotId -> stageId -> [lap1, lap2, ...]
  const [stagePilots, setStagePilots] = useState(() => loadFromStorage('rally_stage_pilots', {})); // stageId -> [pilotIds] (for lap race pilot selection)
  
  const [pilots, setPilots] = useState(() => loadFromStorage('rally_pilots', []));
  const [pilotTelemetryByPilotId, setPilotTelemetryByPilotId] = useState(() => loadFromStorage('rally_pilot_telemetry', {}));
  const [categories, setCategories] = useState(() => loadFromStorage('rally_categories', []));
  const [stages, setStages] = useState(() => loadFromStorage('rally_stages', []));
  const [times, setTimes] = useState(() => loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').map);
  const [arrivalTimes, setArrivalTimes] = useState(() => loadFromStorage('rally_arrival_times', {}));
  const [startTimes, setStartTimes] = useState(() => loadFromStorage('rally_start_times', {}));
  const [realStartTimes, setRealStartTimes] = useState(() => loadFromStorage('rally_real_start_times', {}));
  const [retiredStages, setRetiredStages] = useState(() => loadFromStorage('rally_retired_stages', {}));
  const [stageAlerts, setStageAlerts] = useState(() => loadFromStorage('rally_stage_alerts', {}));
  const [mapPlacemarks, setMapPlacemarks] = useState(() => loadFromStorage('rally_map_placemarks', []));
  const [currentStageId, setCurrentStageId] = useState(() => loadFromStorage('rally_current_stage', null));
  const [debugDate, setDebugDate] = useState(() => loadFromStorage('rally_debug_date', ''));
  const [timeDecimals, setTimeDecimals] = useState(() => {
    const storedValue = loadFromStorage('rally_time_decimals', 3);
    const numericValue = Number(storedValue);
    if (!Number.isFinite(numericValue)) {
      return 3;
    }
    return Math.min(3, Math.max(0, Math.trunc(numericValue)));
  });
  const [chromaKey, setChromaKey] = useState(() => loadFromStorage('rally_chroma_key', '#000000'));
  const [mapUrl, setMapUrl] = useState(() => loadFromStorage('rally_map_url', ''));
  const [logoUrl, setLogoUrl] = useState(() => loadFromStorage('rally_logo_url', ''));
  const [transitionImageUrl, setTransitionImageUrl] = useState(() => loadFromStorage('rally_transition_image', ''));
  const [externalMedia, setExternalMedia] = useState(() => loadFromStorage('rally_external_media', []));
  const [streamConfigs, setStreamConfigs] = useState(() => loadFromStorage('rally_stream_configs', {}));
  const [globalAudio, setGlobalAudio] = useState(() => loadFromStorage('rally_global_audio', { volume: 100, muted: false }));
  const [cameras, setCameras] = useState(() => loadFromStorage('rally_cameras', []));
  const [currentScene, setCurrentScene] = useState(1);
  const [dataVersion, setDataVersion] = useState(() => Date.now());

  // WebSocket state
  const [wsEnabled, setWsEnabled] = useState(() => loadFromStorage('rally_ws_enabled', false));
  const [wsChannelKey, setWsChannelKey] = useState(() => loadFromStorage('rally_ws_channel_key', ''));
  const [wsCanPublish, setWsCanPublish] = useState(false);
  const [wsConnectionStatus, setWsConnectionStatus] = useState('disconnected'); // disconnected, connecting, connected, error
  const [wsError, setWsError] = useState(null);
  const [wsLastMessageAt, setWsLastMessageAt] = useState(null);
  const [wsRole, setWsRole] = useState('client');
  const [wsPublishSections, setWsPublishSections] = useState(null);
  const [clientRole, setClientRole] = useState('client');
  const [sessionManifest, setSessionManifest] = useState(() => loadFromStorage('rally_ws_session_manifest', null));
  const [latestSnapshotVersion, setLatestSnapshotVersion] = useState(() => loadFromStorage('rally_ws_snapshot_version', 0));
  const [dirtySetupSections, setDirtySetupSections] = useState(() => loadFromStorage('rally_dirty_setup_sections', []));
  const [lastSetupEditAt, setLastSetupEditAt] = useState(() => loadFromStorage('rally_setup_last_edit_at', 0));
  const [lastSetupSyncAt, setLastSetupSyncAt] = useState(() => loadFromStorage('rally_setup_last_sync_at', 0));
  const [dirtyTimingSections, setDirtyTimingSections] = useState(() => loadFromStorage('rally_dirty_times', []));
  const [timingSectionTouchedAt, setTimingSectionTouchedAt] = useState(() => loadFromStorage('rally_timing_section_touched_at', {}));
  const [timingLineVersions, setTimingLineVersions] = useState(() => loadFromStorage('rally_timing_line_versions', {}));
  const [lastTimesEditAt, setLastTimesEditAt] = useState(() => loadFromStorage('rally_times_last_edit_at', 0));
  const [lastTimesSyncAt, setLastTimesSyncAt] = useState(() => loadFromStorage('rally_times_last_sync_at', 0));
  const [lastTimesAckAt, setLastTimesAckAt] = useState(() => loadFromStorage('rally_times_last_ack_at', 0));
  const [lastTimesAckedEditAt, setLastTimesAckedEditAt] = useState(() => loadFromStorage('rally_times_last_acked_edit_at', 0));
  const [lineSyncResults, setLineSyncResults] = useState({});
  const setupPublishTimer = useRef(null);
  const setupPendingSections = useRef(new Set());
  const dirtyStageSyncChangesRef = useRef(new Map());
  const pendingSetupPatchEntriesRef = useRef(new Map());
  const setupDirtyTrackingReady = useRef(false);
  const bulkSyncModeRef = useRef(false);
  const timesPublishTimer = useRef(null);
  const timesPendingLineKeys = useRef(new Set());
  const wsProvider = useRef(null);
  const wsMessageReceiver = useRef(null);
  const isPublishing = useRef(false);
  const storageReloadTimeout = useRef(null);
  const pendingStorageDomainsRef = useRef(new Set());
  const wsRoleRef = useRef(wsRole);
  const pendingLocalTimingSectionsRef = useRef(new Set());
  const timingLineVersionsRef = useRef(timingLineVersions);
  const publishDirtyTimingSectionsRef = useRef(null);
  const publishDirtySetupSectionsRef = useRef(null);
  const publishDirtyTimingDeltasRef = useRef(null);
  const publishSetupSnapshotRef = useRef(null);
  const publishSessionManifestUpdateRef = useRef(null);
  const persistenceReadyRef = useRef(false);
  const hydratingDomainsRef = useRef(new Set());
  const suppressPilotPublishRef = useRef(0);
  const pilotsRef = useRef(pilots);
  const pilotTelemetryByPilotIdRef = useRef(pilotTelemetryByPilotId);
  const pilotTelemetryQueueRef = useRef(new Map());
  const pilotTelemetryFlushTimerRef = useRef(null);
  const pilotTelemetrySyncSuppressionRef = useRef(0);
  const timesPersistedStageIdsRef = useRef(loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').stageIds);
  const timesPersistenceTimerRef = useRef(null);
  const logicalTimestampRef = useRef(loadFromStorage('rally_logical_timestamp', 0));
  const setupTimingSectionTouchedAtRef = useRef({});
  const timesRef = useRef(times);
  const arrivalTimesRef = useRef(arrivalTimes);
  const startTimesRef = useRef(startTimes);
  const realStartTimesRef = useRef(realStartTimes);
  const lapTimesRef = useRef(lapTimes);
  const positionsRef = useRef(positions);
  const stagePilotsRef = useRef(stagePilots);
  const retiredStagesRef = useRef(retiredStages);
  const stageAlertsRef = useRef(stageAlerts);
  const autoDerivedStartTimesRef = useRef({});
  const previousSetupSyncStateRef = useRef({
    meta: {
      eventName,
      currentStageId,
      debugDate,
      timeDecimals,
      chromaKey,
      mapUrl,
      logoUrl,
      transitionImageUrl,
      globalAudio
    },
    pilots,
    pilotTelemetry: pilotTelemetryByPilotId,
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    lapTimes,
    positions,
    stagePilots,
    retiredStages,
    stageAlerts,
    mapPlacemarks,
    cameras,
    externalMedia,
    streamConfigs
  });

  useEffect(() => {
    pilotsRef.current = pilots;
  }, [pilots]);

  useEffect(() => {
    pilotTelemetryByPilotIdRef.current = pilotTelemetryByPilotId;
  }, [pilotTelemetryByPilotId]);

  const mergePilotTelemetryEntries = useCallback((entries = [], options = {}) => {
    const safeEntries = Array.isArray(entries)
      ? entries
        .map(([pilotId, telemetry]) => [normalizePilotId(pilotId), telemetry])
        .filter(([pilotId, telemetry]) => pilotId && telemetry && typeof telemetry === 'object')
      : [];

    if (safeEntries.length === 0) {
      return;
    }

    if (options.suppressSync) {
      pilotTelemetrySyncSuppressionRef.current += 1;
    }

    setPilotTelemetryByPilotId((prev) => {
      const next = options.replace ? {} : { ...(prev || {}) };

      safeEntries.forEach(([pilotId, telemetry]) => {
        next[pilotId] = {
          ...(!options.replace ? (next[pilotId] || {}) : {}),
          ...telemetry
        };
      });

      pilotTelemetryByPilotIdRef.current = next;
      return next;
    });
  }, []);

  const getNextLogicalTimestamp = useCallback(() => {
    const now = Date.now();
    const next = now > logicalTimestampRef.current
      ? now
      : logicalTimestampRef.current + 1;
    logicalTimestampRef.current = next;
    localStorage.setItem('rally_logical_timestamp', JSON.stringify(next));
    return next;
  }, []);

  const queuePendingSetupPatchEntries = useCallback((entries = []) => {
    const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];

    if (safeEntries.length === 0) {
      return;
    }

    safeEntries.forEach((entry) => {
      const entryKey = buildSetupPatchEntryKey(entry);
      const existingEntry = pendingSetupPatchEntriesRef.current.get(entryKey);
      pendingSetupPatchEntriesRef.current.set(entryKey, mergeSetupPatchEntries(existingEntry, entry));
    });
  }, []);

  const getPendingSetupPatchEntries = useCallback((allowedSections = null) => {
    const entries = Array.from(pendingSetupPatchEntriesRef.current.values());

    if (!Array.isArray(allowedSections) || allowedSections.length === 0) {
      return entries;
    }

    return entries.filter((entry) => allowedSections.includes(entry.section));
  }, []);

  const clearPendingSetupPatchEntries = useCallback((allowedSections = null) => {
    if (!Array.isArray(allowedSections) || allowedSections.length === 0) {
      pendingSetupPatchEntriesRef.current.clear();
      return;
    }

    Array.from(pendingSetupPatchEntriesRef.current.entries()).forEach(([entryKey, entry]) => {
      if (allowedSections.includes(entry?.section)) {
        pendingSetupPatchEntriesRef.current.delete(entryKey);
      }
    });
  }, []);

  const buildSetupPatchMessages = useCallback((allowedSections = null) => {
    const entries = getPendingSetupPatchEntries(allowedSections);

    if (entries.length === 0) {
      return [];
    }

    const batchId = createEntityId('setup_patch');
    const messageTimestamp = getNextLogicalTimestamp();
    const chunks = chunkEntriesByApproximateSize(entries);

    return chunks.map((chunk, partIndex) => ({
      messageType: 'setup-patch',
      batchId,
      partIndex,
      totalParts: chunks.length,
      entries: chunk,
      timestamp: messageTimestamp
    }));
  }, [getNextLogicalTimestamp, getPendingSetupPatchEntries]);

  const publishSetupPatchMessages = useCallback(async (allowedSections = null) => {
    if (!wsProvider.current?.isConnected) {
      return false;
    }

    const messages = buildSetupPatchMessages(allowedSections);
    if (messages.length === 0) {
      return false;
    }

    for (const message of messages) {
      const published = await wsProvider.current.publish(message);
      if (!published) {
        return false;
      }
    }

    return true;
  }, [buildSetupPatchMessages]);

  useEffect(() => {
    persistenceReadyRef.current = true;
  }, []);

  const updateDataVersion = useCallback((domains = []) => {
    if (!persistenceReadyRef.current || isPublishing.current) {
      return;
    }

    const newVersion = Date.now();
    setDataVersion(newVersion);

    const nextDomains = Array.from(new Set(
      (Array.isArray(domains) ? domains : [domains]).filter(Boolean)
    ));

    nextDomains.forEach((domain) => {
      if (hydratingDomainsRef.current.has(domain)) {
        return;
      }
      const storageKey = STORAGE_DOMAIN_VERSION_KEYS[domain];
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(newVersion));
      }
    });
  }, []);

  const flushTimesPersistence = useCallback(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    const timesSnapshot = timesRef.current || {};
    const nextStageBuckets = new Map();

    Object.entries(timesSnapshot).forEach(([pilotId, pilotTimes]) => {
      if (!pilotTimes || typeof pilotTimes !== 'object') {
        return;
      }

      Object.entries(pilotTimes).forEach(([stageId, value]) => {
        if (value === undefined || value === null || value === '') {
          return;
        }

        const currentStageBucket = nextStageBuckets.get(stageId) || {};
        currentStageBucket[pilotId] = value;
        nextStageBuckets.set(stageId, currentStageBucket);
      });
    });

    const nextStageIds = new Set(nextStageBuckets.keys());

    timesPersistedStageIdsRef.current.forEach((stageId) => {
      if (!nextStageIds.has(stageId)) {
        window.localStorage.removeItem(`rally_times_stage_${stageId}`);
      }
    });

    nextStageBuckets.forEach((stageBucket, stageId) => {
      window.localStorage.setItem(`rally_times_stage_${stageId}`, JSON.stringify(stageBucket));
    });

    timesPersistedStageIdsRef.current = nextStageIds;
    window.localStorage.removeItem('rally_times');
    updateDataVersion('timingCore');
  }, [updateDataVersion]);

  const scheduleTimesPersistenceFlush = useCallback(() => {
    if (timesPersistenceTimerRef.current) {
      return;
    }

    timesPersistenceTimerRef.current = window.setTimeout(() => {
      timesPersistenceTimerRef.current = null;
      flushTimesPersistence();
    }, 1000);
  }, [flushTimesPersistence]);

  useEffect(() => () => {
    if (timesPersistenceTimerRef.current) {
      window.clearTimeout(timesPersistenceTimerRef.current);
      timesPersistenceTimerRef.current = null;
    }
  }, []);

  const flushPilotTelemetryQueue = useCallback(() => {
    if (pilotTelemetryQueueRef.current.size === 0) {
      return;
    }

    const updatesByPilotId = new Map(pilotTelemetryQueueRef.current);
    pilotTelemetryQueueRef.current.clear();
    const nextTelemetryByPilotId = { ...(pilotTelemetryByPilotIdRef.current || {}) };
    let shouldRelayTelemetry = false;

    updatesByPilotId.forEach((telemetry, pilotId) => {
      if (!pilotId || !telemetry) {
        return;
      }

      const normalizedPilotId = normalizePilotId(pilotId);
      const currentTelemetry = nextTelemetryByPilotId[normalizedPilotId] || {};
      const nextTelemetry = { ...currentTelemetry };

      if (Object.prototype.hasOwnProperty.call(telemetry, 'latLong')) {
        const normalizedLatLong = normalizeLatLongString(telemetry.latLong || '');
        nextTelemetry.latLong = normalizedLatLong;

        if (!parseLatLongString(normalizedLatLong)) {
          nextTelemetry.lastLatLongUpdatedAt = null;
        } else if (normalizedLatLong !== normalizeLatLongString(currentTelemetry.latLong || '')) {
          nextTelemetry.lastLatLongUpdatedAt = telemetry.lastLatLongUpdatedAt ?? telemetry.latlongTimestamp ?? Date.now();
        }
      }

      if (telemetry.latlongTimestamp !== undefined || telemetry.lastLatLongUpdatedAt !== undefined) {
        const timestampValue = telemetry.latlongTimestamp ?? telemetry.lastLatLongUpdatedAt;
        nextTelemetry.latlongTimestamp = timestampValue;
        nextTelemetry.lastLatLongUpdatedAt = timestampValue;
      }

      if (telemetry.speed !== undefined) {
        nextTelemetry.speed = telemetry.speed;
      }

      if (telemetry.heading !== undefined) {
        nextTelemetry.heading = telemetry.heading;
      }

      if (telemetry.lastTelemetryAt !== undefined) {
        nextTelemetry.lastTelemetryAt = telemetry.lastTelemetryAt;
      }

      if (telemetry.source) {
        nextTelemetry.source = telemetry.source;
      }

      nextTelemetryByPilotId[normalizedPilotId] = nextTelemetry;
      if (normalizeMessageSource(telemetry.source) === 'android-app') {
        shouldRelayTelemetry = true;
      }

      console.debug('[Telemetry] Applied pilot telemetry relation', {
        pilotId: normalizedPilotId,
        source: telemetry.source || 'unknown',
        latLong: nextTelemetry.latLong || '',
        lastTelemetryAt: nextTelemetry.lastTelemetryAt || null
      });
    });

    setPilotTelemetryByPilotId(nextTelemetryByPilotId);

    if (shouldRelayTelemetry && wsEnabled && wsRoleRef.current === 'setup' && wsCanPublish && wsProvider.current?.isConnected) {
      wsProvider.current.publish({
        messageType: 'sync-update',
        section: 'pilotTelemetry',
        source: 'setup-relay',
        payload: {
          pilotTelemetry: updatesByPilotId.size > 0
            ? Object.fromEntries(Array.from(updatesByPilotId.entries()).map(([pilotId, telemetry]) => ([
                normalizePilotId(pilotId),
                buildPilotTelemetryPayload(telemetry)
              ])))
            : {}
        },
        timestamp: getNextLogicalTimestamp()
      }).catch((error) => {
        console.error('[WebSocket] Pilot telemetry relay failed', error);
      });
    }

    window.setTimeout(() => {
      if (suppressPilotPublishRef.current > 0) {
        suppressPilotPublishRef.current -= 1;
      }
    }, 0);
  }, [getNextLogicalTimestamp, wsCanPublish, wsEnabled]);

  useEffect(() => {
    return () => {
      if (pilotTelemetryFlushTimerRef.current) {
        clearTimeout(pilotTelemetryFlushTimerRef.current);
      }
    };
  }, []);

  const schedulePilotTelemetryFlush = useCallback(() => {
    if (pilotTelemetryFlushTimerRef.current) {
      return;
    }

    pilotTelemetryFlushTimerRef.current = window.setTimeout(() => {
      pilotTelemetryFlushTimerRef.current = null;
      flushPilotTelemetryQueue();
    }, 1000);
  }, [flushPilotTelemetryQueue]);

  const buildTimingLineKey = useCallback((section, pilotId = null, stageId = null) => (
    `${section}:${pilotId ?? '_'}:${stageId ?? '_'}`
  ), []);

  // Reload all data from localStorage
  const reloadData = useCallback(() => {
    setEventName(loadFromStorage('rally_event_name', ''));
    setPositions(loadFromStorage('rally_positions', {}));
    setLapTimes(loadFromStorage('rally_lap_times', {}));
    setStagePilots(loadFromStorage('rally_stage_pilots', {}));
    setPilots(loadFromStorage('rally_pilots', []));
    setPilotTelemetryByPilotId(loadFromStorage('rally_pilot_telemetry', {}));
    setCategories(loadFromStorage('rally_categories', []));
    setStages(loadFromStorage('rally_stages', []));
    setTimes(loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').map);
    setArrivalTimes(loadFromStorage('rally_arrival_times', {}));
    setStartTimes(loadFromStorage('rally_start_times', {}));
    setRealStartTimes(loadFromStorage('rally_real_start_times', {}));
    setRetiredStages(loadFromStorage('rally_retired_stages', {}));
    setStageAlerts(loadFromStorage('rally_stage_alerts', {}));
    setMapPlacemarks(loadFromStorage('rally_map_placemarks', []));
    setCurrentStageId(loadFromStorage('rally_current_stage', null));
    setDebugDate(loadFromStorage('rally_debug_date', ''));
    const storedTimeDecimals = loadFromStorage('rally_time_decimals', 3);
    const normalizedTimeDecimals = Number.isFinite(Number(storedTimeDecimals))
      ? Math.min(3, Math.max(0, Math.trunc(Number(storedTimeDecimals))))
      : 3;
    setTimeDecimals(normalizedTimeDecimals);
    setChromaKey(loadFromStorage('rally_chroma_key', '#000000'));
    setMapUrl(loadFromStorage('rally_map_url', ''));
    setLogoUrl(loadFromStorage('rally_logo_url', ''));
    setTransitionImageUrl(loadFromStorage('rally_transition_image', ''));
    setExternalMedia(loadFromStorage('rally_external_media', []));
    setStreamConfigs(loadFromStorage('rally_stream_configs', {}));
    setGlobalAudio(loadFromStorage('rally_global_audio', { volume: 100, muted: false }));
    setCameras(loadFromStorage('rally_cameras', []));
    setDataVersion(Date.now());
  }, [wsRole]);

  const wasSetupTimingSectionTouchedRecently = useCallback((sectionKey, now = Date.now()) => {
    if (clientRole !== 'setup') {
      return false;
    }

    const touchedAt = Number(setupTimingSectionTouchedAtRef.current?.[sectionKey] || 0);
    return touchedAt > 0 && (now - touchedAt) < 1500;
  }, [clientRole]);

  const shouldPreserveLocalTimingSection = useCallback((sectionKey, now = Date.now()) => (
    pendingLocalTimingSectionsRef.current.has(sectionKey)
    || wasSetupTimingSectionTouchedRecently(sectionKey, now)
  ), [wasSetupTimingSectionTouchedRecently]);

  const reloadStorageDomains = useCallback((domains = []) => {
    const nextDomains = Array.from(new Set(
      (Array.isArray(domains) ? domains : [domains]).filter(Boolean)
    ));

    if (nextDomains.length === 0) {
      return;
    }

    if (nextDomains.includes('meta')) {
      hydratingDomainsRef.current.add('meta');
      setEventName(loadFromStorage('rally_event_name', ''));
      setCurrentStageId(loadFromStorage('rally_current_stage', null));
      setDebugDate(loadFromStorage('rally_debug_date', ''));
      const storedTimeDecimals = loadFromStorage('rally_time_decimals', 3);
      const normalizedTimeDecimals = Number.isFinite(Number(storedTimeDecimals))
        ? Math.min(3, Math.max(0, Math.trunc(Number(storedTimeDecimals))))
        : 3;
      setTimeDecimals(normalizedTimeDecimals);
      setChromaKey(loadFromStorage('rally_chroma_key', '#000000'));
      setMapUrl(loadFromStorage('rally_map_url', ''));
      setLogoUrl(loadFromStorage('rally_logo_url', ''));
      setTransitionImageUrl(loadFromStorage('rally_transition_image', ''));
      setGlobalAudio(loadFromStorage('rally_global_audio', { volume: 100, muted: false }));
    }

    if (nextDomains.includes('pilots')) {
      hydratingDomainsRef.current.add('pilots');
      setPilots(loadFromStorage('rally_pilots', []));
    }

    if (nextDomains.includes('pilotTelemetry')) {
      hydratingDomainsRef.current.add('pilotTelemetry');
      setPilotTelemetryByPilotId(loadFromStorage('rally_pilot_telemetry', {}));
    }

    if (nextDomains.includes('categories')) {
      hydratingDomainsRef.current.add('categories');
      setCategories(loadFromStorage('rally_categories', []));
    }

    if (nextDomains.includes('stages')) {
      hydratingDomainsRef.current.add('stages');
      setStages(loadFromStorage('rally_stages', []));
    }

    if (nextDomains.includes('timingCore')) {
      const reloadAt = Date.now();
      const shouldReloadTimes = !shouldPreserveLocalTimingSection('times', reloadAt);
      const shouldReloadArrivalTimes = !shouldPreserveLocalTimingSection('arrivalTimes', reloadAt);
      const shouldReloadStartTimes = !shouldPreserveLocalTimingSection('startTimes', reloadAt);
      const shouldReloadRealStartTimes = !shouldPreserveLocalTimingSection('realStartTimes', reloadAt);

      if (shouldReloadTimes || shouldReloadArrivalTimes || shouldReloadStartTimes || shouldReloadRealStartTimes) {
        hydratingDomainsRef.current.add('timingCore');
        if (shouldReloadTimes) setTimes(loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').map);
        if (shouldReloadArrivalTimes) setArrivalTimes(loadFromStorage('rally_arrival_times', {}));
        if (shouldReloadStartTimes) setStartTimes(loadFromStorage('rally_start_times', {}));
        if (shouldReloadRealStartTimes) setRealStartTimes(loadFromStorage('rally_real_start_times', {}));
      }
    }

    if (nextDomains.includes('timingExtra')) {
      hydratingDomainsRef.current.add('timingExtra');
      setPositions(loadFromStorage('rally_positions', {}));
      setLapTimes(loadFromStorage('rally_lap_times', {}));
      setStagePilots(loadFromStorage('rally_stage_pilots', {}));
      setRetiredStages(loadFromStorage('rally_retired_stages', {}));
      setStageAlerts(loadFromStorage('rally_stage_alerts', {}));
    }

    if (nextDomains.includes('maps')) {
      hydratingDomainsRef.current.add('maps');
      setMapPlacemarks(loadFromStorage('rally_map_placemarks', []));
    }

    if (nextDomains.includes('streams')) {
      hydratingDomainsRef.current.add('streams');
      setStreamConfigs(loadFromStorage('rally_stream_configs', {}));
      setCameras(loadFromStorage('rally_cameras', []));
    }

    if (nextDomains.includes('media')) {
      hydratingDomainsRef.current.add('media');
      setExternalMedia(loadFromStorage('rally_external_media', []));
    }

    setDataVersion(Date.now());

    window.setTimeout(() => {
      nextDomains.forEach((domain) => hydratingDomainsRef.current.delete(domain));
    }, 0);
  }, [shouldPreserveLocalTimingSection]);

  // Apply data from WebSocket message
  useEffect(() => {
    wsRoleRef.current = wsRole;
  }, [wsRole]);

  useEffect(() => {
    timingLineVersionsRef.current = timingLineVersions;
  }, [timingLineVersions]);

  useEffect(() => {
    timesRef.current = times;
  }, [times]);

  useEffect(() => {
    arrivalTimesRef.current = arrivalTimes;
  }, [arrivalTimes]);

  useEffect(() => {
    startTimesRef.current = startTimes;
  }, [startTimes]);

  useEffect(() => {
    realStartTimesRef.current = realStartTimes;
  }, [realStartTimes]);

  useEffect(() => {
    lapTimesRef.current = lapTimes;
  }, [lapTimes]);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    stagePilotsRef.current = stagePilots;
  }, [stagePilots]);

  useEffect(() => {
    retiredStagesRef.current = retiredStages;
  }, [retiredStages]);

  useEffect(() => {
    stageAlertsRef.current = stageAlerts;
  }, [stageAlerts]);

  useEffect(() => {
    const nextPendingSections = new Set(
      clientRole === 'times'
        ? (Array.isArray(dirtyTimingSections) ? dirtyTimingSections : [])
          .filter((section) => Number(timingSectionTouchedAt?.[section] || 0) > Number(lastTimesAckedEditAt || 0))
        : []
    );
    pendingLocalTimingSectionsRef.current = nextPendingSections;
  }, [clientRole, dirtyTimingSections, lastTimesAckedEditAt, timingSectionTouchedAt]);

  const getTimingLineCurrentValue = useCallback((section, pilotId, stageId) => {
    switch (section) {
      case 'times':
        return timesRef.current?.[pilotId]?.[stageId] || '';
      case 'arrivalTimes':
        return arrivalTimesRef.current?.[pilotId]?.[stageId] || '';
      case 'startTimes':
        return startTimesRef.current?.[pilotId]?.[stageId] || '';
      case 'realStartTimes':
        return realStartTimesRef.current?.[pilotId]?.[stageId] || '';
      case 'lapTimes':
        return lapTimesRef.current?.[pilotId]?.[stageId] || [];
      case 'positions':
        return positionsRef.current?.[pilotId]?.[stageId] ?? null;
      case 'stagePilots':
        return stagePilotsRef.current?.[stageId] || [];
      case 'retiredStages':
        return !!retiredStagesRef.current?.[pilotId]?.[stageId];
      case 'stageAlerts':
        return !!stageAlertsRef.current?.[pilotId]?.[stageId];
      default:
        return null;
    }
  }, []);

  const setTimingLineValue = useCallback((section, pilotId, stageId, value) => {
    switch (section) {
      case 'times':
        setTimes((prev) => ({
          ...prev,
          [pilotId]: {
            ...(prev[pilotId] || {}),
            [stageId]: value || ''
          }
        }));
        break;
      case 'arrivalTimes':
        setArrivalTimes((prev) => ({
          ...prev,
          [pilotId]: {
            ...(prev[pilotId] || {}),
            [stageId]: value || ''
          }
        }));
        break;
      case 'startTimes':
        setStartTimes((prev) => ({
          ...prev,
          [pilotId]: {
            ...(prev[pilotId] || {}),
            [stageId]: value || ''
          }
        }));
        break;
      case 'realStartTimes':
        setRealStartTimes((prev) => ({
          ...prev,
          [pilotId]: {
            ...(prev[pilotId] || {}),
            [stageId]: value || ''
          }
        }));
        break;
      case 'lapTimes':
        setLapTimes((prev) => ({
          ...prev,
          [pilotId]: {
            ...(prev[pilotId] || {}),
            [stageId]: Array.isArray(value) ? [...value] : []
          }
        }));
        break;
      case 'positions':
        setPositions((prev) => ({
          ...prev,
          [pilotId]: {
            ...(prev[pilotId] || {}),
            [stageId]: value ?? null
          }
        }));
        break;
      case 'stagePilots':
        setStagePilots((prev) => ({
          ...prev,
          [stageId]: Array.isArray(value) ? [...value] : []
        }));
        break;
      case 'retiredStages':
        setRetiredStages((prev) => {
          const next = { ...prev };
          const nextPilotStages = { ...(next[pilotId] || {}) };
          if (value) {
            nextPilotStages[stageId] = stageId;
          } else {
            delete nextPilotStages[stageId];
          }
          if (Object.keys(nextPilotStages).length > 0) {
            next[pilotId] = nextPilotStages;
          } else {
            delete next[pilotId];
          }
          return next;
        });
        break;
      case 'stageAlerts':
        setStageAlerts((prev) => {
          const next = { ...prev };
          const nextPilotStages = { ...(next[pilotId] || {}) };
          if (value) {
            nextPilotStages[stageId] = stageId;
          } else {
            delete nextPilotStages[stageId];
          }
          if (Object.keys(nextPilotStages).length > 0) {
            next[pilotId] = nextPilotStages;
          } else {
            delete next[pilotId];
          }
          return next;
        });
        break;
      default:
        break;
    }
  }, []);

  const applySetupPatchEntry = useCallback((entry) => {
    if (!entry?.section) {
      return;
    }

    if (entry.kind === 'meta') {
      switch (entry.field) {
        case 'eventName':
          setEventName(entry.value);
          break;
        case 'currentStageId':
          setCurrentStageId(entry.value);
          break;
        case 'debugDate':
          setDebugDate(entry.value);
          break;
        case 'timeDecimals':
          setTimeDecimals(Math.min(3, Math.max(0, Math.trunc(Number(entry.value) || 0))));
          break;
        case 'chromaKey':
          setChromaKey(entry.value);
          break;
        case 'mapUrl':
          setMapUrl(entry.value);
          break;
        case 'logoUrl':
          setLogoUrl(entry.value);
          break;
        case 'transitionImageUrl':
          setTransitionImageUrl(entry.value);
          break;
        case 'globalAudio':
          setGlobalAudio(entry.value);
          break;
        default:
          break;
      }
      return;
    }

    if (entry.kind === 'timing-line') {
      setTimingLineValue(entry.section, entry.pilotId ?? null, entry.stageId ?? null, entry.value);
      return;
    }

    const { id, op, changes = {} } = entry;

    switch (entry.section) {
      case 'pilots':
        if (op === 'delete') {
          setPilots((prev) => prev.filter((item) => item?.id !== id));
        } else {
          setPilots((prev) => mergeEntityArrayItemById(prev, id, changes));
        }
        break;
      case 'categories':
        if (op === 'delete') {
          setCategories((prev) => prev.filter((item) => item?.id !== id));
        } else {
          setCategories((prev) => mergeEntityArrayItemById(prev, id, changes));
        }
        break;
      case 'stages':
        if (op === 'delete') {
          setStages((prev) => prev.filter((item) => item?.id !== id));
        } else {
          setStages((prev) => mergeEntityArrayItemById(prev, id, changes));
        }
        break;
      case 'mapPlacemarks':
        if (op === 'delete') {
          setMapPlacemarks((prev) => prev.filter((item) => item?.id !== id));
        } else {
          setMapPlacemarks((prev) => mergeEntityArrayItemById(prev, id, changes));
        }
        break;
      case 'cameras':
        if (op === 'delete') {
          setCameras((prev) => prev.filter((item) => item?.id !== id));
        } else {
          setCameras((prev) => mergeEntityArrayItemById(prev, id, changes));
        }
        break;
      case 'externalMedia':
        if (op === 'delete') {
          setExternalMedia((prev) => prev.filter((item) => item?.id !== id));
        } else {
          setExternalMedia((prev) => mergeEntityArrayItemById(prev, id, changes));
        }
        break;
      case 'pilotTelemetry':
        setPilotTelemetryByPilotId((prev) => {
          const next = { ...(prev || {}) };
          if (op === 'delete') {
            delete next[id];
            return next;
          }

          next[id] = {
            ...(next[id] || {}),
            ...(changes || {})
          };
          return next;
        });
        break;
      case 'streamConfigs':
        setStreamConfigs((prev) => {
          const next = { ...(prev || {}) };
          if (op === 'delete') {
            delete next[id];
            return next;
          }

          next[id] = {
            ...(next[id] || {}),
            ...(changes || {})
          };
          return next;
        });
        break;
      default:
        break;
    }
  }, [setTimingLineValue]);

  const publishTimingDeltaEntries = useCallback(async (entries) => {
    if (!wsProvider.current?.isConnected || !Array.isArray(entries) || entries.length === 0) {
      return false;
    }

    return wsProvider.current.publish({
      messageType: 'timing-delta',
      entries,
      senderRole: wsRoleRef.current || clientRole,
      timestamp: getNextLogicalTimestamp()
    });
  }, [clientRole, getNextLogicalTimestamp]);

  const buildPendingTimingDeltaEntries = useCallback((since = null, pendingOnly = false) => {
    const versionEntries = Object.values(timingLineVersionsRef.current || {});

    return versionEntries
      .filter((entry) => {
        if (!entry?.section) return false;
        if (wsRoleRef.current === 'times' && !TIMES_ROLE_TIMING_SECTION_SET.has(entry.section)) {
          return false;
        }
        if (pendingOnly && Number(entry.localVersion || 0) <= Number(entry.ackedVersion || 0)) {
          return false;
        }
        if (since !== null && Number(entry.updatedAt || 0) <= Number(since || 0)) {
          return false;
        }
        return true;
      })
      .map((entry) => ({
        key: buildTimingLineKey(entry.section, entry.pilotId, entry.stageId),
        section: entry.section,
        pilotId: entry.pilotId ?? null,
        stageId: entry.stageId ?? null,
        localVersion: Number(entry.localVersion || 0),
        value: getTimingLineCurrentValue(entry.section, entry.pilotId, entry.stageId)
      }));
  }, [buildTimingLineKey, getTimingLineCurrentValue]);

  const markTimingLineDirty = useCallback((section, pilotId = null, stageId = null) => {
    if (clientRole !== 'times') {
      return;
    }

    if (!TIMES_ROLE_TIMING_SECTION_SET.has(section)) {
      return;
    }

    const updatedAt = getNextLogicalTimestamp();
    const key = buildTimingLineKey(section, pilotId, stageId);

    timesPendingLineKeys.current.add(key);
    setTimingLineVersions((prev) => {
      const current = prev?.[key] || {};
      const nextLocalVersion = Math.max(
        Number(current.localVersion || 0),
        Number(current.ackedVersion || 0),
        Number(current.appliedVersion || 0)
      ) + 1;

      return {
        ...(prev || {}),
        [key]: {
          ...current,
          key,
          section,
          pilotId,
          stageId,
          localVersion: nextLocalVersion,
          ackedVersion: Number(current.ackedVersion || 0),
          appliedVersion: Math.max(Number(current.appliedVersion || 0), nextLocalVersion),
          updatedAt
        }
      };
    });
  }, [buildTimingLineKey, clientRole, getNextLogicalTimestamp]);

  const applyWebSocketData = useCallback((data) => {
    if (!data) return;

    if (data?.messageType === 'timing-delta' && Array.isArray(data.entries)) {
      setWsLastMessageAt(Date.now());
      isPublishing.current = true;

      const acceptedEntries = [];
      const incomingEntries = data?.senderRole === 'times'
        ? data.entries.filter((entry) => TIMES_ROLE_TIMING_SECTION_SET.has(entry?.section))
        : data.entries;

      incomingEntries.forEach((entry) => {
        const key = entry?.key || buildTimingLineKey(entry?.section, entry?.pilotId, entry?.stageId);
        const currentVersionEntry = timingLineVersionsRef.current?.[key] || {};
        const incomingVersion = Number(entry?.localVersion || 0);
        const localVersion = Number(currentVersionEntry.localVersion || 0);
        const appliedVersion = Number(currentVersionEntry.appliedVersion || 0);

        if (!entry?.section || !incomingVersion) {
          return;
        }

        if (wsRoleRef.current === 'times' && localVersion > incomingVersion) {
          return;
        }

        if (incomingVersion <= appliedVersion) {
          return;
        }

        setTimingLineValue(entry.section, entry.pilotId ?? null, entry.stageId ?? null, entry.value);
        acceptedEntries.push({
          key,
          section: entry.section,
          pilotId: entry.pilotId ?? null,
          stageId: entry.stageId ?? null,
          localVersion: incomingVersion
        });
      });

      if (acceptedEntries.length > 0) {
        setTimingLineVersions((prev) => {
          const next = { ...(prev || {}) };
          acceptedEntries.forEach((entry) => {
            const current = next[entry.key] || {};
            next[entry.key] = {
              ...current,
              key: entry.key,
              section: entry.section,
              pilotId: entry.pilotId,
              stageId: entry.stageId,
              localVersion: Math.max(Number(current.localVersion || 0), entry.localVersion),
              ackedVersion: Number(current.ackedVersion || 0),
              appliedVersion: Math.max(Number(current.appliedVersion || 0), entry.localVersion),
              updatedAt: Math.max(Number(current.updatedAt || 0), Number(data?.timestamp || 0))
            };
          });
          return next;
        });
      }

      if (wsRoleRef.current === 'setup' && acceptedEntries.length > 0) {
        const nextSyncAt = typeof data?.timestamp === 'number' ? data.timestamp : getNextLogicalTimestamp();
        setLastTimesSyncAt(nextSyncAt);
        wsProvider.current?.publishTimesSyncAck?.({
          receivedAt: nextSyncAt,
          lineAcks: acceptedEntries.map((entry) => ({
            key: entry.key,
            localVersion: entry.localVersion
          })),
          timestamp: getNextLogicalTimestamp()
        });
      }

      setTimeout(() => {
        isPublishing.current = false;
      }, 100);
      return;
    }

    if (data?.messageType === 'setup-patch' && Array.isArray(data.entries)) {
      setWsLastMessageAt(Date.now());
      isPublishing.current = true;

      data.entries.forEach((entry) => {
        applySetupPatchEntry(entry);
      });

      const nextSyncAt = typeof data?.timestamp === 'number' ? data.timestamp : getNextLogicalTimestamp();
      const hasTimingEntries = data.entries.some((entry) => SETUP_TIMING_SECTION_SET.has(entry?.section));
      const hasSetupEntries = data.entries.some((entry) => !SETUP_TIMING_SECTION_SET.has(entry?.section));

      if (hasSetupEntries) {
        setLastSetupSyncAt(nextSyncAt);
      }

      if (hasTimingEntries) {
        setLastTimesSyncAt(nextSyncAt);
      }

      setTimeout(() => {
        isPublishing.current = false;
      }, 100);
      return;
    }

    let normalizedData = data?.payload && typeof data.payload === 'object'
      ? data.payload
      : data;

    const messageSource = normalizeMessageSource(
      normalizedData?.source
      || normalizedData?.origin
      || normalizedData?.clientSource
      || data?.source
      || data?.origin
      || data?.clientSource
    );
    if (messageSource === 'android-app' && normalizedData?.messageType !== 'pilot-telemetry' && data?.section !== 'pilotTelemetry') {
      console.debug('[Telemetry] Ignoring non-telemetry payload from android-app', {
        messageType: normalizedData?.messageType || null,
        section: data?.section || null
      });
      setWsLastMessageAt(Date.now());
      isPublishing.current = true;
      setTimeout(() => {
        isPublishing.current = false;
      }, 100);
      return;
    }

    if (normalizedData?.messageType === 'pilot-telemetry') {
      const pilotId = normalizePilotId(normalizedData.pilotId || normalizedData.pilotid || null);
      const telemetrySource = messageSource;

      if (telemetrySource && !TRUSTED_PILOT_TELEMETRY_SOURCES.has(telemetrySource)) {
        console.debug('[Telemetry] Ignoring pilot telemetry from untrusted source', {
          pilotId,
          source: telemetrySource
        });
        setWsLastMessageAt(Date.now());
        isPublishing.current = true;
        setTimeout(() => {
          isPublishing.current = false;
        }, 100);
        return;
      }

      console.debug('[Telemetry] Queued pilot telemetry', {
        pilotId,
        source: telemetrySource || 'unknown',
        latLong: normalizedData.latLong ?? '',
        latlongTimestamp: normalizedData.latlongTimestamp ?? normalizedData.lastLatLongUpdatedAt ?? null
      });

      if (pilotId) {
        const pilotExists = Array.isArray(pilotsRef.current)
          && pilotsRef.current.some((pilot) => normalizePilotId(pilot?.id) === pilotId);

        if (!pilotExists) {
          console.warn('[Telemetry] Received telemetry for unknown pilot', {
            pilotId,
            source: telemetrySource || 'unknown'
          });
        }

        const telemetryReceivedAt = Date.now();
        const telemetryTimestamp = normalizedData.latlongTimestamp ?? normalizedData.lastLatLongUpdatedAt;
        const immediateTelemetry = {
          ...(pilotTelemetryByPilotIdRef.current?.[pilotId] || {}),
          lastTelemetryAt: telemetryReceivedAt,
          source: telemetrySource || (pilotTelemetryByPilotIdRef.current?.[pilotId]?.source || '')
        };

        if (normalizedData.latLong !== undefined) {
          immediateTelemetry.latLong = normalizeLatLongString(normalizedData.latLong || '');
        }

        if (telemetryTimestamp !== undefined) {
          immediateTelemetry.latlongTimestamp = telemetryTimestamp;
          immediateTelemetry.lastLatLongUpdatedAt = telemetryTimestamp;
        }

        if (normalizedData.speed !== undefined) {
          immediateTelemetry.speed = normalizedData.speed;
        }

        if (normalizedData.heading !== undefined) {
          immediateTelemetry.heading = normalizedData.heading;
        }

        mergePilotTelemetryEntries([[pilotId, immediateTelemetry]], { suppressSync: true });

        const queuedTelemetry = {
          ...(pilotTelemetryQueueRef.current.get(pilotId) || {}),
          lastTelemetryAt: telemetryReceivedAt,
          source: telemetrySource || (pilotTelemetryQueueRef.current.get(pilotId)?.source || '')
        };

        if (normalizedData.latLong !== undefined) {
          queuedTelemetry.latLong = normalizedData.latLong;
        }

        if (telemetryTimestamp !== undefined) {
          queuedTelemetry.latlongTimestamp = telemetryTimestamp;
          queuedTelemetry.lastLatLongUpdatedAt = telemetryTimestamp;
        }

        if (normalizedData.speed !== undefined) {
          queuedTelemetry.speed = normalizedData.speed;
        }

        if (normalizedData.heading !== undefined) {
          queuedTelemetry.heading = normalizedData.heading;
        }

        pilotTelemetryQueueRef.current.set(pilotId, queuedTelemetry);
        schedulePilotTelemetryFlush();
      }

      setWsLastMessageAt(Date.now());
      isPublishing.current = true;
      setTimeout(() => {
        isPublishing.current = false;
      }, 100);
      return;
    }

    if (data?.section === 'pilotTelemetry' && normalizedData?.pilotTelemetry && typeof normalizedData.pilotTelemetry === 'object') {
      const pilotTelemetryEntries = Object.entries(normalizedData.pilotTelemetry).map(([pilotId, telemetry]) => [
        normalizePilotId(pilotId),
        telemetry
      ]);
      const telemetrySource = normalizeMessageSource(
        normalizedData.source
        || normalizedData.origin
        || normalizedData.clientSource
        || data?.source
        || data?.origin
        || data?.clientSource
      );

      if (telemetrySource && !TRUSTED_PILOT_TELEMETRY_SOURCES.has(telemetrySource)) {
        console.debug('[Telemetry] Ignoring pilot telemetry relay from untrusted source', {
          source: telemetrySource
        });
        setWsLastMessageAt(Date.now());
        isPublishing.current = true;
        setTimeout(() => {
          isPublishing.current = false;
        }, 100);
        return;
      }

      const nextTelemetryEntries = pilotTelemetryEntries.map(([pilotId, telemetry]) => {
        if (!pilotId || !telemetry || typeof telemetry !== 'object') {
          return null;
        }

        const nextTelemetry = {
          ...(pilotTelemetryByPilotIdRef.current?.[pilotId] || {}),
          lastTelemetryAt: Number(telemetry.lastTelemetryAt || Date.now())
        };

        if (telemetry.latLong !== undefined) {
          nextTelemetry.latLong = telemetry.latLong;
        }

        if (telemetry.latlongTimestamp !== undefined) {
          nextTelemetry.latlongTimestamp = telemetry.latlongTimestamp;
          nextTelemetry.lastLatLongUpdatedAt = telemetry.lastLatLongUpdatedAt ?? telemetry.latlongTimestamp;
        } else if (telemetry.lastLatLongUpdatedAt !== undefined) {
          nextTelemetry.lastLatLongUpdatedAt = telemetry.lastLatLongUpdatedAt;
        }

        if (telemetry.speed !== undefined) {
          nextTelemetry.speed = telemetry.speed;
        }

        if (telemetry.heading !== undefined) {
          nextTelemetry.heading = telemetry.heading;
        }

        nextTelemetry.source = telemetrySource || 'setup-relay';
        return [pilotId, nextTelemetry];
      }).filter(Boolean);

      mergePilotTelemetryEntries(nextTelemetryEntries, { suppressSync: true });

      if (pilotTelemetryEntries.length > 0) {
        console.debug('[Telemetry] Received pilotTelemetry relay', {
          count: pilotTelemetryEntries.length,
          source: telemetrySource || 'unknown'
        });
      }

      setWsLastMessageAt(Date.now());
      isPublishing.current = true;
      setTimeout(() => {
        isPublishing.current = false;
      }, 100);
      return;
    }

    if (data?.section === 'times' && data?.stageId && normalizedData?.times && typeof normalizedData.times === 'object') {
      const stageId = data.stageId;

      Object.entries(normalizedData.times).forEach(([pilotId, value]) => {
        setTimingLineValue('times', pilotId, stageId, value);
      });

      setWsLastMessageAt(Date.now());
      isPublishing.current = true;
      setTimeout(() => {
        isPublishing.current = false;
      }, 100);
      return;
    }

    if (data?.section === 'stages' && normalizedData?.stage) {
      setStages((prev) => mergeStagesById(prev, normalizedData.stage));
      setWsLastMessageAt(Date.now());
      isPublishing.current = true;
      setTimeout(() => {
        isPublishing.current = false;
      }, 100);
      return;
    }

    if (data?.section === 'stages' && normalizedData?.deletedStageId) {
      setStages((prev) => (Array.isArray(prev) ? prev.filter((stage) => stage?.id !== normalizedData.deletedStageId) : []));
      setWsLastMessageAt(Date.now());
      isPublishing.current = true;
      setTimeout(() => {
        isPublishing.current = false;
      }, 100);
      return;
    }

    if (data?.section === 'mapPlacemarks' && normalizedData?.mapPlacemark) {
      setMapPlacemarks((prev) => mergeMapPlacemarksById(prev, normalizedData.mapPlacemark));
      setWsLastMessageAt(Date.now());
      isPublishing.current = true;
      setTimeout(() => {
        isPublishing.current = false;
      }, 100);
      return;
    }

    if (data?.section === 'bundle' && normalizedData) {
      const flat = {};
      Object.values(normalizedData).forEach((sectionPayload) => {
        if (sectionPayload && typeof sectionPayload === 'object') {
          Object.assign(flat, sectionPayload);
        }
      });
      normalizedData = flat;
    }
    
    console.log('[RallyContext] Applying WebSocket data');

    setWsLastMessageAt(Date.now());
    
    // Prevent re-publishing when applying received data
    isPublishing.current = true;

    const isTimingPayload = (
      normalizedData.times !== undefined
      || normalizedData.arrivalTimes !== undefined
      || normalizedData.startTimes !== undefined
      || normalizedData.realStartTimes !== undefined
      || normalizedData.lapTimes !== undefined
      || normalizedData.positions !== undefined
      || normalizedData.stagePilots !== undefined
      || normalizedData.retiredStages !== undefined
      || normalizedData.stageAlerts !== undefined
    );

    if (wsRoleRef.current === 'setup' && isTimingPayload) {
      const nextSyncAt = typeof data?.timestamp === 'number' ? data.timestamp : Date.now();
      setLastTimesSyncAt(nextSyncAt);
      wsProvider.current?.publishTimesSyncAck?.({
        receivedAt: nextSyncAt,
        timestamp: Date.now()
      });
    }

    if (normalizedData.eventName !== undefined) setEventName(normalizedData.eventName);
    if (normalizedData.positions !== undefined && !shouldPreserveLocalTimingSection('positions')) setPositions(normalizedData.positions);
    if (normalizedData.lapTimes !== undefined && !shouldPreserveLocalTimingSection('lapTimes')) setLapTimes(normalizedData.lapTimes);
    if (normalizedData.stagePilots !== undefined && !shouldPreserveLocalTimingSection('stagePilots')) setStagePilots(normalizedData.stagePilots);
    if (normalizedData.pilots !== undefined) setPilots(normalizedData.pilots);
    if (normalizedData.pilotTelemetry !== undefined) {
      mergePilotTelemetryEntries(Object.entries(normalizedData.pilotTelemetry || {}), {
        suppressSync: true,
        replace: true
      });
    }
    if (normalizedData.categories !== undefined) setCategories(normalizedData.categories);
    if (normalizedData.stages !== undefined) setStages(normalizedData.stages);
    if (normalizedData.times !== undefined && !shouldPreserveLocalTimingSection('times')) setTimes(normalizedData.times);
    if (normalizedData.arrivalTimes !== undefined && !shouldPreserveLocalTimingSection('arrivalTimes')) setArrivalTimes(normalizedData.arrivalTimes);
    if (normalizedData.startTimes !== undefined && !shouldPreserveLocalTimingSection('startTimes')) setStartTimes(normalizedData.startTimes);
    if (normalizedData.realStartTimes !== undefined && !shouldPreserveLocalTimingSection('realStartTimes')) setRealStartTimes(normalizedData.realStartTimes);
    if (normalizedData.retiredStages !== undefined && !shouldPreserveLocalTimingSection('retiredStages')) setRetiredStages(normalizedData.retiredStages);
    if (normalizedData.stageAlerts !== undefined && !shouldPreserveLocalTimingSection('stageAlerts')) setStageAlerts(normalizedData.stageAlerts);
    if (normalizedData.mapPlacemarks !== undefined) setMapPlacemarks(normalizedData.mapPlacemarks);
    if (normalizedData.currentStageId !== undefined) setCurrentStageId(normalizedData.currentStageId);
    if (normalizedData.debugDate !== undefined) setDebugDate(normalizedData.debugDate);
    if (normalizedData.timeDecimals !== undefined) {
      setTimeDecimals(Math.min(3, Math.max(0, Math.trunc(Number(normalizedData.timeDecimals) || 0))));
    }
    if (normalizedData.chromaKey !== undefined) setChromaKey(normalizedData.chromaKey);
    if (normalizedData.mapUrl !== undefined) setMapUrl(normalizedData.mapUrl);
    if (normalizedData.logoUrl !== undefined) setLogoUrl(normalizedData.logoUrl);
    if (normalizedData.transitionImageUrl !== undefined) setTransitionImageUrl(normalizedData.transitionImageUrl);
    if (normalizedData.externalMedia !== undefined) setExternalMedia(normalizedData.externalMedia);
    if (normalizedData.streamConfigs !== undefined) setStreamConfigs(normalizedData.streamConfigs);
    if (normalizedData.globalAudio !== undefined) setGlobalAudio(normalizedData.globalAudio);
    if (normalizedData.cameras !== undefined) setCameras(normalizedData.cameras);
    
    // Re-enable publishing after a short delay
    setTimeout(() => {
      isPublishing.current = false;
    }, 100);
  }, [applySetupPatchEntry, buildTimingLineKey, getNextLogicalTimestamp, mergePilotTelemetryEntries, schedulePilotTelemetryFlush, setTimingLineValue, shouldPreserveLocalTimingSection]);

  // Listen for external data updates
  useEffect(() => {
    const handleStorageUpdate = () => {
      reloadStorageDomains(ALL_STORAGE_DOMAINS);
    };

    window.addEventListener('rally-reload-data', handleStorageUpdate);
    return () => window.removeEventListener('rally-reload-data', handleStorageUpdate);
  }, [reloadStorageDomains]);

  useEffect(() => {
    const flushPendingStorageDomains = () => {
      const nextDomains = Array.from(pendingStorageDomainsRef.current);
      pendingStorageDomainsRef.current.clear();
      storageReloadTimeout.current = null;

      if (nextDomains.length > 0) {
        reloadStorageDomains(nextDomains);
      }
    };

    const queueStorageDomains = (domains) => {
      domains.forEach((domain) => pendingStorageDomainsRef.current.add(domain));

      if (storageReloadTimeout.current) {
        return;
      }

      storageReloadTimeout.current = window.setTimeout(flushPendingStorageDomains, 30);
    };

    const handleStorageEvent = (event) => {
      if (!event?.key) return;
      const changedDomain = Object.entries(STORAGE_DOMAIN_VERSION_KEYS).find(([, storageKey]) => storageKey === event.key)?.[0];
      if (!changedDomain) return;

      queueStorageDomains([changedDomain]);
    };

    const handleDomainReloadEvent = (event) => {
      const domains = Array.isArray(event?.detail?.domains) ? event.detail.domains : [];
      if (domains.length === 0) {
        return;
      }

      queueStorageDomains(domains);
    };

    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener('rally-reload-domains', handleDomainReloadEvent);
    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('rally-reload-domains', handleDomainReloadEvent);
      if (storageReloadTimeout.current) {
        window.clearTimeout(storageReloadTimeout.current);
        storageReloadTimeout.current = null;
      }
      pendingStorageDomainsRef.current.clear();
    };
  }, [reloadStorageDomains]);

  const buildWebSocketSnapshot = useCallback(() => ({
    eventName,
    positions,
    lapTimes,
    stagePilots,
    pilots,
    pilotTelemetry: pilotTelemetryByPilotId,
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    retiredStages,
    stageAlerts,
    mapPlacemarks,
    currentStageId,
    debugDate,
    timeDecimals,
    chromaKey,
    mapUrl,
    logoUrl,
    transitionImageUrl,
    externalMedia,
    streamConfigs,
    globalAudio,
    cameras,
    timestamp: Date.now()
  }), [
    eventName,
    positions,
    lapTimes,
    stagePilots,
    pilots,
    pilotTelemetryByPilotId,
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    retiredStages,
    stageAlerts,
    mapPlacemarks,
    currentStageId,
    debugDate,
    timeDecimals,
    chromaKey,
    mapUrl,
    logoUrl,
    transitionImageUrl,
    externalMedia,
    streamConfigs,
    globalAudio,
    cameras
  ]);

  const buildWebSocketMessages = useCallback((messageType = 'sync-update', allowedSections = null, extraMeta = {}) => {
    const snapshot = buildWebSocketSnapshot();
    const snapshotId = createEntityId('snapshot');
    const messageTimestamp = getNextLogicalTimestamp();
    const shouldSendStageDeltas = messageType === 'sync-update'
      && dirtyStageSyncChangesRef.current.size > 0
      && (!Array.isArray(allowedSections) || allowedSections.includes('stages'));
    const timesStageParts = Array.isArray(snapshot.stages)
      ? snapshot.stages.flatMap((stage) => {
          if (!stage?.id) {
            return [];
          }

          const stageTimes = {};
          Object.entries(snapshot.times || {}).forEach(([pilotId, pilotTimes]) => {
            const stageValue = pilotTimes?.[stage.id];
            if (stageValue === undefined || stageValue === null || stageValue === '') {
              return;
            }
            stageTimes[pilotId] = stageValue;
          });

          if (Object.keys(stageTimes).length === 0) {
            return [];
          }

          return [{
            section: 'times',
            stageId: stage.id,
            payload: { times: stageTimes }
          }];
        })
      : [];
    const stageParts = shouldSendStageDeltas
      ? Array.from(dirtyStageSyncChangesRef.current.entries()).flatMap(([stageId, action]) => {
          if (!stageId) {
            return [];
          }

          if (action === 'delete') {
            return [{
              section: 'stages',
              stageId,
              payload: { deletedStageId: stageId }
            }];
          }

          const stage = Array.isArray(snapshot.stages)
            ? snapshot.stages.find((item) => item?.id === stageId)
            : null;

          if (!stage) {
            return [{
              section: 'stages',
              stageId,
              payload: { deletedStageId: stageId }
            }];
          }

          return [{
            section: 'stages',
            stageId,
            payload: { stage: pruneEmptyNestedValues(stage) }
          }];
        })
      : [
          { section: 'stages', payload: { stages: pruneEmptyNestedValues(snapshot.stages) } }
        ];
    const stageLinkedMapPlacemarks = getStageLinkedMapPlacemarks(snapshot.stages, snapshot.mapPlacemarks);
    const mapPlacemarkParts = Array.isArray(stageLinkedMapPlacemarks)
      ? stageLinkedMapPlacemarks.flatMap((placemark) => {
          if (!placemark?.id) {
            return [];
          }

          const originalSize = JSON.stringify(placemark).length;
          const transportPlacemark = originalSize > 55000
            ? compressMapPlacemarkForTransport(placemark, {
                maxBytes: 55000,
                initialTolerance: 0.00001,
                maxTolerance: 0.05
              })
            : placemark;
          const compressedSize = JSON.stringify(transportPlacemark).length;

          if (compressedSize > 55000 || compressedSize !== originalSize) {
            console.debug('[WebSocket] mapPlacemark transport size', {
              placemarkId: placemark.id,
              originalSize,
              compressedSize
            });
          }

          return [{
            section: 'mapPlacemarks',
            mapPlacemarkId: placemark.id,
            payload: { mapPlacemark: pruneEmptyNestedValues(transportPlacemark) }
          }];
        })
      : [];
    const allParts = [
      { section: 'meta', payload: {
        eventName: snapshot.eventName,
        currentStageId: snapshot.currentStageId,
        debugDate: snapshot.debugDate,
        timeDecimals: snapshot.timeDecimals,
        chromaKey: snapshot.chromaKey,
        mapUrl: snapshot.mapUrl,
        logoUrl: snapshot.logoUrl,
        transitionImageUrl: snapshot.transitionImageUrl,
        globalAudio: snapshot.globalAudio
      } },
      { section: 'pilots', payload: { pilots: pruneEmptyNestedValues(snapshot.pilots) } },
      { section: 'pilotTelemetry', payload: { pilotTelemetry: pruneEmptyNestedValues(snapshot.pilotTelemetry) } },
      { section: 'categories', payload: { categories: pruneEmptyNestedValues(snapshot.categories) } },
      ...stageParts,
      { section: 'arrivalTimes', payload: { arrivalTimes: pruneEmptyNestedValues(snapshot.arrivalTimes) } },
      { section: 'startTimes', payload: { startTimes: pruneEmptyNestedValues(snapshot.startTimes) } },
      { section: 'realStartTimes', payload: { realStartTimes: pruneEmptyNestedValues(snapshot.realStartTimes) } },
      { section: 'lapTimes', payload: { lapTimes: pruneEmptyNestedValues(snapshot.lapTimes) } },
      { section: 'positions', payload: { positions: pruneEmptyNestedValues(snapshot.positions) } },
      { section: 'stagePilots', payload: { stagePilots: pruneEmptyNestedValues(snapshot.stagePilots) } },
      { section: 'retiredStages', payload: { retiredStages: pruneEmptyNestedValues(snapshot.retiredStages) } },
      { section: 'stageAlerts', payload: { stageAlerts: pruneEmptyNestedValues(snapshot.stageAlerts) } },
      ...mapPlacemarkParts,
      { section: 'cameras', payload: { cameras: pruneEmptyNestedValues(snapshot.cameras) } },
      { section: 'externalMedia', payload: { externalMedia: pruneEmptyNestedValues(snapshot.externalMedia) } },
      { section: 'streamConfigs', payload: { streamConfigs: pruneEmptyNestedValues(snapshot.streamConfigs) } }
    ];

    const allPartsWithStages = [
      ...allParts.slice(0, 5),
      ...timesStageParts,
      ...allParts.slice(5)
    ];

    const parts = Array.isArray(allowedSections) && allowedSections.length > 0
      ? allPartsWithStages.filter((part) => allowedSections.includes(part.section))
      : allPartsWithStages;

    const totalParts = parts.length;

    return parts.map((part, partIndex) => ({
      messageType,
      snapshotId,
      section: part.section,
      partIndex,
      totalParts,
      ...extraMeta,
      payload: part.payload,
      timestamp: messageTimestamp
    }));
  }, [buildWebSocketSnapshot, getNextLogicalTimestamp]);

  const buildWebSocketPayload = useCallback((allowedSections = null) => {
    const snapshot = buildWebSocketSnapshot();
    const allParts = {
      meta: {
        eventName: snapshot.eventName,
        currentStageId: snapshot.currentStageId,
        debugDate: snapshot.debugDate,
        timeDecimals: snapshot.timeDecimals,
        chromaKey: snapshot.chromaKey,
        mapUrl: snapshot.mapUrl,
        logoUrl: snapshot.logoUrl,
        transitionImageUrl: snapshot.transitionImageUrl,
        globalAudio: snapshot.globalAudio
      },
      pilots: { pilots: pruneEmptyNestedValues(snapshot.pilots) },
      pilotTelemetry: { pilotTelemetry: pruneEmptyNestedValues(snapshot.pilotTelemetry) },
      categories: { categories: pruneEmptyNestedValues(snapshot.categories) },
      stages: { stages: pruneEmptyNestedValues(snapshot.stages) },
      times: { times: pruneEmptyNestedValues(snapshot.times) },
      arrivalTimes: { arrivalTimes: pruneEmptyNestedValues(snapshot.arrivalTimes) },
      startTimes: { startTimes: pruneEmptyNestedValues(snapshot.startTimes) },
      realStartTimes: { realStartTimes: pruneEmptyNestedValues(snapshot.realStartTimes) },
      lapTimes: { lapTimes: pruneEmptyNestedValues(snapshot.lapTimes) },
      positions: { positions: pruneEmptyNestedValues(snapshot.positions) },
      stagePilots: { stagePilots: pruneEmptyNestedValues(snapshot.stagePilots) },
      retiredStages: { retiredStages: pruneEmptyNestedValues(snapshot.retiredStages) },
      stageAlerts: { stageAlerts: pruneEmptyNestedValues(snapshot.stageAlerts) },
      mapPlacemarks: { mapPlacemarks: pruneEmptyNestedValues(getStageLinkedMapPlacemarks(snapshot.stages, snapshot.mapPlacemarks)) },
      cameras: { cameras: pruneEmptyNestedValues(snapshot.cameras) },
      externalMedia: { externalMedia: pruneEmptyNestedValues(snapshot.externalMedia) },
      streamConfigs: { streamConfigs: pruneEmptyNestedValues(snapshot.streamConfigs) }
    };

    if (Array.isArray(allowedSections) && allowedSections.length > 0) {
      return allowedSections.reduce((acc, key) => {
        if (allParts[key] !== undefined) {
          acc[key] = allParts[key];
        }
        return acc;
      }, {});
    }

    return allParts;
  }, [buildWebSocketSnapshot]);

  const timingSectionKeys = useMemo(() => ([
    'times',
    'arrivalTimes',
    'startTimes',
    'realStartTimes',
    'lapTimes',
    'positions',
    'stagePilots',
    'retiredStages',
    'stageAlerts'
  ]), []);

  const setupBaseSectionKeys = useMemo(() => ([
    'meta',
    'pilots',
    'pilotTelemetry',
    'categories',
    'stages',
    'mapPlacemarks',
    'cameras',
    'externalMedia',
    'streamConfigs'
  ]), []);

  const publishWebSocketMessages = useCallback(async (messageType = 'sync-update', allowedSections = null, extraMeta = {}) => {
    if (!wsProvider.current?.isConnected) {
      return false;
    }

    const messages = buildWebSocketMessages(messageType, allowedSections, extraMeta);

    for (const message of messages) {
      const messageSize = JSON.stringify(message).length;
      const success = await wsProvider.current.publish(message);
      if (!success) {
        console.error('[WebSocket] Section publish failed', {
          messageType,
          section: message.section,
          partIndex: message.partIndex,
          totalParts: message.totalParts,
          messageSize
        });
        return false;
      }
    }

    return true;
  }, [buildWebSocketMessages]);

  const publishWebSocketBundle = useCallback(async (messageType = 'sync-update', allowedSections = null, extraMeta = {}) => {
    if (!wsProvider.current?.isConnected) {
      return false;
    }

    const payload = buildWebSocketPayload(allowedSections);
    const debugTimestamp = Date.now();
    const data = {
      messageType,
      section: 'bundle',
      ...extraMeta,
      payload,
      timestamp: getNextLogicalTimestamp()
    };

    const estimatedSize = JSON.stringify(data).length;
    if (estimatedSize > 60000) {
      let cumulativePayload = {};
      const breakdown = Object.entries(payload).map(([section, sectionPayload]) => {
        cumulativePayload = {
          ...cumulativePayload,
          [section]: sectionPayload
        };

        const previewData = {
          messageType,
          section: 'bundle',
          ...extraMeta,
          payload: cumulativePayload,
          timestamp: debugTimestamp
        };

        return {
          section,
          cumulativeSize: JSON.stringify(previewData).length
        };
      });

      console.debug('[WebSocket] Bundle size breakdown', {
        messageType,
        estimatedSize,
        breakdown
      });

      return publishWebSocketMessages(messageType, allowedSections, extraMeta);
    }

    return wsProvider.current.publish(data);
  }, [buildWebSocketPayload, getNextLogicalTimestamp, publishWebSocketMessages]);

  const publishSessionManifestUpdate = useCallback(async (partialManifest = {}, baseManifest = null) => {
    if (!wsProvider.current?.isConnected) {
      return null;
    }

    const previousManifest = baseManifest || sessionManifest || {};
    const nextManifest = {
      ...previousManifest,
      ...partialManifest,
      channelKey: partialManifest.channelKey || wsChannelKey || previousManifest.channelKey || '',
      sessionId: partialManifest.sessionId || previousManifest.sessionId || createEntityId('session'),
      initializedAt: partialManifest.initializedAt || previousManifest.initializedAt || Date.now(),
      latestSnapshotVersion: Number(partialManifest.latestSnapshotVersion ?? previousManifest.latestSnapshotVersion ?? latestSnapshotVersion ?? 0),
      lastSnapshotAt: Number(partialManifest.lastSnapshotAt ?? previousManifest.lastSnapshotAt ?? 0),
      latestSetupSyncAt: Number(partialManifest.latestSetupSyncAt ?? previousManifest.latestSetupSyncAt ?? lastSetupSyncAt ?? 0),
      latestTimesSyncAt: Number(partialManifest.latestTimesSyncAt ?? previousManifest.latestTimesSyncAt ?? lastTimesSyncAt ?? 0),
      updatedAt: Date.now()
    };

    const published = await wsProvider.current.publishSessionManifest(nextManifest);
    if (!published) {
      return null;
    }

    setSessionManifest(nextManifest);
    setLatestSnapshotVersion(nextManifest.latestSnapshotVersion || 0);
    return nextManifest;
  }, [lastSetupSyncAt, lastTimesSyncAt, latestSnapshotVersion, sessionManifest, wsChannelKey]);

  useEffect(() => {
    publishSessionManifestUpdateRef.current = publishSessionManifestUpdate;
  }, [publishSessionManifestUpdate]);

  const publishSetupSnapshot = useCallback(async (channelKey, allowedSections = null, baseManifest = null) => {
    const previousManifest = baseManifest || sessionManifest || {};
    const nextSnapshotVersion = Math.max(
      Number(previousManifest.latestSnapshotVersion || 0),
      Number(latestSnapshotVersion || 0)
    ) + 1;
    const snapshotTimestamp = Date.now();

    const published = await publishWebSocketBundle('full-snapshot', allowedSections, {
      snapshotVersion: nextSnapshotVersion
    });

    if (!published) {
      return null;
    }

    if (!Array.isArray(allowedSections) || allowedSections.includes('stages')) {
      dirtyStageSyncChangesRef.current.clear();
    }
    setLatestSnapshotVersion(nextSnapshotVersion);

    return publishSessionManifestUpdate({
      channelKey: channelKey || previousManifest.channelKey || wsChannelKey || '',
      sessionId: previousManifest.sessionId || createEntityId('session'),
      initializedAt: previousManifest.initializedAt || snapshotTimestamp,
      latestSnapshotVersion: nextSnapshotVersion,
      lastSnapshotAt: snapshotTimestamp
    }, previousManifest);
  }, [latestSnapshotVersion, publishSessionManifestUpdate, publishWebSocketBundle, sessionManifest, wsChannelKey]);

  useEffect(() => {
    publishSetupSnapshotRef.current = publishSetupSnapshot;
  }, [publishSetupSnapshot]);

  const markTimingSectionDirty = useCallback((section) => {
    if (clientRole === 'setup') {
      setupPendingSections.current.add(section);
      setupTimingSectionTouchedAtRef.current = {
        ...(setupTimingSectionTouchedAtRef.current || {}),
        [section]: Date.now()
      };
      return;
    }

    if (clientRole !== 'times') {
      return;
    }

    if (!TIMES_ROLE_TIMING_SECTION_SET.has(section)) {
      return;
    }

    const now = getNextLogicalTimestamp();
    setDirtyTimingSections((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (!next.includes(section)) {
        next.push(section);
      }
      return next;
    });
    setTimingSectionTouchedAt((prev) => ({
      ...(prev || {}),
      [section]: now
    }));
    setLastTimesEditAt(now);
  }, [clientRole, getNextLogicalTimestamp]);

  const markSetupSectionDirty = useCallback((section) => {
    if (clientRole !== 'setup' || !setupDirtyTrackingReady.current || isPublishing.current) {
      return;
    }

    const now = Date.now();
    setDirtySetupSections((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (!next.includes(section)) {
        next.push(section);
      }
      return next;
    });
    setLastSetupEditAt(now);
  }, [clientRole]);

  const captureSetupPatchEntries = useCallback((section, entries = []) => {
    const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];

    if (
      safeEntries.length === 0
      || clientRole !== 'setup'
      || !setupDirtyTrackingReady.current
      || isPublishing.current
    ) {
      return false;
    }

    queuePendingSetupPatchEntries(safeEntries);

    if (SETUP_TIMING_SECTION_SET.has(section)) {
      setupPendingSections.current.add(section);
      return true;
    }

    markSetupSectionDirty(section);
    return true;
  }, [clientRole, markSetupSectionDirty, queuePendingSetupPatchEntries]);

  const publishDirtyTimingSections = useCallback(async () => {
    const entries = buildPendingTimingDeltaEntries(null, true);

    if (entries.length === 0) {
      return false;
    }

    return publishTimingDeltaEntries(entries);
  }, [buildPendingTimingDeltaEntries, publishTimingDeltaEntries]);

  useEffect(() => {
    publishDirtyTimingSectionsRef.current = publishDirtyTimingSections;
  }, [publishDirtyTimingSections]);

  useEffect(() => {
    publishDirtyTimingDeltasRef.current = publishDirtyTimingSections;
  }, [publishDirtyTimingSections]);

  const publishDirtySetupSections = useCallback(async (sections = null) => {
    const nextSections = Array.isArray(sections) && sections.length > 0
      ? sections
      : dirtySetupSections;

    if (!Array.isArray(nextSections) || nextSections.length === 0) {
      return false;
    }

    const syncAt = Date.now();
    const hasPendingPatchEntries = getPendingSetupPatchEntries(nextSections).length > 0;
    const published = hasPendingPatchEntries
      ? await publishSetupPatchMessages(nextSections)
      : await publishSetupSnapshot(wsChannelKey, nextSections, sessionManifest);
    if (!published) {
      return false;
    }

    if (hasPendingPatchEntries) {
      clearPendingSetupPatchEntries(nextSections);
    }

    const publishedBaseSections = nextSections.filter((section) => setupBaseSectionKeys.includes(section));
    const publishedTimingSections = nextSections.filter((section) => timingSectionKeys.includes(section));

    if (publishedBaseSections.length > 0) {
      setLastSetupSyncAt(syncAt);
      setDirtySetupSections((prev) => prev.filter((section) => !publishedBaseSections.includes(section)));
    }

    if (publishedTimingSections.length > 0) {
      setLastTimesSyncAt(syncAt);
    }

    await publishSessionManifestUpdate({
      ...(publishedBaseSections.length > 0 ? { latestSetupSyncAt: syncAt } : {}),
      ...(publishedTimingSections.length > 0 ? { latestTimesSyncAt: syncAt } : {})
    });
    return true;
  }, [
    clearPendingSetupPatchEntries,
    dirtySetupSections,
    getPendingSetupPatchEntries,
    publishSessionManifestUpdate,
    publishSetupPatchMessages,
    publishSetupSnapshot,
    sessionManifest,
    setupBaseSectionKeys,
    timingSectionKeys,
    wsChannelKey
  ]);

  useEffect(() => {
    publishDirtySetupSectionsRef.current = publishDirtySetupSections;
  }, [publishDirtySetupSections]);

  const buildLineSyncKey = (pilotId, stageId) => `${pilotId}:${stageId}`;

  const requestTimingLineSync = useCallback((pilotId, stageId) => {
    if (!wsProvider.current?.isConnected) {
      setLineSyncResults((prev) => ({
        ...prev,
        [buildLineSyncKey(pilotId, stageId)]: {
          status: 'error',
          message: 'not_connected',
          updatedAt: Date.now()
        }
      }));
      return false;
    }

    setLineSyncResults((prev) => ({
      ...prev,
      [buildLineSyncKey(pilotId, stageId)]: {
        status: 'pending',
        updatedAt: Date.now()
      }
    }));

    wsProvider.current?.publishTimesLineRequest?.({
      pilotId,
      stageId,
      timestamp: Date.now()
    });

    return true;
  }, []);

  // Publish to WebSocket when data changes
  const publishToWebSocket = useCallback(async () => {
    if (!wsEnabled || !wsCanPublish || !wsProvider.current?.isConnected || isPublishing.current) {
      return;
    }

    if (wsRole === 'setup') {
      const sections = Array.from(new Set([
        ...(Array.isArray(dirtySetupSections) ? dirtySetupSections : []),
        ...Array.from(setupPendingSections.current)
      ]));

      if (sections.length === 0) {
        return;
      }

      sections.forEach((section) => setupPendingSections.current.add(section));

      if (setupPublishTimer.current) {
        return;
      }

      setupPublishTimer.current = window.setTimeout(async () => {
        setupPublishTimer.current = null;
        const pending = Array.from(setupPendingSections.current);
        setupPendingSections.current.clear();
        if (pending.length > 0) {
          const published = await publishDirtySetupSectionsRef.current?.(pending);
          if (!published) {
            pending.forEach((section) => setupPendingSections.current.add(section));
          }
        }
      }, 2000);

      return;
    }

    if (wsRole === 'times') {
      const pendingEntries = buildPendingTimingDeltaEntries(null, true);

      if (pendingEntries.length === 0) {
        return;
      }

      if (timesPublishTimer.current) {
        return;
      }

      timesPublishTimer.current = window.setTimeout(async () => {
        timesPublishTimer.current = null;
        await publishDirtyTimingDeltasRef.current?.();
      }, 1200);

      return;
    }

    await publishWebSocketMessages('sync-update', wsPublishSections);
  }, [buildPendingTimingDeltaEntries, dirtySetupSections, publishDirtySetupSections, wsEnabled, wsCanPublish, publishWebSocketMessages, wsPublishSections, wsRole]);

  // WebSocket connection management
  const connectWebSocket = useCallback(async (channelKey, options = {}) => {
    const { valid } = parseChannelKey(channelKey);
    if (!valid) {
      setWsError('Invalid channel key format');
      return false;
    }

    const role = options.role || 'client';
    const canPublish = options.readOnly !== true;
    const shouldReadHistory = options.readHistory ?? (role === 'setup' ? true : !canPublish);
    const shouldRequestSnapshot = options.requestSnapshot ?? (!canPublish && !shouldReadHistory);
    const shouldPublishSnapshot = options.publishSnapshot ?? canPublish;
    const allowedSections = options.allowedSections ?? (
      role === 'times'
        ? TIMES_ROLE_TIMING_SECTION_KEYS
        : null
    );

    try {
      setWsConnectionStatus('connecting');
      setWsError(null);
      
      wsProvider.current = getWebSocketProvider();
      
        if (!wsMessageReceiver.current) {
          wsMessageReceiver.current = new WsMessageReceiver((data) => applyWebSocketData(data));
        }

        await wsProvider.current.connect(
          channelKey,
          // On message received
          (data) => {
            wsMessageReceiver.current?.handleMessage(data);
          },
        // On status change
        (status, provider, error) => {
          setWsConnectionStatus(status);
          if (error) setWsError(error);
        },
        {
          readHistory: shouldReadHistory,
          onSnapshotRequest: canPublish && role === 'setup'
            ? () => {
                publishSetupSnapshot(channelKey, allowedSections);
              }
            : null
          ,
          onTimesSyncRequest: (payload) => {
            if (role !== 'times') return;
            const since = Number(payload?.since || 0);
            if (lastTimesEditAt > since) {
              const entries = buildPendingTimingDeltaEntries(since, false);

              if (entries.length > 0) {
                publishTimingDeltaEntries(entries);
              }
            }
          }
          ,
          onTimesLineRequest: (payload) => {
            if (role !== 'times') return;
            const pilotId = payload?.pilotId;
            const stageId = payload?.stageId;
            if (!pilotId || !stageId) return;

            const timesStore = loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').map;
            const arrivalStore = loadFromStorage('rally_arrival_times', {});
            const startStore = loadFromStorage('rally_start_times', {});
            const realStartStore = loadFromStorage('rally_real_start_times', {});
            const lapStore = loadFromStorage('rally_lap_times', {});
            const positionsStore = loadFromStorage('rally_positions', {});
            const retiredStore = loadFromStorage('rally_retired_stages', {});
            const alertStore = loadFromStorage('rally_stage_alerts', {});

            const lineData = {
              time: timesStore?.[pilotId]?.[stageId] || '',
              arrivalTime: arrivalStore?.[pilotId]?.[stageId] || '',
              startTime: startStore?.[pilotId]?.[stageId] || '',
              realStartTime: realStartStore?.[pilotId]?.[stageId] || '',
              lapTimes: lapStore?.[pilotId]?.[stageId] || [],
              position: positionsStore?.[pilotId]?.[stageId] ?? null,
              retired: !!retiredStore?.[pilotId]?.[stageId],
              alert: !!alertStore?.[pilotId]?.[stageId]
            };

            const hasData = !!(
              lineData.time
              || lineData.arrivalTime
              || lineData.startTime
              || lineData.realStartTime
              || (Array.isArray(lineData.lapTimes) && lineData.lapTimes.some((value) => value))
              || Number.isFinite(lineData.position)
              || lineData.retired
              || lineData.alert
            );

            wsProvider.current?.publishTimesLineResponse?.({
              pilotId,
              stageId,
              hasData,
              data: lineData,
              timestamp: Date.now()
            });
          }
          ,
          onTimesLineResponse: (payload) => {
            if (role !== 'setup') return;
            const pilotId = payload?.pilotId;
            const stageId = payload?.stageId;
            const lineData = payload?.data || {};
            if (!pilotId || !stageId) return;

            const timesStore = loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').map;
            const arrivalStore = loadFromStorage('rally_arrival_times', {});
            const startStore = loadFromStorage('rally_start_times', {});
            const realStartStore = loadFromStorage('rally_real_start_times', {});
            const lapStore = loadFromStorage('rally_lap_times', {});
            const positionsStore = loadFromStorage('rally_positions', {});
            const retiredStore = loadFromStorage('rally_retired_stages', {});
            const alertStore = loadFromStorage('rally_stage_alerts', {});

            const currentTime = timesStore?.[pilotId]?.[stageId] || '';
            const currentArrival = arrivalStore?.[pilotId]?.[stageId] || '';
            const currentStart = startStore?.[pilotId]?.[stageId] || '';
            const currentRealStart = realStartStore?.[pilotId]?.[stageId] || '';
            const currentLapTimes = lapStore?.[pilotId]?.[stageId] || [];
            const currentPosition = positionsStore?.[pilotId]?.[stageId] ?? null;
            const currentRetired = !!retiredStore?.[pilotId]?.[stageId];
            const currentAlert = !!alertStore?.[pilotId]?.[stageId];

            let updated = false;

            if (lineData.time !== undefined && lineData.time !== currentTime) {
              setTimes((prev) => ({
                ...prev,
                [pilotId]: {
                  ...(prev[pilotId] || {}),
                  [stageId]: lineData.time
                }
              }));
              updated = true;
            }

            if (lineData.arrivalTime !== undefined && lineData.arrivalTime !== currentArrival) {
              setArrivalTimes((prev) => ({
                ...prev,
                [pilotId]: {
                  ...(prev[pilotId] || {}),
                  [stageId]: lineData.arrivalTime
                }
              }));
              updated = true;
            }

            if (lineData.startTime !== undefined && lineData.startTime !== currentStart) {
              setStartTimes((prev) => ({
                ...prev,
                [pilotId]: {
                  ...(prev[pilotId] || {}),
                  [stageId]: lineData.startTime
                }
              }));
              updated = true;
            }

            if (lineData.realStartTime !== undefined && lineData.realStartTime !== currentRealStart) {
              setRealStartTimes((prev) => ({
                ...prev,
                [pilotId]: {
                  ...(prev[pilotId] || {}),
                  [stageId]: lineData.realStartTime
                }
              }));
              updated = true;
            }

            if (Array.isArray(lineData.lapTimes) && JSON.stringify(lineData.lapTimes) !== JSON.stringify(currentLapTimes)) {
              setLapTimes((prev) => ({
                ...prev,
                [pilotId]: {
                  ...(prev[pilotId] || {}),
                  [stageId]: [...lineData.lapTimes]
                }
              }));
              updated = true;
            }

            if (lineData.position !== undefined && lineData.position !== null && lineData.position !== currentPosition) {
              setPositions((prev) => ({
                ...prev,
                [pilotId]: {
                  ...(prev[pilotId] || {}),
                  [stageId]: lineData.position
                }
              }));
              updated = true;
            }

            if (lineData.retired !== undefined && lineData.retired !== currentRetired) {
              setRetiredStages((prev) => {
                const next = { ...prev };
                const nextPilotStages = { ...(next[pilotId] || {}) };
                if (lineData.retired) {
                  nextPilotStages[stageId] = stageId;
                } else {
                  delete nextPilotStages[stageId];
                }
                if (Object.keys(nextPilotStages).length > 0) {
                  next[pilotId] = nextPilotStages;
                } else {
                  delete next[pilotId];
                }
                return next;
              });
              updated = true;
            }

            if (lineData.alert !== undefined && lineData.alert !== currentAlert) {
              setStageAlerts((prev) => {
                const next = { ...prev };
                const nextPilotStages = { ...(next[pilotId] || {}) };
                if (lineData.alert) {
                  nextPilotStages[stageId] = stageId;
                } else {
                  delete nextPilotStages[stageId];
                }
                if (Object.keys(nextPilotStages).length > 0) {
                  next[pilotId] = nextPilotStages;
                } else {
                  delete next[pilotId];
                }
                return next;
              });
              updated = true;
            }

            const key = buildLineSyncKey(pilotId, stageId);
            const nextStatus = payload?.hasData
              ? (updated ? 'updated' : 'no_change')
              : 'no_data';

            setLineSyncResults((prev) => ({
              ...prev,
              [key]: {
                status: nextStatus,
                updatedAt: Date.now()
              }
            }));

            if (payload?.hasData) {
              const syncAt = typeof payload?.timestamp === 'number' ? payload.timestamp : Date.now();
              setLastTimesSyncAt(syncAt);
              wsProvider.current?.publishTimesSyncAck?.({
                receivedAt: syncAt,
                timestamp: Date.now()
              });
            }
          }
          ,
          onTimesSyncAck: (payload) => {
            if (role !== 'times') return;
            const receivedAt = Number(payload?.receivedAt || 0);
            const lineAcks = Array.isArray(payload?.lineAcks) ? payload.lineAcks : [];

            if (!Number.isFinite(receivedAt) && lineAcks.length === 0) return;

            if (lineAcks.length > 0) {
              setTimingLineVersions((prev) => {
                const next = { ...(prev || {}) };
                lineAcks.forEach((ack) => {
                  const key = ack?.key;
                  const ackVersion = Number(ack?.localVersion || 0);
                  if (!key || !ackVersion) return;

                  const current = next[key] || {};
                  next[key] = {
                    ...current,
                    ackedVersion: Math.max(Number(current.ackedVersion || 0), ackVersion)
                  };

                  if (Number(next[key].localVersion || 0) <= Number(next[key].ackedVersion || 0)) {
                    timesPendingLineKeys.current.delete(key);
                  }
                });
                return next;
              });
            }

            setLastTimesAckAt(Date.now());
            if (Number.isFinite(receivedAt)) {
              setLastTimesAckedEditAt(receivedAt);
            }
          }
        }
      );
      
      setWsChannelKey(channelKey);
      setWsCanPublish(canPublish);
      setWsRole(role);
      setWsPublishSections(allowedSections);
      setWsLastMessageAt(Date.now());
      localStorage.setItem('rally_ws_channel_key', JSON.stringify(channelKey));
      setWsEnabled(true);
      localStorage.setItem('rally_ws_enabled', JSON.stringify(true));

      const isSetupRole = role === 'setup';
      const existingManifest = await wsProvider.current.loadSessionManifest();

      if (existingManifest) {
        setSessionManifest(existingManifest);
        setLatestSnapshotVersion(Number(existingManifest.latestSnapshotVersion || 0));
        setLastSetupSyncAt(Number(existingManifest.latestSetupSyncAt || 0));
        setLastTimesSyncAt(Number(existingManifest.latestTimesSyncAt || 0));
      }

      if (role === 'times' && existingManifest) {
        const sanitizedDirtySections = (Array.isArray(dirtyTimingSections) ? dirtyTimingSections : [])
          .filter((section) => TIMES_ROLE_TIMING_SECTION_SET.has(section));
        const sanitizedTouchedAt = Object.fromEntries(
          Object.entries(timingSectionTouchedAt || {}).filter(([section]) => TIMES_ROLE_TIMING_SECTION_SET.has(section))
        );
        const sanitizedLineVersions = Object.fromEntries(
          Object.entries(timingLineVersionsRef.current || {}).filter(([, entry]) => TIMES_ROLE_TIMING_SECTION_SET.has(entry?.section))
        );

        if (sanitizedDirtySections.length !== (Array.isArray(dirtyTimingSections) ? dirtyTimingSections.length : 0)) {
          setDirtyTimingSections(sanitizedDirtySections);
        }

        if (Object.keys(sanitizedTouchedAt).length !== Object.keys(timingSectionTouchedAt || {}).length) {
          setTimingSectionTouchedAt(sanitizedTouchedAt);
        }

        if (Object.keys(sanitizedLineVersions).length !== Object.keys(timingLineVersionsRef.current || {}).length) {
          timesPendingLineKeys.current = new Set(
            Array.from(timesPendingLineKeys.current).filter((key) => TIMES_ROLE_TIMING_SECTION_SET.has(sanitizedLineVersions[key]?.section))
          );
          setTimingLineVersions(sanitizedLineVersions);
        }

        const remoteTimesSyncAt = Number(existingManifest.latestTimesSyncAt || 0);
        const latestLocalTimingVersionAt = Math.max(
          0,
          ...Object.values(sanitizedLineVersions).map((entry) => Number(entry?.updatedAt || 0))
        );
        const latestLocalTimingEditAt = Math.max(
          Number(lastTimesEditAt || 0),
          latestLocalTimingVersionAt
        );

        if (remoteTimesSyncAt > latestLocalTimingEditAt) {
          timesPendingLineKeys.current.clear();
          setDirtyTimingSections([]);
          setTimingSectionTouchedAt({});
          setTimingLineVersions({});
          setLastTimesEditAt(remoteTimesSyncAt);
          setLastTimesAckedEditAt(remoteTimesSyncAt);
        }
      }

      if (shouldPublishSnapshot) {
        if (isSetupRole) {
          const hasRemoteSnapshot = Number(existingManifest?.latestSnapshotVersion || 0) > 0;

          if (existingManifest?.sessionId && hasRemoteSnapshot) {
            setupPendingSections.current.clear();
            dirtyStageSyncChangesRef.current.clear();
            setDirtySetupSections([]);
          } else {
            await publishSetupSnapshot(channelKey, allowedSections, existingManifest);
          }
        } else {
          await publishWebSocketMessages('full-snapshot', allowedSections);
        }
      } else if (shouldRequestSnapshot || (!canPublish && wsProvider.current?.historyBootstrapNeedsSnapshot)) {
        await wsProvider.current.requestSnapshot();

        [1000, 3000, 5000].forEach((delay) => {
          window.setTimeout(() => {
            if (wsProvider.current?.isConnected) {
              wsProvider.current.requestSnapshot();
            }
          }, delay);
        });
      }

      if (role === 'times') {
        window.setTimeout(() => {
          publishDirtyTimingSectionsRef.current?.();
        }, 500);
      }

      if (role === 'setup') {
        wsProvider.current?.publishTimesSyncRequest?.({
          since: lastTimesSyncAt || 0,
          timestamp: Date.now()
        });
      }

      return true;
    } catch (error) {
      setWsConnectionStatus('error');
      setWsError(error.message);
      return false;
    }
  }, [
    applyWebSocketData,
    publishWebSocketMessages,
    publishDirtyTimingSections,
    publishDirtySetupSections,
    publishSetupSnapshot,
    publishSessionManifestUpdate,
    buildPendingTimingDeltaEntries,
    publishTimingDeltaEntries,
    timingSectionKeys,
    dirtyTimingSections,
    timingSectionTouchedAt,
    dirtySetupSections,
    lastTimesEditAt,
    lastTimesSyncAt,
    lastSetupSyncAt,
    publishWebSocketBundle
  ]);

  const disconnectWebSocket = useCallback(() => {
    if (setupPublishTimer.current) {
      window.clearTimeout(setupPublishTimer.current);
      setupPublishTimer.current = null;
    }
    if (timesPublishTimer.current) {
      window.clearTimeout(timesPublishTimer.current);
      timesPublishTimer.current = null;
    }
    setupPendingSections.current.clear();
    timesPendingLineKeys.current.clear();

    if (wsProvider.current) {
      wsProvider.current.disconnect();
      wsProvider.current = null;
    }
    setWsConnectionStatus('disconnected');
    setWsEnabled(false);
    setWsCanPublish(false);
    setWsLastMessageAt(null);
    setWsRole('client');
    setWsPublishSections(null);
    localStorage.setItem('rally_ws_enabled', JSON.stringify(false));
  }, []);

  const generateNewChannelKey = useCallback(() => {
    return generateChannelKey();
  }, []);

  // Publish to WebSocket when data version changes
  useEffect(() => {
    if (wsEnabled && wsProvider.current?.isConnected) {
      publishToWebSocket();
    }
  }, [dataVersion, wsEnabled, publishToWebSocket]);

  useEffect(() => {
    if (wsRole !== 'setup' || !wsEnabled || !wsCanPublish || wsConnectionStatus !== 'connected' || !wsChannelKey) {
      return undefined;
    }

    const maybeRefreshSnapshot = async () => {
      if (isPublishing.current || setupPublishTimer.current || timesPublishTimer.current) {
        return;
      }

      const manifest = sessionManifest || {};
      const lastSnapshotAt = Number(manifest.lastSnapshotAt || 0);
      const latestSyncAt = Math.max(
        Number(lastSetupSyncAt || 0),
        Number(lastTimesSyncAt || 0)
      );

      if (latestSyncAt <= lastSnapshotAt) {
        return;
      }

      if (lastSnapshotAt > 0 && (Date.now() - lastSnapshotAt) < PERIODIC_SNAPSHOT_INTERVAL_MS) {
        return;
      }

      await publishSetupSnapshotRef.current?.(wsChannelKey, wsPublishSections, manifest);
    };

    const intervalId = window.setInterval(() => {
      void maybeRefreshSnapshot();
    }, 60000);
    void maybeRefreshSnapshot();

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    lastSetupSyncAt,
    lastTimesSyncAt,
    sessionManifest,
    wsCanPublish,
    wsChannelKey,
    wsConnectionStatus,
    wsEnabled,
    wsPublishSections,
    wsRole
  ]);

  useEffect(() => {
    localStorage.setItem('rally_dirty_times', JSON.stringify(dirtyTimingSections));
  }, [dirtyTimingSections]);

  useEffect(() => {
    localStorage.setItem('rally_timing_section_touched_at', JSON.stringify(timingSectionTouchedAt));
  }, [timingSectionTouchedAt]);

  useEffect(() => {
    localStorage.setItem('rally_timing_line_versions', JSON.stringify(timingLineVersions));
  }, [timingLineVersions]);

  useEffect(() => {
    localStorage.setItem('rally_dirty_setup_sections', JSON.stringify(dirtySetupSections));
  }, [dirtySetupSections]);

  useEffect(() => {
    if (clientRole !== 'times') return;
    if (!dirtyTimingSections || dirtyTimingSections.length === 0) return;
    if (!lastTimesAckedEditAt) return;

    const GRACE_MS = 120000;
    const hasNewerEdits = lastTimesEditAt > lastTimesAckedEditAt;
    if (hasNewerEdits) return;

    const elapsedSinceAck = Date.now() - lastTimesAckedEditAt;
    if (elapsedSinceAck < GRACE_MS) return;

    setDirtyTimingSections([]);
  }, [clientRole, dirtyTimingSections, lastTimesAckedEditAt, lastTimesEditAt]);

  useEffect(() => {
    localStorage.setItem('rally_times_last_edit_at', JSON.stringify(lastTimesEditAt));
  }, [lastTimesEditAt]);

  useEffect(() => {
    localStorage.setItem('rally_times_last_sync_at', JSON.stringify(lastTimesSyncAt));
  }, [lastTimesSyncAt]);

  useEffect(() => {
    localStorage.setItem('rally_times_last_ack_at', JSON.stringify(lastTimesAckAt));
  }, [lastTimesAckAt]);

  useEffect(() => {
    localStorage.setItem('rally_times_last_acked_edit_at', JSON.stringify(lastTimesAckedEditAt));
  }, [lastTimesAckedEditAt]);

  useEffect(() => {
    localStorage.setItem('rally_setup_last_edit_at', JSON.stringify(lastSetupEditAt));
  }, [lastSetupEditAt]);

  useEffect(() => {
    localStorage.setItem('rally_setup_last_sync_at', JSON.stringify(lastSetupSyncAt));
  }, [lastSetupSyncAt]);

  useEffect(() => {
    localStorage.setItem('rally_ws_session_manifest', JSON.stringify(sessionManifest));
  }, [sessionManifest]);

  useEffect(() => {
    localStorage.setItem('rally_ws_snapshot_version', JSON.stringify(latestSnapshotVersion));
  }, [latestSnapshotVersion]);

  

  useEffect(() => {
    const previousEventName = previousSetupSyncStateRef.current.meta.eventName;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      eventName
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_event_name', JSON.stringify(eventName));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousEventName, eventName) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'eventName',
      value: eventName
    }]);
  }, [captureSetupPatchEntries, eventName, updateDataVersion]);

  useEffect(() => {
    const previousPositions = previousSetupSyncStateRef.current.positions;
    previousSetupSyncStateRef.current.positions = positions;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_positions', JSON.stringify(positions));
    updateDataVersion('timingExtra');
    captureSetupPatchEntries('positions', diffTimingLineEntries('positions', previousPositions, positions));
  }, [captureSetupPatchEntries, positions, updateDataVersion]);

  useEffect(() => {
    const previousLapTimes = previousSetupSyncStateRef.current.lapTimes;
    previousSetupSyncStateRef.current.lapTimes = lapTimes;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_lap_times', JSON.stringify(lapTimes));
    updateDataVersion('timingExtra');
    captureSetupPatchEntries('lapTimes', diffTimingLineEntries('lapTimes', previousLapTimes, lapTimes));
  }, [captureSetupPatchEntries, lapTimes, updateDataVersion]);

  useEffect(() => {
    const previousStagePilots = previousSetupSyncStateRef.current.stagePilots;
    previousSetupSyncStateRef.current.stagePilots = stagePilots;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_stage_pilots', JSON.stringify(stagePilots));
    updateDataVersion('timingExtra');
    captureSetupPatchEntries('stagePilots', diffTimingLineEntries('stagePilots', previousStagePilots, stagePilots));
  }, [captureSetupPatchEntries, stagePilots, updateDataVersion]);

  useEffect(() => {
    const previousPilots = previousSetupSyncStateRef.current.pilots;
    previousSetupSyncStateRef.current.pilots = pilots;
    if (hydratingDomainsRef.current.has('pilots')) return;
    localStorage.setItem('rally_pilots', JSON.stringify(pilots));
    if (suppressPilotPublishRef.current > 0) {
      suppressPilotPublishRef.current -= 1;
      return;
    }
    updateDataVersion('pilots');
    captureSetupPatchEntries('pilots', diffEntityArrayEntries('pilots', previousPilots, pilots));
  }, [captureSetupPatchEntries, pilots, updateDataVersion]);

  useEffect(() => {
    const previousPilotTelemetry = previousSetupSyncStateRef.current.pilotTelemetry;
    previousSetupSyncStateRef.current.pilotTelemetry = pilotTelemetryByPilotId;
    if (hydratingDomainsRef.current.has('pilotTelemetry')) return;
    localStorage.setItem('rally_pilot_telemetry', JSON.stringify(pilotTelemetryByPilotId));
    if (pilotTelemetrySyncSuppressionRef.current > 0) {
      pilotTelemetrySyncSuppressionRef.current -= 1;
      return;
    }
    updateDataVersion('pilotTelemetry');
    captureSetupPatchEntries('pilotTelemetry', diffKeyedEntityEntries('pilotTelemetry', previousPilotTelemetry, pilotTelemetryByPilotId));
  }, [captureSetupPatchEntries, pilotTelemetryByPilotId, updateDataVersion]);

  useEffect(() => {
    const previousCategories = previousSetupSyncStateRef.current.categories;
    previousSetupSyncStateRef.current.categories = categories;
    if (hydratingDomainsRef.current.has('categories')) return;
    localStorage.setItem('rally_categories', JSON.stringify(categories));
    updateDataVersion('categories');
    captureSetupPatchEntries('categories', diffEntityArrayEntries('categories', previousCategories, categories));
  }, [captureSetupPatchEntries, categories, updateDataVersion]);

  useEffect(() => {
    const previousStages = previousSetupSyncStateRef.current.stages;
    previousSetupSyncStateRef.current.stages = stages;
    if (hydratingDomainsRef.current.has('stages')) return;
    localStorage.setItem('rally_stages', JSON.stringify(stages));
    updateDataVersion('stages');
    captureSetupPatchEntries('stages', diffEntityArrayEntries('stages', previousStages, stages));
  }, [captureSetupPatchEntries, stages, updateDataVersion]);

  useEffect(() => {
    const previousTimes = previousSetupSyncStateRef.current.times;
    previousSetupSyncStateRef.current.times = times;
    if (hydratingDomainsRef.current.has('timingCore')) return;
    scheduleTimesPersistenceFlush();
    captureSetupPatchEntries('times', diffTimingLineEntries('times', previousTimes, times));
  }, [captureSetupPatchEntries, scheduleTimesPersistenceFlush, times]);

  useEffect(() => {
    const previousArrivalTimes = previousSetupSyncStateRef.current.arrivalTimes;
    const previousStartTimes = previousSetupSyncStateRef.current.startTimes;
    const previousRealStartTimes = previousSetupSyncStateRef.current.realStartTimes;
    previousSetupSyncStateRef.current.arrivalTimes = arrivalTimes;
    previousSetupSyncStateRef.current.startTimes = startTimes;
    previousSetupSyncStateRef.current.realStartTimes = realStartTimes;
    if (hydratingDomainsRef.current.has('timingCore')) return;
    localStorage.setItem('rally_arrival_times', JSON.stringify(arrivalTimes));
    localStorage.setItem('rally_start_times', JSON.stringify(startTimes));
    localStorage.setItem('rally_real_start_times', JSON.stringify(realStartTimes));
    updateDataVersion('timingCore');
    captureSetupPatchEntries('arrivalTimes', diffTimingLineEntries('arrivalTimes', previousArrivalTimes, arrivalTimes));
    captureSetupPatchEntries('startTimes', diffTimingLineEntries('startTimes', previousStartTimes, startTimes));
    captureSetupPatchEntries('realStartTimes', diffTimingLineEntries('realStartTimes', previousRealStartTimes, realStartTimes));
  }, [arrivalTimes, captureSetupPatchEntries, realStartTimes, startTimes, updateDataVersion]);

  useEffect(() => {
    const previousRetiredStages = previousSetupSyncStateRef.current.retiredStages;
    previousSetupSyncStateRef.current.retiredStages = retiredStages;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_retired_stages', JSON.stringify(retiredStages));
    updateDataVersion('timingExtra');
    captureSetupPatchEntries('retiredStages', diffTimingLineEntries('retiredStages', previousRetiredStages, retiredStages));
  }, [captureSetupPatchEntries, retiredStages, updateDataVersion]);

  useEffect(() => {
    const previousStageAlerts = previousSetupSyncStateRef.current.stageAlerts;
    previousSetupSyncStateRef.current.stageAlerts = stageAlerts;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_stage_alerts', JSON.stringify(stageAlerts));
    updateDataVersion('timingExtra');
    captureSetupPatchEntries('stageAlerts', diffTimingLineEntries('stageAlerts', previousStageAlerts, stageAlerts));
  }, [captureSetupPatchEntries, stageAlerts, updateDataVersion]);

  useEffect(() => {
    const previousMapPlacemarks = previousSetupSyncStateRef.current.mapPlacemarks;
    previousSetupSyncStateRef.current.mapPlacemarks = mapPlacemarks;
    if (hydratingDomainsRef.current.has('maps')) return;
    localStorage.setItem('rally_map_placemarks', JSON.stringify(mapPlacemarks));
    updateDataVersion('maps');
    captureSetupPatchEntries('mapPlacemarks', diffEntityArrayEntries('mapPlacemarks', previousMapPlacemarks, mapPlacemarks));
  }, [captureSetupPatchEntries, mapPlacemarks, updateDataVersion]);

  useEffect(() => {
    const previousDebugDate = previousSetupSyncStateRef.current.meta.debugDate;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      debugDate
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_debug_date', JSON.stringify(debugDate));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousDebugDate, debugDate) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'debugDate',
      value: debugDate
    }]);
  }, [captureSetupPatchEntries, debugDate, updateDataVersion]);

  useEffect(() => {
    const previousTimeDecimals = previousSetupSyncStateRef.current.meta.timeDecimals;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      timeDecimals
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_time_decimals', JSON.stringify(timeDecimals));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousTimeDecimals, timeDecimals) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'timeDecimals',
      value: timeDecimals
    }]);
  }, [captureSetupPatchEntries, timeDecimals, updateDataVersion]);

  useEffect(() => {
    setStartTimes((prev) => {
      let changed = false;
      const next = { ...prev };
      const previousDerivedStartTimes = autoDerivedStartTimesRef.current || {};
      const nextDerivedStartTimes = {};

      pilots.forEach((pilot) => {
        const nextPilotTimes = { ...(next[pilot.id] || {}) };
        let pilotChanged = false;
        const nextPilotDerivedTimes = {};

        stages.forEach((stage) => {
          if (isLapRaceStageType(stage.type)) {
            if (nextPilotTimes[stage.id]) {
              delete nextPilotTimes[stage.id];
              pilotChanged = true;
            }
            return;
          }

          if (isManualStartStageType(stage.type)) {
            return;
          }

          const derivedStartTime = getPilotScheduledStartTime(stage, pilot);
          const currentValue = nextPilotTimes[stage.id] || '';
          const previousDerivedValue = previousDerivedStartTimes?.[pilot.id]?.[stage.id] || '';

          if (derivedStartTime) {
            nextPilotDerivedTimes[stage.id] = derivedStartTime;
          }

          if (derivedStartTime) {
            if (!currentValue || currentValue === previousDerivedValue) {
              if (currentValue !== derivedStartTime) {
                nextPilotTimes[stage.id] = derivedStartTime;
                pilotChanged = true;
              }
            }
          } else if (!currentValue || currentValue === previousDerivedValue) {
            if (currentValue) {
              delete nextPilotTimes[stage.id];
              pilotChanged = true;
            }
          }
        });

        if (Object.keys(nextPilotDerivedTimes).length > 0) {
          nextDerivedStartTimes[pilot.id] = nextPilotDerivedTimes;
        }

        if (pilotChanged) {
          if (Object.keys(nextPilotTimes).length > 0) {
            next[pilot.id] = nextPilotTimes;
          } else {
            delete next[pilot.id];
          }
          changed = true;
        }
      });

      autoDerivedStartTimesRef.current = nextDerivedStartTimes;
      return changed ? next : prev;
    });
  }, [pilots, stages]);

  useEffect(() => {
    const repairedPilots = ensureUniqueEntityIds(pilots, 'pilot');
    if (repairedPilots !== pilots) {
      setPilots(repairedPilots);
    }
  }, [pilots]);

  useEffect(() => {
    const repairedStages = ensureUniqueEntityIds(stages, 'stage');
    if (repairedStages !== stages) {
      setStages(repairedStages);
    }
  }, [stages]);

  useEffect(() => {
    const repairedCategories = ensureUniqueEntityIds(categories, 'category');
    if (repairedCategories !== categories) {
      setCategories(repairedCategories);
    }
  }, [categories]);

  useEffect(() => {
    let changed = false;

    const normalizedCategories = categories.map((category, index) => {
      const numericOrder = category?.order === '' || category?.order === null || category?.order === undefined
        ? NaN
        : Number(category.order);

      if (Number.isFinite(numericOrder)) {
        return category;
      }

      changed = true;
      return {
        ...category,
        order: index + 1
      };
    });

    if (changed) {
      setCategories(normalizedCategories);
    }
  }, [categories]);

  useEffect(() => {
    const repairedCameras = ensureUniqueEntityIds(cameras, 'cam');
    if (repairedCameras !== cameras) {
      setCameras(repairedCameras);
    }
  }, [cameras]);

  useEffect(() => {
    const repairedExternalMedia = ensureUniqueEntityIds(externalMedia, 'media');
    if (repairedExternalMedia !== externalMedia) {
      setExternalMedia(repairedExternalMedia);
    }
  }, [externalMedia]);

  useEffect(() => {
    const previousCurrentStageId = previousSetupSyncStateRef.current.meta.currentStageId;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      currentStageId
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_current_stage', JSON.stringify(currentStageId));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousCurrentStageId, currentStageId) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'currentStageId',
      value: currentStageId
    }]);
  }, [captureSetupPatchEntries, currentStageId, updateDataVersion]);

  useEffect(() => {
    const previousChromaKey = previousSetupSyncStateRef.current.meta.chromaKey;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      chromaKey
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_chroma_key', JSON.stringify(chromaKey));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousChromaKey, chromaKey) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'chromaKey',
      value: chromaKey
    }]);
  }, [captureSetupPatchEntries, chromaKey, updateDataVersion]);

  useEffect(() => {
    const previousMapUrl = previousSetupSyncStateRef.current.meta.mapUrl;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      mapUrl
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_map_url', JSON.stringify(mapUrl));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousMapUrl, mapUrl) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'mapUrl',
      value: mapUrl
    }]);
  }, [captureSetupPatchEntries, mapUrl, updateDataVersion]);

  useEffect(() => {
    const previousLogoUrl = previousSetupSyncStateRef.current.meta.logoUrl;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      logoUrl
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_logo_url', JSON.stringify(logoUrl));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousLogoUrl, logoUrl) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'logoUrl',
      value: logoUrl
    }]);
  }, [captureSetupPatchEntries, logoUrl, updateDataVersion]);

  useEffect(() => {
    const previousTransitionImageUrl = previousSetupSyncStateRef.current.meta.transitionImageUrl;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      transitionImageUrl
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_transition_image', JSON.stringify(transitionImageUrl));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousTransitionImageUrl, transitionImageUrl) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'transitionImageUrl',
      value: transitionImageUrl
    }]);
  }, [captureSetupPatchEntries, transitionImageUrl, updateDataVersion]);

  useEffect(() => {
    const previousStreamConfigs = previousSetupSyncStateRef.current.streamConfigs;
    previousSetupSyncStateRef.current.streamConfigs = streamConfigs;
    if (hydratingDomainsRef.current.has('streams')) return;
    localStorage.setItem('rally_stream_configs', JSON.stringify(streamConfigs));
    updateDataVersion('streams');
    captureSetupPatchEntries('streamConfigs', diffKeyedEntityEntries('streamConfigs', previousStreamConfigs, streamConfigs));
  }, [captureSetupPatchEntries, streamConfigs, updateDataVersion]);

  useEffect(() => {
    const previousGlobalAudio = previousSetupSyncStateRef.current.meta.globalAudio;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      globalAudio
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_global_audio', JSON.stringify(globalAudio));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousGlobalAudio, globalAudio) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'globalAudio',
      value: globalAudio
    }]);
  }, [captureSetupPatchEntries, globalAudio, updateDataVersion]);

  useEffect(() => {
    const previousCameras = previousSetupSyncStateRef.current.cameras;
    previousSetupSyncStateRef.current.cameras = cameras;
    if (hydratingDomainsRef.current.has('streams')) return;
    localStorage.setItem('rally_cameras', JSON.stringify(cameras));
    updateDataVersion('streams');
    captureSetupPatchEntries('cameras', diffEntityArrayEntries('cameras', previousCameras, cameras));
  }, [cameras, captureSetupPatchEntries, updateDataVersion]);

  useEffect(() => {
    const previousExternalMedia = previousSetupSyncStateRef.current.externalMedia;
    previousSetupSyncStateRef.current.externalMedia = externalMedia;
    if (hydratingDomainsRef.current.has('media')) return;
    localStorage.setItem('rally_external_media', JSON.stringify(externalMedia));
    updateDataVersion('media');
    captureSetupPatchEntries('externalMedia', diffEntityArrayEntries('externalMedia', previousExternalMedia, externalMedia));
  }, [captureSetupPatchEntries, externalMedia, updateDataVersion]);

  useEffect(() => {
    if (!setupDirtyTrackingReady.current) {
      setupDirtyTrackingReady.current = true;
    }
  }, []);

  useEffect(() => {
    if (wsRole !== 'setup' || !wsEnabled || !wsProvider.current?.isConnected || !lastTimesSyncAt) {
      return;
    }

    publishSessionManifestUpdateRef.current?.({
      latestTimesSyncAt: lastTimesSyncAt
    });
  }, [lastTimesSyncAt, wsEnabled, wsRole]);

  // CRUD for external media items
  const addExternalMedia = useCallback((item) => {
    const newItem = {
      id: createEntityId('media'),
      name: item.name || '',
      url: item.url || '',
      icon: item.icon || 'Map',
      ...item
    };
    setExternalMedia(prev => [...prev, newItem]);
  }, [setExternalMedia]);

  const updateExternalMedia = useCallback((id, updates) => {
    setExternalMedia(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, [setExternalMedia]);

  const deleteExternalMedia = useCallback((id) => {
    setExternalMedia(prev => prev.filter(m => m.id !== id));
  }, [setExternalMedia]);

  const addPilot = (pilot) => {
    const newPilot = {
      ...pilot,
      id: createEntityId('pilot'),
      name: pilot.name,
      team: pilot.team || '',
      car: pilot.car || '',
      picture: pilot.picture || '',
      streamUrl: pilot.streamUrl || '',
      categoryId: pilot.categoryId || null,
      startOrder: pilot.startOrder || 999,
      timeOffsetMinutes: pilot.timeOffsetMinutes || 0,
      isActive: pilot.isActive ?? false
    };
    setPilots(prev => [...prev, newPilot]);
  };

  function updatePilot(id, updates) {
    setPilots(prev => prev.map((pilot) => {
      if (pilot.id !== id) {
        return pilot;
      }

      const nextUpdates = { ...updates };
      delete nextUpdates.latLong;
      delete nextUpdates.latlongTimestamp;
      delete nextUpdates.lastLatLongUpdatedAt;
      delete nextUpdates.lastTelemetryAt;
      delete nextUpdates.speed;
      delete nextUpdates.heading;

      return { ...pilot, ...nextUpdates };
    }));
  }

  const setPilotTelemetry = useCallback((pilotId, telemetry = {}) => {
    if (!pilotId) {
      return;
    }

    const normalizedTelemetry = {};

    if (telemetry.latLong !== undefined) {
      normalizedTelemetry.latLong = normalizeLatLongString(telemetry.latLong || '');
    }

    if (telemetry.latlongTimestamp !== undefined) {
      normalizedTelemetry.latlongTimestamp = telemetry.latlongTimestamp;
    }

    if (telemetry.lastLatLongUpdatedAt !== undefined) {
      normalizedTelemetry.lastLatLongUpdatedAt = telemetry.lastLatLongUpdatedAt;
    }

    if (telemetry.speed !== undefined) {
      normalizedTelemetry.speed = telemetry.speed;
    }

    if (telemetry.heading !== undefined) {
      normalizedTelemetry.heading = telemetry.heading;
    }

    if (telemetry.lastTelemetryAt !== undefined) {
      normalizedTelemetry.lastTelemetryAt = telemetry.lastTelemetryAt;
    }

    if (telemetry.source !== undefined) {
      normalizedTelemetry.source = telemetry.source;
    }

    mergePilotTelemetryEntries([[normalizePilotId(pilotId), normalizedTelemetry]]);
  }, [mergePilotTelemetryEntries]);

  const getPilotTelemetry = useCallback((pilotId) => (
    pilotTelemetryByPilotIdRef.current?.[normalizePilotId(pilotId)] || pilotTelemetryByPilotIdRef.current?.[pilotId] || {}
  ), []);

  const deletePilot = (id) => {
    setPilots(prev => prev.filter(p => p.id !== id));
    setTimes(prev => {
      const newTimes = { ...prev };
      delete newTimes[id];
      return newTimes;
    });
    setStartTimes(prev => {
      const newStartTimes = { ...prev };
      delete newStartTimes[id];
      return newStartTimes;
    });
    setRealStartTimes(prev => {
      const newRealStartTimes = { ...prev };
      delete newRealStartTimes[id];
      return newRealStartTimes;
    });
    setArrivalTimes(prev => {
      const newArrivalTimes = { ...prev };
      delete newArrivalTimes[id];
      return newArrivalTimes;
    });
    setLapTimes(prev => {
      const newLapTimes = { ...prev };
      delete newLapTimes[id];
      return newLapTimes;
    });
    setPositions(prev => {
      const newPositions = { ...prev };
      delete newPositions[id];
      return newPositions;
    });
    setRetiredStages(prev => {
      const nextRetiredStages = { ...prev };
      delete nextRetiredStages[id];
      return nextRetiredStages;
    });
    setStageAlerts(prev => {
      const nextStageAlerts = { ...prev };
      delete nextStageAlerts[id];
      return nextStageAlerts;
    });
    setStreamConfigs(prev => {
      const nextStreamConfigs = { ...prev };
      delete nextStreamConfigs[id];
      return nextStreamConfigs;
    });
    setStagePilots(prev => {
      const nextStagePilots = {};

      Object.entries(prev).forEach(([stageId, pilotIds]) => {
        nextStagePilots[stageId] = (pilotIds || []).filter((pilotId) => pilotId !== id);
      });

      return nextStagePilots;
    });
  };

  const togglePilotActive = (id) => {
    setPilots(prev => prev.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));
  };

  // Camera CRUD operations
  const addCamera = (camera) => {
    const newCamera = {
      id: createEntityId('cam'),
      name: camera.name,
      streamUrl: camera.streamUrl || '',
      isActive: true,
      ...camera
    };
    setCameras(prev => [...prev, newCamera]);
  };

  const updateCamera = (id, updates) => {
    setCameras(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deleteCamera = (id) => {
    setCameras(prev => prev.filter(c => c.id !== id));
    // Also remove stream config for this camera
    setStreamConfigs(prev => {
      const newConfigs = { ...prev };
      delete newConfigs[id];
      return newConfigs;
    });
  };

  const toggleCameraActive = (id) => {
    setCameras(prev => prev.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c));
  };

  const addCategory = (category) => {
    const parsedOrder = category?.order === '' || category?.order === null || category?.order === undefined
      ? NaN
      : Number(category.order);
    const fallbackOrder = categories.reduce((maxOrder, currentCategory) => {
      const currentOrder = Number(currentCategory?.order);
      return Number.isFinite(currentOrder) ? Math.max(maxOrder, currentOrder) : maxOrder;
    }, 0) + 1;

    const newCategory = {
      id: createEntityId('category'),
      name: category.name,
      color: category.color || '#FF4500',
      ...category,
      order: Number.isFinite(parsedOrder) ? parsedOrder : fallbackOrder
    };
    setCategories(prev => [...prev, newCategory]);
  };

  const updateCategory = (id, updates) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deleteCategory = (id) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    // Remove category from pilots
    setPilots(prev => prev.map(p => p.categoryId === id ? { ...p, categoryId: null } : p));
  };

  const addStage = (stage) => {
    const newStage = {
      id: createEntityId('stage'),
      name: stage.name,
      type: stage.type || 'SS',
      ssNumber: stage.ssNumber || '', // For SS / Super Prime stage types
      date: stage.date || '',
      distance: stage.distance || '',
      startTime: stage.startTime || '', // For SS/Super Prime/Liaison/Service Park: schedule time. For Lap Race: race start time
      endTime: stage.endTime || '',
      mapPlacemarkId: stage.mapPlacemarkId || '',
      numberOfLaps: stage.numberOfLaps || 5, // For Lap Race type
      ...stage
    };
    dirtyStageSyncChangesRef.current.set(newStage.id, 'upsert');
    setStages(prev => [...prev, newStage]);
    
    // For Lap Race, initialize with all pilots selected by default
    if (isLapRaceStageType(stage.type)) {
      setStagePilots(prev => ({
        ...prev,
        [newStage.id]: pilots.map(p => p.id)
      }));
    }
  };

  const updateStage = useCallback((id, updates) => {
    dirtyStageSyncChangesRef.current.set(id, 'upsert');
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, [setStages]);

  const deleteStage = (id) => {
    dirtyStageSyncChangesRef.current.set(id, 'delete');
    setStages(prev => prev.filter(s => s.id !== id));
    setTimes(prev => {
      const newTimes = { ...prev };
      Object.keys(newTimes).forEach(pilotId => {
        if (newTimes[pilotId]) {
          delete newTimes[pilotId][id];
        }
      });
      return newTimes;
    });
    setArrivalTimes(prev => {
      const newArrivalTimes = { ...prev };
      Object.keys(newArrivalTimes).forEach(pilotId => {
        if (newArrivalTimes[pilotId]) {
          delete newArrivalTimes[pilotId][id];
        }
      });
      return newArrivalTimes;
    });
    setStartTimes(prev => {
      const newStartTimes = { ...prev };
      Object.keys(newStartTimes).forEach(pilotId => {
        if (newStartTimes[pilotId]) {
          delete newStartTimes[pilotId][id];
        }
      });
      return newStartTimes;
    });
    setRealStartTimes(prev => {
      const newRealStartTimes = { ...prev };
      Object.keys(newRealStartTimes).forEach(pilotId => {
        if (newRealStartTimes[pilotId]) {
          delete newRealStartTimes[pilotId][id];
        }
      });
      return newRealStartTimes;
    });
    setLapTimes(prev => {
      const newLapTimes = { ...prev };
      Object.keys(newLapTimes).forEach(pilotId => {
        if (newLapTimes[pilotId]) {
          delete newLapTimes[pilotId][id];
        }
      });
      return newLapTimes;
    });
    setPositions(prev => {
      const newPositions = { ...prev };
      Object.keys(newPositions).forEach(pilotId => {
        if (newPositions[pilotId]) {
          delete newPositions[pilotId][id];
        }
      });
      return newPositions;
    });
    setStagePilots(prev => {
      const newStagePilots = { ...prev };
      delete newStagePilots[id];
      return newStagePilots;
    });
    setStageAlerts(prev => {
      const newStageAlerts = { ...prev };
      Object.keys(newStageAlerts).forEach(pilotId => {
        if (newStageAlerts[pilotId]) {
          delete newStageAlerts[pilotId][id];
        }
      });
      return newStageAlerts;
    });
  };

  const importMapPlacemarks = useCallback((placemarks) => {
    if (!Array.isArray(placemarks) || placemarks.length === 0) {
      return;
    }

    setMapPlacemarks((prev) => [...prev, ...placemarks]);
  }, []);

  const clearMapPlacemarks = useCallback(() => {
    setMapPlacemarks([]);
  }, []);

  // Stage pilots functions (for Lap Race pilot selection)
  const getStagePilots = useCallback((stageId) => (
    stagePilots[stageId] || pilots.map(p => p.id)
  ), [pilots, stagePilots]);

  const setStagePilotsForStage = useCallback((stageId, pilotIds) => {
    if (clientRole === 'times') {
      return;
    }
    setStagePilots(prev => ({
      ...prev,
      [stageId]: pilotIds
    }));
    markTimingSectionDirty('stagePilots');
    markTimingLineDirty('stagePilots', null, stageId);
  }, [clientRole, markTimingLineDirty, markTimingSectionDirty, setStagePilots]);

  const togglePilotInStage = useCallback((stageId, pilotId) => {
    if (clientRole === 'times') {
      return;
    }
    setStagePilots(prev => {
      const currentPilots = prev[stageId] || pilots.map(p => p.id);
      if (currentPilots.includes(pilotId)) {
        return { ...prev, [stageId]: currentPilots.filter(id => id !== pilotId) };
      } else {
        return { ...prev, [stageId]: [...currentPilots, pilotId] };
      }
    });
    markTimingSectionDirty('stagePilots');
    markTimingLineDirty('stagePilots', null, stageId);
  }, [clientRole, markTimingLineDirty, markTimingSectionDirty, pilots, setStagePilots]);

  const selectAllPilotsInStage = useCallback((stageId) => {
    if (clientRole === 'times') {
      return;
    }
    setStagePilots(prev => ({
      ...prev,
      [stageId]: pilots.map(p => p.id)
    }));
    markTimingSectionDirty('stagePilots');
    markTimingLineDirty('stagePilots', null, stageId);
  }, [clientRole, markTimingLineDirty, markTimingSectionDirty, pilots, setStagePilots]);

  const deselectAllPilotsInStage = useCallback((stageId) => {
    if (clientRole === 'times') {
      return;
    }
    setStagePilots(prev => ({
      ...prev,
      [stageId]: []
    }));
    markTimingSectionDirty('stagePilots');
    markTimingLineDirty('stagePilots', null, stageId);
  }, [clientRole, markTimingLineDirty, markTimingSectionDirty, setStagePilots]);

  // Lap times functions
  const setLapTime = useCallback((pilotId, stageId, lapIndex, time) => {
    setLapTimes(prev => {
      const pilotLaps = prev[pilotId] || {};
      const stageLaps = [...(pilotLaps[stageId] || [])];
      stageLaps[lapIndex] = time;
      return {
        ...prev,
        [pilotId]: {
          ...pilotLaps,
          [stageId]: stageLaps
        }
      };
    });
    markTimingSectionDirty('lapTimes');
    markTimingLineDirty('lapTimes', pilotId, stageId);
  }, [markTimingLineDirty, markTimingSectionDirty, setLapTimes]);

  const getLapTime = useCallback((pilotId, stageId, lapIndex) => (
    lapTimes[pilotId]?.[stageId]?.[lapIndex] || ''
  ), [lapTimes]);

  const getPilotLapTimes = useCallback((pilotId, stageId) => (
    lapTimes[pilotId]?.[stageId] || []
  ), [lapTimes]);

  // Position functions
  const setPosition = useCallback((pilotId, stageId, position) => {
    setPositions(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: position
      }
    }));
    markTimingSectionDirty('positions');
    markTimingLineDirty('positions', pilotId, stageId);
  }, [markTimingLineDirty, markTimingSectionDirty, setPositions]);

  const getPosition = useCallback((pilotId, stageId) => (
    positions[pilotId]?.[stageId] || null
  ), [positions]);

  // Calculate positions based on lap times (for lap race / rallyX)
  const calculatePositions = useCallback((stageId, currentLap) => {
    const pilotData = pilots.map(pilot => {
      const pilotLaps = lapTimes[pilot.id]?.[stageId] || [];
      const completedLaps = pilotLaps.filter(t => t).length;
      const totalTime = pilotLaps.reduce((sum, t) => {
        if (!t) return sum;
        const parts = t.split(':');
        const mins = parseInt(parts[0]) || 0;
        const secsAndMs = parts[1] ? parseFloat(parts[1]) : 0;
        return sum + mins * 60 + secsAndMs;
      }, 0);
      return { pilotId: pilot.id, completedLaps, totalTime };
    });

    // Sort by completed laps (desc), then by total time (asc)
    pilotData.sort((a, b) => {
      if (b.completedLaps !== a.completedLaps) return b.completedLaps - a.completedLaps;
      return a.totalTime - b.totalTime;
    });

    // Update positions
    pilotData.forEach((data, index) => {
      setPosition(data.pilotId, stageId, index + 1);
    });
  }, [lapTimes, pilots, setPosition]);

  const setTime = useCallback((pilotId, stageId, time) => {
    setTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: time
      }
    }));
    markTimingSectionDirty('times');
    markTimingLineDirty('times', pilotId, stageId);
  }, [markTimingLineDirty, markTimingSectionDirty, setTimes]);

  const getTime = useCallback((pilotId, stageId) => (
    times[pilotId]?.[stageId] || ''
  ), [times]);

  const setArrivalTime = useCallback((pilotId, stageId, arrivalTime) => {
    setArrivalTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: arrivalTime
      }
    }));
    markTimingSectionDirty('arrivalTimes');
    markTimingLineDirty('arrivalTimes', pilotId, stageId);
  }, [markTimingLineDirty, markTimingSectionDirty, setArrivalTimes]);

  const getArrivalTime = useCallback((pilotId, stageId) => (
    arrivalTimes[pilotId]?.[stageId] || ''
  ), [arrivalTimes]);

  const setStartTime = useCallback((pilotId, stageId, startTime) => {
    setStartTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: startTime
      }
    }));
    markTimingSectionDirty('startTimes');
    markTimingLineDirty('startTimes', pilotId, stageId);
  }, [markTimingLineDirty, markTimingSectionDirty, setStartTimes]);

  const getStartTime = useCallback((pilotId, stageId) => (
    startTimes[pilotId]?.[stageId] || ''
  ), [startTimes]);

  const setRealStartTime = useCallback((pilotId, stageId, realStartTime) => {
    setRealStartTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: realStartTime
      }
    }));
    markTimingSectionDirty('realStartTimes');
    markTimingLineDirty('realStartTimes', pilotId, stageId);
  }, [markTimingLineDirty, markTimingSectionDirty, setRealStartTimes]);

  const getRealStartTime = useCallback((pilotId, stageId) => (
    realStartTimes[pilotId]?.[stageId] || ''
  ), [realStartTimes]);

  const bulkImportTimingEntries = (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      return;
    }

    const applyBulkUpdates = (previousState, valueKey) => {
      let changed = false;
      const nextState = { ...previousState };

      entries.forEach((entry) => {
        const nextValue = entry[valueKey];
        if (nextValue === undefined || nextValue === null || nextValue === '') {
          return;
        }

        const currentPilotState = nextState[entry.pilotId] || {};
        if (currentPilotState[entry.stageId] === nextValue) {
          return;
        }

        nextState[entry.pilotId] = {
          ...currentPilotState,
          [entry.stageId]: nextValue
        };
        changed = true;
      });

      return changed ? nextState : previousState;
    };

    setTimes((prev) => applyBulkUpdates(prev, 'totalTime'));
    setArrivalTimes((prev) => applyBulkUpdates(prev, 'arrivalTime'));
    setStartTimes((prev) => applyBulkUpdates(prev, 'startTime'));
    markTimingSectionDirty('times');
    markTimingSectionDirty('arrivalTimes');
    markTimingSectionDirty('startTimes');
    entries.forEach((entry) => {
      if (entry.totalTime !== undefined && entry.totalTime !== null && entry.totalTime !== '') {
        markTimingLineDirty('times', entry.pilotId, entry.stageId);
      }
      if (entry.arrivalTime !== undefined && entry.arrivalTime !== null && entry.arrivalTime !== '') {
        markTimingLineDirty('arrivalTimes', entry.pilotId, entry.stageId);
      }
      if (entry.startTime !== undefined && entry.startTime !== null && entry.startTime !== '') {
        markTimingLineDirty('startTimes', entry.pilotId, entry.stageId);
      }
    });
  };

  const isRetiredStage = useCallback((pilotId, stageId) => (
    !!retiredStages[pilotId]?.[stageId]
  ), [retiredStages]);

  const setRetiredFromStage = useCallback((pilotId, stageId, retired) => {
    if (clientRole === 'times') {
      return;
    }
    const sortedSpecialStages = [...stages]
      .filter((stage) => isSpecialStageType(stage.type))
      .sort(compareStagesBySchedule);
    const startIndex = sortedSpecialStages.findIndex((stage) => stage.id === stageId);

    if (startIndex === -1) {
      return;
    }

    const affectedStageIds = sortedSpecialStages.slice(startIndex).map((stage) => stage.id);

    setRetiredStages((prev) => {
      const next = { ...prev };
      const nextPilotStages = { ...(next[pilotId] || {}) };

      affectedStageIds.forEach((affectedStageId) => {
        if (retired) {
          nextPilotStages[affectedStageId] = affectedStageId;
        } else {
          delete nextPilotStages[affectedStageId];
        }
      });

      if (Object.keys(nextPilotStages).length > 0) {
        next[pilotId] = nextPilotStages;
      } else {
        delete next[pilotId];
      }

      return next;
    });
    markTimingSectionDirty('retiredStages');
    affectedStageIds.forEach((affectedStageId) => {
      markTimingLineDirty('retiredStages', pilotId, affectedStageId);
    });
  }, [clientRole, markTimingLineDirty, markTimingSectionDirty, setRetiredStages, stages]);

  const isStageAlert = useCallback((pilotId, stageId) => (
    !!stageAlerts?.[pilotId]?.[stageId]
  ), [stageAlerts]);

  const setStageAlert = useCallback((pilotId, stageId, alert) => {
    if (clientRole === 'times') {
      return;
    }
    setStageAlerts((prev) => {
      const next = { ...prev };
      const nextPilotStages = { ...(next[pilotId] || {}) };

      if (alert) {
        nextPilotStages[stageId] = stageId;
      } else {
        delete nextPilotStages[stageId];
      }

      if (Object.keys(nextPilotStages).length > 0) {
        next[pilotId] = nextPilotStages;
      } else {
        delete next[pilotId];
      }

      return next;
    });
    markTimingSectionDirty('stageAlerts');
    markTimingLineDirty('stageAlerts', pilotId, stageId);
  }, [clientRole, markTimingLineDirty, markTimingSectionDirty, setStageAlerts]);

  // Stream configuration functions
  const getStreamConfig = (pilotId) => {
    return streamConfigs[pilotId] || {
      volume: 100,
      muted: false,
      solo: false,
      saturation: 100,
      contrast: 100,
      brightness: 100
    };
  };

  const setStreamConfig = (pilotId, config) => {
    setStreamConfigs(prev => ({
      ...prev,
      [pilotId]: { ...getStreamConfig(pilotId), ...config }
    }));
  };

  const setSoloStream = (pilotId) => {
    // If pilot is already solo, unsolo them
    const currentConfig = getStreamConfig(pilotId);
    if (currentConfig.solo) {
      setStreamConfigs(prev => ({
        ...prev,
        [pilotId]: { ...currentConfig, solo: false }
      }));
    } else {
      // Set this pilot as solo, remove solo from others
      setStreamConfigs(prev => {
        const newConfigs = { ...prev };
        Object.keys(newConfigs).forEach(id => {
          if (newConfigs[id]) {
            newConfigs[id] = { ...newConfigs[id], solo: false };
          }
        });
        newConfigs[pilotId] = { ...getStreamConfig(pilotId), solo: true };
        return newConfigs;
      });
    }
  };

  const exportData = useCallback(() => {
    const data = {
      eventName: loadFromStorage('rally_event_name', ''),
      positions: loadFromStorage('rally_positions', {}),
      lapTimes: loadFromStorage('rally_lap_times', {}),
      stagePilots: loadFromStorage('rally_stage_pilots', {}),
      pilots: loadFromStorage('rally_pilots', []),
      pilotTelemetry: loadFromStorage('rally_pilot_telemetry', {}),
      categories: loadFromStorage('rally_categories', []),
      stages: loadFromStorage('rally_stages', []),
      times: loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').map,
      arrivalTimes: loadFromStorage('rally_arrival_times', {}),
      startTimes: loadFromStorage('rally_start_times', {}),
      realStartTimes: loadFromStorage('rally_real_start_times', {}),
      retiredStages: loadFromStorage('rally_retired_stages', {}),
      stageAlerts: loadFromStorage('rally_stage_alerts', {}),
      timeDecimals: loadFromStorage('rally_time_decimals', 3),
      streamConfigs: loadFromStorage('rally_stream_configs', {}),
      globalAudio: loadFromStorage('rally_global_audio', { volume: 100, muted: false }),
      cameras: loadFromStorage('rally_cameras', []),
      externalMedia: loadFromStorage('rally_external_media', []),
      transitionImageUrl: loadFromStorage('rally_transition_image', ''),
      currentStageId: loadFromStorage('rally_current_stage', null),
      chromaKey: loadFromStorage('rally_chroma_key', '#000000'),
      mapUrl: loadFromStorage('rally_map_url', ''),
      logoUrl: loadFromStorage('rally_logo_url', ''),
      dataVersion,
      exportDate: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  }, [dataVersion]);

  const importData = useCallback((jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.pilots) setPilots(data.pilots);
      if (data.pilotTelemetry) setPilotTelemetryByPilotId(data.pilotTelemetry);
      if (data.categories) setCategories(data.categories);
      if (data.stages) setStages(data.stages);
      if (data.times) setTimes(data.times);
      if (data.arrivalTimes) setArrivalTimes(data.arrivalTimes);
      if (data.startTimes) setStartTimes(data.startTimes);
      if (data.realStartTimes) setRealStartTimes(data.realStartTimes);
      if (data.retiredStages) setRetiredStages(data.retiredStages);
      if (data.stageAlerts) setStageAlerts(data.stageAlerts);
      if (data.timeDecimals !== undefined) {
        setTimeDecimals(Math.min(3, Math.max(0, Math.trunc(Number(data.timeDecimals) || 0))));
      }
      if (data.streamConfigs) setStreamConfigs(data.streamConfigs);
      if (data.globalAudio) setGlobalAudio(data.globalAudio);
      if (data.cameras) setCameras(data.cameras);
      if (data.externalMedia) setExternalMedia(data.externalMedia);
      if (data.transitionImageUrl !== undefined) setTransitionImageUrl(data.transitionImageUrl);
      if (data.currentStageId !== undefined) setCurrentStageId(data.currentStageId);
      if (data.chromaKey) setChromaKey(data.chromaKey);
      if (data.mapUrl !== undefined) setMapUrl(data.mapUrl);
      if (data.logoUrl !== undefined) setLogoUrl(data.logoUrl);
      if (data.eventName !== undefined) setEventName(data.eventName);
      if (data.positions) setPositions(data.positions);
      if (data.lapTimes) setLapTimes(data.lapTimes);
      if (data.stagePilots) setStagePilots(data.stagePilots);
      updateDataVersion(ALL_STORAGE_DOMAINS);
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }, [setCategories, setCameras, setChromaKey, setCurrentStageId, setEventName, setExternalMedia, setGlobalAudio, setLapTimes, setLogoUrl, setMapUrl, setPilots, setPilotTelemetryByPilotId, setPositions, setRealStartTimes, setRetiredStages, setStageAlerts, setStagePilots, setStages, setStartTimes, setStreamConfigs, setTimeDecimals, setTimes, setArrivalTimes, setTransitionImageUrl, updateDataVersion]);

  const clearAllData = useCallback(() => {
    setEventName('');
    setPositions({});
    setLapTimes({});
    setStagePilots({});
    setPilots([]);
    setCategories([]);
    setStages([]);
    setTimes({});
    setArrivalTimes({});
    setStartTimes({});
    setRealStartTimes({});
    setRetiredStages({});
    setStageAlerts({});
    setMapPlacemarks([]);
    setPilotTelemetryByPilotId({});
    setDebugDate('');
    setTimeDecimals(3);
    setStreamConfigs({});
    setCameras([]);
    setExternalMedia([]);
    setGlobalAudio({ volume: 100, muted: false });
    setCurrentStageId(null);
    setChromaKey('#000000');
    setMapUrl('');
    setLogoUrl('');
    setTransitionImageUrl('');
    updateDataVersion(ALL_STORAGE_DOMAINS);
  }, [setCameras, setCategories, setChromaKey, setCurrentStageId, setEventName, setExternalMedia, setGlobalAudio, setLapTimes, setLogoUrl, setMapPlacemarks, setMapUrl, setPilots, setPilotTelemetryByPilotId, setPositions, setRealStartTimes, setRetiredStages, setStageAlerts, setStagePilots, setStages, setStartTimes, setStreamConfigs, setTimeDecimals, setTimes, setArrivalTimes, setTransitionImageUrl, updateDataVersion]);

  const value = {
    // Event configuration
    eventName,
    positions,
    lapTimes,
    stagePilots,
    // Core data
    pilots,
    pilotTelemetryByPilotId,
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    retiredStages,
    stageAlerts,
    mapPlacemarks,
    debugDate,
    timeDecimals,
    streamConfigs,
    globalAudio,
    cameras,
    currentStageId,
    chromaKey,
    mapUrl,
    logoUrl,
    transitionImageUrl,
    currentScene,
    dataVersion,
    // WebSocket state
    wsEnabled,
    wsChannelKey,
    wsConnectionStatus,
    wsError,
    wsLastMessageAt,
    wsRole,
    wsPublishSections,
    clientRole,
    sessionManifest,
    latestSnapshotVersion,
    dirtySetupSections,
    lastSetupEditAt,
    lastSetupSyncAt,
    dirtyTimingSections,
    lastTimesEditAt,
    lastTimesSyncAt,
    lastTimesAckAt,
    lastTimesAckedEditAt,
    lineSyncResults,
    // Setters
    setEventName,
    setCurrentScene,
    setDebugDate,
    setTimeDecimals,
    setChromaKey,
    setMapUrl,
    setLogoUrl,
    setTransitionImageUrl,
    setCurrentStageId,
    setGlobalAudio,
    // CRUD operations
    addPilot,
    updatePilot,
    setPilotTelemetry,
    getPilotTelemetry,
    deletePilot,
    togglePilotActive,
    // Camera operations
    addCamera,
    updateCamera,
    deleteCamera,
    toggleCameraActive,
    addCategory,
    updateCategory,
    deleteCategory,
    addStage,
    updateStage,
    deleteStage,
    importMapPlacemarks,
    clearMapPlacemarks,
    setTime,
    getTime,
    setArrivalTime,
    getArrivalTime,
    setStartTime,
    getStartTime,
    setRealStartTime,
    getRealStartTime,
    setRealStartTime,
    getRealStartTime,
    bulkImportTimingEntries,
    setRetiredFromStage,
    isRetiredStage,
    setStageAlert,
    isStageAlert,
    // Lap time functions
    setLapTime,
    getLapTime,
    getPilotLapTimes,
    // Position functions
    setPosition,
    getPosition,
    calculatePositions,
    // Stage pilots functions (for Lap Race)
    getStagePilots,
    setStagePilotsForStage,
    togglePilotInStage,
    selectAllPilotsInStage,
    deselectAllPilotsInStage,
    getStreamConfig,
    setStreamConfig,
    setSoloStream,
    // Data management
    exportData,
    importData,
    clearAllData,
    externalMedia,
    addExternalMedia,
    updateExternalMedia,
    deleteExternalMedia,
    reloadData,
    // WebSocket functions
    connectWebSocket,
    disconnectWebSocket,
    generateNewChannelKey,
    setClientRole,
    requestTimingLineSync
  };

  const configValue = useMemo(() => ({
    pilots,
    pilotTelemetryByPilotId,
    categories,
    stages,
    cameras,
    timeDecimals,
    chromaKey,
    logoUrl,
    transitionImageUrl,
    externalMedia,
    setTimeDecimals,
    setChromaKey,
    setLogoUrl,
    setTransitionImageUrl,
    addPilot,
    updatePilot,
    setPilotTelemetry,
    getPilotTelemetry,
    deletePilot,
    togglePilotActive,
    addExternalMedia,
    updateExternalMedia,
    deleteExternalMedia,
    exportData,
    importData,
    clearAllData
  }), [
    pilots,
    pilotTelemetryByPilotId,
    categories,
    stages,
    cameras,
    timeDecimals,
    chromaKey,
    logoUrl,
    transitionImageUrl,
    externalMedia,
    setTimeDecimals,
    setChromaKey,
    setLogoUrl,
    setTransitionImageUrl,
    addPilot,
    updatePilot,
    setPilotTelemetry,
    getPilotTelemetry,
    deletePilot,
    togglePilotActive,
    addExternalMedia,
    updateExternalMedia,
    deleteExternalMedia,
    exportData,
    importData,
    clearAllData
  ]);

  const metaValue = useMemo(() => ({
    pilots,
    categories,
    stages,
    currentStageId,
    updateStage
  }), [categories, currentStageId, pilots, stages, updateStage]);

  const timingValue = useMemo(() => ({
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    lapTimes,
    positions,
    stagePilots,
    retiredStages,
    stageAlerts,
    timeDecimals,
    setTime,
    getTime,
    setArrivalTime,
    getArrivalTime,
    setStartTime,
    getStartTime,
    setRealStartTime,
    getRealStartTime,
    setLapTime,
    getLapTime,
    getPilotLapTimes,
    setPosition,
    getPosition,
    calculatePositions,
    getStagePilots,
    setStagePilotsForStage,
    togglePilotInStage,
    selectAllPilotsInStage,
    deselectAllPilotsInStage,
    setRetiredFromStage,
    isRetiredStage,
    setStageAlert,
    isStageAlert
  }), [
    arrivalTimes,
    calculatePositions,
    deselectAllPilotsInStage,
    getArrivalTime,
    getLapTime,
    getPilotLapTimes,
    getPosition,
    getRealStartTime,
    getStagePilots,
    getStartTime,
    getTime,
    isRetiredStage,
    isStageAlert,
    lapTimes,
    positions,
    realStartTimes,
    retiredStages,
    selectAllPilotsInStage,
    setArrivalTime,
    setLapTime,
    setPosition,
    setRealStartTime,
    setRetiredFromStage,
    setStageAlert,
    setStagePilotsForStage,
    setStartTime,
    setTime,
    stageAlerts,
    stagePilots,
    startTimes,
    timeDecimals,
    times,
    togglePilotInStage
  ]);

  const wsValue = useMemo(() => ({
    wsEnabled,
    wsChannelKey,
    wsConnectionStatus,
    wsError,
    wsLastMessageAt,
    wsRole,
    wsPublishSections,
    clientRole,
    sessionManifest,
    latestSnapshotVersion,
    dirtySetupSections,
    lastSetupEditAt,
    lastSetupSyncAt,
    dirtyTimingSections,
    lastTimesEditAt,
    lastTimesSyncAt,
    lastTimesAckAt,
    lastTimesAckedEditAt,
    lineSyncResults,
    connectWebSocket,
    disconnectWebSocket,
    generateNewChannelKey,
    setClientRole,
    requestTimingLineSync
  }), [
    clientRole,
    connectWebSocket,
    disconnectWebSocket,
    dirtySetupSections,
    dirtyTimingSections,
    generateNewChannelKey,
    lastSetupEditAt,
    lastSetupSyncAt,
    lastTimesAckAt,
    lastTimesAckedEditAt,
    lastTimesEditAt,
    lastTimesSyncAt,
    latestSnapshotVersion,
    lineSyncResults,
    requestTimingLineSync,
    sessionManifest,
    setClientRole,
    wsChannelKey,
    wsConnectionStatus,
    wsEnabled,
    wsError,
    wsLastMessageAt,
    wsPublishSections,
    wsRole
  ]);

  return (
    <RallyContext.Provider value={value}>
      <RallyConfigContext.Provider value={configValue}>
        <RallyMetaContext.Provider value={metaValue}>
          <RallyTimingContext.Provider value={timingValue}>
            <RallyWsContext.Provider value={wsValue}>
              {children}
            </RallyWsContext.Provider>
          </RallyTimingContext.Provider>
        </RallyMetaContext.Provider>
      </RallyConfigContext.Provider>
    </RallyContext.Provider>
  );
};
