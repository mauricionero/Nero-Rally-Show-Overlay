import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, Download, Gauge, Radio, Sparkles, VideoOff } from 'lucide-react';
import { useRally, useRallyWs } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { useSecondAlignedClock } from '../hooks/useSecondAlignedClock.js';
import useWsActivityCounters from '../hooks/useWsActivityCounters.js';
import { Checkbox } from '../components/ui/checkbox';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { LanguageSelectorCompact } from '../components/LanguageSelector.jsx';
import WsLedStrip from '../components/WsLedStrip.jsx';
import { StreamPlayer } from '../components/StreamPlayer.jsx';
import PilotTelemetryHud from '../components/PilotTelemetryHud.jsx';
import { getPilotTelemetryForId } from '../utils/pilotIdentity.js';
import { getWebSocketPilotTelemetryUrl } from '../utils/overlayUrls.js';
import {
  buildPilotTelemetryBatScript,
  buildPilotTelemetryLaunchArtifacts,
  downloadTextFile,
  requestPilotTelemetryLaunchToken
} from '../utils/pilotTelemetryLaunch.js';

const PREFERRED_STAGE_REGISTRY_PATHS = [
  '/pilot-telemetry-stage-registry.json',
  '/docs/pilot-telemetry-stage-registry.json'
];

const loadPilotTelemetryStageRegistry = async () => {
  for (const path of PREFERRED_STAGE_REGISTRY_PATHS) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) {
        continue;
      }

      const json = await response.json();
      return (json && typeof json === 'object') ? json : {};
    } catch {
      // Try the next path.
    }
  }

  return {};
};

