import React, { useCallback, useEffect, useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Wifi, X, VideoOff } from 'lucide-react';
import WsLedStrip from '../components/WsLedStrip.jsx';
import useWsActivityCounters from '../hooks/useWsActivityCounters.js';
import { DEFAULT_DEBUG_FLAGS, DEBUG_FLAGS_STORAGE_KEY, loadDebugFlags, saveDebugFlags } from '../utils/debugFlags.js';
import { shouldSuppressManualWsReconnect } from '../utils/wsAutoConnect.js';

// version constant
import { VERSION } from '../config/version.js';

export default function Overlay() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { 
    chromaKey,
    transitionImageUrl,
    currentScene,
    setCurrentScene,
    wsEnabled,
    wsConnectionStatus,
    wsError,
    wsLastMessageAt,
    wsLastReceivedAt,
    wsLastSentAt,
    wsReceivedPulse,
    wsSentPulse,
    connectSyncChannel,
    disconnectSyncChannel
  } = useRally();
  const [leftZoneWidth, setLeftZoneWidth] = useState(256);
  const [showWsPanel, setShowWsPanel] = useState(false);
  const [wsKeyInput, setWsKeyInput] = useState('');
  const [lastAutoConnectAttemptAt, setLastAutoConnectAttemptAt] = useState(0);
  const [hideStreams, setHideStreams] = useState(false);
  const [overlayDebugFlags, setOverlayDebugFlags] = useState(() => loadDebugFlags());
  const defaultTransitionImageUrl = '/transition-default.png';
  const [transitionType, setTransitionType] = useState(() => {
    try {
      return localStorage.getItem('rally_transition_type') || 'fade';
    } catch (error) {
      return 'fade';
    }
  });
  const [transitionDurationMs, setTransitionDurationMs] = useState(() => {
    try {
      const stored = Number(localStorage.getItem('rally_transition_duration_ms'));
      if (!Number.isFinite(stored) || stored <= 0) return 1500;
      return Math.min(8000, Math.max(0, Math.trunc(stored)));
    } catch (error) {
      return 1500;
    }
  });
  const [transitionPhase, setTransitionPhase] = useState('idle');
  const [transitionOpacity, setTransitionOpacity] = useState(0);
  const [transitionTransform, setTransitionTransform] = useState('scale(1)');
  const transitionTimersRef = React.useRef([]);
  const transitionRafRef = React.useRef(null);
  const wsActivity = useWsActivityCounters({
    enabled: true,
    wsReceivedPulse,
    wsSentPulse
  });

  useEffect(() => {
    document.title = `${t('header.title')} - ${t('header.overlay')}`;
  }, [t]);

  useEffect(() => {
    try {
      localStorage.setItem('rally_transition_type', transitionType);
    } catch (error) {
      console.error('Failed to store transition type:', error);
    }
  }, [transitionType]);

  useEffect(() => {
    try {
      localStorage.setItem('rally_transition_duration_ms', JSON.stringify(transitionDurationMs));
    } catch (error) {
      console.error('Failed to store transition duration:', error);
    }
  }, [transitionDurationMs]);

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key !== DEBUG_FLAGS_STORAGE_KEY) {
        return;
      }

      setOverlayDebugFlags(loadDebugFlags());
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleToggleDebugLogs = (checked) => {
    const nextFlags = Object.fromEntries(
      Object.keys(DEFAULT_DEBUG_FLAGS).map((flagKey) => [flagKey, checked === true])
    );
    setOverlayDebugFlags(saveDebugFlags(nextFlags));
  };
  const debugLogsEnabled = Object.values(overlayDebugFlags || DEFAULT_DEBUG_FLAGS).every(Boolean);

  // Auto-connect if WebSocket key is in URL
  useEffect(() => {
    const readStoredChannelKey = () => {
      try {
        const storedValue = window.localStorage.getItem('rally_ws_channel_key');
        if (!storedValue) {
          return '';
        }

        const parsedValue = JSON.parse(storedValue);
        return String(parsedValue || '').trim();
      } catch (error) {
        return '';
      }
    };

    const wsKey = searchParams.get('ws') || readStoredChannelKey();
    if (!wsKey || wsConnectionStatus === 'connected' || wsConnectionStatus === 'connecting') {
      return undefined;
    }

    if (shouldSuppressManualWsReconnect(wsKey)) {
      return undefined;
    }

    const now = Date.now();
    const retryDelayMs = lastAutoConnectAttemptAt > 0 ? 3000 : 0;
    const elapsedMs = now - Number(lastAutoConnectAttemptAt || 0);
    const remainingDelayMs = Math.max(0, retryDelayMs - elapsedMs);

    const timeoutId = window.setTimeout(() => {
      setLastAutoConnectAttemptAt(Date.now());
      console.log('[Overlay] Auto-connecting with URL key:', wsKey);
      connectSyncChannel(wsKey, { readOnly: true, role: 'overlay' });
    }, remainingDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [connectSyncChannel, lastAutoConnectAttemptAt, searchParams, wsConnectionStatus]);

  const clearTransitionTimers = useCallback(() => {
    transitionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    transitionTimersRef.current = [];
    if (transitionRafRef.current !== null) {
      window.cancelAnimationFrame(transitionRafRef.current);
      transitionRafRef.current = null;
    }
  }, []);

  const requestSceneChange = useCallback((sceneNum) => {
    if (!sceneNum || sceneNum === currentScene) {
      return;
    }

    const normalizedType = transitionType || 'none';
    const normalizedDuration = Math.min(8000, Math.max(0, Number(transitionDurationMs) || 0));
    const baseHoldMs = normalizedDuration <= 0 ? 1500 : normalizedDuration;
    const phaseDurationMs = 300;
    const totalDurationMs = baseHoldMs + (phaseDurationMs * 2);

    if (normalizedType === 'none') {
      clearTransitionTimers();
      setTransitionPhase('idle');
      setCurrentScene(sceneNum);
      return;
    }

    const getInTransform = () => {
      if (normalizedType === 'wipe') return 'translateX(-12%)';
      if (normalizedType === 'slide') return 'translateY(10%)';
      return 'scale(1.02)';
    };
    const getHoldTransform = () => {
      if (normalizedType === 'wipe') return 'translateX(0)';
      if (normalizedType === 'slide') return 'translateY(0)';
      return 'scale(1)';
    };
    const getOutTransform = () => {
      if (normalizedType === 'wipe') return 'translateX(12%)';
      if (normalizedType === 'slide') return 'translateY(-10%)';
      return 'scale(1.01)';
    };

    clearTransitionTimers();
    setTransitionPhase('in');
    setTransitionOpacity(0);
    setTransitionTransform(getInTransform());
    transitionRafRef.current = window.requestAnimationFrame(() => {
      setTransitionOpacity(1);
      setTransitionTransform(getHoldTransform());
    });

    const swapDelay = phaseDurationMs + 80;
    const swapTimer = window.setTimeout(() => {
      setCurrentScene(sceneNum);
      setTransitionPhase('hold');
    }, swapDelay);
    const outTimer = window.setTimeout(() => {
      setTransitionPhase('out');
      setTransitionOpacity(0);
      setTransitionTransform(getOutTransform());
    }, phaseDurationMs + baseHoldMs);
    const finishTimer = window.setTimeout(() => {
      setTransitionPhase('idle');
      setTransitionOpacity(0);
    }, totalDurationMs);

    transitionTimersRef.current = [swapTimer, outTimer, finishTimer];
  }, [clearTransitionTimers, currentScene, setCurrentScene, transitionDurationMs, transitionType]);

  useEffect(() => {
    return () => {
      clearTransitionTimers();
      setTransitionPhase('idle');
      setTransitionOpacity(0);
      setTransitionTransform('scale(1)');
    };
  }, [clearTransitionTimers]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      const key = parseInt(e.key);
      if (key >= 1 && key <= 4) {
        requestSceneChange(key);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [requestSceneChange]);

  const latestActivityAt = Math.max(
    Number(wsLastReceivedAt || 0),
    Number(wsLastSentAt || 0),
    Number(wsLastMessageAt || 0)
  ) || null;
  const wsMessageAgeMs = latestActivityAt ? Math.max(0, wsActivity.connectionNow - latestActivityAt) : null;

  const handleWsConnect = async () => {
    if (!wsKeyInput.trim()) return;
    const success = await connectSyncChannel(wsKeyInput.trim(), { readOnly: true, role: 'overlay' });
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
  const resolvedTransitionImageUrl = transitionImageUrl?.trim()
    ? transitionImageUrl.trim()
    : defaultTransitionImageUrl;
  const transitionOptions = [
    { value: 'none', label: t('header.transitionNone') },
    { value: 'fade', label: t('header.transitionFade') },
    { value: 'wipe', label: t('header.transitionWipe') },
    { value: 'slide', label: t('header.transitionSlide') }
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
                onClick={() => requestSceneChange(scene.num)}
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
              {/* version display */}
              <div className="text-xs text-zinc-400">v{VERSION}</div>

              {/* Language Selector */}
              <LanguageSelectorCompact />

              {/* Hide Streams Checkbox */}
              <label className="flex flex-row items-start gap-1 cursor-pointer select-none w-[56px]">
                <Checkbox
                  checked={hideStreams}
                  onCheckedChange={setHideStreams}
                  className="border-zinc-500 data-[state=checked]:bg-[#FF4500] data-[state=checked]:border-[#FF4500]"
                  data-testid="hide-streams-checkbox"
                />
                <span className="text-[10px] leading-tight text-zinc-300 font-medium text-left whitespace-normal break-words max-w-[48px]">
                  <span className="inline-flex items-center gap-1">
                    <VideoOff className="w-3 h-3 flex-shrink-0" />
                    <span className="inline-block">{t('header.hide')}</span>
                  </span>
                  <span className="block">{t('header.stream')}</span>
                </span>
              </label>

              <label className="flex flex-row items-start gap-1 cursor-pointer select-none w-[56px]">
                <Checkbox
                  checked={debugLogsEnabled}
                  onCheckedChange={handleToggleDebugLogs}
                  className="border-zinc-500 data-[state=checked]:bg-[#FF4500] data-[state=checked]:border-[#FF4500]"
                  data-testid="overlay-debug-checkbox"
                />
                <span className="text-[10px] leading-tight text-zinc-300 font-medium text-left whitespace-normal break-words max-w-[48px]">
                  {t('header.debugLogs')}
                </span>
              </label>

              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {t('header.transition')}
                </span>
                <Select value={transitionType} onValueChange={setTransitionType}>
                  <SelectTrigger className="h-7 w-[92px] bg-[#09090B] border-zinc-700 text-xs text-white">
                    <SelectValue placeholder={t('header.transition')} />
                  </SelectTrigger>
                  <SelectContent>
                    {transitionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  max="8000"
                  step="50"
                  value={transitionDurationMs}
                  onChange={(e) => {
                    const numericValue = Number(e.target.value);
                    setTransitionDurationMs(
                      Math.min(8000, Math.max(0, Number.isFinite(numericValue) ? Math.trunc(numericValue) : 0))
                    );
                  }}
                  className="h-7 w-[72px] bg-[#09090B] border-zinc-700 text-white text-xs"
                  placeholder={t('header.transitionDuration')}
                  data-testid="transition-duration-input"
                />
                <span className="text-[10px] text-zinc-500 whitespace-nowrap -ml-1">ms</span>
              </div>

              <WsLedStrip
                wsEnabled={wsEnabled}
                wsConnectionStatus={wsConnectionStatus}
                activityAgeMs={wsMessageAgeMs}
                counts={wsActivity}
                size="tiny"
                onClick={() => setShowWsPanel((prev) => !prev)}
              />
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
                    disconnectSyncChannel({ manual: true });
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
        <div className="relative h-full w-full overflow-hidden">
          {renderScene()}
          {transitionPhase !== 'idle' && transitionType !== 'none' && (
            <div className="absolute inset-0 z-30 pointer-events-none">
              <div
                className="overlay-transition-modal"
                style={{
                  transitionDuration: '300ms',
                  opacity: transitionOpacity,
                  transform: transitionTransform,
                  ['--transition-image']: resolvedTransitionImageUrl ? `url("${resolvedTransitionImageUrl}")` : 'none'
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
