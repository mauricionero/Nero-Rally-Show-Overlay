import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useRally, useRallyMeta, useRallyTiming, useRallyWs } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { useSearchParams } from 'react-router-dom';
import TimesTab from '../components/setup/TimesTab.jsx';
import { LanguageSelectorCompact } from '../components/LanguageSelector.jsx';
import { AlertTriangle, Car, Flag, Lock, Menu, RotateCcw, Timer, Unlock } from 'lucide-react';
import WsLedStrip from '../components/WsLedStrip.jsx';
import useWsActivityCounters from '../hooks/useWsActivityCounters.js';
import SosAlertStack from '../components/SosAlertStack.jsx';
import { Checkbox } from '../components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu.jsx';
import { DEFAULT_DEBUG_FLAGS, loadDebugFlags, saveDebugFlags } from '../utils/debugFlags.js';
import { compareStagesBySchedule, formatStageScheduleRange } from '../utils/stageSchedule.js';
import {
  getStageNumberLabel,
  getStageTitle,
  isLapTimingStageType,
  isSpecialStageType,
  isTransitStageType,
  SUPER_PRIME_STAGE_TYPE
} from '../utils/stageTypes.js';

const getStageTypeIcon = (type) => {
  switch (type) {
    case 'SS': return Flag;
    case SUPER_PRIME_STAGE_TYPE: return Flag;
    case 'Lap Race': return RotateCcw;
    case 'Liaison': return Car;
    case 'Service Park': return Timer;
    default: return Flag;
  }
};

const getDisplayedStageSchedule = (stage) => {
  if (!stage) return '';

  const stageDate = stage.date || '';
  const stageTime = isTransitStageType(stage.type)
    ? formatStageScheduleRange(stage)
    : (stage.startTime || '');

  if (stageDate && stageTime) {
    return `${stageDate} ${stageTime}`;
  }

  return stageDate || stageTime;
};

const buildStageSosCountMap = (stageSos = {}) => {
  const counts = new Map();

  Object.values(stageSos || {}).forEach((pilotStages) => {
    Object.entries(pilotStages || {}).forEach(([stageId, level]) => {
      if (Number(level || 0) <= 0) {
        return;
      }

      counts.set(stageId, (counts.get(stageId) || 0) + 1);
    });
  });

  return counts;
};

const TIMES_LAST_WS_KEY_STORAGE_KEY = 'rally_times_last_ws_key';

const readStoredTimesWsKey = () => {
  try {
    return String(window.localStorage.getItem(TIMES_LAST_WS_KEY_STORAGE_KEY) || '').trim();
  } catch (error) {
    return '';
  }
};

