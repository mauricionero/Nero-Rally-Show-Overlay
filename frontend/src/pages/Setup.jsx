import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRally, useRallyWs } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import { Download, Play, VideoOff, Wifi } from 'lucide-react';
import { getLocalOverlayUrl, getWebSocketOverlayUrl, getLocalTimesUrl, getWebSocketTimesUrl } from '../utils/overlayUrls.js';
import WsLedStrip from '../components/WsLedStrip.jsx';
import { LanguageSelectorCompact } from '../components/LanguageSelector.jsx';
import SosAlertStack from '../components/SosAlertStack.jsx';
import useWsActivityCounters from '../hooks/useWsActivityCounters.js';

// app version constant
import { APK_FILE_NAME, VERSION, getApkDownloadUrl } from '../config/version.js';

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
import { shouldSuppressManualWsReconnect } from '../utils/wsAutoConnect.js';

export default function Setup() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { displayIdsInSetup } = useRally();
  const {
    wsChannelKey,
    wsEnabled,
    wsConnectionStatus,
    wsLastMessageAt,
    wsLastReceivedAt,
    wsLastSentAt,
    wsReceivedPulse,
    wsSentPulse,
    wsInstanceId,
    wsOwnership,
    connectSyncChannel,
    setClientRole
  } = useRallyWs();
  const [hideStreams, setHideStreams] = useState(false);
  const [activeTab, setActiveTab] = useState('pilots');
  const [lastAutoConnectAttemptAt, setLastAutoConnectAttemptAt] = useState(0);
  const hasWebSocketOverlay = wsConnectionStatus === 'connected' && Boolean(wsChannelKey);
  const wsActivity = useWsActivityCounters({
    enabled: true,
    wsReceivedPulse,
    wsSentPulse
  });

  useEffect(() => {
    document.title = `${t('header.title')} - ${t('header.subtitle')}`;
  }, [t]);

  useEffect(() => {
    setClientRole('setup');
    return () => setClientRole('client');
  }, [setClientRole]);

  useEffect(() => {
    const wsKey = searchParams.get('ws');
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
      console.log('[Setup] Auto-connecting with URL key:', wsKey);
      connectSyncChannel(wsKey, { role: 'setup' });
    }, remainingDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [connectSyncChannel, lastAutoConnectAttemptAt, searchParams, wsConnectionStatus]);

  useEffect(() => {
    if (wsConnectionStatus !== 'connected' || !wsChannelKey) {
      return;
    }

    const currentWsKey = searchParams.get('ws');
    if (currentWsKey === wsChannelKey) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('ws', wsChannelKey);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, wsChannelKey, wsConnectionStatus]);

  const latestActivityAt = Math.max(
    Number(wsLastReceivedAt || 0),
    Number(wsLastSentAt || 0),
    Number(wsLastMessageAt || 0)
  ) || null;
  const wsMessageAgeMs = latestActivityAt ? Math.max(0, wsActivity.connectionNow - latestActivityAt) : null;
  const ownershipState = wsOwnership || {};
  const isPrimaryOwnership = !!ownershipState?.ownerId
    && !!wsInstanceId
    && ownershipState.ownerId === wsInstanceId;
  const ownershipLabel = wsConnectionStatus !== 'connected'
    ? t('header.ownershipOffline')
    : isPrimaryOwnership || ownershipState?.hasOwnership
      ? t('header.ownershipPrimary')
      : t('header.ownershipReplica');
  const handleGoLive = (url) => {
    window.open(url, '_blank');
    toast.success('Overlay page opened in new tab');
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-white p-6">
      <SosAlertStack offsetClassName="top-14" />
      <div className="fixed top-0.5 right-0.5 z-50">
        <div className="flex items-center gap-2 rounded-md border border-zinc-800/80 bg-[#111113]/88 backdrop-blur px-1.5 py-1 shadow-lg shadow-black/35">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            v{VERSION}
          </span>
          <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 border-zinc-700 bg-transparent px-2 text-[10px] text-zinc-200 hover:bg-zinc-800 hover:text-white">
            <a href={getApkDownloadUrl()} download={APK_FILE_NAME} title={APK_FILE_NAME}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">APK</span>
            </a>
          </Button>
          <WsLedStrip
            wsEnabled={wsEnabled}
            wsConnectionStatus={wsConnectionStatus}
            activityAgeMs={wsMessageAgeMs}
            counts={wsActivity}
            ownership={{
              isPrimary: isPrimaryOwnership || ownershipState?.hasOwnership,
              title: t('header.ownershipTitle'),
              label: ownershipLabel,
              description: t('header.ownershipDescription'),
              ownerId: ownershipState?.ownerId || 'none'
            }}
            size="compact"
          />
        </div>
      </div>
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-3">
            <img
              src="/images/nrs-control-zone-logo.png"
              alt="NRS Control Zone"
              className="h-[72px] w-auto object-contain shrink-0"
            />
            <div>
              <h1 className="text-5xl font-bold uppercase tracking-tighter text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {t('header.title')}
              </h1>
            <p className="text-zinc-400 mt-2">{t('header.subtitle')}</p>
          </div>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-start gap-3">
              <div className="flex flex-wrap items-start justify-end gap-2">
                <div className="rounded-xl border border-zinc-800 bg-[#18181B] p-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none px-1 py-1.5">
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
                  <div className="pt-1">
                    <LanguageSelectorCompact className="h-9 border-zinc-700 bg-[#09090B] px-3" />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-[#18181B] p-2">
                <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {t('header.overlay')}
                </div>
                <TooltipProvider delayDuration={150}>
                  <div className="flex flex-col gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleGoLive(getLocalOverlayUrl())}
                      className="h-8 min-w-[102px] px-2 bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold text-[11px]"
                      data-testid="go-to-overlay-button"
                    >
                      <Play className="w-3.5 h-3.5" />
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
                              ? 'h-8 min-w-[102px] px-2 bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold text-[11px] disabled:opacity-100'
                              : 'h-8 min-w-[102px] px-2 bg-zinc-800 hover:bg-zinc-800 text-zinc-400 uppercase font-bold text-[11px] disabled:opacity-100'
                            }
                            data-testid="go-to-websocket-overlay-button"
                          >
                            <Wifi className="w-3.5 h-3.5" />
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
                  <div className="flex flex-col gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleGoLive(getLocalTimesUrl())}
                      className="h-8 min-w-[102px] px-2 bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold text-[11px]"
                      data-testid="go-to-times-button"
                    >
                      <Play className="w-3.5 h-3.5" />
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
                              ? 'h-8 min-w-[102px] px-2 bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold text-[11px] disabled:opacity-100'
                              : 'h-8 min-w-[102px] px-2 bg-zinc-800 hover:bg-zinc-800 text-zinc-400 uppercase font-bold text-[11px] disabled:opacity-100'
                            }
                            data-testid="go-to-websocket-times-button"
                          >
                            <Wifi className="w-3.5 h-3.5" />
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
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-2">
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
            <TabsContent value="pilots" className="mt-0">
              <PilotsTab hideStreams={hideStreams} wsChannelKey={wsChannelKey} />
            </TabsContent>
          )}

          {activeTab === 'categories' && (
            <TabsContent value="categories" className="mt-0">
              <CategoriesTab />
            </TabsContent>
          )}

          {activeTab === 'therace' && (
            <TabsContent value="therace" className="mt-0">
              <TheRaceTab />
            </TabsContent>
          )}

          {activeTab === 'times' && (
            <TabsContent value="times" className="mt-0">
              <TimesTab tableFirstColumnWidth={90} showDebugIds={displayIdsInSetup} />
            </TabsContent>
          )}

          {activeTab === 'streams' && (
            <TabsContent value="streams" className="mt-0">
              <StreamsTab hideStreams={hideStreams} />
            </TabsContent>
          )}

          {activeTab === 'bulkload' && (
            <TabsContent value="bulkload" className="mt-0">
              <BulkLoadTab />
            </TabsContent>
          )}

          {activeTab === 'config' && (
            <TabsContent value="config" className="mt-0">
              <ConfigTab />
            </TabsContent>
          )}

          {activeTab === 'liveSync' && (
            <TabsContent value="liveSync" className="mt-0">
              <LiveSyncTab />
            </TabsContent>
          )}

          {activeTab === 'debug' && (
            <TabsContent value="debug" className="mt-0">
              <DebugTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