export default function PilotTelemetry() {
  const { t } = useTranslation();
  const { pilots, stages, pilotTelemetryByPilotId } = useRally();
  const {
    wsChannelKey,
    wsConnectionStatus,
    wsLastReceivedAt,
    wsLastMessageAt,
    wsLastSentAt,
    wsReceivedPulse,
    wsSentPulse,
    connectSyncChannel
  } = useRallyWs();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hideStream, setHideStream] = useState(false);
  const [isDownloadingLauncher, setIsDownloadingLauncher] = useState(false);
  const [lastAutoConnectAttemptAt, setLastAutoConnectAttemptAt] = useState(0);
  const [stageRegistry, setStageRegistry] = useState({});
  const pageNow = useSecondAlignedClock();
  const wsActivity = useWsActivityCounters({
    enabled: true,
    wsReceivedPulse,
    wsSentPulse
  });

  const queryPilotId = searchParams.get('pilotId') || '';
  const resolvedChannelKey = searchParams.get('ws') || wsChannelKey || '';

  const selectedPilot = useMemo(() => (
    queryPilotId ? pilots.find((pilot) => pilot.id === queryPilotId) || null : null
  ), [pilots, queryPilotId]);

  const selectedTelemetry = getPilotTelemetryForId(pilotTelemetryByPilotId, selectedPilot?.id);
  const pageUrl = useMemo(() => (
    queryPilotId
      ? getWebSocketPilotTelemetryUrl(resolvedChannelKey, queryPilotId)
      : getWebSocketPilotTelemetryUrl(resolvedChannelKey)
  ), [queryPilotId, resolvedChannelKey]);
  const displayRpm = Number.isFinite(Number(selectedTelemetry?.rpmReal))
    ? Number(selectedTelemetry.rpmReal).toFixed(1)
    : (Number.isFinite(Number(selectedTelemetry?.rpmPercentage))
      ? `${Number(selectedTelemetry.rpmPercentage).toFixed(1)}%`
      : (Number.isFinite(Number(selectedTelemetry?.rpm)) ? Number(selectedTelemetry.rpm).toFixed(1) : '--'));
  const displayGear = Number.isFinite(Number(selectedTelemetry?.gear))
    ? (Number(selectedTelemetry.gear) === -1 ? 'R' : `${Math.trunc(Number(selectedTelemetry.gear))}`)
    : '--';
  const displayDistance = Number.isFinite(Number(selectedTelemetry?.distance))
    ? `${Number(selectedTelemetry.distance).toFixed(3)}`
    : '--';
  const displayLatLong = selectedTelemetry?.latLong || '--';

  const launchArtifacts = useMemo(() => buildPilotTelemetryLaunchArtifacts({
    channelKey: resolvedChannelKey,
    pilot: selectedPilot,
    stages,
    gameStageRegistry: stageRegistry,
    telemetryUrl: pageUrl
  }), [pageUrl, resolvedChannelKey, selectedPilot, stageRegistry, stages]);

  useEffect(() => {
    document.title = selectedPilot
      ? `${t('header.title')} - ${selectedPilot.name} ${t('pilotTelemetry.title')}`
      : `${t('header.title')} - ${t('pilotTelemetry.title')}`;
  }, [selectedPilot, t]);

  useEffect(() => {
    let isMounted = true;

    const loadStageRegistry = async () => {
      const nextStageRegistry = await loadPilotTelemetryStageRegistry();
      if (isMounted) {
        setStageRegistry(nextStageRegistry);
      }
    };

    loadStageRegistry();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const wsKey = searchParams.get('ws') || wsChannelKey;
    if (!wsKey || wsConnectionStatus === 'connected' || wsConnectionStatus === 'connecting') {
      return undefined;
    }

    const now = Date.now();
    const retryDelayMs = lastAutoConnectAttemptAt > 0 ? 3000 : 0;
    const elapsedMs = now - Number(lastAutoConnectAttemptAt || 0);
    const remainingDelayMs = Math.max(0, retryDelayMs - elapsedMs);

    const timeoutId = window.setTimeout(() => {
      setLastAutoConnectAttemptAt(Date.now());
      connectSyncChannel(wsKey, { readOnly: true, role: 'overlay' });
    }, remainingDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [connectSyncChannel, lastAutoConnectAttemptAt, searchParams, wsChannelKey, wsConnectionStatus]);

  useEffect(() => {
    if (wsConnectionStatus !== 'connected' || !wsChannelKey) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    if (nextParams.get('ws') !== wsChannelKey) {
      nextParams.set('ws', wsChannelKey);
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, wsChannelKey, wsConnectionStatus]);

  const latestActivityAt = Math.max(
    Number(wsLastReceivedAt || 0),
    Number(wsLastSentAt || 0),
    Number(wsLastMessageAt || 0)
  ) || null;
  const connectionAgeMs = latestActivityAt ? Math.max(0, wsActivity.connectionNow - latestActivityAt) : null;

  const handleCopyPageUrl = async () => {
    await navigator.clipboard.writeText(pageUrl);
    toast.success(t('pilotTelemetry.pageUrlCopied'));
  };

  const handleDownloadLauncher = async () => {
    if (!launchArtifacts) {
      toast.error(t('pilotTelemetry.connectWebSocketFirst'));
      return;
    }

    try {
      setIsDownloadingLauncher(true);
      const registryForLauncher = Object.keys(stageRegistry || {}).length > 0
        ? stageRegistry
        : await loadPilotTelemetryStageRegistry();
      if (Object.keys(stageRegistry || {}).length === 0 && Object.keys(registryForLauncher || {}).length > 0) {
        setStageRegistry(registryForLauncher);
      }
      const artifactsForDownload = buildPilotTelemetryLaunchArtifacts({
        channelKey: resolvedChannelKey,
        pilot: selectedPilot,
        stages,
        gameStageRegistry: registryForLauncher,
        telemetryUrl: pageUrl
      });

      if (!artifactsForDownload) {
        toast.error(t('pilotTelemetry.connectWebSocketFirst'));
        return;
      }

      const tokenDetails = await requestPilotTelemetryLaunchToken({
        channelId: artifactsForDownload.channelId,
        pilotId: artifactsForDownload.pilotId
      });

      const batContent = buildPilotTelemetryBatScript({
        tokenDetails,
        channelId: artifactsForDownload.channelId,
        pilotId: artifactsForDownload.pilotId,
        pilotName: artifactsForDownload.pilotName,
        stageCatalog: artifactsForDownload.stageCatalog,
        gameStageRegistry: artifactsForDownload.gameStageRegistry,
        telemetryUrl: pageUrl
      });

      downloadTextFile(artifactsForDownload.batFileName, batContent);
      toast.success(t('pilotTelemetry.launcherDownloaded', { fileName: artifactsForDownload.batFileName }));
    } catch (error) {
      console.error('Could not build pilot launcher:', error);
      toast.error(t('pilotTelemetry.tokenRequestFailed'));
    } finally {
      setIsDownloadingLauncher(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      <div className="fixed top-1 left-2 right-2 sm:left-auto sm:right-4 z-50 flex items-center justify-end gap-2">
        <WsLedStrip
          wsEnabled={Boolean(resolvedChannelKey)}
          wsConnectionStatus={wsConnectionStatus}
          activityAgeMs={connectionAgeMs}
          counts={wsActivity}
          size="tiny"
        />
      </div>

      <div className="sticky top-0 z-30 border-b border-[#FF4500] bg-black/95 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-zinc-500 uppercase tracking-[0.24em] text-xs">
                <Gauge className="h-4 w-4 text-[#FF4500]" />
                {t('pilotTelemetry.title')}
              </div>
              <h1 className="text-4xl font-bold uppercase tracking-tighter text-white truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {selectedPilot ? selectedPilot.name : t('pilotTelemetry.title')}
              </h1>
              <p className="text-sm text-zinc-400 max-w-3xl">
                {t('pilotTelemetry.description')}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-[#18181B] px-3 py-2 text-sm text-white">
                <Checkbox
                  checked={hideStream}
                  onCheckedChange={setHideStream}
                  className="border-zinc-500 data-[state=checked]:bg-[#FF4500] data-[state=checked]:border-[#FF4500]"
                />
                <span className="flex items-center gap-1 text-xs font-medium uppercase text-zinc-300">
                  <VideoOff className="h-3 w-3" />
                  {t('pilotTelemetry.hideStream')}
                </span>
              </label>
              <LanguageSelectorCompact className="h-9 border-zinc-700 bg-[#18181B] px-3" />
              <Button
                type="button"
                variant="outline"
                className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800"
                onClick={handleCopyPageUrl}
                disabled={!pageUrl || !selectedPilot}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t('common.copy')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_420px]">
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl shadow-black/40">
              <div className="aspect-video relative">
                {!hideStream && selectedPilot?.streamUrl ? (
                  <StreamPlayer
                    pilotId={selectedPilot.id}
                    streamUrl={selectedPilot.streamUrl}
                    name={selectedPilot.name}
                    className="absolute inset-0"
                    forceMute
                    forceFullscreen
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,69,0,0.22),transparent_45%),linear-gradient(180deg,#111113_0%,#09090B_100%)]" />
                )}

                {selectedPilot && (
                  <PilotTelemetryHud
                    pilot={selectedPilot}
                    telemetry={selectedTelemetry}
                  />
                )}

                {!selectedPilot && (
                  <div className="absolute inset-0 flex items-center justify-center text-center px-6">
                    <div className="max-w-md space-y-3">
                      <Sparkles className="mx-auto h-10 w-10 text-[#FF4500]" />
                      <h2 className="text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {t('pilotTelemetry.pilotNotSelected')}
                      </h2>
                      <p className="text-sm text-zinc-400">
                        {t('pilotTelemetry.pilotNotSelectedDescription')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('pilotTelemetry.liveStatus')}
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  {t('pilotTelemetry.liveStatusDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
                  <div className="text-zinc-500 text-xs uppercase tracking-wide">{t('pilotTelemetry.channel')}</div>
                  <div className="font-mono text-[#FACC15] break-all">
                    {resolvedChannelKey || t('pilotTelemetry.notConnected')}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
                  <div className="text-zinc-500 text-xs uppercase tracking-wide">{t('pilotTelemetry.telemetryAge')}</div>
                  <div className="font-mono text-white">
                    {selectedTelemetry?.lastTelemetryAt
                      ? t('pilotTelemetry.secondsAgo', {
                        value: Math.max(0, Math.round((pageNow - Number(selectedTelemetry.lastTelemetryAt || 0)) / 1000))
                      })
                      : t('pilotTelemetry.waiting')}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
                  <div className="text-zinc-500 text-xs uppercase tracking-wide">{t('pilotTelemetry.speed')}</div>
                  <div className="font-mono text-white">
                    {Number.isFinite(Number(selectedTelemetry?.speed)) ? `${Number(selectedTelemetry.speed).toFixed(1)} km/h` : '--'}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
                  <div className="text-zinc-500 text-xs uppercase tracking-wide">{t('pilotTelemetry.gForce')}</div>
                  <div className="font-mono text-white">
                    {Number.isFinite(Number(selectedTelemetry?.gForce)) ? `${Number(selectedTelemetry.gForce).toFixed(2)}G` : '--'}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
                  <div className="text-zinc-500 text-xs uppercase tracking-wide">{t('pilotTelemetry.rpm')}</div>
                  <div className="font-mono text-white">{displayRpm}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
                  <div className="text-zinc-500 text-xs uppercase tracking-wide">{t('pilotTelemetry.gear')}</div>
                  <div className="font-mono text-white">{displayGear}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
                  <div className="text-zinc-500 text-xs uppercase tracking-wide">{t('pilotTelemetry.distance')}</div>
                  <div className="font-mono text-white">{displayDistance}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
                  <div className="text-zinc-500 text-xs uppercase tracking-wide">{t('pilotTelemetry.latLong')}</div>
                  <div className="font-mono text-white break-all">{displayLatLong}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('pilotTelemetry.standaloneLauncher')}
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  {t('pilotTelemetry.standaloneLauncherDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-400 space-y-2">
                  <div>
                    <span className="text-zinc-600">{t('pilotTelemetry.pilotId')}</span> <span className="font-mono text-zinc-200">{selectedPilot?.id || '--'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600">{t('pilotTelemetry.channelId')}</span> <span className="font-mono text-zinc-200">{launchArtifacts?.channelId || '--'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600">{t('pilotTelemetry.file')}</span> <span className="font-mono text-zinc-200">{launchArtifacts?.batFileName || '--'}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  className="bg-[#FF4500] hover:bg-[#FF4500]/90 text-white"
                  onClick={handleDownloadLauncher}
                  disabled={!launchArtifacts || isDownloadingLauncher}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isDownloadingLauncher ? t('common.loading') : t('pilotTelemetry.downloadLauncher')}
                </Button>
                <div className="rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-400">
                  {t('pilotTelemetry.launcherDescription')}
                </div>
                {selectedPilot?.streamUrl ? (
                  <div className="rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-400">
                    <div className="mb-2 flex items-center gap-2 text-zinc-200">
                      <Radio className="h-4 w-4 text-[#FF4500]" />
                      {t('pilotTelemetry.cameraStreamActive')}
                    </div>
                    <div className="font-mono text-zinc-500 break-all">
                      {selectedPilot.streamUrl}
                    </div>
                  </div>
                ) : selectedPilot ? (
                  <div className="rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-400">
                    {t('pilotTelemetry.noStreamConfigured')}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>

        {!selectedPilot && queryPilotId && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {t('pilotTelemetry.urlPilotMismatch')}
          </div>
        )}
      </div>
    </div>
  );
}
