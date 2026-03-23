import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketProvider, generateChannelKey, parseChannelKey, PROVIDER_NAME } from '../utils/websocketProvider';
import WsMessageReceiver from '../utils/wsMessageReceiver.js';
import { getPilotScheduledStartTime } from '../utils/pilotSchedule.js';
import { compareStagesBySchedule } from '../utils/stageSchedule.js';
import { isLapRaceStageType, isManualStartStageType, isSpecialStageType } from '../utils/stageTypes.js';

const RallyContext = createContext();

export const useRally = () => {
  const context = useContext(RallyContext);
  if (!context) {
    throw new Error('useRally must be used within RallyProvider');
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

export const RallyProvider = ({ children }) => {
  // Event configuration
  const [eventName, setEventName] = useState(() => loadFromStorage('rally_event_name', ''));
  const [positions, setPositions] = useState(() => loadFromStorage('rally_positions', {})); // pilotId -> stageId -> position
  const [lapTimes, setLapTimes] = useState(() => loadFromStorage('rally_lap_times', {})); // pilotId -> stageId -> [lap1, lap2, ...]
  const [stagePilots, setStagePilots] = useState(() => loadFromStorage('rally_stage_pilots', {})); // stageId -> [pilotIds] (for lap race pilot selection)
  
  const [pilots, setPilots] = useState(() => loadFromStorage('rally_pilots', []));
  const [categories, setCategories] = useState(() => loadFromStorage('rally_categories', []));
  const [stages, setStages] = useState(() => loadFromStorage('rally_stages', []));
  const [times, setTimes] = useState(() => loadFromStorage('rally_times', {}));
  const [arrivalTimes, setArrivalTimes] = useState(() => loadFromStorage('rally_arrival_times', {}));
  const [startTimes, setStartTimes] = useState(() => loadFromStorage('rally_start_times', {}));
  const [realStartTimes, setRealStartTimes] = useState(() => loadFromStorage('rally_real_start_times', {}));
  const [retiredStages, setRetiredStages] = useState(() => loadFromStorage('rally_retired_stages', {}));
  const [stageAlerts, setStageAlerts] = useState(() => loadFromStorage('rally_stage_alerts', {}));
  const [currentStageId, setCurrentStageId] = useState(() => loadFromStorage('rally_current_stage', null));
  const [debugDate, setDebugDate] = useState(() => loadFromStorage('rally_debug_date', ''));
  const [chromaKey, setChromaKey] = useState(() => loadFromStorage('rally_chroma_key', '#000000'));
  const [mapUrl, setMapUrl] = useState(() => loadFromStorage('rally_map_url', ''));
  const [logoUrl, setLogoUrl] = useState(() => loadFromStorage('rally_logo_url', ''));
  const [externalMedia, setExternalMedia] = useState(() => loadFromStorage('rally_external_media', []));
  const [streamConfigs, setStreamConfigs] = useState(() => loadFromStorage('rally_stream_configs', {}));
  const [globalAudio, setGlobalAudio] = useState(() => loadFromStorage('rally_global_audio', { volume: 100, muted: false }));
  const [cameras, setCameras] = useState(() => loadFromStorage('rally_cameras', []));
  const [currentScene, setCurrentScene] = useState(1);
  const [dataVersion, setDataVersion] = useState(() => {
    const stored = loadFromStorage('rally_data_version', Date.now());
    return typeof stored === 'number' ? stored : Date.now();
  });

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
  const [dirtyTimingSections, setDirtyTimingSections] = useState(() => loadFromStorage('rally_dirty_times', []));
  const [lastTimesEditAt, setLastTimesEditAt] = useState(() => loadFromStorage('rally_times_last_edit_at', 0));
  const [lastTimesSyncAt, setLastTimesSyncAt] = useState(() => loadFromStorage('rally_times_last_sync_at', 0));
  const [lastTimesAckAt, setLastTimesAckAt] = useState(() => loadFromStorage('rally_times_last_ack_at', 0));
  const [lastTimesAckedEditAt, setLastTimesAckedEditAt] = useState(() => loadFromStorage('rally_times_last_acked_edit_at', 0));
  const [lineSyncResults, setLineSyncResults] = useState({});
  const timesPublishTimer = useRef(null);
  const timesPendingSections = useRef(new Set());
  const wsProvider = useRef(null);
  const wsMessageReceiver = useRef(null);
  const isPublishing = useRef(false);
  const storageReloadTimeout = useRef(null);

  // Reload all data from localStorage
  const reloadData = useCallback(() => {
    setEventName(loadFromStorage('rally_event_name', ''));
    setPositions(loadFromStorage('rally_positions', {}));
    setLapTimes(loadFromStorage('rally_lap_times', {}));
    setStagePilots(loadFromStorage('rally_stage_pilots', {}));
    setPilots(loadFromStorage('rally_pilots', []));
    setCategories(loadFromStorage('rally_categories', []));
    setStages(loadFromStorage('rally_stages', []));
    setTimes(loadFromStorage('rally_times', {}));
    setArrivalTimes(loadFromStorage('rally_arrival_times', {}));
    setStartTimes(loadFromStorage('rally_start_times', {}));
    setRealStartTimes(loadFromStorage('rally_real_start_times', {}));
    setRetiredStages(loadFromStorage('rally_retired_stages', {}));
    setStageAlerts(loadFromStorage('rally_stage_alerts', {}));
    setCurrentStageId(loadFromStorage('rally_current_stage', null));
    setDebugDate(loadFromStorage('rally_debug_date', ''));
    setChromaKey(loadFromStorage('rally_chroma_key', '#000000'));
    setMapUrl(loadFromStorage('rally_map_url', ''));
    setLogoUrl(loadFromStorage('rally_logo_url', ''));
    setExternalMedia(loadFromStorage('rally_external_media', []));
    setStreamConfigs(loadFromStorage('rally_stream_configs', {}));
    setGlobalAudio(loadFromStorage('rally_global_audio', { volume: 100, muted: false }));
    setCameras(loadFromStorage('rally_cameras', []));
    const newVersion = loadFromStorage('rally_data_version', Date.now());
    setDataVersion(typeof newVersion === 'number' ? newVersion : Date.now());
  }, [wsRole]);

  // Apply data from WebSocket message
  const applyWebSocketData = useCallback((data) => {
    if (!data) return;

    let normalizedData = data?.payload && typeof data.payload === 'object'
      ? data.payload
      : data;

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

    if (wsRole === 'setup' && isTimingPayload) {
      const nextSyncAt = typeof data?.timestamp === 'number' ? data.timestamp : Date.now();
      setLastTimesSyncAt(nextSyncAt);
      wsProvider.current?.publishTimesSyncAck?.({
        receivedAt: nextSyncAt,
        timestamp: Date.now()
      });
    }
    
    if (normalizedData.eventName !== undefined) setEventName(normalizedData.eventName);
    if (normalizedData.positions !== undefined) setPositions(normalizedData.positions);
    if (normalizedData.lapTimes !== undefined) setLapTimes(normalizedData.lapTimes);
    if (normalizedData.stagePilots !== undefined) setStagePilots(normalizedData.stagePilots);
    if (normalizedData.pilots !== undefined) setPilots(normalizedData.pilots);
    if (normalizedData.categories !== undefined) setCategories(normalizedData.categories);
    if (normalizedData.stages !== undefined) setStages(normalizedData.stages);
    if (normalizedData.times !== undefined) setTimes(normalizedData.times);
    if (normalizedData.arrivalTimes !== undefined) setArrivalTimes(normalizedData.arrivalTimes);
    if (normalizedData.startTimes !== undefined) setStartTimes(normalizedData.startTimes);
    if (normalizedData.realStartTimes !== undefined) setRealStartTimes(normalizedData.realStartTimes);
    if (normalizedData.retiredStages !== undefined) setRetiredStages(normalizedData.retiredStages);
    if (normalizedData.stageAlerts !== undefined) setStageAlerts(normalizedData.stageAlerts);
    if (normalizedData.currentStageId !== undefined) setCurrentStageId(normalizedData.currentStageId);
    if (normalizedData.debugDate !== undefined) setDebugDate(normalizedData.debugDate);
    if (normalizedData.chromaKey !== undefined) setChromaKey(normalizedData.chromaKey);
    if (normalizedData.mapUrl !== undefined) setMapUrl(normalizedData.mapUrl);
    if (normalizedData.logoUrl !== undefined) setLogoUrl(normalizedData.logoUrl);
    if (normalizedData.externalMedia !== undefined) setExternalMedia(normalizedData.externalMedia);
    if (normalizedData.streamConfigs !== undefined) setStreamConfigs(normalizedData.streamConfigs);
    if (normalizedData.globalAudio !== undefined) setGlobalAudio(normalizedData.globalAudio);
    if (normalizedData.cameras !== undefined) setCameras(normalizedData.cameras);
    
    // Re-enable publishing after a short delay
    setTimeout(() => {
      isPublishing.current = false;
    }, 100);
  }, []);

  // Listen for external data updates
  useEffect(() => {
    const handleStorageUpdate = () => {
      reloadData();
    };

    window.addEventListener('rally-reload-data', handleStorageUpdate);
    return () => window.removeEventListener('rally-reload-data', handleStorageUpdate);
  }, [reloadData]);

  useEffect(() => {
    const handleStorageEvent = (event) => {
      if (!event?.key) return;
      if (event.key !== 'rally_data_version') return;

      if (storageReloadTimeout.current) {
        window.clearTimeout(storageReloadTimeout.current);
      }

      storageReloadTimeout.current = window.setTimeout(() => {
        reloadData();
      }, 30);
    };

    window.addEventListener('storage', handleStorageEvent);
    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      if (storageReloadTimeout.current) {
        window.clearTimeout(storageReloadTimeout.current);
      }
    };
  }, [reloadData]);

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
    retiredStages,
    stageAlerts,
    currentStageId,
    debugDate,
    chromaKey,
    mapUrl,
    logoUrl,
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
    retiredStages,
    stageAlerts,
    currentStageId,
    debugDate,
    chromaKey,
    mapUrl,
    logoUrl,
    externalMedia,
    streamConfigs,
    globalAudio,
    cameras
  ]);

  const buildWebSocketMessages = useCallback((messageType = 'sync-update', allowedSections = null) => {
    const snapshot = buildWebSocketSnapshot();
    const snapshotId = createEntityId('snapshot');
    const allParts = [
      { section: 'meta', payload: {
        eventName: snapshot.eventName,
        currentStageId: snapshot.currentStageId,
        debugDate: snapshot.debugDate,
        chromaKey: snapshot.chromaKey,
        mapUrl: snapshot.mapUrl,
        logoUrl: snapshot.logoUrl,
        globalAudio: snapshot.globalAudio
      } },
      { section: 'pilots', payload: { pilots: pruneEmptyNestedValues(snapshot.pilots) } },
      { section: 'categories', payload: { categories: pruneEmptyNestedValues(snapshot.categories) } },
      { section: 'stages', payload: { stages: pruneEmptyNestedValues(snapshot.stages) } },
      { section: 'times', payload: { times: pruneEmptyNestedValues(snapshot.times) } },
      { section: 'arrivalTimes', payload: { arrivalTimes: pruneEmptyNestedValues(snapshot.arrivalTimes) } },
      { section: 'startTimes', payload: { startTimes: pruneEmptyNestedValues(snapshot.startTimes) } },
      { section: 'realStartTimes', payload: { realStartTimes: pruneEmptyNestedValues(snapshot.realStartTimes) } },
      { section: 'lapTimes', payload: { lapTimes: pruneEmptyNestedValues(snapshot.lapTimes) } },
      { section: 'positions', payload: { positions: pruneEmptyNestedValues(snapshot.positions) } },
      { section: 'stagePilots', payload: { stagePilots: pruneEmptyNestedValues(snapshot.stagePilots) } },
      { section: 'retiredStages', payload: { retiredStages: pruneEmptyNestedValues(snapshot.retiredStages) } },
      { section: 'stageAlerts', payload: { stageAlerts: pruneEmptyNestedValues(snapshot.stageAlerts) } },
      { section: 'cameras', payload: { cameras: pruneEmptyNestedValues(snapshot.cameras) } },
      { section: 'externalMedia', payload: { externalMedia: pruneEmptyNestedValues(snapshot.externalMedia) } },
      { section: 'streamConfigs', payload: { streamConfigs: pruneEmptyNestedValues(snapshot.streamConfigs) } }
    ];

    const parts = Array.isArray(allowedSections) && allowedSections.length > 0
      ? allParts.filter((part) => allowedSections.includes(part.section))
      : allParts;

    const totalParts = parts.length;

    return parts.map((part, partIndex) => ({
      messageType,
      snapshotId,
      section: part.section,
      partIndex,
      totalParts,
      payload: part.payload,
      timestamp: Date.now()
    }));
  }, [buildWebSocketSnapshot]);

  const buildWebSocketPayload = useCallback((allowedSections = null) => {
    const snapshot = buildWebSocketSnapshot();
    const allParts = {
      meta: {
        eventName: snapshot.eventName,
        currentStageId: snapshot.currentStageId,
        debugDate: snapshot.debugDate,
        chromaKey: snapshot.chromaKey,
        mapUrl: snapshot.mapUrl,
        logoUrl: snapshot.logoUrl,
        globalAudio: snapshot.globalAudio
      },
      pilots: { pilots: pruneEmptyNestedValues(snapshot.pilots) },
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

  const publishWebSocketMessages = useCallback(async (messageType = 'sync-update', allowedSections = null) => {
    if (!wsProvider.current?.isConnected) {
      return false;
    }

    const messages = buildWebSocketMessages(messageType, allowedSections);

    for (const message of messages) {
      const success = await wsProvider.current.publish(message);
      if (!success) {
        return false;
      }
    }

    return true;
  }, [buildWebSocketMessages]);

  const publishWebSocketBundle = useCallback(async (messageType = 'sync-update', allowedSections = null) => {
    if (!wsProvider.current?.isConnected) {
      return false;
    }

    const payload = buildWebSocketPayload(allowedSections);
    const data = {
      messageType,
      section: 'bundle',
      payload,
      timestamp: Date.now()
    };

    const estimatedSize = JSON.stringify(data).length;
    if (estimatedSize > 60000) {
      return publishWebSocketMessages(messageType, allowedSections);
    }

    return wsProvider.current.publish(data);
  }, [buildWebSocketPayload, publishWebSocketMessages]);

  const markTimingSectionDirty = useCallback((section) => {
    if (clientRole !== 'times') {
      return;
    }

    const now = Date.now();
    setDirtyTimingSections((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (!next.includes(section)) {
        next.push(section);
      }
      return next;
    });
    setLastTimesEditAt(now);
  }, [clientRole]);

  const clearDirtyTimingSections = useCallback(() => {
    setDirtyTimingSections([]);
  }, []);

  const publishDirtyTimingSections = useCallback(async () => {
    if (!Array.isArray(dirtyTimingSections) || dirtyTimingSections.length === 0) {
      return false;
    }

    return publishWebSocketBundle('sync-update', dirtyTimingSections);
  }, [dirtyTimingSections, publishWebSocketBundle]);

  const publishTimingSnapshot = useCallback(async () => {
    const timingSections = ['times', 'arrivalTimes', 'startTimes', 'realStartTimes', 'lapTimes', 'positions', 'stagePilots', 'retiredStages', 'stageAlerts'];
    return publishWebSocketBundle('sync-update', timingSections);
  }, [publishWebSocketBundle]);

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

    if (wsRole === 'times') {
      const sections = Array.isArray(wsPublishSections) && wsPublishSections.length > 0
        ? wsPublishSections
        : ['times', 'arrivalTimes', 'startTimes', 'realStartTimes', 'lapTimes', 'positions', 'stagePilots', 'retiredStages', 'stageAlerts'];

      sections.forEach((section) => timesPendingSections.current.add(section));

      if (timesPublishTimer.current) {
        return;
      }

      timesPublishTimer.current = window.setTimeout(async () => {
        timesPublishTimer.current = null;
        const pending = Array.from(timesPendingSections.current);
        timesPendingSections.current.clear();
        if (pending.length > 0) {
          await publishWebSocketBundle('sync-update', pending);
        }
      }, 1200);

      return;
    }

    await publishWebSocketMessages('sync-update', wsPublishSections);
  }, [wsEnabled, wsCanPublish, publishWebSocketMessages, publishWebSocketBundle, wsPublishSections, wsRole]);

  // WebSocket connection management
  const connectWebSocket = useCallback(async (channelKey, options = {}) => {
    const { valid } = parseChannelKey(channelKey);
    if (!valid) {
      setWsError('Invalid channel key format');
      return false;
    }

    const canPublish = options.readOnly !== true;
    const shouldReadHistory = options.readHistory ?? !canPublish;
    const shouldRequestSnapshot = options.requestSnapshot ?? !canPublish;
    const shouldPublishSnapshot = options.publishSnapshot ?? canPublish;
    const role = options.role || 'client';
    const allowedSections = options.allowedSections ?? (
      role === 'times'
        ? ['times', 'arrivalTimes', 'startTimes', 'realStartTimes', 'lapTimes', 'positions', 'stagePilots', 'retiredStages', 'stageAlerts']
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
          onSnapshotRequest: canPublish
            ? () => {
                publishWebSocketMessages('full-snapshot', allowedSections);
              }
            : null
          ,
          onTimesSyncRequest: (payload) => {
            if (role !== 'times') return;
            const since = Number(payload?.since || 0);
            if (lastTimesEditAt > since) {
              publishTimingSnapshot();
            }
          }
          ,
          onTimesLineRequest: (payload) => {
            if (role !== 'times') return;
            const pilotId = payload?.pilotId;
            const stageId = payload?.stageId;
            if (!pilotId || !stageId) return;

            const timesStore = loadFromStorage('rally_times', {});
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

            const timesStore = loadFromStorage('rally_times', {});
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
            if (!Number.isFinite(receivedAt)) return;
            setLastTimesAckAt(Date.now());
            setLastTimesAckedEditAt(receivedAt);
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

      if (shouldPublishSnapshot) {
        await publishWebSocketMessages('full-snapshot', allowedSections);
      } else if (shouldRequestSnapshot) {
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
          publishDirtyTimingSections();
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
    publishTimingSnapshot,
    lastTimesEditAt,
    lastTimesSyncAt,
    publishWebSocketBundle
  ]);

  const disconnectWebSocket = useCallback(() => {
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

  const updateDataVersion = useCallback(() => {
    const newVersion = Date.now();
    setDataVersion(newVersion);
    localStorage.setItem('rally_data_version', JSON.stringify(newVersion));
  }, []);

  // Publish to WebSocket when data version changes
  useEffect(() => {
    if (wsEnabled && wsProvider.current?.isConnected) {
      publishToWebSocket();
    }
  }, [dataVersion, wsEnabled, publishToWebSocket]);

  useEffect(() => {
    localStorage.setItem('rally_dirty_times', JSON.stringify(dirtyTimingSections));
  }, [dirtyTimingSections]);

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
    localStorage.setItem('rally_event_name', JSON.stringify(eventName));
    updateDataVersion();
  }, [eventName]);

  useEffect(() => {
    localStorage.setItem('rally_positions', JSON.stringify(positions));
    updateDataVersion();
  }, [positions]);

  useEffect(() => {
    localStorage.setItem('rally_lap_times', JSON.stringify(lapTimes));
    updateDataVersion();
  }, [lapTimes]);

  useEffect(() => {
    localStorage.setItem('rally_stage_pilots', JSON.stringify(stagePilots));
    updateDataVersion();
  }, [stagePilots]);

  useEffect(() => {
    localStorage.setItem('rally_pilots', JSON.stringify(pilots));
    updateDataVersion();
  }, [pilots]);

  useEffect(() => {
    localStorage.setItem('rally_categories', JSON.stringify(categories));
    updateDataVersion();
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('rally_stages', JSON.stringify(stages));
    updateDataVersion();
  }, [stages]);

  useEffect(() => {
    localStorage.setItem('rally_times', JSON.stringify(times));
    updateDataVersion();
  }, [times]);

  useEffect(() => {
    localStorage.setItem('rally_arrival_times', JSON.stringify(arrivalTimes));
    updateDataVersion();
  }, [arrivalTimes]);

  useEffect(() => {
    localStorage.setItem('rally_start_times', JSON.stringify(startTimes));
    updateDataVersion();
  }, [startTimes]);

  useEffect(() => {
    localStorage.setItem('rally_real_start_times', JSON.stringify(realStartTimes));
    updateDataVersion();
  }, [realStartTimes]);

  useEffect(() => {
    localStorage.setItem('rally_retired_stages', JSON.stringify(retiredStages));
    updateDataVersion();
  }, [retiredStages]);

  useEffect(() => {
    localStorage.setItem('rally_stage_alerts', JSON.stringify(stageAlerts));
    updateDataVersion();
  }, [stageAlerts]);

  useEffect(() => {
    localStorage.setItem('rally_debug_date', JSON.stringify(debugDate));
    updateDataVersion();
  }, [debugDate]);

  useEffect(() => {
    setStartTimes((prev) => {
      let changed = false;
      const next = { ...prev };

      pilots.forEach((pilot) => {
        const nextPilotTimes = { ...(next[pilot.id] || {}) };
        let pilotChanged = false;

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

          if (derivedStartTime) {
            if (currentValue !== derivedStartTime) {
              nextPilotTimes[stage.id] = derivedStartTime;
              pilotChanged = true;
            }
          } else if (currentValue) {
            delete nextPilotTimes[stage.id];
            pilotChanged = true;
          }
        });

        if (pilotChanged) {
          if (Object.keys(nextPilotTimes).length > 0) {
            next[pilot.id] = nextPilotTimes;
          } else {
            delete next[pilot.id];
          }
          changed = true;
        }
      });

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
    localStorage.setItem('rally_current_stage', JSON.stringify(currentStageId));
    updateDataVersion();
  }, [currentStageId]);

  useEffect(() => {
    localStorage.setItem('rally_chroma_key', JSON.stringify(chromaKey));
  }, [chromaKey]);

  useEffect(() => {
    localStorage.setItem('rally_map_url', JSON.stringify(mapUrl));
    updateDataVersion();
  }, [mapUrl]);

  useEffect(() => {
    localStorage.setItem('rally_logo_url', JSON.stringify(logoUrl));
    updateDataVersion();
  }, [logoUrl]);

  useEffect(() => {
    localStorage.setItem('rally_stream_configs', JSON.stringify(streamConfigs));
    updateDataVersion();
  }, [streamConfigs]);

  useEffect(() => {
    localStorage.setItem('rally_global_audio', JSON.stringify(globalAudio));
    updateDataVersion();
  }, [globalAudio]);

  useEffect(() => {
    localStorage.setItem('rally_cameras', JSON.stringify(cameras));
    updateDataVersion();
  }, [cameras]);

  useEffect(() => {
    localStorage.setItem('rally_external_media', JSON.stringify(externalMedia));
    updateDataVersion();
  }, [externalMedia]);

  // CRUD for external media items
  const addExternalMedia = (item) => {
    const newItem = {
      id: createEntityId('media'),
      name: item.name || '',
      url: item.url || '',
      icon: item.icon || 'Map',
      ...item
    };
    setExternalMedia(prev => [...prev, newItem]);
  };

  const updateExternalMedia = (id, updates) => {
    setExternalMedia(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const deleteExternalMedia = (id) => {
    setExternalMedia(prev => prev.filter(m => m.id !== id));
  };

  const addPilot = (pilot) => {
    const newPilot = {
      id: createEntityId('pilot'),
      name: pilot.name,
      team: pilot.team || '',
      car: pilot.car || '',
      picture: pilot.picture || '',
      streamUrl: pilot.streamUrl || '',
      categoryId: pilot.categoryId || null,
      startOrder: pilot.startOrder || 999,
      timeOffsetMinutes: pilot.timeOffsetMinutes || 0,
      isActive: false,
      ...pilot
    };
    setPilots(prev => [...prev, newPilot]);
  };

  const updatePilot = (id, updates) => {
    setPilots(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

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
      numberOfLaps: stage.numberOfLaps || 5, // For Lap Race type
      ...stage
    };
    setStages(prev => [...prev, newStage]);
    
    // For Lap Race, initialize with all pilots selected by default
    if (isLapRaceStageType(stage.type)) {
      setStagePilots(prev => ({
        ...prev,
        [newStage.id]: pilots.map(p => p.id)
      }));
    }
  };

  const updateStage = (id, updates) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

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

  // Stage pilots functions (for Lap Race pilot selection)
  const getStagePilots = (stageId) => {
    return stagePilots[stageId] || pilots.map(p => p.id);
  };

  const setStagePilotsForStage = (stageId, pilotIds) => {
    setStagePilots(prev => ({
      ...prev,
      [stageId]: pilotIds
    }));
    markTimingSectionDirty('stagePilots');
  };

  const togglePilotInStage = (stageId, pilotId) => {
    setStagePilots(prev => {
      const currentPilots = prev[stageId] || pilots.map(p => p.id);
      if (currentPilots.includes(pilotId)) {
        return { ...prev, [stageId]: currentPilots.filter(id => id !== pilotId) };
      } else {
        return { ...prev, [stageId]: [...currentPilots, pilotId] };
      }
    });
    markTimingSectionDirty('stagePilots');
  };

  const selectAllPilotsInStage = (stageId) => {
    setStagePilots(prev => ({
      ...prev,
      [stageId]: pilots.map(p => p.id)
    }));
    markTimingSectionDirty('stagePilots');
  };

  const deselectAllPilotsInStage = (stageId) => {
    setStagePilots(prev => ({
      ...prev,
      [stageId]: []
    }));
    markTimingSectionDirty('stagePilots');
  };

  // Lap times functions
  const setLapTime = (pilotId, stageId, lapIndex, time) => {
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
  };

  const getLapTime = (pilotId, stageId, lapIndex) => {
    return lapTimes[pilotId]?.[stageId]?.[lapIndex] || '';
  };

  const getPilotLapTimes = (pilotId, stageId) => {
    return lapTimes[pilotId]?.[stageId] || [];
  };

  // Position functions
  const setPosition = (pilotId, stageId, position) => {
    setPositions(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: position
      }
    }));
    markTimingSectionDirty('positions');
  };

  const getPosition = (pilotId, stageId) => {
    return positions[pilotId]?.[stageId] || null;
  };

  // Calculate positions based on lap times (for lap race / rallyX)
  const calculatePositions = (stageId, currentLap) => {
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
  };

  const setTime = (pilotId, stageId, time) => {
    setTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: time
      }
    }));
    markTimingSectionDirty('times');
  };

  const getTime = (pilotId, stageId) => {
    return times[pilotId]?.[stageId] || '';
  };

  const setArrivalTime = (pilotId, stageId, arrivalTime) => {
    setArrivalTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: arrivalTime
      }
    }));
    markTimingSectionDirty('arrivalTimes');
  };

  const getArrivalTime = (pilotId, stageId) => {
    return arrivalTimes[pilotId]?.[stageId] || '';
  };

  const setStartTime = (pilotId, stageId, startTime) => {
    setStartTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: startTime
      }
    }));
    markTimingSectionDirty('startTimes');
  };

  const getStartTime = (pilotId, stageId) => {
    return startTimes[pilotId]?.[stageId] || '';
  };

  const setRealStartTime = (pilotId, stageId, realStartTime) => {
    setRealStartTimes(prev => ({
      ...prev,
      [pilotId]: {
        ...(prev[pilotId] || {}),
        [stageId]: realStartTime
      }
    }));
    markTimingSectionDirty('realStartTimes');
  };

  const getRealStartTime = (pilotId, stageId) => {
    return realStartTimes[pilotId]?.[stageId] || '';
  };

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
  };

  const isRetiredStage = (pilotId, stageId) => {
    return !!retiredStages[pilotId]?.[stageId];
  };

  const setRetiredFromStage = (pilotId, stageId, retired) => {
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
  };

  const isStageAlert = (pilotId, stageId) => {
    return !!stageAlerts?.[pilotId]?.[stageId];
  };

  const setStageAlert = (pilotId, stageId, alert) => {
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
  };

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

  const exportData = () => {
    const data = {
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
      retiredStages,
      stageAlerts,
      streamConfigs,
      globalAudio,
      cameras,
      externalMedia,
      currentStageId,
      chromaKey,
      mapUrl,
      logoUrl,
      dataVersion,
      exportDate: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  };

  const importData = (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.pilots) setPilots(data.pilots);
      if (data.categories) setCategories(data.categories);
      if (data.stages) setStages(data.stages);
      if (data.times) setTimes(data.times);
      if (data.arrivalTimes) setArrivalTimes(data.arrivalTimes);
      if (data.startTimes) setStartTimes(data.startTimes);
      if (data.realStartTimes) setRealStartTimes(data.realStartTimes);
      if (data.retiredStages) setRetiredStages(data.retiredStages);
      if (data.stageAlerts) setStageAlerts(data.stageAlerts);
      if (data.streamConfigs) setStreamConfigs(data.streamConfigs);
      if (data.globalAudio) setGlobalAudio(data.globalAudio);
      if (data.cameras) setCameras(data.cameras);
      if (data.externalMedia) setExternalMedia(data.externalMedia);
      if (data.currentStageId !== undefined) setCurrentStageId(data.currentStageId);
      if (data.chromaKey) setChromaKey(data.chromaKey);
      if (data.mapUrl !== undefined) setMapUrl(data.mapUrl);
      if (data.logoUrl !== undefined) setLogoUrl(data.logoUrl);
      if (data.eventName !== undefined) setEventName(data.eventName);
      if (data.positions) setPositions(data.positions);
      if (data.lapTimes) setLapTimes(data.lapTimes);
      if (data.stagePilots) setStagePilots(data.stagePilots);
      updateDataVersion();
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  };

  const clearAllData = () => {
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
    setDebugDate('');
    setStreamConfigs({});
    setCameras([]);
    setExternalMedia([]);
    setGlobalAudio({ volume: 100, muted: false });
    setCurrentStageId(null);
    setChromaKey('#000000');
    setMapUrl('');
    setLogoUrl('');
    updateDataVersion();
  };

  const value = {
    // Event configuration
    eventName,
    positions,
    lapTimes,
    stagePilots,
    // Core data
    pilots,
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    realStartTimes,
    retiredStages,
    stageAlerts,
    debugDate,
    streamConfigs,
    globalAudio,
    cameras,
    currentStageId,
    chromaKey,
    mapUrl,
    logoUrl,
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
    setChromaKey,
    setMapUrl,
    setLogoUrl,
    setCurrentStageId,
    setGlobalAudio,
    // CRUD operations
    addPilot,
    updatePilot,
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

  return <RallyContext.Provider value={value}>{children}</RallyContext.Provider>;
};
