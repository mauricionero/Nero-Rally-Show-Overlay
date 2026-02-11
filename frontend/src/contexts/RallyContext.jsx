import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketProvider, generateChannelKey, parseChannelKey, PROVIDER_NAME } from '../utils/websocketProvider';

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

export const RallyProvider = ({ children }) => {
  // Race configuration
  const [raceType, setRaceType] = useState(() => loadFromStorage('rally_race_type', 'rally')); // rally, lapRace, rallyX
  const [eventName, setEventName] = useState(() => loadFromStorage('rally_event_name', ''));
  const [numberOfLaps, setNumberOfLaps] = useState(() => loadFromStorage('rally_number_of_laps', 10));
  const [raceStartTime, setRaceStartTime] = useState(() => loadFromStorage('rally_race_start_time', '')); // For lap race single start
  const [positions, setPositions] = useState(() => loadFromStorage('rally_positions', {})); // pilotId -> stageId -> position
  const [lapTimes, setLapTimes] = useState(() => loadFromStorage('rally_lap_times', {})); // pilotId -> stageId -> [lap1, lap2, ...]
  
  const [pilots, setPilots] = useState(() => loadFromStorage('rally_pilots', []));
  const [categories, setCategories] = useState(() => loadFromStorage('rally_categories', []));
  const [stages, setStages] = useState(() => loadFromStorage('rally_stages', []));
  const [times, setTimes] = useState(() => loadFromStorage('rally_times', {}));
  const [arrivalTimes, setArrivalTimes] = useState(() => loadFromStorage('rally_arrival_times', {}));
  const [startTimes, setStartTimes] = useState(() => loadFromStorage('rally_start_times', {}));
  const [currentStageId, setCurrentStageId] = useState(() => loadFromStorage('rally_current_stage', null));
  const [chromaKey, setChromaKey] = useState(() => loadFromStorage('rally_chroma_key', '#000000'));
  const [mapUrl, setMapUrl] = useState(() => loadFromStorage('rally_map_url', ''));
  const [logoUrl, setLogoUrl] = useState(() => loadFromStorage('rally_logo_url', ''));
  const [streamConfigs, setStreamConfigs] = useState(() => loadFromStorage('rally_stream_configs', {}));
  const [globalAudio, setGlobalAudio] = useState(() => loadFromStorage('rally_global_audio', { volume: 100, muted: false }));
  const [currentScene, setCurrentScene] = useState(1);
  const [dataVersion, setDataVersion] = useState(() => {
    const stored = loadFromStorage('rally_data_version', Date.now());
    return typeof stored === 'number' ? stored : Date.now();
  });

  // WebSocket state
  const [wsEnabled, setWsEnabled] = useState(() => loadFromStorage('rally_ws_enabled', false));
  const [wsChannelKey, setWsChannelKey] = useState(() => loadFromStorage('rally_ws_channel_key', ''));
  const [wsConnectionStatus, setWsConnectionStatus] = useState('disconnected'); // disconnected, connecting, connected, error
  const [wsError, setWsError] = useState(null);
  const wsProvider = useRef(null);
  const isPublishing = useRef(false);

  // Reload all data from localStorage
  const reloadData = useCallback(() => {
    setRaceType(loadFromStorage('rally_race_type', 'rally'));
    setEventName(loadFromStorage('rally_event_name', ''));
    setNumberOfLaps(loadFromStorage('rally_number_of_laps', 10));
    setRaceStartTime(loadFromStorage('rally_race_start_time', ''));
    setPositions(loadFromStorage('rally_positions', {}));
    setLapTimes(loadFromStorage('rally_lap_times', {}));
    setPilots(loadFromStorage('rally_pilots', []));
    setCategories(loadFromStorage('rally_categories', []));
    setStages(loadFromStorage('rally_stages', []));
    setTimes(loadFromStorage('rally_times', {}));
    setArrivalTimes(loadFromStorage('rally_arrival_times', {}));
    setStartTimes(loadFromStorage('rally_start_times', {}));
    setCurrentStageId(loadFromStorage('rally_current_stage', null));
    setChromaKey(loadFromStorage('rally_chroma_key', '#000000'));
    setMapUrl(loadFromStorage('rally_map_url', ''));
    setLogoUrl(loadFromStorage('rally_logo_url', ''));
    setStreamConfigs(loadFromStorage('rally_stream_configs', {}));
    setGlobalAudio(loadFromStorage('rally_global_audio', { volume: 100, muted: false }));
    const newVersion = loadFromStorage('rally_data_version', Date.now());
    setDataVersion(typeof newVersion === 'number' ? newVersion : Date.now());
  }, []);

  // Apply data from WebSocket message
  const applyWebSocketData = useCallback((data) => {
    if (!data) return;
    
    console.log('[RallyContext] Applying WebSocket data');
    
    // Prevent re-publishing when applying received data
    isPublishing.current = true;
    
    if (data.raceType) setRaceType(data.raceType);
    if (data.eventName !== undefined) setEventName(data.eventName);
    if (data.numberOfLaps !== undefined) setNumberOfLaps(data.numberOfLaps);
    if (data.raceStartTime !== undefined) setRaceStartTime(data.raceStartTime);
    if (data.positions) setPositions(data.positions);
    if (data.lapTimes) setLapTimes(data.lapTimes);
    if (data.pilots) setPilots(data.pilots);
    if (data.categories) setCategories(data.categories);
    if (data.stages) setStages(data.stages);
    if (data.times) setTimes(data.times);
    if (data.arrivalTimes) setArrivalTimes(data.arrivalTimes);
    if (data.startTimes) setStartTimes(data.startTimes);
    if (data.currentStageId !== undefined) setCurrentStageId(data.currentStageId);
    if (data.chromaKey) setChromaKey(data.chromaKey);
    if (data.mapUrl !== undefined) setMapUrl(data.mapUrl);
    if (data.logoUrl !== undefined) setLogoUrl(data.logoUrl);
    if (data.streamConfigs) setStreamConfigs(data.streamConfigs);
    if (data.globalAudio) setGlobalAudio(data.globalAudio);
    
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

  // Publish to WebSocket when data changes
  const publishToWebSocket = useCallback(async () => {
    if (!wsEnabled || !wsProvider.current?.isConnected || isPublishing.current) {
      return;
    }
    
    const data = {
      raceType,
      eventName,
      numberOfLaps,
      raceStartTime,
      positions,
      lapTimes,
      pilots,
      categories,
      stages,
      times,
      arrivalTimes,
      startTimes,
      currentStageId,
      chromaKey,
      mapUrl,
      logoUrl,
      streamConfigs,
      globalAudio,
      timestamp: Date.now()
    };
    
    await wsProvider.current.publish(data);
  }, [wsEnabled, raceType, eventName, numberOfLaps, raceStartTime, positions, lapTimes, pilots, categories, stages, times, arrivalTimes, startTimes, currentStageId, chromaKey, mapUrl, logoUrl, streamConfigs, globalAudio]);

  // WebSocket connection management
  const connectWebSocket = useCallback(async (channelKey) => {
    const { valid } = parseChannelKey(channelKey);
    if (!valid) {
      setWsError('Invalid channel key format');
      return false;
    }

    try {
      setWsConnectionStatus('connecting');
      setWsError(null);
      
      wsProvider.current = getWebSocketProvider();
      
      await wsProvider.current.connect(
        channelKey,
        // On message received
        (data) => {
          applyWebSocketData(data);
        },
        // On status change
        (status, provider, error) => {
          setWsConnectionStatus(status);
          if (error) setWsError(error);
        }
      );
      
      setWsChannelKey(channelKey);
      localStorage.setItem('rally_ws_channel_key', JSON.stringify(channelKey));
      setWsEnabled(true);
      localStorage.setItem('rally_ws_enabled', JSON.stringify(true));
      
      return true;
    } catch (error) {
      setWsConnectionStatus('error');
      setWsError(error.message);
      return false;
    }
  }, [applyWebSocketData]);

  const disconnectWebSocket = useCallback(() => {
    if (wsProvider.current) {
      wsProvider.current.disconnect();
      wsProvider.current = null;
    }
    setWsConnectionStatus('disconnected');
    setWsEnabled(false);
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

  const addPilot = (pilot) => {
    const newPilot = {
      id: Date.now().toString(),
      name: pilot.name,
      picture: pilot.picture || '',
      streamUrl: pilot.streamUrl || '',
      categoryId: pilot.categoryId || null,
      startOrder: pilot.startOrder || 999,
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
  };

  const togglePilotActive = (id) => {
    setPilots(prev => prev.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));
  };

  const addCategory = (category) => {
    const newCategory = {
      id: Date.now().toString(),
      name: category.name,
      color: category.color || '#FF4500',
      ...category
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
      id: Date.now().toString(),
      name: stage.name,
      type: stage.type || 'SS',
      ssNumber: stage.ssNumber || '',
      startTime: stage.startTime || '',
      ...stage
    };
    setStages(prev => [...prev, newStage]);
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
    setStartTimes(prev => {
      const newStartTimes = { ...prev };
      Object.keys(newStartTimes).forEach(pilotId => {
        if (newStartTimes[pilotId]) {
          delete newStartTimes[pilotId][id];
        }
      });
      return newStartTimes;
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
  };

  const getStartTime = (pilotId, stageId) => {
    return startTimes[pilotId]?.[stageId] || '';
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
      pilots,
      categories,
      stages,
      times,
      arrivalTimes,
      startTimes,
      streamConfigs,
      globalAudio,
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
      if (data.streamConfigs) setStreamConfigs(data.streamConfigs);
      if (data.globalAudio) setGlobalAudio(data.globalAudio);
      if (data.currentStageId !== undefined) setCurrentStageId(data.currentStageId);
      if (data.chromaKey) setChromaKey(data.chromaKey);
      if (data.mapUrl !== undefined) setMapUrl(data.mapUrl);
      if (data.logoUrl !== undefined) setLogoUrl(data.logoUrl);
      updateDataVersion();
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  };

  const clearAllData = () => {
    setPilots([]);
    setCategories([]);
    setStages([]);
    setTimes({});
    setArrivalTimes({});
    setStartTimes({});
    setStreamConfigs({});
    setGlobalAudio({ volume: 100, muted: false });
    setCurrentStageId(null);
    setChromaKey('#000000');
    setMapUrl('');
    setLogoUrl('');
    updateDataVersion();
  };

  const value = {
    pilots,
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    streamConfigs,
    globalAudio,
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
    // Setters
    setCurrentScene,
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
    getStreamConfig,
    setStreamConfig,
    setSoloStream,
    // Data management
    exportData,
    importData,
    clearAllData,
    reloadData,
    // WebSocket functions
    connectWebSocket,
    disconnectWebSocket,
    generateNewChannelKey
  };

  return <RallyContext.Provider value={value}>{children}</RallyContext.Provider>;
};
