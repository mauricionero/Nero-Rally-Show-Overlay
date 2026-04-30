import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { getWebSocketProvider, generateChannelKey, parseChannelKey, PROVIDER_NAME } from '../utils/websocketProvider';
import WsMessageReceiver from '../utils/wsMessageReceiver.js';
import SyncEngine, { SYNC_MESSAGE_TYPES, SYNC_ROLES, createSyncInstanceId } from '../utils/syncEngine.js';
import { DEFAULT_SYNC_MESSAGE_MAX_BYTES as SYNC_MESSAGE_MAX_BYTES } from '../utils/sync/syncMessageBuilder.js';
import SyncOutboundService from '../utils/sync/SyncOutboundService.js';
import SyncInboundService from '../utils/sync/SyncInboundService.js';
import {
  ALL_SNAPSHOT_SECTION_KEYS,
  canRoleWriteTimingSection,
  getAllowedPublishSectionsForRole,
  normalizeSyncRole,
  roleRequiresSnapshotBootstrap,
  SNAPSHOT_ONLY_TIMING_SECTION_KEYS,
  sanitizeSnapshotSections,
  SETUP_BASE_SECTION_KEYS,
  TIMES_ROLE_TIMING_SECTION_SET,
  TIMING_SECTION_KEYS,
  TIMING_SECTION_SET
} from '../utils/sync/SyncRolePolicy.js';
import { getPilotScheduledStartTime } from '../utils/pilotSchedule.js';
import { compareStagesBySchedule } from '../utils/stageSchedule.js';
import { isLapTimingStageType, isManualStartStageType, isSpecialStageType } from '../utils/stageTypes.js';
import { formatDurationSeconds } from '../utils/timeFormat.js';
import { getLapRaceStoredTotalTimeSeconds, getLapTimingStartTime } from '../utils/rallyHelpers.js';
import { normalizeLatLongString, parseLatLongString } from '../utils/pilotMapMarkers.js';
import { getPilotTelemetryForId, normalizePilotId } from '../utils/pilotIdentity.js';
import {
  assignPilotTelemetryFields,
  assignPilotTelemetryGForceFields,
  PILOT_G_FORCE_FIELD_KEYS
} from '../utils/pilotTelemetry.js';
import { isSyncDebugEnabled, isTelemetryDebugEnabled } from '../utils/debugFlags.js';
import { clearManualWsDisconnect, markManualWsDisconnect } from '../utils/wsAutoConnect.js';
import {
  canTimingSourceOverwrite,
  getHighestTimingSource,
  normalizeTimingSource,
  TIMING_SOURCES
} from '../utils/timingSource.js';

const RallyContext = createContext();
const RallyConfigContext = createContext();
const RallyMetaContext = createContext();
const RallyTimingContext = createContext();
const RallyWsContext = createContext();
const TELEMETRY_STATE_FLUSH_INTERVAL_MS = 1000;
const DEFAULT_LAP_RACE_TOTAL_TIME_MODE = 'cumulative';

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

const normalizeCurrentSessionMarker = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const timestamp = Number(value.timestamp || 0);
  const snapshotId = String(value.snapshotId || '').trim();
  const partIndex = Number.isFinite(value.partIndex) ? Number(value.partIndex) : 0;
  const channelType = String(value.channelType || '').trim();
  const channelName = String(value.channelName || '').trim();
  const messageType = String(value.messageType || '').trim();
  const originalMessageType = String(value.originalMessageType || '').trim();
  const packageType = String(value.packageType || '').trim();
  const controlType = String(value.controlType || '').trim();
  const section = String(value.section || '').trim();

  if (!timestamp && !snapshotId && !messageType && !packageType && !controlType && !section) {
    return null;
  }

  return {
    timestamp,
    channelType: channelType || null,
    channelName: channelName || null,
    snapshotId,
    partIndex,
    messageType: messageType || null,
    originalMessageType: originalMessageType || null,
    packageType: packageType || null,
    controlType: controlType || null,
    section: section || null
  };
};

const normalizeCurrentSessionMeta = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const channelKey = String(value.channelKey || '').trim();
  const lastProjectMessage = normalizeCurrentSessionMarker(value.lastProjectMessage);
  const sessionId = String(value.sessionId || '').trim() || createSyncInstanceId();
  const updatedAt = Number(value.updatedAt || lastProjectMessage?.timestamp || 0);

  if (!channelKey && !lastProjectMessage) {
    return null;
  }

  return {
    sessionId,
    channelKey: channelKey || null,
    updatedAt,
    lastProjectMessage
  };
};

const extractStageFlagEntries = (flagMap = {}) => (
  Object.entries(flagMap || {}).flatMap(([pilotId, stageMap]) => (
    Object.entries(stageMap || {}).map(([stageId, value]) => ({
      pilotId: normalizePilotId(pilotId),
      stageId: String(stageId || '').trim(),
      value,
      enabled: normalizeStageSosLevel(value) > 0
    }))
  )).filter((entry) => entry.pilotId && entry.stageId)
);

const buildSosNotificationId = ({ pilotId, stageId, timestamp }) => (
  `sos:${normalizePilotId(pilotId)}:${String(stageId || '').trim()}:${Number(timestamp || 0)}`
);

const buildSosDeliveryKey = (pilotId, stageId) => (
  `${normalizePilotId(pilotId)}:${String(stageId || '').trim()}`
);

const normalizeStageSosLevel = (value) => {
  if (value === true) {
    return 1;
  }

  if (value === false || value === null || value === undefined || value === '') {
    return 0;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value ? 1 : 0;
  }

  if (numericValue <= 0) {
    return 0;
  }

  return Math.min(3, Math.max(1, Math.trunc(numericValue)));
};

const normalizeConnectionStrength = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.max(0, Math.min(4, Math.trunc(numericValue)));
};

const normalizeConnectionType = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return '';
  }

  return String(value).trim();
};

const getManualTimingSourceForRole = (role) => (
  normalizeSyncRole(role) === SYNC_ROLES.TIMES
    ? TIMING_SOURCES.TIMES
    : TIMING_SOURCES.SETUP
);

const trimTrailingEmptyArrayValues = (values = []) => {
  const nextValues = Array.isArray(values) ? [...values] : [];

  while (nextValues.length > 0) {
    const lastValue = nextValues[nextValues.length - 1];
    if (lastValue === undefined || lastValue === null || lastValue === '') {
      nextValues.pop();
      continue;
    }
    break;
  }

  return nextValues;
};

const getNestedStageValue = (map = {}, pilotId, stageId, fallbackValue = '') => (
  map?.[pilotId]?.[stageId] ?? fallbackValue
);

const setNestedStageValue = (map = {}, pilotId, stageId, value) => {
  const normalizedPilotId = normalizePilotId(pilotId);
  const normalizedStageId = String(stageId || '').trim();

  if (!normalizedPilotId || !normalizedStageId) {
    return isPlainObject(map) ? map : {};
  }

  const nextMap = isPlainObject(map) ? { ...map } : {};
  const nextPilotStages = isPlainObject(nextMap[normalizedPilotId])
    ? { ...nextMap[normalizedPilotId] }
    : {};

  if (value === undefined || value === null || value === '') {
    delete nextPilotStages[normalizedStageId];
  } else {
    nextPilotStages[normalizedStageId] = value;
  }

  if (Object.keys(nextPilotStages).length > 0) {
    nextMap[normalizedPilotId] = nextPilotStages;
  } else {
    delete nextMap[normalizedPilotId];
  }

  return nextMap;
};

const setNestedStageArrayValue = (map = {}, pilotId, stageId, values) => {
  const trimmedValues = trimTrailingEmptyArrayValues(values);
  return setNestedStageValue(map, pilotId, stageId, trimmedValues.length > 0 ? trimmedValues : '');
};

const writeCurrentSessionMetaToStorage = (nextMeta = null) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  if (!nextMeta) {
    window.localStorage.removeItem(CURRENT_SESSION_META_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(CURRENT_SESSION_META_STORAGE_KEY, JSON.stringify(nextMeta));
};

const STORAGE_DOMAIN_VERSION_KEYS = {
  meta: 'rally_meta_version',
  pilots: 'rally_pilots_version',
  pilotTelemetry: 'rally_pilots_telemetry_version',
  categories: 'rally_categories_version',
  stages: 'rally_stages_version',
  timingCore: 'rally_timing_core_version',
  timingExtra: 'rally_timing_extra_version',
  maps: 'rally_maps_version',
  streams: 'rally_streams_version',
  media: 'rally_media_version'
};
const CURRENT_SESSION_META_STORAGE_KEY = 'rally_meta_current_session';
const SOURCE_FINISH_TIME_STORAGE_KEY = 'rally_source_finish_time';
const SOURCE_LAP_TIME_STORAGE_KEY = 'rally_source_lap_time';
const SETUP_DISPLAY_IDS_STORAGE_KEY = 'rally_setup_display_ids';
const TIMING_PATCH_DEFAULT_VALUES = {
  times: '',
  arrivalTimes: '',
  startTimes: '',
  realStartTimes: '',
  lapTimes: [],
  positions: null,
  stagePilots: [],
  retiredStages: false,
  stageAlerts: false,
  stageSos: 0,
  sourceFinishTime: '',
  sourceLapTime: []
};
const SETUP_TIMING_SECTION_SET = TIMING_SECTION_SET;
const TIMING_BY_STAGE_FIELDS = new Set([
  ...TIMING_SECTION_KEYS,
  ...SNAPSHOT_ONLY_TIMING_SECTION_KEYS
]);

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

const normalizePilotStreamUrlFields = (pilot = null) => {
  if (!isPlainObject(pilot)) {
    return pilot;
  }

  const nextPilot = { ...pilot };
  const streamUrlValue = nextPilot.streamUrl
    ?? nextPilot.streamURL
    ?? nextPilot['stream url']
    ?? nextPilot.url_stream
    ?? nextPilot.stream_url;

  if (streamUrlValue !== undefined) {
    nextPilot.streamUrl = String(streamUrlValue || '').trim();
  }

  delete nextPilot.streamURL;
  delete nextPilot['stream url'];
  delete nextPilot.url_stream;
  delete nextPilot.stream_url;

  return nextPilot;
};

const normalizePilotArrayPayload = (value = null) => {
  if (Array.isArray(value)) {
    return value.map((pilot) => normalizePilotStreamUrlFields(pilot));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).map(([id, pilot]) => ({
      id,
      ...normalizePilotStreamUrlFields(pilot)
    }));
  }

  return [];
};

const normalizePilotPatchMap = (value = null) => {
  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([id, pilot]) => [id, normalizePilotStreamUrlFields(pilot)])
  );
};

const stripEntityIdPrefix = (value, prefix = '') => {
  const trimmedValue = String(value ?? '').trim();
  if (!trimmedValue) {
    return '';
  }

  const expectedPrefix = prefix ? `${prefix}_` : '';
  return expectedPrefix && trimmedValue.startsWith(expectedPrefix)
    ? trimmedValue.slice(expectedPrefix.length)
    : trimmedValue;
};

const normalizeReplayStageTimes = (value) => {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([stageId, timeValue]) => [String(stageId || '').trim(), String(timeValue || '').trim()])
      .filter(([stageId, timeValue]) => stageId && timeValue)
  );
};

const resolveKnownEntityId = (value, entities = [], prefix = '') => {
  const trimmedValue = String(value ?? '').trim();
  if (!trimmedValue) {
    return '';
  }

  const entityList = Array.isArray(entities) ? entities : [];
  const exactMatch = entityList.find((entity) => String(entity?.id ?? '').trim() === trimmedValue);
  if (exactMatch?.id) {
    return exactMatch.id;
  }

  const comparableIncomingId = stripEntityIdPrefix(trimmedValue, prefix);
  const aliasMatch = entityList.find((entity) => (
    stripEntityIdPrefix(entity?.id, prefix) === comparableIncomingId
  ));

  return aliasMatch?.id || trimmedValue;
};

const mergePilotStageFlagMap = (currentValue = {}, incomingValue = {}, options = {}) => {
  const nextValue = isPlainObject(currentValue) ? { ...currentValue } : {};
  const incomingMap = isPlainObject(incomingValue) ? incomingValue : {};
  const resolvePilotId = typeof options.resolvePilotId === 'function'
    ? options.resolvePilotId
    : normalizePilotId;
  const resolveStageId = typeof options.resolveStageId === 'function'
    ? options.resolveStageId
    : ((stageId) => String(stageId ?? '').trim());
  const normalizeValue = typeof options.normalizeValue === 'function'
    ? options.normalizeValue
    : ((enabled, normalizedStageId) => (enabled ? normalizedStageId : null));

  Object.entries(incomingMap).forEach(([pilotId, stageFlags]) => {
    const normalizedPilotId = resolvePilotId(normalizePilotId(pilotId));
    if (!normalizedPilotId || !isPlainObject(stageFlags)) {
      return;
    }

    const nextPilotStages = { ...(nextValue[normalizedPilotId] || {}) };

    Object.entries(stageFlags).forEach(([stageId, enabled]) => {
      const normalizedStageId = resolveStageId(stageId);
      if (!normalizedStageId) {
        return;
      }

      const nextValueForStage = normalizeValue(enabled, normalizedStageId, normalizedPilotId);

      if (nextValueForStage === null || nextValueForStage === undefined || nextValueForStage === false || nextValueForStage === 0 || nextValueForStage === '') {
        delete nextPilotStages[normalizedStageId];
      } else {
        nextPilotStages[normalizedStageId] = nextValueForStage;
      }
    });

    if (Object.keys(nextPilotStages).length > 0) {
      nextValue[normalizedPilotId] = nextPilotStages;
    } else {
      delete nextValue[normalizedPilotId];
    }
  });

  return nextValue;
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

const buildTimingByStageSnapshot = (snapshot = {}, selectedTimingSections = []) => {
  const sections = new Set(
    (Array.isArray(selectedTimingSections) ? selectedTimingSections : [])
      .filter((section) => TIMING_BY_STAGE_FIELDS.has(section))
  );

  if (sections.size === 0) {
    return {};
  }

  const nextTimingByStage = {};
  const allStageIds = new Set([
    ...(Array.isArray(snapshot.stages) ? snapshot.stages.map((stage) => stage?.id).filter(Boolean) : []),
    ...Object.keys(snapshot.stagePilots || {})
  ]);

  allStageIds.forEach((stageId) => {
    const stagePilotsForStage = Array.isArray(snapshot.stagePilots?.[stageId])
      ? new Set(snapshot.stagePilots[stageId].filter(Boolean))
      : new Set();
    const stagePilotEntries = {};

    (Array.isArray(snapshot.pilots) ? snapshot.pilots : []).forEach((pilot) => {
      const pilotId = pilot?.id;
      if (!pilotId) {
        return;
      }

      const pilotStageFields = {};

      if (sections.has('times') && snapshot.times?.[pilotId]?.[stageId] !== undefined) {
        pilotStageFields.times = snapshot.times[pilotId][stageId];
      }
      if (sections.has('arrivalTimes') && snapshot.arrivalTimes?.[pilotId]?.[stageId] !== undefined) {
        pilotStageFields.arrivalTimes = snapshot.arrivalTimes[pilotId][stageId];
      }
      if (sections.has('startTimes') && snapshot.startTimes?.[pilotId]?.[stageId] !== undefined) {
        pilotStageFields.startTimes = snapshot.startTimes[pilotId][stageId];
      }
      if (sections.has('realStartTimes') && snapshot.realStartTimes?.[pilotId]?.[stageId] !== undefined) {
        pilotStageFields.realStartTimes = snapshot.realStartTimes[pilotId][stageId];
      }
      if (sections.has('lapTimes') && snapshot.lapTimes?.[pilotId]?.[stageId] !== undefined) {
        pilotStageFields.lapTimes = snapshot.lapTimes[pilotId][stageId];
      }
      if (sections.has('sourceFinishTime') && snapshot.sourceFinishTime?.[pilotId]?.[stageId] !== undefined) {
        pilotStageFields.sourceFinishTime = snapshot.sourceFinishTime[pilotId][stageId];
      }
      if (sections.has('sourceLapTime') && snapshot.sourceLapTime?.[pilotId]?.[stageId] !== undefined) {
        pilotStageFields.sourceLapTime = snapshot.sourceLapTime[pilotId][stageId];
      }
      if (sections.has('positions') && snapshot.positions?.[pilotId]?.[stageId] !== undefined) {
        pilotStageFields.positions = snapshot.positions[pilotId][stageId];
      }
      if (sections.has('retiredStages') && snapshot.retiredStages?.[pilotId]?.[stageId]) {
        pilotStageFields.retiredStages = true;
      }
      if (sections.has('stageAlerts') && snapshot.stageAlerts?.[pilotId]?.[stageId]) {
        pilotStageFields.stageAlerts = true;
      }
      const stageSosLevel = normalizeStageSosLevel(snapshot.stageSos?.[pilotId]?.[stageId]);
      if (sections.has('stageSos') && stageSosLevel > 0) {
        pilotStageFields.stageSos = stageSosLevel;
      }
      if (sections.has('stagePilots') && stagePilotsForStage.has(pilotId)) {
        pilotStageFields.stagePilots = true;
      }

      if (Object.keys(pilotStageFields).length > 0) {
        stagePilotEntries[pilotId] = pilotStageFields;
      }
    });

    if (Object.keys(stagePilotEntries).length > 0) {
      nextTimingByStage[stageId] = stagePilotEntries;
    }
  });

  return nextTimingByStage;
};

const expandTimingByStageSnapshot = (timingByStage = {}) => {
  const expanded = {};

  Object.entries(isPlainObject(timingByStage) ? timingByStage : {}).forEach(([stageId, stagePilots]) => {
    Object.entries(isPlainObject(stagePilots) ? stagePilots : {}).forEach(([pilotId, pilotFields]) => {
      if (!pilotId || !isPlainObject(pilotFields)) {
        return;
      }

      const assignPilotStageValue = (section, value) => {
        if (value === undefined) {
          return;
        }

        if (!isPlainObject(expanded[section])) {
          expanded[section] = {};
        }
        if (!isPlainObject(expanded[section][pilotId])) {
          expanded[section][pilotId] = {};
        }
        expanded[section][pilotId][stageId] = value;
      };

      assignPilotStageValue('times', pilotFields.times);
      assignPilotStageValue('arrivalTimes', pilotFields.arrivalTimes);
      assignPilotStageValue('startTimes', pilotFields.startTimes);
      assignPilotStageValue('realStartTimes', pilotFields.realStartTimes);
      assignPilotStageValue('lapTimes', pilotFields.lapTimes);
      assignPilotStageValue('sourceFinishTime', pilotFields.sourceFinishTime);
      assignPilotStageValue('sourceLapTime', pilotFields.sourceLapTime);
      assignPilotStageValue('positions', pilotFields.positions);

      if (pilotFields.retiredStages) {
        assignPilotStageValue('retiredStages', true);
      }
      if (pilotFields.stageAlerts) {
        assignPilotStageValue('stageAlerts', true);
      }
      if (normalizeStageSosLevel(pilotFields.stageSos) > 0) {
        assignPilotStageValue('stageSos', normalizeStageSosLevel(pilotFields.stageSos));
      }
      if (pilotFields.stagePilots) {
        if (!isPlainObject(expanded.stagePilots)) {
          expanded.stagePilots = {};
        }
        if (!Array.isArray(expanded.stagePilots[stageId])) {
          expanded.stagePilots[stageId] = [];
        }
        expanded.stagePilots[stageId].push(pilotId);
      }
    });
  });

  return expanded;
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

const buildDeltaBatchChangesFromEntries = (entries = []) => {
  const changes = {};

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry?.section) {
      return;
    }

    if (entry.section === 'stages') {
      if (!isPlainObject(changes.stages)) {
        changes.stages = {};
      }

      const stageId = String(entry.stageId || entry.id || '').trim();
      if (!stageId) {
        return;
      }

      if (entry.op === 'delete' || entry.value === null) {
        changes.stages[stageId] = null;
        return;
      }

      const stageChanges = isPlainObject(entry.value)
        ? entry.value
        : (isPlainObject(entry.changes) ? entry.changes : null);

      if (isPlainObject(stageChanges)) {
        changes.stages[stageId] = {
          ...(changes.stages[stageId] || {}),
          ...stageChanges
        };
      }
      return;
    }

    if (entry.kind === 'meta') {
      if (!isPlainObject(changes.meta)) {
        changes.meta = {};
      }
      changes.meta[entry.field] = entry.value;
      return;
    }

    if (entry.kind === 'timing-line' || (entry.pilotId !== undefined && entry.stageId !== undefined)) {
      if (!isPlainObject(changes[entry.section])) {
        changes[entry.section] = {};
      }

      const pilotId = String(entry.pilotId || '').trim();
      const stageId = String(entry.stageId || '').trim();
      if (!pilotId || !stageId) {
        return;
      }

      if (!isPlainObject(changes[entry.section][pilotId])) {
        changes[entry.section][pilotId] = {};
      }
      changes[entry.section][pilotId][stageId] = entry.value;
      return;
    }

    if (!isPlainObject(changes[entry.section])) {
      changes[entry.section] = {};
    }

    const id = String(entry.id || '').trim();
    if (!id) {
      return;
    }

    if (entry.op === 'delete') {
      changes[entry.section][id] = null;
      return;
    }

    if (isPlainObject(entry.changes)) {
      changes[entry.section][id] = {
        ...(changes[entry.section][id] || {}),
        ...entry.changes
      };
    }
  });

  return changes;
};

