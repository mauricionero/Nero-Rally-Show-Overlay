import React, { useEffect, useState } from 'react';
import { useRallyWs } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import { Play, VideoOff, Wifi } from 'lucide-react';
import { getLocalOverlayUrl, getWebSocketOverlayUrl, getLocalTimesUrl, getWebSocketTimesUrl } from '../utils/overlayUrls.js';
import PerformanceLed from '../components/PerformanceLed.jsx';

// app version constant
import { VERSION } from '../config/version.js';

// Tab Components
import PilotsTab from '../components/setup/PilotsTab.jsx';
import CategoriesTab from '../components/setup/CategoriesTab.jsx';
import TheRaceTab from '../components/setup/TheRaceTab.jsx';
import BulkLoadTab from '../components/setup/BulkLoadTab.jsx';
import TimesTab from '../components/setup/TimesTab.jsx';
import StreamsTab from '../components/setup/StreamsTab.jsx';
import ConfigTab from '../components/setup/ConfigTab.jsx';
import DebugTab from '../components/setup/DebugTab.jsx';
import LiveSyncTab from '../components/setup/LiveSyncTab.jsx';

export default function Setup() {
  const { t } = useTranslation();
  const { wsChannelKey, wsEnabled, wsConnectionStatus, wsLastMessageAt, setClientRole } = useRallyWs();
  const [hideStreams, setHideStreams] = useState(false);
  const [activeTab, setActiveTab] = useState('pilots');
  const [connectionNow, setConnectionNow] = useState(() => Date.now());
  const [messagesLastMinute, setMessagesLastMinute] = useState(0);
  const [messagesThisSecond, setMessagesThisSecond] = useState(0);
  const messageBucketsRef = React.useRef(new Array(60).fill(0));
  const messageBucketIndexRef = React.useRef(0);
  const messageBucketTotalRef = React.useRef(0);
  const messageSecondAlertRef = React.useRef(false);
  const hasWebSocketOverlay = wsConnectionStatus === 'connected' && Boolean(wsChannelKey);

  useEffect(() => {
    document.title = `${t('header.title')} - ${t('header.subtitle')}`;
  }, [t]);

  useEffect(() => {
    setClientRole('setup');
    return () => setClientRole('client');
  }, [setClientRole]);

  useEffect(() => {
    if (!wsEnabled) return undefined;
    const interval = setInterval(() => setConnectionNow(Date.now()), 3000);
    return () => clearInterval(interval);
  }, [wsEnabled]);

  useEffect(() => {
    if (!wsEnabled) {
      return undefined;
    }

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
  }, [wsEnabled]);

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

  const handleGoLive = (url) => {
    window.open(url, '_blank');
    toast.success('Overlay page opened in new tab');
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-white p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-5xl font-bold uppercase tracking-tighter text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {t('header.title')}
            </h1>
            <p className="text-zinc-400 mt-2">{t('header.subtitle')}</p>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-bold transition-all border ${connectionBadge.color}`}>
                          <Wifi className="w-3 h-3" />
                          <span>{connectionBadge.label}</span>
                        </div>
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
                  <TooltipProvider delayDuration={150}>
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
                  <PerformanceLed />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none rounded-xl border border-zinc-800 bg-[#18181B] px-3 py-2">
                  <Checkbox
                    checked={hideStreams}
                    onCheckedChange={setHideStreams}
                    className="border-zinc-500 data-[state=checked]:bg-[#FF4500] data-[state=checked]:border-[#FF4500]"
                    data-testid="setup-hide-streams-checkbox"
                  />
                  <span className="flex items-center gap-1 text-xs text-zinc-300 font-medium uppercase">
                    <VideoOff className="w-3 h-3" />
                    {t('header.hideStreams')}
                  </span>
                </label>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-[#18181B] p-2">
                <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {t('header.overlay')}
                </div>
                <TooltipProvider delayDuration={150}>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleGoLive(getLocalOverlayUrl())}
                      className="min-w-[108px] bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold"
                      data-testid="go-to-overlay-button"
                    >
                      <Play className="w-4 h-4" />
                      {t('header.local')}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex">
                          <Button
                            size="sm"
                            onClick={() => handleGoLive(getWebSocketOverlayUrl(wsChannelKey))}
                            disabled={!hasWebSocketOverlay}
                            className={hasWebSocketOverlay
                              ? 'min-w-[108px] bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold disabled:opacity-100'
                              : 'min-w-[108px] bg-zinc-800 hover:bg-zinc-800 text-zinc-400 uppercase font-bold disabled:opacity-100'
                            }
                            data-testid="go-to-websocket-overlay-button"
                          >
                            <Wifi className="w-4 h-4" />
                            {t('header.websocket')}
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[260px] bg-zinc-900 text-zinc-100">
                        {hasWebSocketOverlay ? t('header.websocketReadyHint') : t('header.websocketSetupHint')}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-[#18181B] p-2">
                <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {t('header.times')}
                </div>
                <TooltipProvider delayDuration={150}>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleGoLive(getLocalTimesUrl())}
                      className="min-w-[108px] bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold"
                      data-testid="go-to-times-button"
                    >
                      <Play className="w-4 h-4" />
                      {t('header.local')}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex">
                          <Button
                            size="sm"
                            onClick={() => handleGoLive(getWebSocketTimesUrl(wsChannelKey))}
                            disabled={!hasWebSocketOverlay}
                            className={hasWebSocketOverlay
                              ? 'min-w-[108px] bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold disabled:opacity-100'
                              : 'min-w-[108px] bg-zinc-800 hover:bg-zinc-800 text-zinc-400 uppercase font-bold disabled:opacity-100'
                            }
                            data-testid="go-to-websocket-times-button"
                          >
                            <Wifi className="w-4 h-4" />
                            {t('header.websocket')}
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[260px] bg-zinc-900 text-zinc-100">
                        {hasWebSocketOverlay ? t('header.websocketReadyHint') : t('header.websocketSetupHint')}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>

            </div>
            {/* version tag */}
            <div className="text-xs text-zinc-500">v{VERSION}</div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-[#18181B] border border-zinc-800">
            <TabsTrigger value="pilots" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-pilots">{t('tabs.pilots')}</TabsTrigger>
            <TabsTrigger value="categories" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-categories">{t('tabs.categories')}</TabsTrigger>
            <TabsTrigger value="therace" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-therace">{t('tabs.theRace')}</TabsTrigger>
            <TabsTrigger value="times" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-times">{t('tabs.times')}</TabsTrigger>
            <TabsTrigger value="streams" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-streams">{t('tabs.streams')}</TabsTrigger>
            <TabsTrigger value="bulkload" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-bulkload">{t('tabs.bulkLoad')}</TabsTrigger>
            <TabsTrigger value="config" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-config">{t('tabs.config')}</TabsTrigger>
            <TabsTrigger value="liveSync" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-live-sync">{t('tabs.liveSync')}</TabsTrigger>
            <TabsTrigger value="debug" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-debug">{t('tabs.debug')}</TabsTrigger>
          </TabsList>

          {activeTab === 'pilots' && (
            <TabsContent value="pilots">
              <PilotsTab hideStreams={hideStreams} />
            </TabsContent>
          )}

          {activeTab === 'categories' && (
            <TabsContent value="categories">
              <CategoriesTab />
            </TabsContent>
          )}

          {activeTab === 'therace' && (
            <TabsContent value="therace">
              <TheRaceTab />
            </TabsContent>
          )}

          {activeTab === 'times' && (
            <TabsContent value="times">
              <TimesTab />
            </TabsContent>
          )}

          {activeTab === 'streams' && (
            <TabsContent value="streams">
              <StreamsTab hideStreams={hideStreams} />
            </TabsContent>
          )}

          {activeTab === 'bulkload' && (
            <TabsContent value="bulkload">
              <BulkLoadTab />
            </TabsContent>
          )}

          {activeTab === 'config' && (
            <TabsContent value="config">
              <ConfigTab />
            </TabsContent>
          )}

          {activeTab === 'liveSync' && (
            <TabsContent value="liveSync">
              <LiveSyncTab />
            </TabsContent>
          )}

          {activeTab === 'debug' && (
            <TabsContent value="debug">
              <DebugTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