const writeStoredTimesWsKey = (value) => {
  try {
    if (!value) {
      window.localStorage.removeItem(TIMES_LAST_WS_KEY_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(TIMES_LAST_WS_KEY_STORAGE_KEY, String(value).trim());
  } catch (error) {
    console.error('Failed to store times WebSocket key:', error);
  }
};

export default function Times() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { clearAllData } = useRally();
  const { stages } = useRallyMeta();
  const { stageSos } = useRallyTiming();
  const {
    wsEnabled,
    wsConnectionStatus,
    wsError,
    wsLastMessageAt,
    wsLastReceivedAt,
    wsLastSentAt,
    wsReceivedPulse,
    wsSentPulse,
    wsSyncState,
    wsHasSnapshotBootstrap,
    wsLatestSnapshotAt,
    wsDataIsCurrent,
    connectSyncChannel,
    disconnectSyncChannel,
    resetWsBootstrapState,
    setClientRole
  } = useRallyWs();
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [openStageIds, setOpenStageIds] = useState([]);
  const [lastAutoConnectAttemptAt, setLastAutoConnectAttemptAt] = useState(0);
  const lastTimesWsKeyRef = useRef(readStoredTimesWsKey());
  const manualSnapshotReloadInProgressRef = useRef(false);
  const [showSnapshotReloadConfirm, setShowSnapshotReloadConfirm] = useState(false);
  const [pendingSnapshotReloadKey, setPendingSnapshotReloadKey] = useState('');
  const [isSnapshotReloading, setIsSnapshotReloading] = useState(false);
  const [timesDebugFlags, setTimesDebugFlags] = useState(() => loadDebugFlags());
  const wsActivity = useWsActivityCounters({
    enabled: true,
    wsReceivedPulse,
    wsSentPulse
  });

  useEffect(() => {
    document.title = `${t('header.title')} - ${t('header.timesModule')}`;
  }, [t]);

  const sortedStages = useMemo(() => [...stages].sort(compareStagesBySchedule), [stages]);
  const stageSosCountByStageId = useMemo(() => buildStageSosCountMap(stageSos), [stageSos]);
  const selectedStage = sortedStages.find((stage) => stage.id === selectedStageId) || null;

  useEffect(() => {
    if (selectedStageId && !stages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(null);
      setOpenStageIds([]);
    }
  }, [selectedStageId, stages]);

  useEffect(() => {
    setClientRole('times');
    return () => setClientRole('client');
  }, [setClientRole]);

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key !== 'rally_debug_flags') {
        return;
      }

      setTimesDebugFlags(loadDebugFlags());
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const debugLogsEnabled = Object.values(timesDebugFlags || DEFAULT_DEBUG_FLAGS).every(Boolean);
  const lastTimesConnectErrorKeyRef = useRef('');

  const handleToggleDebugLogs = useCallback((checked) => {
    const nextFlags = Object.fromEntries(
      Object.keys(DEFAULT_DEBUG_FLAGS).map((flagKey) => [flagKey, checked === true])
    );
    setTimesDebugFlags(saveDebugFlags(nextFlags));
  }, []);

  useEffect(() => {
    if (!debugLogsEnabled) {
      return;
    }

    console.log('[Times][bootstrap][state]', {
      wsKey: String(searchParams.get('ws') || '').trim() || null,
      wsConnectionStatus,
      wsError,
      wsSyncState,
      wsDataIsCurrent,
      wsHasSnapshotBootstrap,
      wsLatestSnapshotAt,
      wsLastReceivedAt,
      wsLastMessageAt,
      wsLastSentAt
    });
  }, [
    debugLogsEnabled,
    searchParams,
    wsConnectionStatus,
    wsError,
    wsDataIsCurrent,
    wsHasSnapshotBootstrap,
    wsLatestSnapshotAt,
    wsLastMessageAt,
    wsLastReceivedAt,
    wsLastSentAt,
    wsSyncState
  ]);

  useEffect(() => {
    const wsKey = searchParams.get('ws');
    if (!wsKey || wsConnectionStatus === 'connected' || wsConnectionStatus === 'connecting') {
      return undefined;
    }

    if (manualSnapshotReloadInProgressRef.current) {
      return undefined;
    }

    const normalizedWsKey = String(wsKey || '').trim();
    const storedWsKey = String(lastTimesWsKeyRef.current || '').trim();
    const wsKeyChanged = normalizedWsKey !== storedWsKey;
    if (wsKeyChanged) {
      resetWsBootstrapState();
      lastTimesWsKeyRef.current = normalizedWsKey;
      writeStoredTimesWsKey(normalizedWsKey);
      setLastAutoConnectAttemptAt(0);
      lastTimesConnectErrorKeyRef.current = '';
    }

    if (wsConnectionStatus === 'error') {
      if (lastTimesConnectErrorKeyRef.current === normalizedWsKey) {
        return undefined;
      }

      lastTimesConnectErrorKeyRef.current = normalizedWsKey;
      if (debugLogsEnabled) {
        console.log('[Times][bootstrap][connect][error][suppress-retry]', {
          wsKey: normalizedWsKey,
          wsError,
          wsKeyChanged
        });
      }
      return undefined;
    }

    const now = Date.now();
    const retryDelayMs = wsKeyChanged
      ? 0
      : (lastAutoConnectAttemptAt > 0 ? 3000 : 0);
    const elapsedMs = now - Number(lastAutoConnectAttemptAt || 0);
    const remainingDelayMs = Math.max(0, retryDelayMs - elapsedMs);

    if (debugLogsEnabled) {
      console.log('[Times][bootstrap][connect][schedule]', {
        wsKey: normalizedWsKey,
        wsKeyChanged,
        retryDelayMs,
        remainingDelayMs,
        wsConnectionStatus
      });
    }

    const timeoutId = window.setTimeout(() => {
      setLastAutoConnectAttemptAt(Date.now());
      if (debugLogsEnabled) {
        console.log('[Times][bootstrap][connect][start]', {
          wsKey: normalizedWsKey,
          wsKeyChanged,
          resetBootstrapState: wsKeyChanged,
          readHistory: true
        });
      }
      connectSyncChannel(normalizedWsKey, { readOnly: false, readHistory: true, role: 'times', resetBootstrapState: wsKeyChanged });
    }, remainingDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [connectSyncChannel, debugLogsEnabled, lastAutoConnectAttemptAt, resetWsBootstrapState, searchParams, wsConnectionStatus, wsError]);

  const currentWsKey = String(searchParams.get('ws') || '').trim();

  const handleOpenSnapshotReloadConfirm = useCallback(() => {
    if (!currentWsKey) {
      return;
    }

    setPendingSnapshotReloadKey(currentWsKey);
    setShowSnapshotReloadConfirm(true);
  }, [currentWsKey]);

  const handleConfirmSnapshotReload = useCallback(async () => {
    const nextWsKey = String(pendingSnapshotReloadKey || '').trim();
    if (!nextWsKey || manualSnapshotReloadInProgressRef.current) {
      return;
    }

    manualSnapshotReloadInProgressRef.current = true;
    setIsSnapshotReloading(true);
    setShowSnapshotReloadConfirm(false);
    setLastAutoConnectAttemptAt(0);
    lastTimesConnectErrorKeyRef.current = '';
    disconnectSyncChannel({ manual: false, channelKey: nextWsKey });
    clearAllData();
    resetWsBootstrapState();

    if (debugLogsEnabled) {
      console.log('[Times][bootstrap][manual-reload][start]', {
        wsKey: nextWsKey,
        action: 'clear_all_and_bootstrap_from_latest_snapshot'
      });
    }

    try {
      await connectSyncChannel(nextWsKey, {
        readOnly: false,
        readHistory: true,
        role: 'times',
        resetBootstrapState: true
      });
    } finally {
      manualSnapshotReloadInProgressRef.current = false;
      setIsSnapshotReloading(false);
      setPendingSnapshotReloadKey('');
      if (debugLogsEnabled) {
        console.log('[Times][bootstrap][manual-reload][done]', {
          wsKey: nextWsKey
        });
      }
    }
  }, [clearAllData, connectSyncChannel, debugLogsEnabled, disconnectSyncChannel, pendingSnapshotReloadKey, resetWsBootstrapState]);

  const latestActivityAt = Math.max(
    Number(wsLastReceivedAt || 0),
    Number(wsLastSentAt || 0),
    Number(wsLastMessageAt || 0)
  ) || null;
  const connectionAgeMs = latestActivityAt ? Math.max(0, wsActivity.connectionNow - latestActivityAt) : null;

  const headerStage = selectedStage;
  const StageIcon = headerStage ? getStageTypeIcon(headerStage.type) : Flag;
  const headerStageHasSos = headerStage
    ? (stageSosCountByStageId.get(headerStage.id) || 0) > 0
    : false;
  const stageLabel = headerStage
    ? (isSpecialStageType(headerStage.type) ? getStageTitle(headerStage, ' - ') : headerStage.name)
    : t('times.selectStageToEdit');
  const stageSchedule = headerStage ? getDisplayedStageSchedule(headerStage) : '';
  const stageMeta = headerStage
    ? (isLapTimingStageType(headerStage.type)
      ? `${headerStage.numberOfLaps || 0} ${headerStage.type === SUPER_PRIME_STAGE_TYPE ? t('theRace.finishLinePassesShort') : t('scene3.laps').toLowerCase()}`
      : '')
    : '';

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      <AlertDialog
        open={showSnapshotReloadConfirm}
        onOpenChange={(open) => {
          setShowSnapshotReloadConfirm(open);
          if (!open) {
            setPendingSnapshotReloadKey('');
          }
        }}
      >
        <AlertDialogContent className="border-zinc-800 bg-[#111114] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('times.reloadFromLastSnapshotTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-300">
              {t('times.reloadFromLastSnapshotDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSnapshotReload}
              disabled={!pendingSnapshotReloadKey || isSnapshotReloading}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {isSnapshotReloading ? t('common.loading') : t('times.reloadFromLastSnapshot')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SosAlertStack offsetClassName="top-12" />
      <div className="fixed top-1 left-2 right-2 sm:left-auto sm:right-4 z-50 flex items-center justify-end gap-2">
        <WsLedStrip
          wsEnabled={wsEnabled}
          wsConnectionStatus={wsConnectionStatus}
          activityAgeMs={connectionAgeMs}
          counts={wsActivity}
          size="tiny"
        />
      </div>
      <div className={`sticky top-0 z-30 backdrop-blur-sm ${headerStageHasSos ? 'bg-[#2A0B0B]/95 border-b border-red-500/70' : 'bg-black/95 border-b border-[#FF4500]'}`}>
        <div className="max-w-5xl mx-auto px-2 sm:px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded border border-red-500/30 bg-[#2A0B0B] text-red-300 transition-colors hover:border-red-400 hover:bg-[#3A1111] hover:text-red-100"
                    aria-label={t('times.actionsMenu')}
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 border-red-900/50 bg-[#1A0F0F] text-red-50">
                  <DropdownMenuLabel className="text-red-100">{t('times.actionsMenu')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!currentWsKey}
                    onSelect={(event) => {
                      event.preventDefault();
                      handleOpenSnapshotReloadConfirm();
                    }}
                    className="text-red-300 focus:bg-red-950/70 focus:text-red-100"
                  >
                    <AlertTriangle className="mr-2 h-4 w-4 text-red-300" />
                    {t('times.reloadFromLastSnapshot')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <StageIcon className={`w-6 h-6 flex-shrink-0 ${headerStageHasSos ? 'text-red-400' : 'text-[#FF4500]'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs uppercase text-zinc-400">
                  {selectedStageId ? (
                    <Unlock className={`w-3.5 h-3.5 ${headerStageHasSos ? 'text-red-300' : 'text-[#22C55E]'}`} />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <span>{headerStage ? t('times.editingStage') : t('times.noStageSelected')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {stageLabel}
                  </h1>
                  {stageMeta && (
                    <span className="text-sm text-zinc-400">{stageMeta}</span>
                  )}
                  {stageSchedule && (
                    <span className="text-sm text-zinc-500">{stageSchedule}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end md:gap-1">
              <div className="flex w-full min-w-0 items-center gap-2 md:w-auto">
                <select
                  value={selectedStageId || ''}
                  onChange={(e) => {
                    const nextId = e.target.value || null;
                    setSelectedStageId(nextId);
                    setOpenStageIds(nextId ? [nextId] : []);
                  }}
                  className="bg-[#18181B] border border-zinc-700 text-white text-sm rounded px-2 py-1 w-0 flex-1 min-w-0 md:w-[240px]"
                  >
                  <option value="">{t('times.selectStageToEdit')}</option>
                  {sortedStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {getStageTitle(stage)}
                    </option>
                  ))}
                </select>
                <LanguageSelectorCompact className="h-8 !w-10 !min-w-10 !px-0 border-zinc-700 bg-[#18181B] shrink-0 justify-center" />
                <label className="flex flex-row items-start gap-1 cursor-pointer select-none w-[56px]">
                  <Checkbox
                    checked={debugLogsEnabled}
                    onCheckedChange={handleToggleDebugLogs}
                    className="border-zinc-500 data-[state=checked]:bg-[#FF4500] data-[state=checked]:border-[#FF4500]"
                    data-testid="times-debug-checkbox"
                  />
                  <span className="text-[10px] leading-tight text-zinc-300 font-medium text-left whitespace-normal break-words max-w-[48px]">
                    {t('header.debugLogs')}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-4">
        <TimesTab
          onStageSelect={setSelectedStageId}
          openStageIds={openStageIds}
          onOpenStageIdsChange={setOpenStageIds}
          showCurrentStageCard={false}
          defaultOpenStageIds={[]}
          activeStageId={selectedStageId}
          showStageAccent={false}
          compactStagePadding={true}
          tableFirstColumnWidth={90}
        />
      </div>
    </div>
  );
}