const normalizeMessageSource = (source) => String(source || '').trim().toLowerCase();
const TRUSTED_PILOT_TELEMETRY_SOURCES = new Set(['android-app', 'win-telemetry', 'setup-relay', 'pilot-script', 'dirt-rally-2']);

export const RallyProvider = ({ children }) => {
  // Event configuration
  const [eventName, setEventName] = useState(() => loadFromStorage('rally_event_name', ''));
  const [positions, setPositions] = useState(() => loadFromStorage('rally_positions', {})); // pilotId -> stageId -> position
  const [lapTimes, setLapTimes] = useState(() => loadFromStorage('rally_lap_times', {})); // pilotId -> stageId -> [lap1, lap2, ...]
  const [stagePilots, setStagePilots] = useState(() => loadFromStorage('rally_stage_pilots', {})); // stageId -> [pilotIds] (for lap race pilot selection)
  
  const [pilots, setPilots] = useState(() => loadFromStorage('rally_pilots', []));
  const [pilotTelemetryByPilotId, setPilotTelemetryByPilotId] = useState({});
  const [categories, setCategories] = useState(() => loadFromStorage('rally_categories', []));
  const [stages, setStages] = useState(() => loadFromStorage('rally_stages', []));
  const [times, setTimes] = useState(() => loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').map);
  const [arrivalTimes, setArrivalTimes] = useState(() => loadFromStorage('rally_arrival_times', {}));
  const [startTimes, setStartTimes] = useState(() => loadFromStorage('rally_start_times', {}));
  const [realStartTimes, setRealStartTimes] = useState(() => loadFromStorage('rally_real_start_times', {}));
  const [sourceFinishTime, setSourceFinishTime] = useState(() => loadFromStorage(SOURCE_FINISH_TIME_STORAGE_KEY, {}));
  const [sourceLapTime, setSourceLapTime] = useState(() => loadFromStorage(SOURCE_LAP_TIME_STORAGE_KEY, {}));
  const [retiredStages, setRetiredStages] = useState(() => loadFromStorage('rally_retired_stages', {}));
  const [stageAlerts, setStageAlerts] = useState(() => loadFromStorage('rally_stage_alerts', {}));
  const [stageSos, setStageSosState] = useState(() => loadFromStorage('rally_stage_sos', {}));
  const [mapPlacemarks, setMapPlacemarks] = useState(() => loadFromStorage('rally_map_placemarks', []));
  const [currentStageId, setCurrentStageId] = useState(() => loadFromStorage('rally_current_stage', null));
  const [eventIsOver, setEventIsOver] = useState(() => loadFromStorage('rally_event_is_over', false) === true);
  const [eventReplayStartDate, setEventReplayStartDate] = useState(() => loadFromStorage('rally_event_replay_start_date', ''));
  const [eventReplayStartTime, setEventReplayStartTime] = useState(() => loadFromStorage('rally_event_replay_start_time', ''));
  const [eventReplayStageIntervalSeconds, setEventReplayStageIntervalSeconds] = useState(() => {
    const storedValue = Number(loadFromStorage('rally_event_replay_stage_interval_seconds', 0));
    if (!Number.isFinite(storedValue) || storedValue < 0) {
      return 0;
    }

    return Math.trunc(storedValue);
  });
  const [debugDate, setDebugDate] = useState(() => loadFromStorage('rally_debug_date', ''));
  const [displayIdsInSetup, setDisplayIdsInSetup] = useState(() => loadFromStorage(SETUP_DISPLAY_IDS_STORAGE_KEY, false) === true);
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
  const [wsLastReceivedAt, setWsLastReceivedAt] = useState(null);
  const [wsLastSentAt, setWsLastSentAt] = useState(null);
  const [wsReceivedPulse, setWsReceivedPulse] = useState(0);
  const [wsSentPulse, setWsSentPulse] = useState(0);
  const [wsRole, setWsRole] = useState('client');
  const [wsPublishSections, setWsPublishSections] = useState(null);
  const [wsDataIsCurrent, setWsDataIsCurrent] = useState(false);
  const [wsHasSnapshotBootstrap, setWsHasSnapshotBootstrap] = useState(false);
  const [wsSyncState, setWsSyncState] = useState('idle');
  const [wsLatestSnapshotAt, setWsLatestSnapshotAt] = useState(null);
  const [wsLastSnapshotGeneratedAt, setWsLastSnapshotGeneratedAt] = useState(null);
  const [wsLastSnapshotReceivedAt, setWsLastSnapshotReceivedAt] = useState(null);
  const [snapshotFreshnessTick, setSnapshotFreshnessTick] = useState(() => Date.now());
  const [clientRole, setClientRole] = useState('client');
  const [wsOwnership, setWsOwnership] = useState({
    ownerId: null,
    ownerEpoch: 0,
    hasOwnership: false,
    reason: null
  });
  const [pendingSosAlerts, setPendingSosAlerts] = useState([]);
  const [sosDeliveryByLine, setSosDeliveryByLine] = useState({});
  const [metaCurrentSession, setMetaCurrentSession] = useState(() => normalizeCurrentSessionMeta(
    loadFromStorage(CURRENT_SESSION_META_STORAGE_KEY, null)
  ));
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
  const pendingSetupPatchEntriesRef = useRef(new Map());
  const setupDirtyTrackingReady = useRef(false);
  const bulkSyncModeRef = useRef(false);
  const timesPublishTimer = useRef(null);
  const timesPendingLineKeys = useRef(new Set());
  const wsProvider = useRef(null);
  const wsMessageReceiver = useRef(null);
  const syncEngineRef = useRef(null);
  const syncOutboundServiceRef = useRef(null);
  const syncInboundServiceRef = useRef(null);
  const wsConnectInFlightRef = useRef(null);
  const setupInstanceIdRef = useRef(createSyncInstanceId());
  const [wsInstanceId, setWsInstanceId] = useState(() => setupInstanceIdRef.current);
  const metaCurrentSessionRef = useRef(metaCurrentSession);
  const pendingSosAlertsRef = useRef(pendingSosAlerts);
  const sosDeliveryByLineRef = useRef(sosDeliveryByLine);
  const localSetupTimingCaptureSuppressionRef = useRef(new Set());
  const wsLastReceivedMarkerRef = useRef(null);
  const isPublishing = useRef(false);
  const storageReloadTimeout = useRef(null);
  const pendingStorageDomainsRef = useRef(new Set());
  const wsRoleRef = useRef(wsRole);
  const wsConnectionStatusRef = useRef(wsConnectionStatus);
  const wsDataIsCurrentRef = useRef(wsDataIsCurrent);
  const applyWebSocketDataRef = useRef(null);
  const wsActivityStateRef = useRef({
    lastReceivedAt: null,
    lastSentAt: null,
    lastMessageAt: null,
    receivedPulseDelta: 0,
    sentPulseDelta: 0
  });
  const wsActivityFlushTimerRef = useRef(null);
  const pendingIncomingWsMessagesRef = useRef([]);
  const incomingWsFlushTimerRef = useRef(null);
  const pendingLocalTimingSectionsRef = useRef(new Set());
  const timingLineVersionsRef = useRef(timingLineVersions);
  const publishDirtyTimingSectionsRef = useRef(null);
  const publishDirtySetupSectionsRef = useRef(null);
  const publishDirtyTimingDeltasRef = useRef(null);
  const publishSetupSnapshotRef = useRef(null);
  const snapshotRequestInFlightRef = useRef(false);
  const snapshotPublishInFlightRef = useRef(false);
  const lastSnapshotEnsureAttemptRef = useRef({
    channelKey: '',
    timestamp: 0
  });
  const lastSnapshotRequestHandledAtRef = useRef(0);
  const incomingSetupTimingCaptureSuppressionRef = useRef(new Set());
  const persistenceReadyRef = useRef(false);
  const hydratingDomainsRef = useRef(new Set());
  const suppressPilotPublishRef = useRef(0);
  const pilotsRef = useRef(pilots);
  const stagesRef = useRef(stages);
  const pilotTelemetryByPilotIdRef = useRef(pilotTelemetryByPilotId);
  const pilotTelemetryStateFlushTimerRef = useRef(null);
  const timesPersistedStageIdsRef = useRef(loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').stageIds);
  const timesPersistenceTimerRef = useRef(null);
  const logicalTimestampRef = useRef(loadFromStorage('rally_logical_timestamp', 0));
  const setupTimingSectionTouchedAtRef = useRef({});
  const timesRef = useRef(times);
  const arrivalTimesRef = useRef(arrivalTimes);
  const startTimesRef = useRef(startTimes);
  const realStartTimesRef = useRef(realStartTimes);
  const sourceFinishTimeRef = useRef(sourceFinishTime);
  const sourceLapTimeRef = useRef(sourceLapTime);
  const lapTimesRef = useRef(lapTimes);
  const positionsRef = useRef(positions);
  const stagePilotsRef = useRef(stagePilots);
  const retiredStagesRef = useRef(retiredStages);
  const stageAlertsRef = useRef(stageAlerts);
  const stageSosRef = useRef(stageSos);
  const previousSetupSyncStateRef = useRef({
    meta: {
      eventName,
      currentStageId,
      eventIsOver,
      eventReplayStartDate,
      eventReplayStartTime,
      eventReplayStageIntervalSeconds,
      debugDate,
      timeDecimals,
      chromaKey,
      mapUrl,
      logoUrl,
      transitionImageUrl,
      globalAudio
    },
    pilots,
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    sourceFinishTime,
    sourceLapTime,
    lapTimes,
    positions,
    stagePilots,
    retiredStages,
    stageAlerts,
    stageSos,
    mapPlacemarks,
    cameras,
    externalMedia,
    streamConfigs
  });

  useEffect(() => {
    pilotsRef.current = pilots;
  }, [pilots]);

  useEffect(() => {
    stagesRef.current = stages;
  }, [stages]);

  useEffect(() => {
    pilotTelemetryByPilotIdRef.current = pilotTelemetryByPilotId;
  }, [pilotTelemetryByPilotId]);

  useEffect(() => {
    sourceFinishTimeRef.current = sourceFinishTime;
  }, [sourceFinishTime]);

  useEffect(() => {
    sourceLapTimeRef.current = sourceLapTime;
  }, [sourceLapTime]);

  useEffect(() => {
    metaCurrentSessionRef.current = metaCurrentSession;
  }, [metaCurrentSession]);

  useEffect(() => {
    pendingSosAlertsRef.current = pendingSosAlerts;
  }, [pendingSosAlerts]);

  useEffect(() => {
    sosDeliveryByLineRef.current = sosDeliveryByLine;
  }, [sosDeliveryByLine]);

  useEffect(() => {
    wsConnectionStatusRef.current = wsConnectionStatus;
  }, [wsConnectionStatus]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    if (!metaCurrentSession) {
      writeCurrentSessionMetaToStorage(null);
      return;
    }

    writeCurrentSessionMetaToStorage(metaCurrentSession);
  }, [metaCurrentSession, writeCurrentSessionMetaToStorage]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(SETUP_DISPLAY_IDS_STORAGE_KEY, JSON.stringify(displayIdsInSetup === true));
  }, [displayIdsInSetup]);

  const clearPilotTelemetryStateFlushTimer = useCallback(() => {
    if (pilotTelemetryStateFlushTimerRef.current) {
      window.clearTimeout(pilotTelemetryStateFlushTimerRef.current);
      pilotTelemetryStateFlushTimerRef.current = null;
    }
  }, []);

  const applyPilotTelemetryState = useCallback((nextTelemetry = {}, options = {}) => {
    const normalizedTelemetry = nextTelemetry && typeof nextTelemetry === 'object'
      ? nextTelemetry
      : {};

    pilotTelemetryByPilotIdRef.current = normalizedTelemetry;

    if (options.flushMode !== 'deferred') {
      clearPilotTelemetryStateFlushTimer();
      setPilotTelemetryByPilotId(normalizedTelemetry);
      return normalizedTelemetry;
    }

    if (!pilotTelemetryStateFlushTimerRef.current) {
      pilotTelemetryStateFlushTimerRef.current = window.setTimeout(() => {
        pilotTelemetryStateFlushTimerRef.current = null;
        setPilotTelemetryByPilotId({ ...(pilotTelemetryByPilotIdRef.current || {}) });
      }, TELEMETRY_STATE_FLUSH_INTERVAL_MS);
    }

    return normalizedTelemetry;
  }, [clearPilotTelemetryStateFlushTimer]);

  const getPilotTelemetrySnapshot = useCallback(() => (
    pilotTelemetryByPilotIdRef.current || {}
  ), []);

  const shouldTrackCurrentSessionMessage = useCallback((details = {}) => {
    const channelType = String(details?.channelType || '').trim();
    const messageType = String(details?.messageType || '').trim();
    const packageType = String(details?.packageType || '').trim();
    const controlType = String(details?.controlType || '').trim();
    const section = String(details?.section || '').trim();
    const payload = isPlainObject(details?.payload) ? details.payload : {};
    const source = String(
      details?.source
      || details?.origin
      || details?.clientSource
      || details?.sourceRole
      || ''
    ).trim().toLowerCase();
    const normalizedSourceRole = normalizeSyncRole(source);
    const hasArrivalTimes = section === 'arrivalTimes' || isPlainObject(payload.arrivalTimes);

    if (channelType === 'telemetry') {
      return false;
    }

    if (messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_HEARTBEAT
      || messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_CLAIM
      || messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_RELEASE) {
      return false;
    }

    if (messageType === 'pilot-telemetry' || section === 'pilotTelemetry') {
      return false;
    }

    if (normalizedSourceRole === SYNC_ROLES.MOBILE && section !== 'stageSos' && messageType !== 'pilot-telemetry' && !hasArrivalTimes) {
      return false;
    }

    if (packageType === 'control' && controlType === 'sos-ack') {
      return false;
    }

    if (
      messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_HEARTBEAT
      || messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_CLAIM
      || messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_RELEASE
    ) {
      return false;
    }

    return (
      messageType === SYNC_MESSAGE_TYPES.DELTA_BATCH
      || packageType === 'snapshot'
      || packageType === 'delta'
      || channelType === 'data'
      || channelType === 'snapshots'
    );
  }, []);

  const recordCurrentSessionMessage = useCallback((details = {}) => {
    if (!shouldTrackCurrentSessionMessage(details)) {
      return metaCurrentSessionRef.current || null;
    }

    const channelKey = String(metaCurrentSessionRef.current?.channelKey || wsChannelKey || '').trim();
    if (!channelKey) {
      return metaCurrentSessionRef.current || null;
    }

    const marker = normalizeCurrentSessionMarker(details);
    if (!marker) {
      return metaCurrentSessionRef.current || null;
    }

    const previous = metaCurrentSessionRef.current || {};
    const nextMeta = normalizeCurrentSessionMeta({
      sessionId: previous.sessionId || createSyncInstanceId(),
      channelKey,
      updatedAt: marker.timestamp || Date.now(),
      lastProjectMessage: marker
    });

    if (!nextMeta) {
      return metaCurrentSessionRef.current || null;
    }

    metaCurrentSessionRef.current = nextMeta;
    setMetaCurrentSession(nextMeta);
    writeCurrentSessionMetaToStorage(nextMeta);
    if (isSyncDebugEnabled()) {
      console.log('[SessionMeta]', {
        channelKey: nextMeta.channelKey,
        timestamp: nextMeta.updatedAt,
        hasProjectMarker: !!nextMeta.lastProjectMessage
      });
    }
    return nextMeta;
  }, [shouldTrackCurrentSessionMessage, writeCurrentSessionMetaToStorage]);

  const getCurrentSessionHistoryMarker = useCallback((channelKey = wsChannelKey) => {
    const current = normalizeCurrentSessionMeta(
      loadFromStorage(CURRENT_SESSION_META_STORAGE_KEY, null)
    ) || normalizeCurrentSessionMeta(metaCurrentSessionRef.current);
    if (!current || !current.lastProjectMessage) {
      return null;
    }

    if (String(current.channelKey || '').trim() && String(current.channelKey || '').trim() !== String(channelKey || '').trim()) {
      return null;
    }

    return current.lastProjectMessage;
  }, [wsChannelKey]);

  const removePendingSosAlert = useCallback((notificationId, fallback = {}) => {
    const normalizedNotificationId = String(notificationId || '').trim();
    const normalizedPilotId = normalizePilotId(fallback?.pilotId);
    const normalizedStageId = String(fallback?.stageId || '').trim();

    setPendingSosAlerts((prev) => prev.filter((alert) => {
      if (normalizedNotificationId && alert.notificationId === normalizedNotificationId) {
        return false;
      }

      if (normalizedPilotId && normalizedStageId) {
        return !(alert.pilotId === normalizedPilotId && alert.stageId === normalizedStageId);
      }

      return true;
    }));
  }, []);

  const registerIncomingSosAlerts = useCallback((stageSosChanges = {}, metadata = {}) => {
    const incomingEntries = extractStageFlagEntries(stageSosChanges)
      .filter((entry) => normalizeStageSosLevel(entry.value) > 0 && normalizeStageSosLevel(entry.value) < 3);
    if (incomingEntries.length === 0) {
      return;
    }

    const messageTimestamp = Number(metadata?.timestamp || Date.now());

    setPendingSosAlerts((prev) => {
      let next = [...prev];

      incomingEntries.forEach(({ pilotId, stageId, enabled }) => {
        if (!enabled) {
          next = next.filter((alert) => !(alert.pilotId === pilotId && alert.stageId === stageId));
          return;
        }

        const existingIndex = next.findIndex((alert) => alert.pilotId === pilotId && alert.stageId === stageId);
        const notificationId = String(metadata?.notificationId || '').trim() || buildSosNotificationId({
          pilotId,
          stageId,
          timestamp: messageTimestamp
        });
        const nextAlert = {
          notificationId,
          pilotId,
          stageId,
          timestamp: messageTimestamp,
          sourceRole: String(metadata?.sourceRole || metadata?.source || '').trim() || null,
          sourceInstanceId: String(metadata?.sourceInstanceId || metadata?.instanceId || '').trim() || null,
          channelType: String(metadata?.channelType || '').trim() || 'priority'
        };

        if (existingIndex >= 0) {
          if (Number(next[existingIndex]?.timestamp || 0) <= messageTimestamp) {
            next[existingIndex] = nextAlert;
          }
          return;
        }

        next.unshift(nextAlert);
      });

      return next;
    });
  }, []);

  const setSosDeliveryStatus = useCallback((pilotId, stageId, nextStatus = {}) => {
    const deliveryKey = buildSosDeliveryKey(pilotId, stageId);
    setSosDeliveryByLine((prev) => ({
      ...(prev || {}),
      [deliveryKey]: {
        ...(prev?.[deliveryKey] || {}),
        ...nextStatus,
        pilotId: normalizePilotId(pilotId),
        stageId: String(stageId || '').trim(),
        updatedAt: Date.now()
      }
    }));
  }, []);

  const clearSosDeliveryStatus = useCallback((pilotId, stageId) => {
    const deliveryKey = buildSosDeliveryKey(pilotId, stageId);
    setSosDeliveryByLine((prev) => {
      if (!prev?.[deliveryKey]) {
        return prev;
      }

      const next = { ...(prev || {}) };
      delete next[deliveryKey];
      return next;
    });
  }, []);

  const getSosDeliveryStatus = useCallback((pilotId, stageId) => (
    sosDeliveryByLineRef.current?.[buildSosDeliveryKey(pilotId, stageId)] || null
  ), []);

  const clearResolvedSosAlerts = useCallback((stageSosChanges = {}) => {
    const disabledEntries = extractStageFlagEntries(stageSosChanges).filter((entry) => !entry.enabled);
    if (disabledEntries.length === 0) {
      return;
    }

    disabledEntries.forEach((entry) => {
      clearSosDeliveryStatus(entry.pilotId, entry.stageId);
    });

    setPendingSosAlerts((prev) => prev.filter((alert) => !disabledEntries.some((entry) => (
      entry.pilotId === alert.pilotId && entry.stageId === alert.stageId
    ))));
  }, [clearSosDeliveryStatus]);

  const applyAcknowledgedSosEntries = useCallback((stageSosChanges = {}) => {
    const acknowledgedEntries = extractStageFlagEntries(stageSosChanges)
      .filter((entry) => normalizeStageSosLevel(entry.value) >= 3);

    if (acknowledgedEntries.length === 0) {
      return;
    }

    acknowledgedEntries.forEach((entry) => {
      removePendingSosAlert('', {
        pilotId: entry.pilotId,
        stageId: entry.stageId
      });
      setSosDeliveryStatus(entry.pilotId, entry.stageId, {
        status: 'acked',
        acknowledgedAt: Date.now(),
        errorMessage: ''
      });
    });
  }, [removePendingSosAlert, setSosDeliveryStatus]);

  const suppressNextLocalSetupTimingCapture = useCallback((section) => {
    if (!section) {
      return;
    }

    localSetupTimingCaptureSuppressionRef.current.add(section);
  }, []);

  const consumeLocalSetupTimingCaptureSuppression = useCallback((section) => {
    if (!localSetupTimingCaptureSuppressionRef.current.has(section)) {
      return false;
    }

    localSetupTimingCaptureSuppressionRef.current.delete(section);
    return true;
  }, []);

  const setLocalStageSosLevel = useCallback((pilotId, stageId, nextLevel, options = {}) => {
    const normalizedPilotId = normalizePilotId(pilotId);
    const normalizedStageId = String(stageId || '').trim();
    const normalizedLevel = normalizeStageSosLevel(nextLevel);

    if (!normalizedPilotId || !normalizedStageId) {
      return;
    }

    if (clientRole === 'setup' && options.suppressSetupCapture !== false) {
      suppressNextLocalSetupTimingCapture('stageSos');
    }

    setStageSosState((prev) => {
      const next = { ...(prev || {}) };
      const nextPilotStages = { ...(next[normalizedPilotId] || {}) };

      if (normalizedLevel > 0) {
        nextPilotStages[normalizedStageId] = normalizedLevel;
      } else {
        delete nextPilotStages[normalizedStageId];
      }

      if (Object.keys(nextPilotStages).length > 0) {
        next[normalizedPilotId] = nextPilotStages;
      } else {
        delete next[normalizedPilotId];
      }

      return next;
    });
  }, [clientRole, suppressNextLocalSetupTimingCapture]);

  const mergePilotTelemetryEntries = useCallback((entries = [], options = {}) => {
    const safeEntries = Array.isArray(entries)
      ? entries
        .map(([pilotId, telemetry]) => [normalizePilotId(pilotId), telemetry])
        .filter(([pilotId, telemetry]) => pilotId && telemetry && typeof telemetry === 'object')
      : [];

    if (safeEntries.length === 0) {
      return pilotTelemetryByPilotIdRef.current || {};
    }

    const next = options.replace ? {} : { ...(pilotTelemetryByPilotIdRef.current || {}) };

    safeEntries.forEach(([pilotId, telemetry]) => {
      next[pilotId] = {
        ...(!options.replace ? (next[pilotId] || {}) : {}),
        ...telemetry
      };
    });

    return applyPilotTelemetryState(next, {
      flushMode: options.deferState ? 'deferred' : 'immediate'
    });
  }, [applyPilotTelemetryState]);

  useEffect(() => () => {
    clearPilotTelemetryStateFlushTimer();
  }, [clearPilotTelemetryStateFlushTimer]);

  const getNextLogicalTimestamp = useCallback(() => {
    const now = Date.now();
    const next = now > logicalTimestampRef.current
      ? now
      : logicalTimestampRef.current + 1;
    logicalTimestampRef.current = next;
    localStorage.setItem('rally_logical_timestamp', JSON.stringify(next));
    return next;
  }, []);

  const ensureSyncOutboundService = useCallback(() => {
    if (!syncOutboundServiceRef.current) {
      syncOutboundServiceRef.current = new SyncOutboundService({
        createPackageId: (packageType) => createEntityId(packageType === 'snapshot' ? 'snapshot' : 'batch'),
        getNextLogicalTimestamp,
        getSourceMetadata: () => {
          const sourceRole = wsRoleRef.current || clientRole;
          return {
            source: sourceRole,
            sourceRole,
            sourceInstanceId: setupInstanceIdRef.current,
            instanceId: setupInstanceIdRef.current
          };
        },
        deltaMessageType: SYNC_MESSAGE_TYPES.DELTA_BATCH,
        maxBytes: SYNC_MESSAGE_MAX_BYTES,
        normalizePilotId
      });
    }

    syncOutboundServiceRef.current.setTransport({
      provider: wsProvider.current,
      syncEngine: syncEngineRef.current
    });

    return syncOutboundServiceRef.current;
  }, [clientRole, getNextLogicalTimestamp]);

  const publishPilotTelemetryMessage = useCallback((pilotId, telemetry) => {
    if (!wsEnabled || !wsCanPublish || wsRoleRef.current !== 'setup' || !wsProvider.current?.isConnected) {
      return;
    }

    const outboundService = ensureSyncOutboundService();
    outboundService?.publishPilotTelemetry(pilotId, telemetry).catch((error) => {
      console.error('[WebSocket] Pilot telemetry queue failed', error);
    });
  }, [ensureSyncOutboundService, wsCanPublish, wsEnabled]);

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

  const buildSetupDeltaChanges = useCallback((allowedSections = null) => {
    const entries = getPendingSetupPatchEntries(allowedSections);

    if (entries.length === 0) {
      return {};
    }

    return buildDeltaBatchChangesFromEntries(entries);
  }, [getPendingSetupPatchEntries]);

  const enqueueChangePackages = useCallback(async (changes = {}, options = {}) => {
    if (!wsProvider.current?.isConnected || !syncEngineRef.current || !isPlainObject(changes) || Object.keys(changes).length === 0) {
      return null;
    }

    const outboundService = ensureSyncOutboundService();
    return outboundService?.publishChanges(changes, options) || null;
  }, [ensureSyncOutboundService]);

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

  const buildTimingLineKey = useCallback((section, pilotId = null, stageId = null) => (
    `${section}:${pilotId ?? '_'}:${stageId ?? '_'}`
  ), []);

  // Reload all data from localStorage
  const reloadData = useCallback(() => {
    setEventName(loadFromStorage('rally_event_name', ''));
    setPositions(loadFromStorage('rally_positions', {}));
    setLapTimes(loadFromStorage('rally_lap_times', {}));
    setStagePilots(loadFromStorage('rally_stage_pilots', {}));
    setPilots(normalizePilotArrayPayload(loadFromStorage('rally_pilots', [])));
    applyPilotTelemetryState({});
    setCategories(loadFromStorage('rally_categories', []));
    setStages(loadFromStorage('rally_stages', []));
    setTimes(loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').map);
    setArrivalTimes(loadFromStorage('rally_arrival_times', {}));
    setStartTimes(loadFromStorage('rally_start_times', {}));
    setRealStartTimes(loadFromStorage('rally_real_start_times', {}));
    setSourceFinishTime(loadFromStorage(SOURCE_FINISH_TIME_STORAGE_KEY, {}));
    setSourceLapTime(loadFromStorage(SOURCE_LAP_TIME_STORAGE_KEY, {}));
    setRetiredStages(loadFromStorage('rally_retired_stages', {}));
    setStageAlerts(loadFromStorage('rally_stage_alerts', {}));
    setStageSosState(loadFromStorage('rally_stage_sos', {}));
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
  }, [applyPilotTelemetryState]);

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
      setPilots(normalizePilotArrayPayload(loadFromStorage('rally_pilots', [])));
    }

    if (nextDomains.includes('pilotTelemetry')) {
      applyPilotTelemetryState({});
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
        setSourceFinishTime(loadFromStorage(SOURCE_FINISH_TIME_STORAGE_KEY, {}));
      }
    }

    if (nextDomains.includes('timingExtra')) {
      hydratingDomainsRef.current.add('timingExtra');
      setPositions(loadFromStorage('rally_positions', {}));
      setLapTimes(loadFromStorage('rally_lap_times', {}));
      setSourceLapTime(loadFromStorage(SOURCE_LAP_TIME_STORAGE_KEY, {}));
      setStagePilots(loadFromStorage('rally_stage_pilots', {}));
      setRetiredStages(loadFromStorage('rally_retired_stages', {}));
      setStageAlerts(loadFromStorage('rally_stage_alerts', {}));
      setStageSosState(loadFromStorage('rally_stage_sos', {}));
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
  }, [applyPilotTelemetryState, shouldPreserveLocalTimingSection]);

  // Apply data from WebSocket message
  useEffect(() => {
    wsRoleRef.current = wsRole;
  }, [wsRole]);

  useEffect(() => {
    wsDataIsCurrentRef.current = wsDataIsCurrent;
  }, [wsDataIsCurrent]);

  const flushPendingWsActivityState = useCallback(() => {
    const pending = wsActivityStateRef.current || {};
    wsActivityStateRef.current = {
      lastReceivedAt: null,
      lastSentAt: null,
      lastMessageAt: null,
      receivedPulseDelta: 0,
      sentPulseDelta: 0
    };

    if (pending.lastReceivedAt !== null) {
      setWsLastReceivedAt(pending.lastReceivedAt);
    }
    if (pending.lastSentAt !== null) {
      setWsLastSentAt(pending.lastSentAt);
    }
    if (pending.lastMessageAt !== null) {
      setWsLastMessageAt(pending.lastMessageAt);
    }
    if (Number(pending.receivedPulseDelta || 0) > 0) {
      setWsReceivedPulse((prev) => prev + Number(pending.receivedPulseDelta || 0));
    }
    if (Number(pending.sentPulseDelta || 0) > 0) {
      setWsSentPulse((prev) => prev + Number(pending.sentPulseDelta || 0));
    }
  }, []);

  const scheduleWsActivityStateFlush = useCallback((updates = {}) => {
    const current = wsActivityStateRef.current || {};
    wsActivityStateRef.current = {
      lastReceivedAt: updates.lastReceivedAt ?? current.lastReceivedAt ?? null,
      lastSentAt: updates.lastSentAt ?? current.lastSentAt ?? null,
      lastMessageAt: updates.lastMessageAt ?? current.lastMessageAt ?? null,
      receivedPulseDelta: Number(current.receivedPulseDelta || 0) + Number(updates.receivedPulseDelta || 0),
      sentPulseDelta: Number(current.sentPulseDelta || 0) + Number(updates.sentPulseDelta || 0)
    };

    if (wsActivityFlushTimerRef.current) {
      return;
    }

    wsActivityFlushTimerRef.current = window.setTimeout(() => {
      wsActivityFlushTimerRef.current = null;
      flushPendingWsActivityState();
    }, 100);
  }, [flushPendingWsActivityState]);

  useEffect(() => () => {
    if (wsActivityFlushTimerRef.current) {
      window.clearTimeout(wsActivityFlushTimerRef.current);
      wsActivityFlushTimerRef.current = null;
    }
  }, []);

  const flushPendingIncomingWsMessages = useCallback(() => {
    const pendingMessages = Array.isArray(pendingIncomingWsMessagesRef.current)
      ? [...pendingIncomingWsMessagesRef.current]
      : [];

    pendingIncomingWsMessagesRef.current = [];
    incomingWsFlushTimerRef.current = null;

    if (pendingMessages.length === 0) {
      return;
    }

    let latestTrackableMessage = null;

    unstable_batchedUpdates(() => {
      pendingMessages.forEach((effectiveData) => {
        if (shouldTrackCurrentSessionMessage(effectiveData)) {
          latestTrackableMessage = effectiveData;
        }

        applyWebSocketDataRef.current?.(effectiveData);
      });
    });

    if (latestTrackableMessage) {
      recordCurrentSessionMessage(latestTrackableMessage);
    }
  }, [recordCurrentSessionMessage, shouldTrackCurrentSessionMessage]);

  const queueIncomingWsMessage = useCallback((data) => {
    pendingIncomingWsMessagesRef.current.push(data);

    if (incomingWsFlushTimerRef.current) {
      return;
    }

    incomingWsFlushTimerRef.current = window.setTimeout(() => {
      flushPendingIncomingWsMessages();
    }, 0);
  }, [flushPendingIncomingWsMessages]);

  useEffect(() => () => {
    if (incomingWsFlushTimerRef.current) {
      window.clearTimeout(incomingWsFlushTimerRef.current);
      incomingWsFlushTimerRef.current = null;
    }
    pendingIncomingWsMessagesRef.current = [];
  }, []);

  useEffect(() => () => {
    if (setupPublishTimer.current) {
      window.clearTimeout(setupPublishTimer.current);
      setupPublishTimer.current = null;
    }

    if (timesPublishTimer.current) {
      window.clearTimeout(timesPublishTimer.current);
      timesPublishTimer.current = null;
    }

    wsProvider.current?.disconnect?.();
    syncEngineRef.current?.disconnect?.();
    wsConnectInFlightRef.current = null;
  }, []);

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
    stageSosRef.current = stageSos;
  }, [stageSos]);

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
      case 'stages':
        return stagesRef.current?.find((stage) => stage?.id === stageId) || null;
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
      case 'stageSos':
        return normalizeStageSosLevel(stageSosRef.current?.[pilotId]?.[stageId]);
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
      case 'stages':
        setStages((prev) => (
          Array.isArray(prev)
            ? prev.map((stage) => (stage?.id === stageId && value ? { ...stage, ...value } : stage))
            : prev
        ));
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
      case 'stageSos':
        setStageSosState((prev) => {
          const next = { ...prev };
          const nextPilotStages = { ...(next[pilotId] || {}) };
          const nextStageSosLevel = normalizeStageSosLevel(value);
          if (nextStageSosLevel > 0) {
            nextPilotStages[stageId] = nextStageSosLevel;
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

  const suppressNextSetupTimingCapture = useCallback((section) => {
    if (!SETUP_TIMING_SECTION_SET.has(section)) {
      return;
    }

    incomingSetupTimingCaptureSuppressionRef.current.add(section);
  }, []);

  const consumeSetupTimingCaptureSuppression = useCallback((section) => {
    if (!incomingSetupTimingCaptureSuppressionRef.current.has(section)) {
      return false;
    }

    incomingSetupTimingCaptureSuppressionRef.current.delete(section);
    return true;
  }, []);

  const buildLineSyncKey = useCallback((pilotId, stageId) => `${pilotId}:${stageId}`, []);

  const acknowledgePublishedTimingEntries = useCallback((entries = [], acknowledgedAt = Date.now()) => {
    const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (safeEntries.length === 0) {
      return;
    }

    const ackTimestamp = Number.isFinite(Number(acknowledgedAt))
      ? Number(acknowledgedAt)
      : Date.now();

    setTimingLineVersions((prev) => {
      const next = { ...(prev || {}) };

      safeEntries.forEach((entry) => {
        const key = entry?.key || buildTimingLineKey(entry?.section, entry?.pilotId, entry?.stageId);
        if (!key) {
          return;
        }

        const current = next[key] || {};
        const localVersion = Math.max(
          Number(entry?.localVersion || 0),
          Number(current.localVersion || 0)
        );
        const ackedVersion = Math.max(
          Number(current.ackedVersion || 0),
          localVersion
        );

        next[key] = {
          ...current,
          key,
          section: entry?.section ?? current.section,
          pilotId: entry?.pilotId ?? current.pilotId,
          stageId: entry?.stageId ?? current.stageId,
          localVersion,
          ackedVersion,
          appliedVersion: Math.max(
            Number(current.appliedVersion || 0),
            localVersion
          )
        };

        if (Number(next[key].localVersion || 0) <= Number(next[key].ackedVersion || 0)) {
          timesPendingLineKeys.current.delete(key);
        }
      });

      return next;
    });

    setLastTimesAckAt(Date.now());
    setLastTimesAckedEditAt(ackTimestamp);
  }, [buildTimingLineKey]);

  const publishTimingDeltaEntries = useCallback(async (entries) => {
    if (!wsProvider.current?.isConnected || !Array.isArray(entries) || entries.length === 0) {
      return false;
    }

    const published = !!(await enqueueChangePackages(buildDeltaBatchChangesFromEntries(entries), {
      packageType: 'delta'
    }));

    if (published && wsRoleRef.current === 'times') {
      acknowledgePublishedTimingEntries(entries, Date.now());
    }

    return published;
  }, [acknowledgePublishedTimingEntries, enqueueChangePackages]);

  const publishSetupDeltaBatchMessages = useCallback(async (allowedSections = null) => {
    return !!(await enqueueChangePackages(buildSetupDeltaChanges(allowedSections), {
      packageType: 'delta'
    }));
  }, [buildSetupDeltaChanges, enqueueChangePackages]);

  const buildPendingTimingDeltaEntries = useCallback((since = null, pendingOnly = false) => {
    const versionEntries = Object.values(timingLineVersionsRef.current || {});

    return versionEntries
      .filter((entry) => {
        if (!entry?.section) return false;
        if (!canRoleWriteTimingSection(wsRoleRef.current, entry.section)) {
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

    if (!canRoleWriteTimingSection(clientRole, section)) {
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

  const publishDeltaBatchControl = useCallback((controlType, changes = {}, extraMeta = {}) => {
    if (!wsProvider.current?.isConnected) {
      return false;
    }

    const outboundService = ensureSyncOutboundService();
    return outboundService?.publishControl(controlType, isPlainObject(changes) ? changes : {}, extraMeta) || false;
  }, [ensureSyncOutboundService]);

  const acknowledgeSosAlert = useCallback((notificationId) => {
    const normalizedNotificationId = String(notificationId || '').trim();
    if (!normalizedNotificationId) {
      return false;
    }

    const alert = pendingSosAlertsRef.current.find((entry) => entry.notificationId === normalizedNotificationId);
    if (!alert) {
      return false;
    }

    removePendingSosAlert(normalizedNotificationId, alert);
    setSosDeliveryByLine((prev) => {
      const next = { ...(prev || {}) };
      Object.entries(next).forEach(([key, value]) => {
        if (
          value?.notificationId === normalizedNotificationId
          || (value?.pilotId === alert.pilotId && value?.stageId === alert.stageId)
        ) {
          next[key] = {
            ...value,
            status: 'acked',
            acknowledgedAt: Date.now(),
            updatedAt: Date.now()
          };
        }
      });
      return next;
    });
    applyAcknowledgedSosEntries({
      [alert.pilotId]: {
        [alert.stageId]: 3
      }
    });

    return enqueueChangePackages({
      stageSos: {
        [alert.pilotId]: {
          [alert.stageId]: 3
        }
      }
    }, {
      highPriority: true,
      extraMeta: {
        notificationId: normalizedNotificationId,
        acknowledgedAt: Date.now(),
        acknowledgedBy: setupInstanceIdRef.current,
        acknowledgedByRole: wsRoleRef.current || clientRole
      }
    });
  }, [applyAcknowledgedSosEntries, clientRole, enqueueChangePackages, removePendingSosAlert]);

  const computeLapRaceStoredTimeValue = useCallback((stage, lapEntries, pilotId = '') => {
    if (!stage || !isLapTimingStageType(stage.type)) {
      return '';
    }

    const totalSeconds = getLapRaceStoredTotalTimeSeconds({
      lapEntries,
      startTime: getLapTimingStartTime({
        stage,
        pilotId,
        startTimes: startTimesRef.current
      }),
      mode: stage.lapRaceTotalTimeMode || DEFAULT_LAP_RACE_TOTAL_TIME_MODE
    });

    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
      return '';
    }

    return formatDurationSeconds(totalSeconds, timeDecimals, {
      fallback: '',
      showHoursIfNeeded: true,
      padMinutes: true
    });
  }, [timeDecimals]);

  const setFinishTimeSourceValue = useCallback((pilotId, stageId, source) => {
    setSourceFinishTime((prev) => setNestedStageValue(prev, pilotId, stageId, normalizeTimingSource(source)));
  }, []);

  const setLapTimeSourcesValue = useCallback((pilotId, stageId, sources) => {
    const normalizedSources = trimTrailingEmptyArrayValues(
      (Array.isArray(sources) ? sources : []).map((source) => normalizeTimingSource(source))
    );
    setSourceLapTime((prev) => setNestedStageArrayValue(prev, pilotId, stageId, normalizedSources));
  }, []);

  const setLapTimeSourceValue = useCallback((pilotId, stageId, lapIndex, source) => {
    const normalizedSource = normalizeTimingSource(source);
    if (!Number.isInteger(lapIndex) || lapIndex < 0) {
      return;
    }

    setSourceLapTime((prev) => {
      const currentValues = Array.isArray(prev?.[pilotId]?.[stageId]) ? [...prev[pilotId][stageId]] : [];
      currentValues[lapIndex] = normalizedSource;
      return setNestedStageArrayValue(prev, pilotId, stageId, currentValues);
    });
  }, []);

  const applyDeltaBatchChanges = useCallback((changes = {}, metadata = {}) => {
    if (!isPlainObject(changes)) {
      return;
    }

    const normalizedChanges = isPlainObject(changes.timingByStage)
      ? {
          ...changes,
          ...expandTimingByStageSnapshot(changes.timingByStage)
        }
      : changes;
    delete normalizedChanges.timingByStage;

    const sourceRole = normalizeMessageSource(
      metadata?.sourceRole
      || metadata?.source
      || metadata?.origin
      || metadata?.clientSource
    );
    const incomingTimingSource = normalizeTimingSource(sourceRole);
    const isSnapshotPackage = metadata?.packageType === 'snapshot';

    const normalizedSourceRole = normalizeSyncRole(sourceRole);

    if (!isSnapshotPackage && normalizedChanges.arrivalTimes !== undefined && normalizedSourceRole === SYNC_ROLES.MOBILE) {
      const nextArrivalTimes = {};
      const nextLapTimes = isPlainObject(normalizedChanges.lapTimes) ? { ...normalizedChanges.lapTimes } : {};
      const nextTimes = isPlainObject(normalizedChanges.times) ? { ...normalizedChanges.times } : {};
      const lapTimedStagesById = new Map(
        (Array.isArray(stagesRef.current) ? stagesRef.current : [])
          .filter((stage) => stage?.id && isLapTimingStageType(stage.type))
          .map((stage) => [stage.id, stage])
      );

      Object.entries(isPlainObject(normalizedChanges.arrivalTimes) ? normalizedChanges.arrivalTimes : {}).forEach(([pilotId, stageEntries]) => {
        const normalizedPilotId = normalizePilotId(pilotId);
        if (!normalizedPilotId || !isPlainObject(stageEntries)) {
          return;
        }

        Object.entries(stageEntries).forEach(([stageId, arrivalValue]) => {
          const normalizedStageId = String(stageId || '').trim();
          const normalizedArrivalValue = typeof arrivalValue === 'string' ? arrivalValue.trim() : arrivalValue;
          const lapRaceStage = lapTimedStagesById.get(normalizedStageId);

          if (!lapRaceStage) {
            nextArrivalTimes[normalizedPilotId] = {
              ...(nextArrivalTimes[normalizedPilotId] || {}),
              [normalizedStageId]: arrivalValue
            };
            return;
          }

          if (!normalizedArrivalValue) {
            return;
          }

          const existingPilotLapPatch = isPlainObject(nextLapTimes[normalizedPilotId]) ? nextLapTimes[normalizedPilotId] : {};
          const existingLapEntries = Array.isArray(existingPilotLapPatch[normalizedStageId])
            ? [...existingPilotLapPatch[normalizedStageId]]
            : [...(lapTimesRef.current?.[normalizedPilotId]?.[normalizedStageId] || [])];

          if (existingLapEntries.some((entry) => String(entry || '').trim() === normalizedArrivalValue)) {
            return;
          }

          const nextLapIndex = existingLapEntries.findIndex((entry) => !String(entry || '').trim());
          if (nextLapIndex >= 0) {
            existingLapEntries[nextLapIndex] = normalizedArrivalValue;
          } else {
            existingLapEntries.push(normalizedArrivalValue);
          }

          nextLapTimes[normalizedPilotId] = {
            ...existingPilotLapPatch,
            [normalizedStageId]: existingLapEntries
          };

          const nextStoredTotal = computeLapRaceStoredTimeValue(lapRaceStage, existingLapEntries, normalizedPilotId);
          nextTimes[normalizedPilotId] = {
            ...(isPlainObject(nextTimes[normalizedPilotId]) ? nextTimes[normalizedPilotId] : {}),
            [normalizedStageId]: nextStoredTotal
          };
        });
      });

      if (Object.keys(nextArrivalTimes).length > 0) {
        normalizedChanges.arrivalTimes = nextArrivalTimes;
      } else {
        delete normalizedChanges.arrivalTimes;
      }

      if (Object.keys(nextLapTimes).length > 0) {
        normalizedChanges.lapTimes = nextLapTimes;
      }

      if (Object.keys(nextTimes).length > 0) {
        normalizedChanges.times = nextTimes;
      }
    }

    if (!isSnapshotPackage && incomingTimingSource) {
      const stagesById = new Map(
        (Array.isArray(stagesRef.current) ? stagesRef.current : [])
          .filter((stage) => stage?.id)
          .map((stage) => [stage.id, stage])
      );
      const incomingArrivalTimes = isPlainObject(normalizedChanges.arrivalTimes) ? normalizedChanges.arrivalTimes : {};
      const incomingTimes = isPlainObject(normalizedChanges.times) ? normalizedChanges.times : {};
      const incomingLapTimes = isPlainObject(normalizedChanges.lapTimes) ? normalizedChanges.lapTimes : {};
      const acceptedArrivalTimes = {};
      const acceptedTimes = {};
      const acceptedLapTimes = {};
      const acceptedFinishSources = {};
      const acceptedLapSources = {};
      const handledLapTimeKeys = new Set();
      const commitLapRacePatch = (normalizedPilotId, normalizedStageId, stage, nextLapEntries, nextLapSources) => {
        const trimmedLapEntries = trimTrailingEmptyArrayValues(nextLapEntries);
        const trimmedLapSources = trimTrailingEmptyArrayValues(nextLapSources);
        const nextStoredTotal = computeLapRaceStoredTimeValue(stage, trimmedLapEntries);
        const nextFinishSource = nextStoredTotal ? getHighestTimingSource(trimmedLapSources) : '';

        assignPilotStagePatchValue(acceptedLapTimes, normalizedPilotId, normalizedStageId, trimmedLapEntries);
        assignPilotStagePatchValue(acceptedLapSources, normalizedPilotId, normalizedStageId, trimmedLapSources);
        assignPilotStagePatchValue(acceptedTimes, normalizedPilotId, normalizedStageId, nextStoredTotal);
        assignPilotStagePatchValue(acceptedFinishSources, normalizedPilotId, normalizedStageId, nextFinishSource);
      };

      const assignPilotStagePatchValue = (target, pilotId, stageId, value) => {
        target[pilotId] = {
          ...(target[pilotId] || {}),
          [stageId]: value
        };
      };

      Object.entries(incomingLapTimes).forEach(([pilotId, stageEntries]) => {
        const normalizedPilotId = normalizePilotId(pilotId);
        if (!normalizedPilotId || !isPlainObject(stageEntries)) {
          return;
        }

        Object.entries(stageEntries).forEach(([stageId, incomingLapEntries]) => {
          const normalizedStageId = String(stageId || '').trim();
          const stage = stagesById.get(normalizedStageId);
          if (!stage || !isLapTimingStageType(stage.type) || !Array.isArray(incomingLapEntries)) {
            return;
          }

          handledLapTimeKeys.add(`${normalizedPilotId}:${normalizedStageId}`);

          const currentLapEntries = Array.isArray(lapTimesRef.current?.[normalizedPilotId]?.[normalizedStageId])
            ? lapTimesRef.current[normalizedPilotId][normalizedStageId]
            : [];
          const currentLapSources = Array.isArray(sourceLapTimeRef.current?.[normalizedPilotId]?.[normalizedStageId])
            ? sourceLapTimeRef.current[normalizedPilotId][normalizedStageId]
            : [];
          if (Array.isArray(incomingLapEntries)) {
            const nextLapEntries = [...currentLapEntries];
            const nextLapSources = [...currentLapSources];
            const maxLength = Math.max(currentLapEntries.length, incomingLapEntries.length);
            let acceptedAnyLapChange = false;

            for (let lapIndex = 0; lapIndex < maxLength; lapIndex += 1) {
              const incomingLapValue = lapIndex < incomingLapEntries.length
                ? (incomingLapEntries[lapIndex] ?? '')
                : '';
              const currentLapSource = normalizeTimingSource(currentLapSources[lapIndex]);

              if (!canTimingSourceOverwrite(currentLapSource, incomingTimingSource)) {
                continue;
              }

              nextLapEntries[lapIndex] = incomingLapValue;
              nextLapSources[lapIndex] = incomingLapValue ? incomingTimingSource : '';
              acceptedAnyLapChange = true;
            }

            if (!acceptedAnyLapChange) {
              return;
            }

            commitLapRacePatch(normalizedPilotId, normalizedStageId, stage, nextLapEntries, nextLapSources);
            return;
          }

          const incomingLapValue = String(incomingLapEntries || '').trim();
          if (!incomingLapValue) {
            return;
          }
          const trimmedLapEntries = trimTrailingEmptyArrayValues(nextLapEntries);
          const trimmedLapSources = trimTrailingEmptyArrayValues(nextLapSources);
          const nextStoredTotal = computeLapRaceStoredTimeValue(stage, trimmedLapEntries, normalizedPilotId);
          const nextFinishSource = nextStoredTotal ? getHighestTimingSource(trimmedLapSources) : '';

          if (currentLapEntries.some((entry) => String(entry || '').trim() === incomingLapValue)) {
            return;
          }

          const nextLapEntries = [...currentLapEntries];
          const nextLapSources = [...currentLapSources];
          const nextLapIndex = nextLapEntries.findIndex((entry) => !String(entry || '').trim());

          if (nextLapIndex >= 0) {
            nextLapEntries[nextLapIndex] = incomingLapValue;
            nextLapSources[nextLapIndex] = incomingTimingSource;
          } else {
            nextLapEntries.push(incomingLapValue);
            nextLapSources.push(incomingTimingSource);
          }

          commitLapRacePatch(normalizedPilotId, normalizedStageId, stage, nextLapEntries, nextLapSources);
        });
      });

      const finishPilotIds = new Set([
        ...Object.keys(incomingArrivalTimes),
        ...Object.keys(incomingTimes)
      ]);

      finishPilotIds.forEach((pilotId) => {
        const normalizedPilotId = normalizePilotId(pilotId);
        if (!normalizedPilotId) {
          return;
        }

        const arrivalStageEntries = isPlainObject(incomingArrivalTimes[pilotId]) ? incomingArrivalTimes[pilotId] : {};
        const timeStageEntries = isPlainObject(incomingTimes[pilotId]) ? incomingTimes[pilotId] : {};
        const stageIds = new Set([
          ...Object.keys(arrivalStageEntries),
          ...Object.keys(timeStageEntries)
        ]);

        stageIds.forEach((stageId) => {
          const normalizedStageId = String(stageId || '').trim();
          if (!normalizedStageId) {
            return;
          }

          const handledLapKey = `${normalizedPilotId}:${normalizedStageId}`;
          if (handledLapTimeKeys.has(handledLapKey)) {
            return;
          }

          const stage = stagesById.get(normalizedStageId);
          const hasArrivalPatch = Object.prototype.hasOwnProperty.call(arrivalStageEntries, stageId);
          const hasTimePatch = Object.prototype.hasOwnProperty.call(timeStageEntries, stageId);
          if (!hasArrivalPatch && !hasTimePatch) {
            return;
          }

          const currentFinishSource = normalizeTimingSource(sourceFinishTimeRef.current?.[normalizedPilotId]?.[normalizedStageId]);
          const currentArrivalValue = arrivalTimesRef.current?.[normalizedPilotId]?.[normalizedStageId] || '';
          const currentTimeValue = timesRef.current?.[normalizedPilotId]?.[normalizedStageId] || '';
          const hasCurrentFinishValue = Boolean(currentArrivalValue || currentTimeValue);

          if (hasCurrentFinishValue && !canTimingSourceOverwrite(currentFinishSource, incomingTimingSource)) {
            return;
          }

          const nextArrivalValue = hasArrivalPatch ? (arrivalStageEntries[stageId] ?? '') : undefined;
          const nextTimeValue = hasTimePatch ? (timeStageEntries[stageId] ?? '') : undefined;
          const nextFinishSource = (nextArrivalValue || nextTimeValue) ? incomingTimingSource : '';

          if (!stage || !isLapTimingStageType(stage.type)) {
            if (hasArrivalPatch) {
              assignPilotStagePatchValue(acceptedArrivalTimes, normalizedPilotId, normalizedStageId, nextArrivalValue);
            }
            if (hasTimePatch) {
              assignPilotStagePatchValue(acceptedTimes, normalizedPilotId, normalizedStageId, nextTimeValue);
            }
            assignPilotStagePatchValue(acceptedFinishSources, normalizedPilotId, normalizedStageId, nextFinishSource);
            return;
          }

          if (hasTimePatch) {
            assignPilotStagePatchValue(acceptedTimes, normalizedPilotId, normalizedStageId, nextTimeValue);
            assignPilotStagePatchValue(acceptedFinishSources, normalizedPilotId, normalizedStageId, nextFinishSource);
          }
        });
      });

      if (Object.keys(acceptedArrivalTimes).length > 0) {
        normalizedChanges.arrivalTimes = acceptedArrivalTimes;
      } else {
        delete normalizedChanges.arrivalTimes;
      }

      if (Object.keys(acceptedTimes).length > 0) {
        normalizedChanges.times = acceptedTimes;
      } else {
        delete normalizedChanges.times;
      }

      if (Object.keys(acceptedLapTimes).length > 0) {
        normalizedChanges.lapTimes = acceptedLapTimes;
      } else {
        delete normalizedChanges.lapTimes;
      }

      if (Object.keys(acceptedFinishSources).length > 0) {
        normalizedChanges.sourceFinishTime = acceptedFinishSources;
      } else {
        delete normalizedChanges.sourceFinishTime;
      }

      if (Object.keys(acceptedLapSources).length > 0) {
        normalizedChanges.sourceLapTime = acceptedLapSources;
      } else {
        delete normalizedChanges.sourceLapTime;
      }
    }

    const messageTimestamp = Number(metadata?.timestamp || Date.now());
    const hasTimingChanges = Object.keys(normalizedChanges).some((key) => SETUP_TIMING_SECTION_SET.has(key));
    const hasSetupChanges = Object.keys(normalizedChanges).some((key) => SETUP_BASE_SECTION_KEYS.includes(key));
    isPublishing.current = true;
    setWsLastMessageAt(messageTimestamp);

    if (wsRoleRef.current === 'setup') {
      if (normalizedChanges.positions !== undefined) suppressNextSetupTimingCapture('positions');
      if (normalizedChanges.lapTimes !== undefined) suppressNextSetupTimingCapture('lapTimes');
      if (normalizedChanges.stagePilots !== undefined) suppressNextSetupTimingCapture('stagePilots');
      if (normalizedChanges.times !== undefined) suppressNextSetupTimingCapture('times');
      if (normalizedChanges.arrivalTimes !== undefined) suppressNextSetupTimingCapture('arrivalTimes');
      if (normalizedChanges.startTimes !== undefined) suppressNextSetupTimingCapture('startTimes');
      if (normalizedChanges.realStartTimes !== undefined) suppressNextSetupTimingCapture('realStartTimes');
      if (normalizedChanges.retiredStages !== undefined) suppressNextSetupTimingCapture('retiredStages');
      if (normalizedChanges.stageAlerts !== undefined) suppressNextSetupTimingCapture('stageAlerts');
      if (normalizedChanges.stageSos !== undefined) suppressNextSetupTimingCapture('stageSos');
    }

    const mergeNestedPatch = (currentValue = {}, incomingValue = {}) => {
      const nextValue = isPlainObject(currentValue) ? { ...currentValue } : {};
      const patch = isPlainObject(incomingValue) ? incomingValue : {};

      Object.entries(patch).forEach(([outerKey, outerValue]) => {
        if (outerValue === null || outerValue === undefined || outerValue === '') {
          delete nextValue[outerKey];
          return;
        }

        if (Array.isArray(outerValue)) {
          nextValue[outerKey] = [...outerValue];
          return;
        }

        if (!isPlainObject(outerValue)) {
          nextValue[outerKey] = outerValue;
          return;
        }

        nextValue[outerKey] = {
          ...(isPlainObject(nextValue[outerKey]) ? nextValue[outerKey] : {}),
          ...outerValue
        };
      });

      return nextValue;
    };

    const mergeArrayEntityPatch = (currentItems = [], incomingPatch = {}, mergeStrategy = 'entity') => {
      if (Array.isArray(incomingPatch)) {
        return incomingPatch;
      }

      const nextItems = Array.isArray(currentItems) ? [...currentItems] : [];
      Object.entries(isPlainObject(incomingPatch) ? incomingPatch : {}).forEach(([id, value]) => {
        if (!id) {
          return;
        }

        if (value === null) {
          const filtered = nextItems.filter((item) => item?.id !== id);
          nextItems.length = 0;
          nextItems.push(...filtered);
          return;
        }

        if (mergeStrategy === 'stage') {
          const mergedStage = {
            ...(isPlainObject(value) ? value : {}),
            id
          };
          const updatedStages = mergeStagesById(nextItems, mergedStage);
          nextItems.length = 0;
          nextItems.push(...updatedStages);
          return;
        }

        if (mergeStrategy === 'placemark') {
          const mergedPlacemark = {
            ...(isPlainObject(value) ? value : {}),
            id
          };
          const updatedPlacemarks = mergeMapPlacemarksById(nextItems, mergedPlacemark);
          nextItems.length = 0;
          nextItems.push(...updatedPlacemarks);
          return;
        }

        const updatedItems = mergeEntityArrayItemById(nextItems, id, isPlainObject(value) ? value : { value });
        nextItems.length = 0;
        nextItems.push(...updatedItems);
      });

      return nextItems;
    };

    if (isPlainObject(normalizedChanges.meta)) {
      if (normalizedChanges.meta.eventName !== undefined) setEventName(normalizedChanges.meta.eventName);
      if (normalizedChanges.meta.currentStageId !== undefined) setCurrentStageId(normalizedChanges.meta.currentStageId);
      if (normalizedChanges.meta.eventIsOver !== undefined) setEventIsOver(normalizedChanges.meta.eventIsOver === true);
      if (normalizedChanges.meta.eventReplayStartDate !== undefined) setEventReplayStartDate(normalizedChanges.meta.eventReplayStartDate || '');
      if (normalizedChanges.meta.eventReplayStartTime !== undefined) setEventReplayStartTime(normalizedChanges.meta.eventReplayStartTime || '');
      if (normalizedChanges.meta.eventReplayStageIntervalSeconds !== undefined) {
        const nextReplayStageIntervalSeconds = Number(normalizedChanges.meta.eventReplayStageIntervalSeconds);
        setEventReplayStageIntervalSeconds(Number.isFinite(nextReplayStageIntervalSeconds) && nextReplayStageIntervalSeconds >= 0 ? Math.trunc(nextReplayStageIntervalSeconds) : 0);
      }
      if (normalizedChanges.meta.debugDate !== undefined) setDebugDate(normalizedChanges.meta.debugDate);
      if (normalizedChanges.meta.timeDecimals !== undefined) {
        setTimeDecimals(Math.min(3, Math.max(0, Math.trunc(Number(normalizedChanges.meta.timeDecimals) || 0))));
      }
      if (normalizedChanges.meta.chromaKey !== undefined) setChromaKey(normalizedChanges.meta.chromaKey);
      if (normalizedChanges.meta.mapUrl !== undefined) setMapUrl(normalizedChanges.meta.mapUrl);
      if (normalizedChanges.meta.logoUrl !== undefined) setLogoUrl(normalizedChanges.meta.logoUrl);
      if (normalizedChanges.meta.transitionImageUrl !== undefined) setTransitionImageUrl(normalizedChanges.meta.transitionImageUrl);
      if (normalizedChanges.meta.globalAudio !== undefined) setGlobalAudio(normalizedChanges.meta.globalAudio);
    }

    if (normalizedChanges.pilots !== undefined) {
      if (isSnapshotPackage) {
        setPilots(normalizePilotArrayPayload(normalizedChanges.pilots));
      } else {
        const nextPilots = normalizePilotPatchMap(normalizedChanges.pilots);
        setPilots((prev) => mergeArrayEntityPatch(prev, nextPilots, 'entity'));
      }
    }

    if (normalizedChanges.categories !== undefined) {
      setCategories((prev) => (isSnapshotPackage ? (Array.isArray(normalizedChanges.categories) ? normalizedChanges.categories : []) : mergeArrayEntityPatch(prev, normalizedChanges.categories, 'entity')));
    }

    if (normalizedChanges.stages !== undefined) {
      setStages((prev) => (isSnapshotPackage ? (Array.isArray(normalizedChanges.stages) ? normalizedChanges.stages : []) : mergeArrayEntityPatch(prev, normalizedChanges.stages, 'stage')));
    }

    if (normalizedChanges.mapPlacemarks !== undefined) {
      setMapPlacemarks((prev) => (isSnapshotPackage ? (Array.isArray(normalizedChanges.mapPlacemarks) ? normalizedChanges.mapPlacemarks : []) : mergeArrayEntityPatch(prev, normalizedChanges.mapPlacemarks, 'placemark')));
    }

    if (normalizedChanges.cameras !== undefined) {
      setCameras((prev) => (isSnapshotPackage ? (Array.isArray(normalizedChanges.cameras) ? normalizedChanges.cameras : []) : mergeArrayEntityPatch(prev, normalizedChanges.cameras, 'entity')));
    }

    if (normalizedChanges.externalMedia !== undefined) {
      setExternalMedia((prev) => (isSnapshotPackage ? (Array.isArray(normalizedChanges.externalMedia) ? normalizedChanges.externalMedia : []) : mergeArrayEntityPatch(prev, normalizedChanges.externalMedia, 'entity')));
    }

    if (normalizedChanges.streamConfigs !== undefined) {
      setStreamConfigs((prev) => (isSnapshotPackage ? (isPlainObject(normalizedChanges.streamConfigs) ? normalizedChanges.streamConfigs : {}) : mergeNestedPatch(prev, normalizedChanges.streamConfigs)));
    }

    if (normalizedChanges.times !== undefined) {
      setTimes(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.times) ? normalizedChanges.times : {}) : mergeNestedPatch(timesRef.current, normalizedChanges.times)));
    }

    if (normalizedChanges.arrivalTimes !== undefined) {
      setArrivalTimes(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.arrivalTimes) ? normalizedChanges.arrivalTimes : {}) : mergeNestedPatch(arrivalTimesRef.current, normalizedChanges.arrivalTimes)));
    }

    if (normalizedChanges.startTimes !== undefined) {
      setStartTimes(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.startTimes) ? normalizedChanges.startTimes : {}) : mergeNestedPatch(startTimesRef.current, normalizedChanges.startTimes)));
    }

    if (normalizedChanges.realStartTimes !== undefined) {
      setRealStartTimes(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.realStartTimes) ? normalizedChanges.realStartTimes : {}) : mergeNestedPatch(realStartTimesRef.current, normalizedChanges.realStartTimes)));
    }

    if (normalizedChanges.lapTimes !== undefined) {
      setLapTimes(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.lapTimes) ? normalizedChanges.lapTimes : {}) : mergeNestedPatch(lapTimesRef.current, normalizedChanges.lapTimes)));
    }

    if (normalizedChanges.sourceFinishTime !== undefined) {
      setSourceFinishTime(() => (
        isSnapshotPackage
          ? (isPlainObject(normalizedChanges.sourceFinishTime) ? normalizedChanges.sourceFinishTime : {})
          : mergeNestedPatch(sourceFinishTimeRef.current, normalizedChanges.sourceFinishTime)
      ));
    }

    if (normalizedChanges.sourceLapTime !== undefined) {
      setSourceLapTime(() => (
        isSnapshotPackage
          ? (isPlainObject(normalizedChanges.sourceLapTime) ? normalizedChanges.sourceLapTime : {})
          : mergeNestedPatch(sourceLapTimeRef.current, normalizedChanges.sourceLapTime)
      ));
    }

    if (normalizedChanges.positions !== undefined) {
      setPositions(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.positions) ? normalizedChanges.positions : {}) : mergeNestedPatch(positionsRef.current, normalizedChanges.positions)));
    }

    if (normalizedChanges.stagePilots !== undefined) {
      setStagePilots(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.stagePilots) ? normalizedChanges.stagePilots : {}) : mergeNestedPatch(stagePilotsRef.current, normalizedChanges.stagePilots)));
    }

    if (normalizedChanges.retiredStages !== undefined) {
      setRetiredStages(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.retiredStages) ? normalizedChanges.retiredStages : {}) : mergePilotStageFlagMap(retiredStagesRef.current, normalizedChanges.retiredStages, {
        resolvePilotId: (pilotId) => resolveKnownEntityId(pilotId, pilotsRef.current, 'pilot'),
        resolveStageId: (stageId) => resolveKnownEntityId(stageId, stagesRef.current, 'stage')
      })));
    }

    if (normalizedChanges.stageAlerts !== undefined && !shouldPreserveLocalTimingSection('stageAlerts', messageTimestamp)) {
      setStageAlerts(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.stageAlerts) ? normalizedChanges.stageAlerts : {}) : mergePilotStageFlagMap(stageAlertsRef.current, normalizedChanges.stageAlerts, {
        resolvePilotId: (pilotId) => resolveKnownEntityId(pilotId, pilotsRef.current, 'pilot'),
        resolveStageId: (stageId) => resolveKnownEntityId(stageId, stagesRef.current, 'stage')
      })));
    }

    if (normalizedChanges.stageSos !== undefined) {
      setStageSosState(() => (isSnapshotPackage ? (isPlainObject(normalizedChanges.stageSos) ? normalizedChanges.stageSos : {}) : mergePilotStageFlagMap(stageSosRef.current, normalizedChanges.stageSos, {
        resolvePilotId: (pilotId) => resolveKnownEntityId(pilotId, pilotsRef.current, 'pilot'),
        resolveStageId: (stageId) => resolveKnownEntityId(stageId, stagesRef.current, 'stage'),
        normalizeValue: (value) => {
          const nextStageSosLevel = normalizeStageSosLevel(value);
          return nextStageSosLevel > 0 ? nextStageSosLevel : null;
        }
      })));
      clearResolvedSosAlerts(normalizedChanges.stageSos);
      applyAcknowledgedSosEntries(normalizedChanges.stageSos);

      if (metadata?.channelType === 'priority' && !isSnapshotPackage) {
        registerIncomingSosAlerts(normalizedChanges.stageSos, metadata);
      }
    }

    if (normalizedChanges.pilotTelemetry !== undefined) {
      const telemetryEntries = Object.entries(normalizedChanges.pilotTelemetry || {}).map(([pilotId, telemetry]) => ([
        normalizePilotId(pilotId),
        telemetry
      ]));
      mergePilotTelemetryEntries(telemetryEntries, {
        suppressSync: true
      });
    }

    if (hasSetupChanges) {
      setLastSetupSyncAt(messageTimestamp);
    }

    if (hasTimingChanges) {
      setLastTimesSyncAt(messageTimestamp);
    }

    setTimeout(() => {
      isPublishing.current = false;
    }, 0);
  }, [applyAcknowledgedSosEntries, clearResolvedSosAlerts, computeLapRaceStoredTimeValue, mergePilotTelemetryEntries, registerIncomingSosAlerts, shouldPreserveLocalTimingSection, suppressNextSetupTimingCapture]);

  const applyDeltaBatchControl = useCallback((data = {}) => {
    const controlType = String(data?.controlType || '').trim();
    const controlPayload = isPlainObject(data?.payload)
      ? data.payload
      : (isPlainObject(data?.changes) ? data.changes : {});

    if (!controlType) {
      return false;
    }

    if (controlType === 'sos-ack') {
      console.log('[SOS][ack]', {
        notificationId: controlPayload?.notificationId || null,
        pilotId: controlPayload?.pilotId || null,
        stageId: controlPayload?.stageId || null,
        acknowledgedAt: Number(controlPayload?.acknowledgedAt || Date.now())
      });
      removePendingSosAlert(controlPayload?.notificationId, {
        pilotId: controlPayload?.pilotId,
        stageId: controlPayload?.stageId
      });
      setSosDeliveryByLine((prev) => {
        const next = { ...(prev || {}) };
        Object.entries(next).forEach(([key, value]) => {
          if (
            value?.notificationId === String(controlPayload?.notificationId || '').trim()
            || (
              value?.pilotId === normalizePilotId(controlPayload?.pilotId)
              && value?.stageId === String(controlPayload?.stageId || '').trim()
            )
          ) {
            next[key] = {
              ...value,
              status: 'acked',
              acknowledgedAt: Number(controlPayload?.acknowledgedAt || Date.now()),
              updatedAt: Date.now()
            };
          }
        });
        return next;
      });
      if (controlPayload?.pilotId && controlPayload?.stageId) {
        setLocalStageSosLevel(controlPayload.pilotId, controlPayload.stageId, 3);
      }
      return true;
    }

    if (controlType === 'times-line-request' && wsRoleRef.current === 'times') {
      const pilotId = controlPayload?.pilotId;
      const stageId = controlPayload?.stageId;
      if (!pilotId || !stageId) {
        return true;
      }

      const lineData = {
        time: timesRef.current?.[pilotId]?.[stageId] || '',
        arrivalTime: arrivalTimesRef.current?.[pilotId]?.[stageId] || '',
        startTime: startTimesRef.current?.[pilotId]?.[stageId] || '',
        realStartTime: realStartTimesRef.current?.[pilotId]?.[stageId] || '',
        lapTimes: lapTimesRef.current?.[pilotId]?.[stageId] || [],
        position: positionsRef.current?.[pilotId]?.[stageId] ?? null,
        retired: !!retiredStagesRef.current?.[pilotId]?.[stageId],
        alert: !!stageAlertsRef.current?.[pilotId]?.[stageId]
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

      publishDeltaBatchControl('times-line-response', {
        pilotId,
        stageId,
        hasData,
        data: lineData
      });
      return true;
    }

    if (controlType === 'times-line-response' && wsRoleRef.current === 'setup') {
      const pilotId = controlPayload?.pilotId;
      const stageId = controlPayload?.stageId;
      const lineData = controlPayload?.data || {};
      if (!pilotId || !stageId) {
        return true;
      }

      const currentTime = timesRef.current?.[pilotId]?.[stageId] || '';
      const currentArrival = arrivalTimesRef.current?.[pilotId]?.[stageId] || '';
      const currentStart = startTimesRef.current?.[pilotId]?.[stageId] || '';
      const currentRealStart = realStartTimesRef.current?.[pilotId]?.[stageId] || '';
      const currentLapTimes = lapTimesRef.current?.[pilotId]?.[stageId] || [];
      const currentPosition = positionsRef.current?.[pilotId]?.[stageId] ?? null;
      const currentRetired = !!retiredStagesRef.current?.[pilotId]?.[stageId];
      const currentAlert = !!stageAlertsRef.current?.[pilotId]?.[stageId];

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

      if (controlPayload?.hasData) {
        const syncAt = typeof controlPayload?.timestamp === 'number' ? controlPayload.timestamp : Date.now();
        const key = buildLineSyncKey(pilotId, stageId);
        setLineSyncResults((prev) => ({
          ...prev,
          [key]: {
            status: updated ? 'updated' : 'no_change',
            updatedAt: Date.now()
          }
        }));
        setLastTimesSyncAt(syncAt);
      }

      return true;
    }

    return false;
  }, [
    buildLineSyncKey,
    publishDeltaBatchControl,
    removePendingSosAlert,
    setLocalStageSosLevel
  ]);

  const ensureSyncInboundService = useCallback(() => {
    if (!syncInboundServiceRef.current) {
      syncInboundServiceRef.current = new SyncInboundService({
        syncMessageTypes: SYNC_MESSAGE_TYPES,
        isPlainObject,
        normalizeMessageSource,
        normalizeSyncRole,
        normalizePilotId,
        trustedPilotTelemetrySources: TRUSTED_PILOT_TELEMETRY_SOURCES
      });
    }

    return syncInboundServiceRef.current;
  }, []);

  const applyLegacyIncomingData = useCallback((data) => {
    if (!data) return;

    const inboundService = ensureSyncInboundService();
    const markInboundHandled = () => {
      setWsLastMessageAt(Date.now());
      isPublishing.current = true;
      setTimeout(() => {
        isPublishing.current = false;
      }, 0);
    };

    inboundService.routeLegacyIncoming(data, {
      timingByStageFields: TIMING_BY_STAGE_FIELDS,
      onIgnored: () => {
        markInboundHandled();
      },
      onPilotTelemetry: ({ normalizedData, telemetryValidation }) => {
        const pilotId = telemetryValidation.pilotId;
        const telemetrySource = telemetryValidation.source;

        if (!telemetryValidation.accepted) {
          markInboundHandled();
          return;
        }

        if (isTelemetryDebugEnabled()) {
          console.log('[Telemetry] Queued pilot telemetry', {
            pilotId,
            source: telemetrySource || 'unknown',
            latLong: normalizedData.latLong ?? '',
            latlongTimestamp: normalizedData.latlongTimestamp ?? normalizedData.lastLatLongUpdatedAt ?? null
          });
        }

        if (pilotId) {
          const pilotExists = Array.isArray(pilotsRef.current)
            && pilotsRef.current.some((pilot) => normalizePilotId(pilot?.id) === pilotId);

          if (!pilotExists && isTelemetryDebugEnabled()) {
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

          if (telemetryTimestamp !== undefined) {
            immediateTelemetry.latlongTimestamp = telemetryTimestamp;
            immediateTelemetry.lastLatLongUpdatedAt = telemetryTimestamp;
          }
          if (normalizedData.latLong !== undefined) {
            immediateTelemetry.latLong = normalizeLatLongString(normalizedData.latLong || '');
          }

          assignPilotTelemetryFields(immediateTelemetry, normalizedData);
          assignPilotTelemetryGForceFields(immediateTelemetry, normalizedData);

          if (immediateTelemetry.connectionStrength !== undefined) {
            immediateTelemetry.connectionStrength = normalizeConnectionStrength(immediateTelemetry.connectionStrength);
          }

          if (immediateTelemetry.connectionType !== undefined) {
            immediateTelemetry.connectionType = normalizeConnectionType(immediateTelemetry.connectionType);
          }

          mergePilotTelemetryEntries([[pilotId, immediateTelemetry]], {
            suppressSync: true
          });
        }

        markInboundHandled();
      },
      onStageTimesDelta: ({ normalizedData, stageId, messageSource }) => {
        const timingChanges = {
          times: Object.fromEntries(
            Object.entries(normalizedData.times).map(([pilotId, value]) => ([
              normalizePilotId(pilotId),
              {
                [stageId]: value
              }
            ]))
          )
        };

        applyDeltaBatchChanges(timingChanges, {
          sourceRole: messageSource,
          timestamp: Number(normalizedData?.timestamp || data?.timestamp || Date.now()),
          packageType: 'delta',
          channelType: data?.channelType || 'data'
        });
      },
      onStageUpsert: ({ normalizedData }) => {
        setStages((prev) => mergeStagesById(prev, normalizedData.stage));
        markInboundHandled();
      },
      onStageDelete: ({ normalizedData }) => {
        setStages((prev) => (Array.isArray(prev) ? prev.filter((stage) => stage?.id !== normalizedData.deletedStageId) : []));
        markInboundHandled();
      },
      onMapPlacemarkUpsert: ({ normalizedData }) => {
        setMapPlacemarks((prev) => mergeMapPlacemarksById(prev, normalizedData.mapPlacemark));
        markInboundHandled();
      },
      onLegacyTimingDelta: ({ normalizedData, legacyTimingEntries, messageSource }) => {
        applyDeltaBatchChanges(Object.fromEntries(legacyTimingEntries), {
          sourceRole: messageSource,
          timestamp: Number(normalizedData?.timestamp || data?.timestamp || Date.now()),
          packageType: 'delta',
          channelType: data?.channelType || 'data'
        });
      },
      onStatePayload: ({ normalizedData, messageSourceRole }) => {
        if (isSyncDebugEnabled()) {
          console.log('[RallyContext] Applying WebSocket data');
        }

        setWsLastMessageAt(Date.now());
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
          || normalizedData.stageSos !== undefined
        );

        if (wsRoleRef.current === 'setup' && isTimingPayload) {
          const nextSyncAt = typeof data?.timestamp === 'number' ? data.timestamp : Date.now();
          setLastTimesSyncAt(nextSyncAt);
        }

        if (wsRoleRef.current === 'setup') {
          if (normalizedData.positions !== undefined) suppressNextSetupTimingCapture('positions');
          if (normalizedData.lapTimes !== undefined) suppressNextSetupTimingCapture('lapTimes');
          if (normalizedData.stagePilots !== undefined) suppressNextSetupTimingCapture('stagePilots');
          if (normalizedData.times !== undefined) suppressNextSetupTimingCapture('times');
          if (normalizedData.arrivalTimes !== undefined) suppressNextSetupTimingCapture('arrivalTimes');
          if (normalizedData.startTimes !== undefined) suppressNextSetupTimingCapture('startTimes');
          if (normalizedData.realStartTimes !== undefined) suppressNextSetupTimingCapture('realStartTimes');
          if (normalizedData.retiredStages !== undefined) suppressNextSetupTimingCapture('retiredStages');
          if (normalizedData.stageAlerts !== undefined) suppressNextSetupTimingCapture('stageAlerts');
          if (normalizedData.stageSos !== undefined) suppressNextSetupTimingCapture('stageSos');
        }

        if (normalizedData.eventName !== undefined) setEventName(normalizedData.eventName);
        if (normalizedData.positions !== undefined && !shouldPreserveLocalTimingSection('positions')) setPositions(normalizedData.positions);
        if (normalizedData.lapTimes !== undefined && !shouldPreserveLocalTimingSection('lapTimes')) setLapTimes(normalizedData.lapTimes);
        if (normalizedData.stagePilots !== undefined && !shouldPreserveLocalTimingSection('stagePilots')) setStagePilots(normalizedData.stagePilots);
        if (normalizedData.pilots !== undefined) setPilots(normalizePilotArrayPayload(normalizedData.pilots));
        if (normalizedData.categories !== undefined) setCategories(normalizedData.categories);
        if (normalizedData.stages !== undefined) setStages(normalizedData.stages);
        if (normalizedData.times !== undefined && !shouldPreserveLocalTimingSection('times')) setTimes(normalizedData.times);
        if (normalizedData.arrivalTimes !== undefined && !shouldPreserveLocalTimingSection('arrivalTimes')) setArrivalTimes(normalizedData.arrivalTimes);
        if (normalizedData.startTimes !== undefined && !shouldPreserveLocalTimingSection('startTimes')) setStartTimes(normalizedData.startTimes);
        if (normalizedData.realStartTimes !== undefined && !shouldPreserveLocalTimingSection('realStartTimes')) setRealStartTimes(normalizedData.realStartTimes);
        if (normalizedData.retiredStages !== undefined && !shouldPreserveLocalTimingSection('retiredStages')) setRetiredStages(normalizedData.retiredStages);
        if (normalizedData.stageAlerts !== undefined && !shouldPreserveLocalTimingSection('stageAlerts')) setStageAlerts(normalizedData.stageAlerts);
        if (normalizedData.stageSos !== undefined) {
          if (wsRoleRef.current === 'setup') {
            suppressNextSetupTimingCapture('stageSos');
          }
          if (messageSourceRole === SYNC_ROLES.MOBILE || data?.section === 'stageSos') {
            setStageSosState((prev) => mergePilotStageFlagMap(prev, normalizedData.stageSos, {
              resolvePilotId: (pilotId) => resolveKnownEntityId(pilotId, pilotsRef.current, 'pilot'),
              resolveStageId: (stageId) => resolveKnownEntityId(stageId, stagesRef.current, 'stage'),
              normalizeValue: (value) => {
                const nextStageSosLevel = normalizeStageSosLevel(value);
                return nextStageSosLevel > 0 ? nextStageSosLevel : null;
              }
            }));
          } else if (!shouldPreserveLocalTimingSection('stageSos')) {
            setStageSosState(normalizedData.stageSos);
          }
        }
        if (normalizedData.mapPlacemarks !== undefined) setMapPlacemarks(normalizedData.mapPlacemarks);
        if (normalizedData.currentStageId !== undefined) setCurrentStageId(normalizedData.currentStageId);
        if (normalizedData.eventIsOver !== undefined) setEventIsOver(normalizedData.eventIsOver === true);
        if (normalizedData.eventReplayStartDate !== undefined) setEventReplayStartDate(normalizedData.eventReplayStartDate || '');
        if (normalizedData.eventReplayStartTime !== undefined) setEventReplayStartTime(normalizedData.eventReplayStartTime || '');
        if (normalizedData.eventReplayStageIntervalSeconds !== undefined) {
          const nextReplayStageIntervalSeconds = Number(normalizedData.eventReplayStageIntervalSeconds);
          setEventReplayStageIntervalSeconds(Number.isFinite(nextReplayStageIntervalSeconds) && nextReplayStageIntervalSeconds >= 0 ? Math.trunc(nextReplayStageIntervalSeconds) : 0);
        }
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

        setTimeout(() => {
          isPublishing.current = false;
        }, 0);
      }
    });
  }, [applyDeltaBatchChanges, ensureSyncInboundService, mergePilotTelemetryEntries, shouldPreserveLocalTimingSection, suppressNextSetupTimingCapture]);

  const applyInboundSyncMessage = useCallback((data) => {
    if (!data) return;

    const inboundService = ensureSyncInboundService();

    inboundService.routeNormalizedIncoming(data, {
      applyDeltaBatchControl,
      applyDeltaBatchChanges,
      applyLegacyIncomingData
    });
  }, [applyDeltaBatchChanges, applyDeltaBatchControl, applyLegacyIncomingData, ensureSyncInboundService]);

  useEffect(() => {
    applyWebSocketDataRef.current = applyInboundSyncMessage;
  }, [applyInboundSyncMessage]);

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
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    sourceFinishTime,
    sourceLapTime,
    retiredStages,
    stageAlerts,
    stageSos,
    mapPlacemarks,
    currentStageId,
    eventIsOver,
    eventReplayStartDate,
    eventReplayStartTime,
    eventReplayStageIntervalSeconds,
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
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    sourceFinishTime,
    sourceLapTime,
    retiredStages,
    stageAlerts,
    stageSos,
    mapPlacemarks,
    currentStageId,
    eventIsOver,
    eventReplayStartDate,
    eventReplayStartTime,
    eventReplayStageIntervalSeconds,
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

  const buildSnapshotChanges = useCallback((allowedSections = null) => {
    const snapshot = buildWebSocketSnapshot();
    const sections = sanitizeSnapshotSections(allowedSections, ALL_SNAPSHOT_SECTION_KEYS) || ALL_SNAPSHOT_SECTION_KEYS;
    const changes = {};
    const timingSections = sections.filter((section) => TIMING_BY_STAGE_FIELDS.has(section));

    sections.forEach((section) => {
      switch (section) {
        case 'meta':
          changes.meta = {
            eventName: snapshot.eventName,
            currentStageId: snapshot.currentStageId,
            eventIsOver: snapshot.eventIsOver,
            eventReplayStartDate: snapshot.eventReplayStartDate,
            eventReplayStartTime: snapshot.eventReplayStartTime,
            eventReplayStageIntervalSeconds: snapshot.eventReplayStageIntervalSeconds,
            debugDate: snapshot.debugDate,
            timeDecimals: snapshot.timeDecimals,
            chromaKey: snapshot.chromaKey,
            mapUrl: snapshot.mapUrl,
            logoUrl: snapshot.logoUrl,
            transitionImageUrl: snapshot.transitionImageUrl,
            globalAudio: snapshot.globalAudio
          };
          break;
        case 'pilots':
          changes.pilots = Array.isArray(snapshot.pilots) ? snapshot.pilots : [];
          break;
        case 'categories':
          changes.categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
          break;
        case 'stages':
          changes.stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
          break;
        case 'mapPlacemarks':
          changes.mapPlacemarks = Array.isArray(snapshot.mapPlacemarks) ? snapshot.mapPlacemarks : [];
          break;
        case 'cameras':
          changes.cameras = Array.isArray(snapshot.cameras) ? snapshot.cameras : [];
          break;
        case 'externalMedia':
          changes.externalMedia = Array.isArray(snapshot.externalMedia) ? snapshot.externalMedia : [];
          break;
        case 'streamConfigs':
          changes.streamConfigs = isPlainObject(snapshot.streamConfigs) ? snapshot.streamConfigs : {};
          break;
        default:
          break;
      }
    });

    if (timingSections.length > 0) {
      changes.timingByStage = buildTimingByStageSnapshot(snapshot, timingSections);
    }

    return changes;
  }, [buildWebSocketSnapshot]);

  const publishSetupSnapshotBatchMessages = useCallback(async (allowedSections = null) => {
    const previousSnapshotVersion = Number(latestSnapshotVersion || 0);
    return enqueueChangePackages(buildSnapshotChanges(allowedSections), {
      packageType: 'snapshot',
      extraMeta: {
        snapshotVersion: previousSnapshotVersion + 1,
        snapshotKind: previousSnapshotVersion > 0 ? 'periodic' : 'initial'
      }
    });
  }, [buildSnapshotChanges, enqueueChangePackages, latestSnapshotVersion]);

  const applyWsOwnership = useCallback((ownership = {}) => {
    const nextOwnership = {
      ownerId: ownership.ownerId || null,
      ownerEpoch: Number(ownership.ownerEpoch || 0),
      hasOwnership: !!ownership.hasOwnership,
      reason: ownership.reason || null
    };

    setWsOwnership(nextOwnership);
  }, []);

  const publishSetupSnapshot = useCallback(async (_channelKey, allowedSections = null) => {
    if (!wsDataIsCurrentRef.current || !syncEngineRef.current?.isOwner) {
      return null;
    }

    if (snapshotPublishInFlightRef.current) {
      return null;
    }

    snapshotPublishInFlightRef.current = true;
    try {
      const nextSnapshotVersion = Number(latestSnapshotVersion || 0) + 1;
      const publishedSnapshot = await publishSetupSnapshotBatchMessages(allowedSections);

      if (!publishedSnapshot) {
        return null;
      }

      const snapshotTimestamp = Number(publishedSnapshot.timestamp || Date.now());
      if (isSyncDebugEnabled()) {
        console.log('[Snapshot] Published', {
          snapshotVersion: nextSnapshotVersion,
          timestamp: snapshotTimestamp,
          totalParts: Number(publishedSnapshot.totalParts || 1)
        });
      }
      setLatestSnapshotVersion(nextSnapshotVersion);
      setWsLatestSnapshotAt(snapshotTimestamp);
      setWsLastSnapshotGeneratedAt(snapshotTimestamp);
      return publishedSnapshot;
    } finally {
      snapshotPublishInFlightRef.current = false;
    }
  }, [latestSnapshotVersion, publishSetupSnapshotBatchMessages]);

  useEffect(() => {
    publishSetupSnapshotRef.current = publishSetupSnapshot;
  }, [publishSetupSnapshot]);

  useEffect(() => {
    if (wsRole !== 'setup' || wsConnectionStatus !== 'connected' || !wsOwnership?.hasOwnership) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setSnapshotFreshnessTick(Date.now());
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [wsConnectionStatus, wsOwnership, wsRole]);

  useEffect(() => {
    const normalizedChannelKey = String(wsChannelKey || '').trim();
    const snapshotStalenessMs = 5 * 60 * 1000;
    const snapshotEnsureRetryMs = 30000;
    const latestKnownSnapshotAt = Number(wsLatestSnapshotAt || 0);
    const needsFreshSnapshot = latestKnownSnapshotAt <= 0 || (Date.now() - latestKnownSnapshotAt) > snapshotStalenessMs;
    const lastEnsureAttempt = lastSnapshotEnsureAttemptRef.current;
    const canRetryEnsure = (
      lastEnsureAttempt.channelKey !== normalizedChannelKey
      || (Date.now() - Number(lastEnsureAttempt.timestamp || 0)) >= snapshotEnsureRetryMs
    );

    if (!normalizedChannelKey) {
      lastSnapshotEnsureAttemptRef.current = {
        channelKey: '',
        timestamp: 0
      };
      return;
    }

    if (
      wsRole !== 'setup'
      || wsConnectionStatus !== 'connected'
      || !wsDataIsCurrent
      || !wsOwnership?.hasOwnership
    ) {
      return;
    }

    if (!needsFreshSnapshot) {
      return;
    }

    if (!canRetryEnsure) {
      return;
    }

    lastSnapshotEnsureAttemptRef.current = {
      channelKey: normalizedChannelKey,
      timestamp: Date.now()
    };
    void publishSetupSnapshotRef.current?.(normalizedChannelKey, wsPublishSections);
  }, [
    snapshotFreshnessTick,
    wsChannelKey,
    wsConnectionStatus,
    wsDataIsCurrent,
    wsLatestSnapshotAt,
    wsOwnership,
    wsPublishSections,
    wsRole
  ]);

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

    if (!canRoleWriteTimingSection(clientRole, section)) {
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

  useEffect(() => {
    if (clientRole !== 'times' || wsRole !== 'times') {
      if (timesPublishTimer.current) {
        window.clearTimeout(timesPublishTimer.current);
        timesPublishTimer.current = null;
      }
      return;
    }

    if (
      !wsEnabled
      || !wsCanPublish
      || wsConnectionStatus !== 'connected'
      || !wsProvider.current?.isConnected
      || !wsDataIsCurrent
    ) {
      return;
    }

    if (!Array.isArray(dirtyTimingSections) || dirtyTimingSections.length === 0) {
      return;
    }

    if (timesPublishTimer.current) {
      window.clearTimeout(timesPublishTimer.current);
    }

    timesPublishTimer.current = window.setTimeout(() => {
      timesPublishTimer.current = null;
      publishDirtyTimingSectionsRef.current?.();
    }, 400);

    return () => {
      if (timesPublishTimer.current) {
        window.clearTimeout(timesPublishTimer.current);
        timesPublishTimer.current = null;
      }
    };
  }, [
    clientRole,
    dirtyTimingSections,
    wsCanPublish,
    wsConnectionStatus,
    wsDataIsCurrent,
    wsEnabled,
    wsRole
  ]);

  const publishDirtySetupSections = useCallback(async (sections = null) => {
    const nextSections = Array.isArray(sections) && sections.length > 0
      ? sections
      : dirtySetupSections;

    if (!Array.isArray(nextSections) || nextSections.length === 0) {
      return false;
    }

    const syncAt = Date.now();
    const hasPendingPatchEntries = getPendingSetupPatchEntries(nextSections).length > 0;
    if (!hasPendingPatchEntries) {
      nextSections.forEach((section) => {
        setupPendingSections.current.delete(section);
      });
      setDirtySetupSections((prev) => prev.filter((section) => !nextSections.includes(section)));
      return true;
    }

    const published = await publishSetupDeltaBatchMessages(nextSections);
    if (!published) {
      return false;
    }

    clearPendingSetupPatchEntries(nextSections);

    nextSections.forEach((section) => {
      setupPendingSections.current.delete(section);
    });

    const publishedBaseSections = nextSections.filter((section) => SETUP_BASE_SECTION_KEYS.includes(section));
    const publishedTimingSections = nextSections.filter((section) => TIMING_SECTION_KEYS.includes(section));

    if (publishedBaseSections.length > 0) {
      setLastSetupSyncAt(syncAt);
      setDirtySetupSections((prev) => prev.filter((section) => !publishedBaseSections.includes(section)));
    }

    if (publishedTimingSections.length > 0) {
      setLastTimesSyncAt(syncAt);
    }

    return true;
  }, [
    clearPendingSetupPatchEntries,
    dirtySetupSections,
    getPendingSetupPatchEntries,
    publishSetupDeltaBatchMessages
  ]);

  useEffect(() => {
    publishDirtySetupSectionsRef.current = publishDirtySetupSections;
  }, [publishDirtySetupSections]);

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

    publishDeltaBatchControl('times-line-request', {
      pilotId,
      stageId,
      timestamp: Date.now()
    });

    return true;
  }, [buildLineSyncKey, publishDeltaBatchControl]);

  // Publish to WebSocket when data changes
  const publishOutgoingSyncBatch = useCallback(async () => {
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
      await publishDirtySetupSectionsRef.current?.(sections);

      return;
    }

    if (wsRole === 'times') {
      const pendingEntries = buildPendingTimingDeltaEntries(null, true);

      if (pendingEntries.length === 0) {
        return;
      }
      await publishDirtyTimingDeltasRef.current?.();

      return;
    }
  }, [buildPendingTimingDeltaEntries, dirtySetupSections, wsEnabled, wsCanPublish, wsRole]);

  // WebSocket connection management
  const connectSyncChannel = useCallback(async (channelKey, options = {}) => {
    if (wsConnectInFlightRef.current) {
      return wsConnectInFlightRef.current;
    }

    const connectPromise = (async () => {
      const { valid } = parseChannelKey(channelKey);
      if (!valid) {
        setWsError('Invalid channel key format');
        return false;
      }

      const role = normalizeSyncRole(options.role || 'client');
      const canPublish = options.readOnly !== true;
      const requireSnapshotBootstrap = roleRequiresSnapshotBootstrap(role);
      const shouldReadHistory = options.readHistory ?? true;
      const allowedSections = options.allowedSections ?? getAllowedPublishSectionsForRole(role);

      try {
        setWsConnectionStatus('connecting');
        setWsError(null);
        setWsDataIsCurrent(false);
        setWsHasSnapshotBootstrap(false);
        setWsSyncState(requireSnapshotBootstrap ? 'waiting_snapshot' : 'idle');
        setPendingSosAlerts([]);

        wsProvider.current = getWebSocketProvider();
        const existingSessionMeta = normalizeCurrentSessionMeta(metaCurrentSessionRef.current);
        if (!existingSessionMeta || existingSessionMeta.channelKey !== channelKey) {
          const nextSessionMeta = normalizeCurrentSessionMeta({
            sessionId: existingSessionMeta?.sessionId || createSyncInstanceId(),
            channelKey,
            updatedAt: Date.now(),
            lastProjectMessage: null
          });

          if (nextSessionMeta) {
            metaCurrentSessionRef.current = nextSessionMeta;
            setMetaCurrentSession(nextSessionMeta);
          }
        }

        const sessionHistoryMarker = getCurrentSessionHistoryMarker(channelKey);
        const sessionHistoryAt = Number(sessionHistoryMarker?.timestamp || 0);
        if (isSyncDebugEnabled()) {
          console.log('[SessionMeta][connect]', {
            channelKey,
            sessionHistoryAt,
            sessionHistoryMarker
          });
        }

        if (!syncEngineRef.current) {
          syncEngineRef.current = new SyncEngine({
            role,
            instanceId: setupInstanceIdRef.current,
            publish: (message) => wsProvider.current?.publish(message),
            onOwnershipChange: (ownership = {}) => {
              if (role !== 'setup') {
                return;
              }

              if (isSyncDebugEnabled()) {
                console.log('[Setup][ownership]', ownership);
              }
              applyWsOwnership(ownership);
            },
            onSnapshotDue: async () => {
              if (role !== 'setup') {
                return false;
              }

              return publishSetupSnapshotRef.current?.(channelKey, allowedSections);
            }
          });
        } else {
          syncEngineRef.current.setRole(role);
          syncEngineRef.current.setInstanceId(setupInstanceIdRef.current);
          syncEngineRef.current.setPublish((message) => wsProvider.current?.publish(message));
          syncEngineRef.current.setCallbacks({
            onOwnershipChange: (ownership = {}) => {
              if (role !== 'setup') {
                return;
              }

              if (isSyncDebugEnabled()) {
                console.log('[Setup][ownership]', ownership);
              }
              applyWsOwnership(ownership);
            },
            onSnapshotDue: async () => {
              if (role !== 'setup') {
                return false;
              }

              return publishSetupSnapshotRef.current?.(channelKey, allowedSections);
            }
          });
        }

        if (!wsMessageReceiver.current) {
          wsMessageReceiver.current = new WsMessageReceiver((data) => {
            const routedData = syncEngineRef.current?.normalizeIncoming(data);
            if (routedData === null) {
              return;
            }
            queueIncomingWsMessage(routedData || data);
          });
        }

        ensureSyncInboundService();

        const onWsMessage = (data) => {
          syncInboundServiceRef.current?.handleProviderMessage(data, {
            role,
            setWsSyncState,
            setLatestSnapshotVersion,
            setWsLatestSnapshotAt,
            setWsHasSnapshotBootstrap,
            setWsLastSnapshotReceivedAt,
            setWsDataIsCurrent,
            wsMessageReceiver: wsMessageReceiver.current
          });
        };

        const onWsStatus = (status, _provider, error) => {
          setWsConnectionStatus(status);
          if (status === 'connected') {
            setWsError(null);
          } else if (error) {
            setWsError(error);
          }
          if (status !== 'connected') {
            setWsDataIsCurrent(false);
            setWsHasSnapshotBootstrap(false);
            setWsSyncState(status === 'connecting' ? 'idle' : 'disconnected');
          }
        };

        const connectOptions = {
          readHistory: shouldReadHistory,
          requireSnapshotBootstrap,
          lastReceivedAt: Number(sessionHistoryAt || wsLastReceivedAt || wsLastReceivedMarkerRef.current?.timestamp || 0),
          lastReceivedMarker: sessionHistoryMarker || wsLastReceivedMarkerRef.current || null,
          snapshotStalenessMs: 5 * 60 * 1000,
          onEchoMessage: ({ channelType, data } = {}) => {
            if (
              channelType === 'priority'
              && isPlainObject(data?.payload?.stageSos)
            ) {
              extractStageFlagEntries(data.payload.stageSos)
                .filter((entry) => entry.enabled)
                .forEach((entry) => {
                  setLocalStageSosLevel(entry.pilotId, entry.stageId, 2);
                  setSosDeliveryStatus(entry.pilotId, entry.stageId, {
                    status: 'sent',
                    notificationId: String(data?.notificationId || '').trim() || undefined,
                    errorMessage: ''
                  });
                });
            }
          },
          onReceiveActivity: ({ timestamp, details } = {}) => {
            const activityAt = Number(timestamp || Date.now());
            const channelType = String(details?.channelType || '').trim();
            if (isPlainObject(details) && channelType !== 'telemetry') {
              wsLastReceivedMarkerRef.current = {
                timestamp: Number(details.timestamp || activityAt || 0),
                snapshotId: String(details.snapshotId || '').trim(),
                partIndex: Number.isFinite(details.partIndex) ? Number(details.partIndex) : 0,
                messageType: String(details.messageType || '').trim(),
                packageType: String(details.packageType || '').trim(),
                controlType: String(details.controlType || '').trim(),
                section: String(details.section || '').trim()
              };
            } else if (channelType !== 'telemetry') {
              wsLastReceivedMarkerRef.current = {
                timestamp: activityAt,
                partIndex: 0
              };
            }
            if (channelType !== 'telemetry') {
              scheduleWsActivityStateFlush({
                lastReceivedAt: activityAt,
                lastMessageAt: activityAt,
                receivedPulseDelta: 1
              });
            } else {
              scheduleWsActivityStateFlush({
                lastMessageAt: activityAt,
                receivedPulseDelta: 1
              });
            }
          },
          onSendMessage: (details = {}) => {
            recordCurrentSessionMessage(details);
            if (
              String(details?.channelType || '').trim() === 'priority'
              && isPlainObject(details?.payload?.stageSos)
            ) {
              extractStageFlagEntries(details.payload.stageSos)
                .filter((entry) => entry.enabled)
                .forEach((entry) => {
                  setSosDeliveryStatus(entry.pilotId, entry.stageId, {
                    status: 'sent',
                    notificationId: String(details?.notificationId || '').trim() || undefined,
                    errorMessage: ''
                  });
                });
            }
          },
          onSendActivity: ({ timestamp } = {}) => {
            const activityAt = Number(timestamp || Date.now());
            scheduleWsActivityStateFlush({
              lastSentAt: activityAt,
              lastMessageAt: activityAt,
              sentPulseDelta: 1
            });
          }
        };

        await wsProvider.current.connect(channelKey, onWsMessage, onWsStatus, connectOptions);

        syncEngineRef.current.connect({
          role,
          instanceId: setupInstanceIdRef.current,
          publish: (message) => wsProvider.current?.publish(message),
          onSnapshotDue: async () => {
            if (role !== 'setup') {
              return false;
            }

            return publishSetupSnapshotRef.current?.(channelKey, allowedSections);
          }
        });

        const bootstrapState = wsProvider.current.getBootstrapState?.() || {};

        setWsChannelKey(channelKey);
        setWsInstanceId(setupInstanceIdRef.current);
        setWsCanPublish(canPublish);
        setWsRole(role);
        setWsPublishSections(allowedSections);
        setWsLastMessageAt(Date.now());
        localStorage.setItem('rally_ws_channel_key', JSON.stringify(channelKey));
        setWsEnabled(true);
        localStorage.setItem('rally_ws_enabled', JSON.stringify(true));
        clearManualWsDisconnect(channelKey);

        const hasSnapshotBootstrap = !!bootstrapState.hasSnapshotBootstrap;
        const hasReplayBootstrap = !!bootstrapState.historyComplete && String(bootstrapState.mode || '').trim() === 'replay';
        const latestSnapshotAt = Number(bootstrapState.snapshotTimestamp || 0);
        setLatestSnapshotVersion(Number(bootstrapState.snapshotVersion || 0));
        setWsHasSnapshotBootstrap(hasSnapshotBootstrap);
        setWsLatestSnapshotAt(latestSnapshotAt || null);
        setWsLastSnapshotReceivedAt(hasSnapshotBootstrap ? (latestSnapshotAt || null) : null);
        setWsSyncState(
          !roleRequiresSnapshotBootstrap(role)
            ? 'current'
            : (hasSnapshotBootstrap || hasReplayBootstrap)
              ? 'current'
              : 'waiting_snapshot'
        );
        setWsDataIsCurrent(
          !roleRequiresSnapshotBootstrap(role)
            ? (!shouldReadHistory || !!bootstrapState.historyComplete)
            : (hasSnapshotBootstrap || hasReplayBootstrap)
        );

        if (role === 'times') {
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

        }

        if (role === 'times') {
          window.setTimeout(() => {
            publishDirtyTimingSectionsRef.current?.();
          }, 500);
        }

        return true;
      } catch (error) {
        syncEngineRef.current?.disconnect();
        setWsConnectionStatus('error');
        setWsError(error.message);
        setWsDataIsCurrent(false);
        setWsHasSnapshotBootstrap(false);
        setWsSyncState('disconnected');
        return false;
      } finally {
        wsConnectInFlightRef.current = null;
      }
    })();

    wsConnectInFlightRef.current = connectPromise;
    return connectPromise;
  }, [
    applyInboundSyncMessage,
    applyWsOwnership,
    publishDirtyTimingSections,
    publishDirtySetupSections,
    publishSetupSnapshot,
    buildPendingTimingDeltaEntries,
    publishTimingDeltaEntries,
    queueIncomingWsMessage,
    dirtyTimingSections,
    timingSectionTouchedAt,
    dirtySetupSections,
    getCurrentSessionHistoryMarker,
    lastTimesEditAt,
    lastTimesSyncAt,
    lastSetupSyncAt,
    recordCurrentSessionMessage,
    ensureSyncInboundService,
    setLocalStageSosLevel,
    setSosDeliveryStatus,
    wsLastReceivedAt
  ]);

  const disconnectSyncChannel = useCallback((options = {}) => {
    const shouldMarkManualDisconnect = options.manual === true;
    const manualDisconnectChannelKey = String(options.channelKey || wsChannelKey || '').trim();

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
    if (syncEngineRef.current) {
      syncEngineRef.current.disconnect();
    }
    setWsConnectionStatus('disconnected');
    setWsEnabled(false);
    setWsCanPublish(false);
    setWsDataIsCurrent(false);
    setWsHasSnapshotBootstrap(false);
    setWsSyncState('disconnected');
    setWsLatestSnapshotAt(null);
    setWsLastSnapshotGeneratedAt(null);
    setWsLastSnapshotReceivedAt(null);
    lastSnapshotEnsureAttemptRef.current = {
      channelKey: '',
      timestamp: 0
    };
    if (wsActivityFlushTimerRef.current) {
      window.clearTimeout(wsActivityFlushTimerRef.current);
      wsActivityFlushTimerRef.current = null;
    }
    if (incomingWsFlushTimerRef.current) {
      window.clearTimeout(incomingWsFlushTimerRef.current);
      incomingWsFlushTimerRef.current = null;
    }
    pendingIncomingWsMessagesRef.current = [];
    wsActivityStateRef.current = {
      lastReceivedAt: null,
      lastSentAt: null,
      lastMessageAt: null,
      receivedPulseDelta: 0,
      sentPulseDelta: 0
    };
    setWsLastMessageAt(null);
    setWsLastReceivedAt(null);
    setWsLastSentAt(null);
      setWsRole('client');
      setWsInstanceId(setupInstanceIdRef.current);
      setWsPublishSections(null);
    setPendingSosAlerts([]);
    applyWsOwnership({
      ownerId: null,
      ownerEpoch: 0,
      hasOwnership: false,
      reason: null
    });
    if (shouldMarkManualDisconnect) {
      markManualWsDisconnect(manualDisconnectChannelKey);
    }
    localStorage.setItem('rally_ws_enabled', JSON.stringify(false));
  }, [wsChannelKey]);

  const generateNewChannelKey = useCallback(() => {
    return generateChannelKey();
  }, []);

  // Publish to WebSocket when data version changes
  useEffect(() => {
    if (wsRole === 'times') {
      return;
    }

    if (wsEnabled && wsProvider.current?.isConnected) {
      publishOutgoingSyncBatch();
    }
  }, [dataVersion, wsEnabled, wsRole, publishOutgoingSyncBatch]);

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
    if (consumeSetupTimingCaptureSuppression('positions')) return;
    captureSetupPatchEntries('positions', diffTimingLineEntries('positions', previousPositions, positions));
  }, [captureSetupPatchEntries, consumeSetupTimingCaptureSuppression, positions, updateDataVersion]);

  useEffect(() => {
    const previousLapTimes = previousSetupSyncStateRef.current.lapTimes;
    previousSetupSyncStateRef.current.lapTimes = lapTimes;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_lap_times', JSON.stringify(lapTimes));
    updateDataVersion('timingExtra');
    if (consumeSetupTimingCaptureSuppression('lapTimes')) return;
    captureSetupPatchEntries('lapTimes', diffTimingLineEntries('lapTimes', previousLapTimes, lapTimes));
  }, [captureSetupPatchEntries, consumeSetupTimingCaptureSuppression, lapTimes, updateDataVersion]);

  useEffect(() => {
    previousSetupSyncStateRef.current.sourceLapTime = sourceLapTime;
    localStorage.setItem(SOURCE_LAP_TIME_STORAGE_KEY, JSON.stringify(sourceLapTime));
  }, [sourceLapTime]);

  useEffect(() => {
    const previousStagePilots = previousSetupSyncStateRef.current.stagePilots;
    previousSetupSyncStateRef.current.stagePilots = stagePilots;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_stage_pilots', JSON.stringify(stagePilots));
    updateDataVersion('timingExtra');
    if (consumeSetupTimingCaptureSuppression('stagePilots')) return;
    captureSetupPatchEntries('stagePilots', diffTimingLineEntries('stagePilots', previousStagePilots, stagePilots));
  }, [captureSetupPatchEntries, consumeSetupTimingCaptureSuppression, stagePilots, updateDataVersion]);

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
    if (consumeSetupTimingCaptureSuppression('times')) return;
    captureSetupPatchEntries('times', diffTimingLineEntries('times', previousTimes, times));
  }, [captureSetupPatchEntries, consumeSetupTimingCaptureSuppression, scheduleTimesPersistenceFlush, times]);

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
    const suppressArrivalCapture = consumeSetupTimingCaptureSuppression('arrivalTimes');
    const suppressStartCapture = consumeSetupTimingCaptureSuppression('startTimes');
    const suppressRealStartCapture = consumeSetupTimingCaptureSuppression('realStartTimes');
    if (!suppressArrivalCapture) {
    captureSetupPatchEntries('arrivalTimes', diffTimingLineEntries('arrivalTimes', previousArrivalTimes, arrivalTimes));
    }
    if (!suppressStartCapture) {
    captureSetupPatchEntries('startTimes', diffTimingLineEntries('startTimes', previousStartTimes, startTimes));
    }
    if (!suppressRealStartCapture) {
    captureSetupPatchEntries('realStartTimes', diffTimingLineEntries('realStartTimes', previousRealStartTimes, realStartTimes));
    }
  }, [arrivalTimes, captureSetupPatchEntries, consumeSetupTimingCaptureSuppression, realStartTimes, startTimes, updateDataVersion]);

  useEffect(() => {
    previousSetupSyncStateRef.current.sourceFinishTime = sourceFinishTime;
    localStorage.setItem(SOURCE_FINISH_TIME_STORAGE_KEY, JSON.stringify(sourceFinishTime));
  }, [sourceFinishTime]);

  useEffect(() => {
    const previousRetiredStages = previousSetupSyncStateRef.current.retiredStages;
    previousSetupSyncStateRef.current.retiredStages = retiredStages;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_retired_stages', JSON.stringify(retiredStages));
    updateDataVersion('timingExtra');
    if (consumeSetupTimingCaptureSuppression('retiredStages')) return;
    captureSetupPatchEntries('retiredStages', diffTimingLineEntries('retiredStages', previousRetiredStages, retiredStages));
  }, [captureSetupPatchEntries, consumeSetupTimingCaptureSuppression, retiredStages, updateDataVersion]);

  useEffect(() => {
    const previousStageAlerts = previousSetupSyncStateRef.current.stageAlerts;
    previousSetupSyncStateRef.current.stageAlerts = stageAlerts;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_stage_alerts', JSON.stringify(stageAlerts));
    updateDataVersion('timingExtra');
    if (consumeSetupTimingCaptureSuppression('stageAlerts')) return;
    captureSetupPatchEntries('stageAlerts', diffTimingLineEntries('stageAlerts', previousStageAlerts, stageAlerts));
  }, [captureSetupPatchEntries, consumeSetupTimingCaptureSuppression, stageAlerts, updateDataVersion]);

  useEffect(() => {
    const previousStageSos = previousSetupSyncStateRef.current.stageSos;
    previousSetupSyncStateRef.current.stageSos = stageSos;
    if (hydratingDomainsRef.current.has('timingExtra')) return;
    localStorage.setItem('rally_stage_sos', JSON.stringify(stageSos));
    updateDataVersion('timingExtra');
    if (consumeLocalSetupTimingCaptureSuppression('stageSos')) return;
    if (consumeSetupTimingCaptureSuppression('stageSos')) return;
    captureSetupPatchEntries('stageSos', diffTimingLineEntries('stageSos', previousStageSos, stageSos));
  }, [captureSetupPatchEntries, consumeLocalSetupTimingCaptureSuppression, consumeSetupTimingCaptureSuppression, stageSos, updateDataVersion]);

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
    const previousEventIsOver = previousSetupSyncStateRef.current.meta.eventIsOver;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      eventIsOver
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_event_is_over', JSON.stringify(eventIsOver));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousEventIsOver, eventIsOver) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'eventIsOver',
      value: eventIsOver
    }]);
  }, [captureSetupPatchEntries, eventIsOver, updateDataVersion]);

  useEffect(() => {
    const previousEventReplayStartDate = previousSetupSyncStateRef.current.meta.eventReplayStartDate;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      eventReplayStartDate
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_event_replay_start_date', JSON.stringify(eventReplayStartDate));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousEventReplayStartDate, eventReplayStartDate) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'eventReplayStartDate',
      value: eventReplayStartDate
    }]);
  }, [captureSetupPatchEntries, eventReplayStartDate, updateDataVersion]);

  useEffect(() => {
    const previousEventReplayStartTime = previousSetupSyncStateRef.current.meta.eventReplayStartTime;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      eventReplayStartTime
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_event_replay_start_time', JSON.stringify(eventReplayStartTime));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousEventReplayStartTime, eventReplayStartTime) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'eventReplayStartTime',
      value: eventReplayStartTime
    }]);
  }, [captureSetupPatchEntries, eventReplayStartTime, updateDataVersion]);

  useEffect(() => {
    const previousEventReplayStageIntervalSeconds = previousSetupSyncStateRef.current.meta.eventReplayStageIntervalSeconds;
    previousSetupSyncStateRef.current.meta = {
      ...(previousSetupSyncStateRef.current.meta || {}),
      eventReplayStageIntervalSeconds
    };
    if (hydratingDomainsRef.current.has('meta')) return;
    localStorage.setItem('rally_event_replay_stage_interval_seconds', JSON.stringify(eventReplayStageIntervalSeconds));
    updateDataVersion('meta');
    captureSetupPatchEntries('meta', areValuesEqual(previousEventReplayStageIntervalSeconds, eventReplayStageIntervalSeconds) ? [] : [{
      kind: 'meta',
      section: 'meta',
      field: 'eventReplayStageIntervalSeconds',
      value: eventReplayStageIntervalSeconds
    }]);
  }, [captureSetupPatchEntries, eventReplayStageIntervalSeconds, updateDataVersion]);

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
      replayVideoUrl: pilot.replayVideoUrl || '',
      replayStageTimes: normalizeReplayStageTimes(pilot.replayStageTimes),
      categoryId: pilot.categoryId || null,
      startOrder: pilot.startOrder || 999,
      timeOffsetMinutes: pilot.timeOffsetMinutes || 0,
      currentStageId: String(pilot.currentStageId || '').trim(),
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
      if (nextUpdates.currentStageId !== undefined && nextUpdates.currentStageId !== null) {
        nextUpdates.currentStageId = String(nextUpdates.currentStageId || '').trim();
      }
      if (nextUpdates.replayStageTimes !== undefined) {
        nextUpdates.replayStageTimes = normalizeReplayStageTimes(nextUpdates.replayStageTimes);
      }
      delete nextUpdates.latLong;
      delete nextUpdates.latlongTimestamp;
      delete nextUpdates.lastLatLongUpdatedAt;
      delete nextUpdates.lastTelemetryAt;
      delete nextUpdates.speed;
      delete nextUpdates.heading;
      delete nextUpdates.gpsPrecision;
      delete nextUpdates.connectionStrength;
      delete nextUpdates.connectionType;
      PILOT_G_FORCE_FIELD_KEYS.forEach((fieldKey) => {
        delete nextUpdates[fieldKey];
      });

      return { ...pilot, ...nextUpdates };
    }));
  }

  const setPilotCurrentStage = useCallback((pilotId, stageId) => {
    const normalizedPilotId = normalizePilotId(pilotId);
    if (!normalizedPilotId) {
      return;
    }

    updatePilot(normalizedPilotId, {
      currentStageId: String(stageId || '').trim()
    });
  }, [updatePilot]);

  const syncPilotCurrentStageFromTelemetry = useCallback((pilotId, telemetry = {}) => {
    const normalizedPilotId = normalizePilotId(pilotId);
    if (!normalizedPilotId) {
      return false;
    }

    const nextStageId = String(telemetry?.stageId || '').trim();
    if (!nextStageId) {
      return false;
    }

    const currentStageIdValue = String(
      pilotsRef.current?.find((pilot) => normalizePilotId(pilot?.id) === normalizedPilotId)?.currentStageId || ''
    ).trim();

    if (currentStageIdValue === nextStageId) {
      return false;
    }

    setPilotCurrentStage(normalizedPilotId, nextStageId);
    return true;
  }, [setPilotCurrentStage]);

  const getPilotCurrentStage = useCallback((pilotId) => {
    const normalizedPilotId = normalizePilotId(pilotId);
    if (!normalizedPilotId) {
      return '';
    }

    return String(pilotsRef.current?.find((pilot) => normalizePilotId(pilot?.id) === normalizedPilotId)?.currentStageId || '').trim();
  }, []);

  const setPilotTelemetry = useCallback((pilotId, telemetry = {}) => {
    if (!pilotId) {
      return;
    }

    const normalizedTelemetry = {};

    if (telemetry.latLong !== undefined) {
      normalizedTelemetry.latLong = normalizeLatLongString(telemetry.latLong || '');
    }
    assignPilotTelemetryFields(normalizedTelemetry, telemetry);
    assignPilotTelemetryGForceFields(normalizedTelemetry, telemetry);

    if (normalizedTelemetry.connectionStrength !== undefined) {
      normalizedTelemetry.connectionStrength = normalizeConnectionStrength(normalizedTelemetry.connectionStrength);
    }

    if (normalizedTelemetry.connectionType !== undefined) {
      normalizedTelemetry.connectionType = normalizeConnectionType(normalizedTelemetry.connectionType);
    }

    if (telemetry.lastTelemetryAt !== undefined) {
      normalizedTelemetry.lastTelemetryAt = telemetry.lastTelemetryAt;
    }

    if (telemetry.source !== undefined) {
      normalizedTelemetry.source = telemetry.source;
    }

    const nextTelemetry = mergePilotTelemetryEntries([[normalizePilotId(pilotId), normalizedTelemetry]]);
    publishPilotTelemetryMessage(pilotId, normalizedTelemetry);
    updateDataVersion('pilotTelemetry');

    return nextTelemetry;
  }, [mergePilotTelemetryEntries, publishPilotTelemetryMessage, updateDataVersion]);

  const getPilotTelemetry = useCallback((pilotId) => (
    getPilotTelemetryForId(pilotTelemetryByPilotIdRef.current || {}, pilotId)
  ), []);

  const getPersistedPilotTelemetry = useCallback((pilotId) => (
    getPilotTelemetryForId(getPilotTelemetrySnapshot(), pilotId)
  ), [getPilotTelemetrySnapshot]);

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
    setSourceFinishTime(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSourceLapTime(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
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

  const recalculateLapRaceStoredTimesForStage = useCallback((stageId, stageOverride = null) => {
    const resolvedStage = stageOverride || stages.find((stage) => stage.id === stageId);
    if (!resolvedStage || !isLapTimingStageType(resolvedStage.type)) {
      return;
    }

    const changedPilotIds = [];
    setTimes((prev) => {
      let didChange = false;
      const next = { ...prev };

      pilots.forEach((pilot) => {
        const pilotId = pilot.id;
        const lapEntries = lapTimesRef.current?.[pilotId]?.[stageId] || [];
        const nextValue = computeLapRaceStoredTimeValue(resolvedStage, lapEntries, pilotId);
        const previousValue = prev?.[pilotId]?.[stageId] || '';

        if (previousValue === nextValue) {
          return;
        }

        didChange = true;
        changedPilotIds.push(pilotId);
        next[pilotId] = {
          ...(next[pilotId] || {}),
          [stageId]: nextValue
        };
      });

      return didChange ? next : prev;
    });
    if (changedPilotIds.length > 0) {
      markTimingSectionDirty('times');
      changedPilotIds.forEach((pilotId) => {
        markTimingLineDirty('times', pilotId, stageId);
      });
    }
  }, [computeLapRaceStoredTimeValue, markTimingLineDirty, markTimingSectionDirty, pilots, setTimes, stages]);

  const addStage = (stage) => {
    const normalizedStageType = stage.type || 'SS';
    const defaultLapCount = normalizedStageType === 'Super Prime' ? 2 : '';
    const newStage = {
      id: createEntityId('stage'),
      ...stage,
      name: stage.name,
      type: normalizedStageType,
      ssNumber: stage.ssNumber || '', // For SS / Super Prime stage types
      date: stage.date || '',
      distance: stage.distance || '',
      startTime: stage.startTime || '', // For SS/Super Prime/Liaison/Service Park: schedule time. For Lap Race: race start time
      realStartTime: stage.realStartTime || '',
      endTime: stage.endTime || '',
      mapPlacemarkId: stage.mapPlacemarkId || '',
      numberOfLaps: stage.numberOfLaps ?? defaultLapCount,
      lapRaceTotalTimeMode: stage.lapRaceTotalTimeMode || DEFAULT_LAP_RACE_TOTAL_TIME_MODE,
      lapRaceMaxTimeMinutes: stage.lapRaceMaxTimeMinutes || '',
      lapRaceVariableLaps: !!stage.lapRaceVariableLaps
    };
    setStages(prev => [...prev, newStage]);
    
    // For Lap Race, initialize with all pilots selected by default
    if (isLapTimingStageType(normalizedStageType)) {
      setStagePilots(prev => ({
        ...prev,
        [newStage.id]: pilots.map(p => p.id)
      }));
    }
  };

  const updateStage = useCallback((id, updates) => {
    let nextStage = null;
    setStages(prev => prev.map(s => {
      if (s.id !== id) {
        return s;
      }
      nextStage = { ...s, ...updates };
      return nextStage;
    }));

    if (nextStage && clientRole === 'times') {
      markTimingSectionDirty('stages');
      markTimingLineDirty('stages', null, id);
    }

    if (nextStage && isLapTimingStageType(nextStage.type) && !stagePilotsRef.current?.[id]?.length) {
      setStagePilots((prev) => ({
        ...prev,
        [id]: pilots.map((pilot) => pilot.id)
      }));
    }

    if (nextStage && isLapTimingStageType(nextStage.type) && (
      Object.prototype.hasOwnProperty.call(updates, 'startTime')
      || Object.prototype.hasOwnProperty.call(updates, 'realStartTime')
      || Object.prototype.hasOwnProperty.call(updates, 'lapRaceTotalTimeMode')
    )) {
      recalculateLapRaceStoredTimesForStage(id, nextStage);
    }
  }, [clientRole, markTimingLineDirty, markTimingSectionDirty, pilots, recalculateLapRaceStoredTimesForStage, setStagePilots, setStages]);

  const deleteStage = (id) => {
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
    setSourceFinishTime(prev => {
      const next = { ...prev };
      Object.keys(next).forEach((pilotId) => {
        if (next[pilotId]) {
          delete next[pilotId][id];
          if (Object.keys(next[pilotId]).length === 0) {
            delete next[pilotId];
          }
        }
      });
      return next;
    });
    setSourceLapTime(prev => {
      const next = { ...prev };
      Object.keys(next).forEach((pilotId) => {
        if (next[pilotId]) {
          delete next[pilotId][id];
          if (Object.keys(next[pilotId]).length === 0) {
            delete next[pilotId];
          }
        }
      });
      return next;
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

  const removeMapPlacemark = useCallback((placemarkId) => {
    const targetId = String(placemarkId || '').trim();
    if (!targetId) {
      return;
    }

    setMapPlacemarks((prev) => prev.filter((placemark) => placemark?.id !== targetId));
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
    const stage = stages.find((entry) => entry.id === stageId);
    const manualTimingSource = getManualTimingSourceForRole(clientRole);

    setLapTimes(prev => {
      const pilotLaps = prev[pilotId] || {};
      const stageLaps = [...(pilotLaps[stageId] || [])];
      stageLaps[lapIndex] = time;

      if (stage && isLapTimingStageType(stage.type)) {
        const nextStoredTotal = computeLapRaceStoredTimeValue(stage, stageLaps, pilotId);
        setTimes((timesPrev) => ({
          ...timesPrev,
          [pilotId]: {
            ...(timesPrev[pilotId] || {}),
            [stageId]: nextStoredTotal
          }
        }));
        markTimingSectionDirty('times');
        markTimingLineDirty('times', pilotId, stageId);
      }

      return {
        ...prev,
        [pilotId]: {
          ...pilotLaps,
          [stageId]: stageLaps
        }
      };
    });
    setLapTimeSourceValue(pilotId, stageId, lapIndex, time ? manualTimingSource : '');
    if (stage && isLapTimingStageType(stage.type)) {
      const nextLapSources = Array.isArray(sourceLapTimeRef.current?.[pilotId]?.[stageId])
        ? [...sourceLapTimeRef.current[pilotId][stageId]]
        : [];
      nextLapSources[lapIndex] = time ? manualTimingSource : '';
      const nextStoredSource = getHighestTimingSource(nextLapSources);
      setFinishTimeSourceValue(pilotId, stageId, nextStoredSource);
    }
    markTimingSectionDirty('lapTimes');
    markTimingLineDirty('lapTimes', pilotId, stageId);
  }, [clientRole, computeLapRaceStoredTimeValue, markTimingLineDirty, markTimingSectionDirty, setFinishTimeSourceValue, setLapTimeSourceValue, setLapTimes, setTimes, stages]);

  const removeLapTimeColumn = useCallback((stageId, lapIndex) => {
    if (!Number.isInteger(lapIndex) || lapIndex < 0) {
      return;
    }

    const stage = stages.find((entry) => entry.id === stageId);
    if (!stage || !isLapTimingStageType(stage.type)) {
      return;
    }

    const changedPilotIds = [];
    setLapTimes((prev) => {
      let didChange = false;
      const next = { ...prev };

      pilots.forEach((pilot) => {
        const pilotId = pilot.id;
        const currentPilotLaps = Array.isArray(next[pilotId]?.[stageId])
          ? next[pilotId][stageId]
          : null;

        if (!currentPilotLaps || lapIndex >= currentPilotLaps.length) {
          return;
        }

        const nextPilotLaps = [...currentPilotLaps];
        nextPilotLaps.splice(lapIndex, 1);

        const nextPilotLapEntries = {
          ...(isPlainObject(next[pilotId]) ? next[pilotId] : {})
        };

        if (nextPilotLaps.length > 0) {
          nextPilotLapEntries[stageId] = nextPilotLaps;
        } else {
          delete nextPilotLapEntries[stageId];
        }

        if (Object.keys(nextPilotLapEntries).length > 0) {
          next[pilotId] = nextPilotLapEntries;
        } else {
          delete next[pilotId];
        }

        didChange = true;
        changedPilotIds.push(pilotId);

        const nextStoredTotal = computeLapRaceStoredTimeValue(stage, nextPilotLaps, pilotId);
        setTimes((timesPrev) => ({
          ...timesPrev,
          [pilotId]: {
            ...(timesPrev[pilotId] || {}),
            [stageId]: nextStoredTotal
          }
        }));
        markTimingLineDirty('lapTimes', pilotId, stageId);
        markTimingLineDirty('times', pilotId, stageId);
      });

      return didChange ? next : prev;
    });

    setSourceLapTime((prev) => {
      let didChange = false;
      const next = { ...(isPlainObject(prev) ? prev : {}) };

      changedPilotIds.forEach((pilotId) => {
        const currentPilotSources = Array.isArray(next[pilotId]?.[stageId])
          ? [...next[pilotId][stageId]]
          : [];

        if (lapIndex >= currentPilotSources.length) {
          return;
        }

        currentPilotSources.splice(lapIndex, 1);
        const nextPilotSourceStages = isPlainObject(next[pilotId]) ? { ...next[pilotId] } : {};
        if (currentPilotSources.length > 0) {
          nextPilotSourceStages[stageId] = currentPilotSources;
        } else {
          delete nextPilotSourceStages[stageId];
        }

        if (Object.keys(nextPilotSourceStages).length > 0) {
          next[pilotId] = nextPilotSourceStages;
        } else {
          delete next[pilotId];
        }
        didChange = true;
      });

      return didChange ? next : prev;
    });

    setSourceFinishTime((prev) => {
      let next = prev;
      changedPilotIds.forEach((pilotId) => {
        const nextLapSources = Array.isArray(sourceLapTimeRef.current?.[pilotId]?.[stageId])
          ? [...sourceLapTimeRef.current[pilotId][stageId]]
          : [];
        nextLapSources.splice(lapIndex, 1);
        next = setNestedStageValue(next, pilotId, stageId, getHighestTimingSource(nextLapSources));
      });
      return next;
    });

    if (changedPilotIds.length > 0) {
      markTimingSectionDirty('lapTimes');
      markTimingSectionDirty('times');
    }
  }, [computeLapRaceStoredTimeValue, markTimingLineDirty, markTimingSectionDirty, pilots, setLapTimes, setSourceFinishTime, setSourceLapTime, setTimes, stages]);

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
    const stage = stages.find((entry) => entry.id === stageId);
    const manualTimingSource = getManualTimingSourceForRole(clientRole);
    setTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: time
      }
    }));
    if (stage && isLapTimingStageType(stage.type)) {
      setFinishTimeSourceValue(pilotId, stageId, time ? manualTimingSource : getHighestTimingSource(sourceLapTimeRef.current?.[pilotId]?.[stageId] || []));
    } else {
      setFinishTimeSourceValue(pilotId, stageId, time ? manualTimingSource : '');
    }
    markTimingSectionDirty('times');
    markTimingLineDirty('times', pilotId, stageId);
  }, [clientRole, markTimingLineDirty, markTimingSectionDirty, setFinishTimeSourceValue, setTimes, stages]);

  const getTime = useCallback((pilotId, stageId) => (
    times[pilotId]?.[stageId] || ''
  ), [times]);

  const setArrivalTime = useCallback((pilotId, stageId, arrivalTime) => {
    const manualTimingSource = getManualTimingSourceForRole(clientRole);
    setArrivalTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: arrivalTime
      }
    }));
    setFinishTimeSourceValue(pilotId, stageId, arrivalTime ? manualTimingSource : '');
    markTimingSectionDirty('arrivalTimes');
    markTimingLineDirty('arrivalTimes', pilotId, stageId);
  }, [clientRole, markTimingLineDirty, markTimingSectionDirty, setArrivalTimes, setFinishTimeSourceValue]);

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

    const stage = stages.find((entry) => entry.id === stageId);
    if (stage && isLapTimingStageType(stage.type)) {
      const lapEntries = lapTimesRef.current?.[pilotId]?.[stageId] || [];
      const nextStoredTotal = computeLapRaceStoredTimeValue(stage, lapEntries, pilotId);
      setTimes((prev) => ({
        ...prev,
        [pilotId]: {
          ...(prev[pilotId] || {}),
          [stageId]: nextStoredTotal
        }
      }));
      markTimingSectionDirty('times');
      markTimingLineDirty('times', pilotId, stageId);
    }

    markTimingSectionDirty('startTimes');
    markTimingLineDirty('startTimes', pilotId, stageId);
  }, [computeLapRaceStoredTimeValue, markTimingLineDirty, markTimingSectionDirty, setStartTimes, setTimes, stages]);

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

  const bulkImportTimingEntries = (entries, options = {}) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      return;
    }

    const replaceExisting = options?.replaceExisting === true;
    const manualTimingSource = getManualTimingSourceForRole(clientRole);

    const applyBulkUpdates = (previousState, valueKey) => {
      let changed = false;
      const nextState = { ...previousState };

      entries.forEach((entry) => {
        const nextValue = entry[valueKey];
        const currentPilotState = nextState[entry.pilotId] || {};

        if (replaceExisting && currentPilotState[entry.stageId] !== undefined) {
          const clearedPilotState = { ...currentPilotState };
          delete clearedPilotState[entry.stageId];
          if (Object.keys(clearedPilotState).length > 0) {
            nextState[entry.pilotId] = clearedPilotState;
          } else {
            delete nextState[entry.pilotId];
          }
          changed = true;
        }

        if (nextValue === undefined || nextValue === null || nextValue === '') {
          return;
        }

        const refreshedPilotState = nextState[entry.pilotId] || {};
        if (refreshedPilotState[entry.stageId] === nextValue) {
          return;
        }

        nextState[entry.pilotId] = {
          ...refreshedPilotState,
          [entry.stageId]: nextValue
        };
        changed = true;
      });

      return changed ? nextState : previousState;
    };

    setTimes((prev) => applyBulkUpdates(prev, 'totalTime'));
    setArrivalTimes((prev) => applyBulkUpdates(prev, 'arrivalTime'));
    setStartTimes((prev) => applyBulkUpdates(prev, 'startTime'));
    setSourceFinishTime((prev) => {
      let next = prev;
      entries.forEach((entry) => {
        if (replaceExisting) {
          next = setNestedStageValue(next, entry.pilotId, entry.stageId, '');
        }
        if (entry.totalTime !== undefined && entry.totalTime !== null && entry.totalTime !== '') {
          next = setNestedStageValue(next, entry.pilotId, entry.stageId, manualTimingSource);
          return;
        }
        if (entry.arrivalTime !== undefined && entry.arrivalTime !== null && entry.arrivalTime !== '') {
          next = setNestedStageValue(next, entry.pilotId, entry.stageId, manualTimingSource);
        }
      });
      return next;
    });
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

  const isStageSos = useCallback((pilotId, stageId) => (
    normalizeStageSosLevel(stageSos?.[pilotId]?.[stageId]) > 0
  ), [stageSos]);

  const setStageSos = useCallback((pilotId, stageId, sos, options = {}) => {
    const normalizedPilotId = normalizePilotId(pilotId);
    const normalizedStageId = String(stageId || '').trim();
    const isHighPriority = options?.highPriority === true;
    const nextStageSosLevel = normalizeStageSosLevel(sos ? (options?.level || 1) : 0);

    if (isHighPriority && clientRole === 'setup') {
      suppressNextLocalSetupTimingCapture('stageSos');
    }

    setLocalStageSosLevel(normalizedPilotId, normalizedStageId, nextStageSosLevel, {
      suppressSetupCapture: isHighPriority
    });

    if (!isHighPriority) {
      markTimingSectionDirty('stageSos');
      markTimingLineDirty('stageSos', normalizedPilotId, normalizedStageId);
    }

    if (nextStageSosLevel <= 0) {
      clearSosDeliveryStatus(normalizedPilotId, normalizedStageId);
      removePendingSosAlert('', {
        pilotId: normalizedPilotId,
        stageId: normalizedStageId
      });
      return;
    }

    if (!isHighPriority) {
      return;
    }

    const notificationId = buildSosNotificationId({
      pilotId: normalizedPilotId,
      stageId: normalizedStageId,
      timestamp: getNextLogicalTimestamp()
    });

    setSosDeliveryStatus(normalizedPilotId, normalizedStageId, {
      status: 'sending',
      notificationId,
      errorMessage: ''
    });

    void enqueueChangePackages({
      stageSos: {
        [normalizedPilotId]: {
          [normalizedStageId]: 1
        }
      }
    }, {
      highPriority: true,
      extraMeta: {
        notificationId
      }
    }).then((result) => {
      if (!result) {
        setSosDeliveryStatus(normalizedPilotId, normalizedStageId, {
          status: 'error',
          notificationId,
          errorMessage: 'Unable to publish SOS alert.'
        });
        return;
      }

    }).catch((error) => {
      setSosDeliveryStatus(normalizedPilotId, normalizedStageId, {
        status: 'error',
        notificationId,
        errorMessage: error?.message || 'Unable to publish SOS alert.'
      });
    });
  }, [clearSosDeliveryStatus, clientRole, enqueueChangePackages, getNextLogicalTimestamp, markTimingLineDirty, markTimingSectionDirty, removePendingSosAlert, setLocalStageSosLevel, setSosDeliveryStatus, suppressNextLocalSetupTimingCapture]);

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
      pilotsTelemetry: getPilotTelemetrySnapshot(),
      categories: loadFromStorage('rally_categories', []),
      stages: loadFromStorage('rally_stages', []),
      times: loadSplitStageTimingMapFromStorage('rally_times_stage_', 'rally_times').map,
      arrivalTimes: loadFromStorage('rally_arrival_times', {}),
      startTimes: loadFromStorage('rally_start_times', {}),
      realStartTimes: loadFromStorage('rally_real_start_times', {}),
      sourceFinishTime: loadFromStorage(SOURCE_FINISH_TIME_STORAGE_KEY, {}),
      sourceLapTime: loadFromStorage(SOURCE_LAP_TIME_STORAGE_KEY, {}),
      retiredStages: loadFromStorage('rally_retired_stages', {}),
      stageAlerts: loadFromStorage('rally_stage_alerts', {}),
      stageSos: loadFromStorage('rally_stage_sos', {}),
      timeDecimals: loadFromStorage('rally_time_decimals', 3),
      streamConfigs: loadFromStorage('rally_stream_configs', {}),
      globalAudio: loadFromStorage('rally_global_audio', { volume: 100, muted: false }),
      cameras: loadFromStorage('rally_cameras', []),
      externalMedia: loadFromStorage('rally_external_media', []),
      transitionImageUrl: loadFromStorage('rally_transition_image', ''),
      currentStageId: loadFromStorage('rally_current_stage', null),
      eventIsOver: loadFromStorage('rally_event_is_over', false) === true,
      eventReplayStartDate: loadFromStorage('rally_event_replay_start_date', ''),
      eventReplayStartTime: loadFromStorage('rally_event_replay_start_time', ''),
      eventReplayStageIntervalSeconds: Number(loadFromStorage('rally_event_replay_stage_interval_seconds', 0)) || 0,
      chromaKey: loadFromStorage('rally_chroma_key', '#000000'),
      mapUrl: loadFromStorage('rally_map_url', ''),
      logoUrl: loadFromStorage('rally_logo_url', ''),
      dataVersion,
      exportDate: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  }, [dataVersion, getPilotTelemetrySnapshot]);

  const importData = useCallback((jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.pilots) setPilots(normalizePilotArrayPayload(data.pilots));
      const importedPilotTelemetry = data.pilotsTelemetry || data.pilotTelemetry;
      if (importedPilotTelemetry) {
        applyPilotTelemetryState(importedPilotTelemetry);
      } else {
        applyPilotTelemetryState({});
      }
      if (data.categories) setCategories(data.categories);
      if (data.stages) setStages(data.stages);
      if (data.times) setTimes(data.times);
      if (data.arrivalTimes) setArrivalTimes(data.arrivalTimes);
      if (data.startTimes) setStartTimes(data.startTimes);
      if (data.realStartTimes) setRealStartTimes(data.realStartTimes);
      if (data.sourceFinishTime) setSourceFinishTime(data.sourceFinishTime);
      if (data.sourceLapTime) setSourceLapTime(data.sourceLapTime);
      if (data.retiredStages) setRetiredStages(data.retiredStages);
      if (data.stageAlerts) setStageAlerts(data.stageAlerts);
      if (data.stageSos) setStageSosState(data.stageSos);
      if (data.timeDecimals !== undefined) {
        setTimeDecimals(Math.min(3, Math.max(0, Math.trunc(Number(data.timeDecimals) || 0))));
      }
      if (data.streamConfigs) setStreamConfigs(data.streamConfigs);
      if (data.globalAudio) setGlobalAudio(data.globalAudio);
      if (data.cameras) setCameras(data.cameras);
      if (data.externalMedia) setExternalMedia(data.externalMedia);
      if (data.transitionImageUrl !== undefined) setTransitionImageUrl(data.transitionImageUrl);
      if (data.currentStageId !== undefined) setCurrentStageId(data.currentStageId);
      if (data.eventIsOver !== undefined) setEventIsOver(data.eventIsOver === true);
      if (data.eventReplayStartDate !== undefined) setEventReplayStartDate(data.eventReplayStartDate || '');
      if (data.eventReplayStartTime !== undefined) setEventReplayStartTime(data.eventReplayStartTime || '');
      if (data.eventReplayStageIntervalSeconds !== undefined) {
        const nextReplayStageIntervalSeconds = Number(data.eventReplayStageIntervalSeconds);
        setEventReplayStageIntervalSeconds(Number.isFinite(nextReplayStageIntervalSeconds) && nextReplayStageIntervalSeconds >= 0 ? Math.trunc(nextReplayStageIntervalSeconds) : 0);
      }
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
  }, [applyPilotTelemetryState, setArrivalTimes, setCategories, setCameras, setChromaKey, setCurrentStageId, setEventIsOver, setEventName, setEventReplayStartDate, setEventReplayStartTime, setExternalMedia, setGlobalAudio, setLapTimes, setLogoUrl, setMapUrl, setPilots, setPositions, setRealStartTimes, setRetiredStages, setSourceFinishTime, setSourceLapTime, setStageAlerts, setStageSos, setStagePilots, setStages, setStartTimes, setStreamConfigs, setTimeDecimals, setTimes, setTransitionImageUrl, updateDataVersion]);

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
    setSourceFinishTime({});
    setSourceLapTime({});
    setRetiredStages({});
    setStageAlerts({});
    setStageSosState({});
    setMapPlacemarks([]);
    applyPilotTelemetryState({});
    setDebugDate('');
    setTimeDecimals(3);
    setStreamConfigs({});
    setCameras([]);
    setExternalMedia([]);
    setGlobalAudio({ volume: 100, muted: false });
    setCurrentStageId(null);
    setEventIsOver(false);
    setEventReplayStartDate('');
    setEventReplayStartTime('');
    setEventReplayStageIntervalSeconds(0);
    setChromaKey('#000000');
    setMapUrl('');
    setLogoUrl('');
    setTransitionImageUrl('');
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(CURRENT_SESSION_META_STORAGE_KEY);
    }
    setMetaCurrentSession(null);
    updateDataVersion('pilotTelemetry');
    updateDataVersion(ALL_STORAGE_DOMAINS);
  }, [applyPilotTelemetryState, setArrivalTimes, setCameras, setCategories, setChromaKey, setCurrentStageId, setEventIsOver, setEventName, setEventReplayStageIntervalSeconds, setEventReplayStartDate, setEventReplayStartTime, setExternalMedia, setGlobalAudio, setLapTimes, setLogoUrl, setMapPlacemarks, setMapUrl, setPilots, setPositions, setRealStartTimes, setRetiredStages, setSourceFinishTime, setSourceLapTime, setStageAlerts, setStageSos, setStagePilots, setStages, setStartTimes, setStreamConfigs, setTimeDecimals, setTimes, setTransitionImageUrl, updateDataVersion]);

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
    sourceFinishTime,
    sourceLapTime,
    retiredStages,
    stageAlerts,
    mapPlacemarks,
    debugDate,
    displayIdsInSetup,
    timeDecimals,
    streamConfigs,
    globalAudio,
    cameras,
    currentStageId,
    eventIsOver,
    eventReplayStartDate,
    eventReplayStartTime,
    eventReplayStageIntervalSeconds,
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
    wsLastReceivedAt,
    wsLastSentAt,
    wsReceivedPulse,
    wsSentPulse,
    wsRole,
    wsPublishSections,
    wsDataIsCurrent,
    wsHasSnapshotBootstrap,
    wsSyncState,
    wsLatestSnapshotAt,
    wsLastSnapshotGeneratedAt,
    wsLastSnapshotReceivedAt,
    wsInstanceId,
    wsOwnership,
    pendingSosAlerts,
    clientRole,
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
    setDisplayIdsInSetup,
    setTimeDecimals,
    setChromaKey,
    setMapUrl,
    setLogoUrl,
    setTransitionImageUrl,
    setCurrentStageId,
    setEventIsOver,
    setEventReplayStartDate,
    setEventReplayStartTime,
    setEventReplayStageIntervalSeconds,
    setGlobalAudio,
    // CRUD operations
    addPilot,
    updatePilot,
    setPilotCurrentStage,
    syncPilotCurrentStageFromTelemetry,
    getPilotCurrentStage,
    setPilotTelemetry,
    getPilotTelemetry,
    getPersistedPilotTelemetry,
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
    removeMapPlacemark,
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
    removeLapTimeColumn,
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
    connectSyncChannel,
    disconnectSyncChannel,
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
    eventIsOver,
    eventReplayStartDate,
    eventReplayStartTime,
    eventReplayStageIntervalSeconds,
    chromaKey,
    logoUrl,
    transitionImageUrl,
    externalMedia,
    setTimeDecimals,
    setChromaKey,
    setLogoUrl,
    setTransitionImageUrl,
    setEventIsOver,
    setEventReplayStartDate,
    setEventReplayStartTime,
    setEventReplayStageIntervalSeconds,
    addPilot,
    updatePilot,
    setPilotCurrentStage,
    syncPilotCurrentStageFromTelemetry,
    getPilotCurrentStage,
    setPilotTelemetry,
    getPilotTelemetry,
    getPersistedPilotTelemetry,
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
    eventIsOver,
    eventReplayStartDate,
    eventReplayStartTime,
    eventReplayStageIntervalSeconds,
    chromaKey,
    logoUrl,
    transitionImageUrl,
    externalMedia,
    setTimeDecimals,
    setChromaKey,
    setLogoUrl,
    setTransitionImageUrl,
    setEventIsOver,
    setEventReplayStartDate,
    setEventReplayStartTime,
    setEventReplayStageIntervalSeconds,
    addPilot,
    updatePilot,
    setPilotCurrentStage,
    syncPilotCurrentStageFromTelemetry,
    getPilotCurrentStage,
    setPilotTelemetry,
    getPilotTelemetry,
    getPersistedPilotTelemetry,
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
    eventIsOver,
    eventReplayStartDate,
    eventReplayStartTime,
    eventReplayStageIntervalSeconds,
    updateStage
  }), [categories, currentStageId, eventIsOver, eventReplayStartDate, eventReplayStartTime, eventReplayStageIntervalSeconds, pilots, stages, updateStage]);

  const timingValue = useMemo(() => ({
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    sourceFinishTime,
    sourceLapTime,
    lapTimes,
    positions,
    stagePilots,
    retiredStages,
    stageAlerts,
    stageSos,
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
    removeLapTimeColumn,
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
    isStageAlert,
    setStageSos,
    isStageSos
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
    sourceFinishTime,
    sourceLapTime,
    retiredStages,
    selectAllPilotsInStage,
    setArrivalTime,
    setLapTime,
    removeLapTimeColumn,
    setPosition,
    setRealStartTime,
    setRetiredFromStage,
    setStageAlert,
    setStageSos,
    setStagePilotsForStage,
    setStartTime,
    setTime,
    stageAlerts,
    stageSos,
    stagePilots,
    startTimes,
    timeDecimals,
    times,
    togglePilotInStage,
    isStageSos
  ]);

  const wsValue = useMemo(() => ({
    wsEnabled,
    wsChannelKey,
    wsConnectionStatus,
    wsError,
    wsLastMessageAt,
    wsLastReceivedAt,
    wsLastSentAt,
    wsReceivedPulse,
    wsSentPulse,
    wsRole,
    wsPublishSections,
    wsDataIsCurrent,
    wsHasSnapshotBootstrap,
    wsSyncState,
    wsLatestSnapshotAt,
    wsLastSnapshotGeneratedAt,
    wsLastSnapshotReceivedAt,
    wsInstanceId,
    wsOwnership,
    pendingSosAlerts,
    sosDeliveryByLine,
    clientRole,
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
    getSosDeliveryStatus,
    connectSyncChannel,
    disconnectSyncChannel,
    generateNewChannelKey,
    setClientRole,
    requestTimingLineSync,
    acknowledgeSosAlert
  }), [
    acknowledgeSosAlert,
    clientRole,
    connectSyncChannel,
    disconnectSyncChannel,
    dirtySetupSections,
    dirtyTimingSections,
    generateNewChannelKey,
    getSosDeliveryStatus,
    lastSetupEditAt,
    lastSetupSyncAt,
    lastTimesAckAt,
    lastTimesAckedEditAt,
    lastTimesEditAt,
    lastTimesSyncAt,
    latestSnapshotVersion,
    lineSyncResults,
    pendingSosAlerts,
    sosDeliveryByLine,
    requestTimingLineSync,
    setClientRole,
    wsChannelKey,
    wsConnectionStatus,
    wsEnabled,
    wsError,
    wsLastMessageAt,
    wsLastReceivedAt,
    wsLastSentAt,
    wsReceivedPulse,
    wsSentPulse,
    wsPublishSections,
    wsDataIsCurrent,
    wsHasSnapshotBootstrap,
    wsSyncState,
    wsLatestSnapshotAt,
    wsLastSnapshotGeneratedAt,
    wsLastSnapshotReceivedAt,
    wsInstanceId,
    wsOwnership,
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
