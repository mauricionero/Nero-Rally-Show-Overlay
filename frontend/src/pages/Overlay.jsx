import React, { useEffect, useState } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { useSearchParams } from 'react-router-dom';
import Scene1LiveStage from '../components/scenes/Scene1LiveStage.jsx';
import Scene2TimingTower from '../components/scenes/Scene2TimingTower.jsx';
import Scene3Leaderboard from '../components/scenes/Scene3Leaderboard.jsx';
import Scene4PilotFocus from '../components/scenes/Scene4PilotFocus.jsx';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Wifi, WifiOff, X, VideoOff } from 'lucide-react';

export default function Overlay() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { 
    chromaKey, 
    currentScene, 
    setCurrentScene, 
    dataVersion,
    wsEnabled,
    wsConnectionStatus,
    wsError,
    connectWebSocket,
    disconnectWebSocket
  } = useRally();
  const [lastVersion, setLastVersion] = useState(null);
  const [heartbeatStatus, setHeartbeatStatus] = useState('normal');
  const [leftZoneWidth, setLeftZoneWidth] = useState(256);
  const [showWsPanel, setShowWsPanel] = useState(false);
  const [wsKeyInput, setWsKeyInput] = useState('');
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [hideStreams, setHideStreams] = useState(false);

  // Auto-connect if WebSocket key is in URL
  useEffect(() => {
    if (autoConnectAttempted) return;
    
    const wsKey = searchParams.get('ws');
    if (wsKey && wsConnectionStatus !== 'connected' && wsConnectionStatus !== 'connecting') {
      setAutoConnectAttempted(true);
      console.log('[Overlay] Auto-connecting with URL key:', wsKey);
      connectWebSocket(wsKey);
    }
  }, [searchParams, wsConnectionStatus, connectWebSocket, autoConnectAttempted]);

  // Hide Emergent badge on Overlay page (for clean screen capture)
  useEffect(() => {
    const badge = document.getElementById('emergent-badge');
    if (badge) {
      badge.style.display = 'none';
    }
    return () => {
      if (badge) {
        badge.style.display = 'inline-flex';
      }
    };
  }, []);

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

  // Only run localStorage heartbeat if WebSocket is not connected
  useEffect(() => {
    if (wsConnectionStatus === 'connected') {
      return; // WebSocket handles updates
    }
    
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
  }, [lastVersion, wsConnectionStatus]);

  const handleWsConnect = async () => {
    if (!wsKeyInput.trim()) return;
    const success = await connectWebSocket(wsKeyInput.trim());
    if (success) {
      setShowWsPanel(false);
      setWsKeyInput('');
    }
  };

  const renderScene = () => {
    switch (currentScene) {
      case 1:
        return <Scene1LiveStage hideStreams={hideStreams} />;
      case 2:
        return <Scene2TimingTower hideStreams={hideStreams} />;
      case 3:
        return <Scene3Leaderboard hideStreams={hideStreams} />;
      case 4:
        return <Scene4PilotFocus hideStreams={hideStreams} />;
      default:
        return <Scene1LiveStage hideStreams={hideStreams} />;
    }
  };

  const scenes = [
    { num: 1, name: t('scenes.liveStage') },
    { num: 2, name: t('scenes.timingTower') },
    { num: 3, name: t('scenes.leaderboard') },
    { num: 4, name: t('scenes.pilotFocus') }
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
          
          <div className="flex items-center gap-4">
            {/* Hide Streams Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={hideStreams}
                onCheckedChange={setHideStreams}
                className="border-zinc-500 data-[state=checked]:bg-[#FF4500] data-[state=checked]:border-[#FF4500]"
                data-testid="hide-streams-checkbox"
              />
              <span className="flex items-center gap-1 text-xs text-zinc-300 font-medium">
                <VideoOff className="w-3 h-3" />
                {t('header.hideStreams')}
              </span>
            </label>

            {/* WebSocket Status/Button */}
            <button
              onClick={() => setShowWsPanel(!showWsPanel)}
              className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-bold transition-all ${
                wsConnectionStatus === 'connected'
                  ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/50'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
              data-testid="ws-status-button"
            >
              {wsConnectionStatus === 'connected' ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span>Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>{t('header.connect')}</span>
                </>
              )}
            </button>
            
            {/* Heartbeat indicator */}
            <div className="flex items-center gap-2 min-w-[85px]">
              <div 
                className={`w-3 h-3 rounded-full transition-all duration-200 flex-shrink-0 ${
                  wsConnectionStatus === 'connected' ? 'bg-[#22C55E]' :
                  heartbeatStatus === 'checking' ? 'bg-[#22C55E] animate-pulse' :
                  heartbeatStatus === 'changed' ? 'bg-[#FF4500] animate-pulse' :
                  'bg-zinc-700'
                }`}
              />
              <span className="text-xs text-zinc-500 whitespace-nowrap">
                {wsConnectionStatus === 'connected' ? 'WebSocket' :
                 heartbeatStatus === 'changed' ? t('header.updated') : t('header.local')}
              </span>
            </div>
          </div>
        </div>
        
        {/* WebSocket Connection Panel */}
        {showWsPanel && (
          <div className="absolute top-full right-4 mt-2 p-4 bg-[#18181B] border border-zinc-700 rounded-lg shadow-xl z-50 w-80">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-sm">{t('config.liveSync')}</h3>
              <button onClick={() => setShowWsPanel(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {wsConnectionStatus === 'connected' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#22C55E] text-sm">
                  <Wifi className="w-4 h-4" />
                  <span>{t('config.connected')}</span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    disconnectWebSocket();
                    setShowWsPanel(false);
                  }}
                >
                  {t('header.disconnect')}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-zinc-400 text-xs">
                  {t('config.pasteKeyToConnect')}
                </p>
                <Input
                  value={wsKeyInput}
                  onChange={(e) => setWsKeyInput(e.target.value)}
                  placeholder={t('config.channelKeyPlaceholder')}
                  className="bg-[#09090B] border-zinc-700 text-white font-mono text-sm"
                  data-testid="ws-key-input"
                />
                {wsError && (
                  <p className="text-red-400 text-xs">{wsError}</p>
                )}
                <Button
                  className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90"
                  size="sm"
                  onClick={handleWsConnect}
                  disabled={wsConnectionStatus === 'connecting' || !wsKeyInput.trim()}
                  data-testid="ws-connect-button"
                >
                  {wsConnectionStatus === 'connecting' ? t('config.connecting') : t('header.connect')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div 
        className="absolute left-0 top-12 bottom-0 bg-black/95 border-r-2 border-[#FF4500] backdrop-blur-sm z-40 p-4 overflow-y-auto resize-x"
        style={{ width: `${leftZoneWidth}px`, minWidth: '200px', maxWidth: '400px' }}
        id="left-controls"
      >
        {/* Controls will be injected here by individual scenes */}
      </div>

      <div className="pt-12 h-full transition-all" style={{ paddingLeft: `${leftZoneWidth}px` }}>
        {renderScene()}
      </div>
    </div>
  );
}
