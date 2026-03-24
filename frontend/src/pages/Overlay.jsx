import React, { useEffect, useState } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { useSearchParams } from 'react-router-dom';
import Scene1LiveStage from '../components/scenes/Scene1LiveStage.jsx';
import Scene2TimingTower from '../components/scenes/Scene2TimingTower.jsx';
import Scene3Leaderboard from '../components/scenes/Scene3Leaderboard.jsx';
import Scene4PilotFocus from '../components/scenes/Scene4PilotFocus.jsx';
import { LanguageSelectorCompact } from '../components/LanguageSelector.jsx';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import { Wifi, WifiOff, X, VideoOff } from 'lucide-react';

// version constant
import { VERSION } from '../config/version.js';

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
    wsLastMessageAt,
    connectWebSocket,
    disconnectWebSocket
  } = useRally();
  const [heartbeatStatus, setHeartbeatStatus] = useState('normal');
  const [leftZoneWidth, setLeftZoneWidth] = useState(256);
  const [showWsPanel, setShowWsPanel] = useState(false);
  const [wsKeyInput, setWsKeyInput] = useState('');
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [hideStreams, setHideStreams] = useState(false);
  const [connectionNow, setConnectionNow] = useState(() => Date.now());
  const [messagesLastMinute, setMessagesLastMinute] = useState(0);
  const [messagesThisSecond, setMessagesThisSecond] = useState(0);
  const messageBucketsRef = React.useRef(new Array(60).fill(0));
  const messageBucketIndexRef = React.useRef(0);
  const messageBucketTotalRef = React.useRef(0);
  const messageSecondAlertRef = React.useRef(false);

  useEffect(() => {
    document.title = `${t('header.title')} - ${t('header.overlay')}`;
  }, [t]);

  // Auto-connect if WebSocket key is in URL
  useEffect(() => {
    if (autoConnectAttempted) return;
    
    const wsKey = searchParams.get('ws');
    if (wsKey && wsConnectionStatus !== 'connected' && wsConnectionStatus !== 'connecting') {
      setAutoConnectAttempted(true);
      console.log('[Overlay] Auto-connecting with URL key:', wsKey);
      connectWebSocket(wsKey, { readOnly: true, role: 'overlay' });
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

  // Keep a localStorage heartbeat active as a safety net for same-browser tabs,
  // even when WebSocket is connected.
  useEffect(() => {
    const interval = setInterval(() => {
      setHeartbeatStatus('checking');
      
      try {
        const storedVersionStr = localStorage.getItem('rally_data_version');
        const storedVersion = storedVersionStr ? JSON.parse(storedVersionStr) : null;
        
        if (storedVersion && typeof storedVersion === 'number' && storedVersion !== dataVersion) {
          setHeartbeatStatus('changed');
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
  }, [dataVersion]);

  useEffect(() => {
    const interval = setInterval(() => setConnectionNow(Date.now()), 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const tick = () => {
      const buckets = messageBucketsRef.current;
      const len = buckets.length;
      const currentIndex = messageBucketIndexRef.current;
      const nextIndex = (currentIndex + 1) % len;
      const removed = buckets[nextIndex];
      if (removed) {
        messageBucketTotalRef.current -= removed;
      }
      buckets[nextIndex] = 0;
      messageBucketIndexRef.current = nextIndex;
      setMessagesLastMinute(messageBucketTotalRef.current);
      setMessagesThisSecond(buckets[nextIndex]);
      messageSecondAlertRef.current = false;
    };

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!wsLastMessageAt) return;
    const buckets = messageBucketsRef.current;
    const index = messageBucketIndexRef.current;
    buckets[index] += 1;
    messageBucketTotalRef.current += 1;
    setMessagesLastMinute(messageBucketTotalRef.current);
    setMessagesThisSecond(buckets[index]);
    if (!messageSecondAlertRef.current && buckets[index] >= 100) {
      messageSecondAlertRef.current = true;
      toast.error(
        <span className="text-white">
          Too many messages in 1 second:{' '}
          <strong className="text-red-400">{buckets[index]}</strong>
        </span>
      );
    }
  }, [wsLastMessageAt]);

  const wsMessageAgeMs = wsLastMessageAt ? Math.max(0, connectionNow - wsLastMessageAt) : null;
  const connectionBadge = (() => {
    if (!wsEnabled) return { color: 'bg-zinc-800 text-zinc-400 border-zinc-700', label: t('header.connect') };
    if (wsConnectionStatus === 'connecting') return { color: 'bg-[#FACC15] text-black border-transparent', label: t('config.connecting') };
    if (wsConnectionStatus === 'connected') return { color: 'bg-[#22C55E] text-black border-transparent', label: 'Live' };
    if (wsConnectionStatus === 'suspended') return { color: 'bg-[#F97316] text-black border-transparent', label: 'Suspended' };
    if (wsConnectionStatus === 'failed' || wsConnectionStatus === 'error') return { color: 'bg-[#EF4444] text-white border-transparent', label: 'Failed' };
    return { color: 'bg-zinc-800 text-zinc-400 border-zinc-700', label: t('header.connect') };
  })();
  const activityProgress = wsEnabled && wsConnectionStatus === 'connected' && wsMessageAgeMs !== null
    ? Math.max(0, 1 - (wsMessageAgeMs / 30000))
    : 0;
  const activityColor = (() => {
    if (messagesLastMinute >= 500) return '239, 68, 68';
    if (messagesLastMinute >= 250) return '249, 115, 22';
    if (messagesLastMinute >= 100) return '250, 204, 21';
    return '34, 197, 94';
  })();
  const activityGlow = activityProgress > 0
    ? `0 0 ${8 + (18 * activityProgress)}px rgba(${activityColor}, ${0.18 + (0.5 * activityProgress)})`
    : '0 0 0 rgba(34, 197, 94, 0)';
  const activityFill = activityProgress > 0
    ? `rgba(${activityColor}, ${0.2 + (0.8 * activityProgress)})`
    : 'rgba(63, 63, 70, 0.45)';

  const handleWsConnect = async () => {
    if (!wsKeyInput.trim()) return;
    const success = await connectWebSocket(wsKeyInput.trim(), { readOnly: true, role: 'overlay' });
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
            {/* version display */}
            <div className="text-xs text-zinc-400">v{VERSION}</div>

            {/* Language Selector */}
            <LanguageSelectorCompact />

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
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setShowWsPanel(!showWsPanel)}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-bold transition-all border ${connectionBadge.color}`}
                      data-testid="ws-status-button"
                    >
                      {wsConnectionStatus === 'connected' ? (
                        <>
                          <Wifi className="w-3 h-3" />
                          <span>{connectionBadge.label}</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-3 h-3" />
                          <span>{connectionBadge.label}</span>
                        </>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
                    <div className="text-xs">
                      <div className="font-semibold">WebSocket Connection</div>
                      <div>Status: {wsConnectionStatus}</div>
                      <div>State badge only reflects socket connection state.</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="w-3 h-3 rounded-full border border-zinc-700 transition-all duration-500"
                      style={{
                        backgroundColor: activityFill,
                        boxShadow: activityGlow
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
                    <div className="text-xs">
                      <div className="font-semibold">Message Activity</div>
                      {wsMessageAgeMs !== null ? (
                        <>
                          <div>Last message: {Math.round(wsMessageAgeMs / 1000)}s ago</div>
                          <div>Messages last minute: {messagesLastMinute}</div>
                          <div>Messages this second: {messagesThisSecond}</div>
                          <div>LED fades from full brightness to off over 30 seconds.</div>
                        </>
                      ) : (
                        <div>No WebSocket messages received yet.</div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
