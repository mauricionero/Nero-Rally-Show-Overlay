import React, { useEffect, useState } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import Scene1LiveStage from '../components/scenes/Scene1LiveStage.jsx';
import Scene2TimingTower from '../components/scenes/Scene2TimingTower.jsx';
import Scene3Leaderboard from '../components/scenes/Scene3Leaderboard.jsx';
import Scene4PilotFocus from '../components/scenes/Scene4PilotFocus.jsx';

export default function Overlay() {
  const { chromaKey, currentScene, setCurrentScene, dataVersion } = useRally();
  const [lastVersion, setLastVersion] = useState(null);
  const [heartbeatStatus, setHeartbeatStatus] = useState('normal');
  const [leftZoneWidth, setLeftZoneWidth] = useState(256);

  // Initialize lastVersion
  useEffect(() => {
    if (lastVersion === null) {
      setLastVersion(dataVersion);
    }
  }, [dataVersion, lastVersion]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      const key = parseInt(e.key);
      if (key >= 1 && key <= 4) {
        setCurrentScene(key);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [setCurrentScene]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHeartbeatStatus('checking');
      
      try {
        const storedVersionStr = localStorage.getItem('rally_data_version');
        const storedVersion = storedVersionStr ? JSON.parse(storedVersionStr) : null;
        
        if (storedVersion && typeof storedVersion === 'number' && lastVersion && storedVersion !== lastVersion) {
          setHeartbeatStatus('changed');
          setLastVersion(storedVersion);
          window.dispatchEvent(new Event('rally-reload-data'));
          setTimeout(() => setHeartbeatStatus('normal'), 1000);
        } else {
          setTimeout(() => setHeartbeatStatus('normal'), 300);
        }
      } catch (e) {
        console.error('Heartbeat error:', e);
        setHeartbeatStatus('normal');
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [lastVersion]);

  const renderScene = () => {
    switch (currentScene) {
      case 1:
        return <Scene1LiveStage />;
      case 2:
        return <Scene2TimingTower />;
      case 3:
        return <Scene3Leaderboard />;
      case 4:
        return <Scene4PilotFocus />;
      default:
        return <Scene1LiveStage />;
    }
  };

  const scenes = [
    { num: 1, name: 'Live Stage' },
    { num: 2, name: 'Timing Tower' },
    { num: 3, name: 'Leaderboard' },
    { num: 4, name: 'Pilot Focus' }
  ];

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: chromaKey }}
      data-testid="overlay-container"
    >
      <div className="absolute top-0 left-0 right-0 z-50 bg-black/95 border-b-2 border-[#FF4500] backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            {scenes.map((scene) => (
              <button
                key={scene.num}
                onClick={() => setCurrentScene(scene.num)}
                className={`px-4 py-1 rounded text-sm font-bold transition-all ${
                  currentScene === scene.num
                    ? 'bg-[#FF4500] text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
                style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                <span className="text-[#FACC15]">{scene.num}</span> {scene.name}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <div 
              className={`w-3 h-3 rounded-full transition-all duration-200 ${
                heartbeatStatus === 'checking' ? 'bg-[#22C55E] animate-pulse' :
                heartbeatStatus === 'changed' ? 'bg-[#FF4500] animate-pulse' :
                'bg-zinc-700'
              }`}
            />
            <span className="text-xs text-zinc-500">
              {heartbeatStatus === 'changed' ? 'Updated' : 'Live'}
            </span>
          </div>
        </div>
      </div>

      <div className="absolute left-0 top-12 bottom-0 w-64 bg-black/95 border-r-2 border-[#FF4500] backdrop-blur-sm z-40 p-4 overflow-y-auto" id="left-controls">
        {/* Controls will be injected here by individual scenes */}
      </div>

      <div className="pt-12 pl-64 h-full">
        {renderScene()}
      </div>
    </div>
  );
}
