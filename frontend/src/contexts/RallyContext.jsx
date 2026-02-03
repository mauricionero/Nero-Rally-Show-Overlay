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
  const [stages, setStages] = useState(() => loadFromStorage('rally_stages', []));
  const [times, setTimes] = useState(() => loadFromStorage('rally_times', {}));
  const [currentStageId, setCurrentStageId] = useState(() => loadFromStorage('rally_current_stage', null));
  const [chromaKey, setChromaKey] = useState(() => loadFromStorage('rally_chroma_key', '#00B140'));
  const [currentScene, setCurrentScene] = useState(1);

  useEffect(() => {
    localStorage.setItem('rally_pilots', JSON.stringify(pilots));
  }, [pilots]);

  useEffect(() => {
    localStorage.setItem('rally_stages', JSON.stringify(stages));
  }, [stages]);

  useEffect(() => {
    localStorage.setItem('rally_times', JSON.stringify(times));
  }, [times]);

  useEffect(() => {
    localStorage.setItem('rally_current_stage', JSON.stringify(currentStageId));
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
    // Also delete times for this pilot
    setTimes(prev => {
      const newTimes = { ...prev };
      delete newTimes[id];
      return newTimes;
    });
  };

  const togglePilotActive = (id) => {
    setPilots(prev => prev.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));
  };

  const addStage = (stage) => {
    const newStage = {
      id: Date.now().toString(),
      name: stage.name,
      ...stage
    };
    setStages(prev => [...prev, newStage]);
  };

  const updateStage = (id, updates) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteStage = (id) => {
    setStages(prev => prev.filter(s => s.id !== id));
    // Also delete times for this stage
    setTimes(prev => {
      const newTimes = { ...prev };
      Object.keys(newTimes).forEach(pilotId => {
        if (newTimes[pilotId]) {
          delete newTimes[pilotId][id];
        }
      });
      return newTimes;
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

  const exportData = () => {
    const data = {
      pilots,
      stages,
      times,
      currentStageId,
      chromaKey,
      exportDate: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  };

  const importData = (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.pilots) setPilots(data.pilots);
      if (data.stages) setStages(data.stages);
      if (data.times) setTimes(data.times);
      if (data.currentStageId !== undefined) setCurrentStageId(data.currentStageId);
      if (data.chromaKey) setChromaKey(data.chromaKey);
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  };

  const clearAllData = () => {
    setPilots([]);
    setStages([]);
    setTimes({});
    setCurrentStageId(null);
    setChromaKey('#00B140');
  };

  const value = {
    pilots,
    stages,
    times,
    currentStageId,
    chromaKey,
    currentScene,
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
    exportData,
    importData,
    clearAllData
  };

  return <RallyContext.Provider value={value}>{children}</RallyContext.Provider>;
};
