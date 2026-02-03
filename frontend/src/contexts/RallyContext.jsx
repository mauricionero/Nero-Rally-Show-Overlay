import React, { createContext, useContext, useState, useEffect } from 'react';

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
  const [pilots, setPilots] = useState(() => loadFromStorage('rally_pilots', []));
  const [categories, setCategories] = useState(() => loadFromStorage('rally_categories', []));
  const [stages, setStages] = useState(() => loadFromStorage('rally_stages', []));
  const [times, setTimes] = useState(() => loadFromStorage('rally_times', {}));
  const [arrivalTimes, setArrivalTimes] = useState(() => loadFromStorage('rally_arrival_times', {}));
  const [startTimes, setStartTimes] = useState(() => loadFromStorage('rally_start_times', {}));
  const [currentStageId, setCurrentStageId] = useState(() => loadFromStorage('rally_current_stage', null));
  const [chromaKey, setChromaKey] = useState(() => loadFromStorage('rally_chroma_key', '#000000'));
  const [currentScene, setCurrentScene] = useState(1);
  const [dataVersion, setDataVersion] = useState(() => loadFromStorage('rally_data_version', Date.now()));

  const updateDataVersion = () => {
    const newVersion = Date.now();
    setDataVersion(newVersion);
    localStorage.setItem('rally_data_version', JSON.stringify(newVersion));
  };

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

  const exportData = () => {
    const data = {
      pilots,
      categories,
      stages,
      times,
      arrivalTimes,
      startTimes,
      currentStageId,
      chromaKey,
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
      if (data.currentStageId !== undefined) setCurrentStageId(data.currentStageId);
      if (data.chromaKey) setChromaKey(data.chromaKey);
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
    setCurrentStageId(null);
    setChromaKey('#000000');
    updateDataVersion();
  };

  const value = {
    pilots,
    stages,
    times,
    startTimes,
    currentStageId,
    chromaKey,
    currentScene,
    lastUpdate,
    setCurrentScene,
    setChromaKey,
    setCurrentStageId,
    addPilot,
    updatePilot,
    deletePilot,
    togglePilotActive,
    addStage,
    updateStage,
    deleteStage,
    setTime,
    getTime,
    setStartTime,
    getStartTime,
    exportData,
    importData,
    clearAllData
  };

  return <RallyContext.Provider value={value}>{children}</RallyContext.Provider>;
};
