import React, { useMemo, useState, useEffect } from 'react';
import { useRallyMeta, useRallyTiming, useRallyWs } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { useSearchParams } from 'react-router-dom';
import TimesTab from '../components/setup/TimesTab.jsx';
import { LanguageSelectorCompact } from '../components/LanguageSelector.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Car, Cpu, Flag, Hourglass, Lock, Mail, RefreshCw, RotateCcw, Timer, Unlock, Wifi, WifiLow, WifiOff } from 'lucide-react';
import PerformanceLed from '../components/PerformanceLed.jsx';
import SosAlertStack from '../components/SosAlertStack.jsx';
import { compareStagesBySchedule, formatStageScheduleRange } from '../utils/stageSchedule.js';
import { getLedLoadRgba, getMessagesPerMinuteLoadLevel } from '../utils/ledLoadColors.js';
import {
  getStageNumberLabel,
  getStageTitle,
  isLapRaceStageType,
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

export default function Times() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { stages } = useRallyMeta();
  const { stageSos } = useRallyTiming();
  const {
    wsEnabled,
    wsConnectionStatus,
    wsLastMessageAt,
    wsLastReceivedAt,
    wsLastSentAt,
    wsReceivedPulse,
    wsSentPulse,
    wsSyncState,
    connectSyncChannel,
    setClientRole
  } = useRallyWs();
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [openStageIds, setOpenStageIds] = useState([]);
  const [connectionNow, setConnectionNow] = useState(() => Date.now());
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [messagesLastMinute, setMessagesLastMinute] = useState(0);
  const [messagesThisSecond, setMessagesThisSecond] = useState(0);
  const [receivedMessagesLastMinute, setReceivedMessagesLastMinute] = useState(0);
  const [receivedMessagesThisSecond, setReceivedMessagesThisSecond] = useState(0);
  const [sentMessagesLastMinute, setSentMessagesLastMinute] = useState(0);
  const [sentMessagesThisSecond, setSentMessagesThisSecond] = useState(0);
  const receivedMessageBucketsRef = React.useRef(new Array(60).fill(0));
  const sentMessageBucketsRef = React.useRef(new Array(60).fill(0));
  const messageBucketIndexRef = React.useRef(0);
  const receivedMessageBucketTotalRef = React.useRef(0);
  const sentMessageBucketTotalRef = React.useRef(0);
  const messageSecondAlertRef = React.useRef(false);

  const syncMessageCounters = React.useCallback(() => {
    const bucketIndex = messageBucketIndexRef.current;
    const receivedThisSecondValue = receivedMessageBucketsRef.current[bucketIndex] || 0;
    const sentThisSecondValue = sentMessageBucketsRef.current[bucketIndex] || 0;
    const totalLastMinuteValue = receivedMessageBucketTotalRef.current + sentMessageBucketTotalRef.current;
    const totalThisSecondValue = receivedThisSecondValue + sentThisSecondValue;

    setReceivedMessagesLastMinute(receivedMessageBucketTotalRef.current);
    setReceivedMessagesThisSecond(receivedThisSecondValue);
    setSentMessagesLastMinute(sentMessageBucketTotalRef.current);
    setSentMessagesThisSecond(sentThisSecondValue);
    setMessagesLastMinute(totalLastMinuteValue);
    setMessagesThisSecond(totalThisSecondValue);

    if (!messageSecondAlertRef.current && totalThisSecondValue >= 100) {
      messageSecondAlertRef.current = true;
      toast.error(
        <span className="text-white">
          Too many messages in 1 second:{' '}
          <strong className="text-red-400">{totalThisSecondValue}</strong>
        </span>
      );
    }
  }, []);

  useEffect(() => {
    document.title = `${t('header.title')} - ${t('header.times')}`;
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
    if (autoConnectAttempted) return;
    const wsKey = searchParams.get('ws');
    if (wsKey && wsConnectionStatus !== 'connected' && wsConnectionStatus !== 'connecting') {
      setAutoConnectAttempted(true);
      connectSyncChannel(wsKey, { readOnly: false, readHistory: true, role: 'times' });
    }
  }, [searchParams, wsConnectionStatus, connectSyncChannel, autoConnectAttempted]);

  useEffect(() => {
    if (!wsEnabled) return undefined;
    const interval = setInterval(() => setConnectionNow(Date.now()), 3000);
    return () => clearInterval(interval);
  }, [wsEnabled]);

  useEffect(() => {
    const tick = () => {
      const len = receivedMessageBucketsRef.current.length;
      const currentIndex = messageBucketIndexRef.current;
      const nextIndex = (currentIndex + 1) % len;
      const removedReceived = receivedMessageBucketsRef.current[nextIndex];
      const removedSent = sentMessageBucketsRef.current[nextIndex];

      if (removedReceived) {
        receivedMessageBucketTotalRef.current -= removedReceived;
      }

      if (removedSent) {
        sentMessageBucketTotalRef.current -= removedSent;
      }

      receivedMessageBucketsRef.current[nextIndex] = 0;
      sentMessageBucketsRef.current[nextIndex] = 0;
      messageBucketIndexRef.current = nextIndex;
      messageSecondAlertRef.current = false;
      syncMessageCounters();
    };

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [syncMessageCounters]);

  useEffect(() => {
    if (!wsReceivedPulse) return;
    const index = messageBucketIndexRef.current;
    receivedMessageBucketsRef.current[index] += 1;
    receivedMessageBucketTotalRef.current += 1;
    syncMessageCounters();
  }, [syncMessageCounters, wsReceivedPulse]);

  useEffect(() => {
    if (!wsSentPulse) return;
    const index = messageBucketIndexRef.current;
    sentMessageBucketsRef.current[index] += 1;
    sentMessageBucketTotalRef.current += 1;
    syncMessageCounters();
  }, [syncMessageCounters, wsSentPulse]);

  const latestActivityAt = Math.max(
    Number(wsLastReceivedAt || 0),
    Number(wsLastSentAt || 0),
    Number(wsLastMessageAt || 0)
  ) || null;
  const connectionAgeMs = latestActivityAt ? Math.max(0, connectionNow - latestActivityAt) : null;
  const connectionLed = (() => {
    if (!wsEnabled) return { color: 'bg-zinc-800 text-zinc-400 border-zinc-700', label: 'Local only', Icon: WifiOff };
    if (wsConnectionStatus === 'connecting') return { color: 'bg-[#FACC15] text-black border-transparent', label: t('config.connecting'), Icon: WifiLow };
    if (wsConnectionStatus === 'connected') return { color: 'bg-[#22C55E] text-black border-transparent', label: t('config.connected'), Icon: Wifi };
    if (wsConnectionStatus === 'suspended') return { color: 'bg-[#F97316] text-black border-transparent', label: 'Suspended', Icon: WifiLow };
    if (wsConnectionStatus === 'failed' || wsConnectionStatus === 'error') return { color: 'bg-[#EF4444] text-white border-transparent', label: 'Failed', Icon: WifiOff };
    return { color: 'bg-zinc-800 text-zinc-400 border-zinc-700', label: 'Disconnected', Icon: WifiOff };
  })();
  const activityProgress = wsEnabled && wsConnectionStatus === 'connected' && connectionAgeMs !== null
    ? Math.max(0, 1 - (connectionAgeMs / 30000))
    : 0;
  const activityLevel = getMessagesPerMinuteLoadLevel(messagesLastMinute);
  const activityLed = {
    bg: activityProgress > 0
      ? getLedLoadRgba(activityLevel, 0.2 + (0.8 * activityProgress))
      : 'rgba(63, 63, 70, 0.45)'
  };
  const syncLed = (() => {
    if (!wsEnabled || wsConnectionStatus !== 'connected') {
      return { color: 'rgba(63, 63, 70, 0.65)', label: 'Idle', description: 'No sync activity.', Icon: RefreshCw, spin: false };
    }
    if (wsSyncState === 'waiting_snapshot') {
      return { color: 'rgba(249, 115, 22, 1)', label: 'Waiting Snapshot', description: 'Waiting for a snapshot before becoming current.', Icon: Hourglass, spin: false };
    }
    if (wsSyncState === 'syncing_snapshot') {
      return { color: 'rgba(250, 204, 21, 1)', label: 'Syncing', description: 'Applying snapshot data now.', Icon: RefreshCw, spin: true };
    }
    if (wsSyncState === 'current') {
      return { color: 'rgba(34, 197, 94, 1)', label: 'Current', description: 'Snapshot sync is complete.', Icon: RefreshCw, spin: false };
    }
    return { color: 'rgba(63, 63, 70, 0.65)', label: 'Idle', description: 'No sync activity.', Icon: RefreshCw, spin: false };
  })();
  const SyncLedIcon = syncLed.Icon;
  const ConnectionLedIcon = connectionLed.Icon;
  const statusBadgeClassName = 'inline-flex items-center justify-center rounded border min-w-[16px] h-[16px] px-0.5';

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
    ? (isLapRaceStageType(headerStage.type) ? `${headerStage.numberOfLaps || 0} ${t('scene3.laps').toLowerCase()}` : '')
    : '';

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      <SosAlertStack offsetClassName="top-12" />
      <div className="fixed top-1 left-2 right-2 sm:left-auto sm:right-4 z-50 flex items-center justify-end gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`${statusBadgeClassName} ${syncLed.color}`}
                aria-label={`WebSocket sync ${syncLed.label}`}
              >
                <SyncLedIcon className={`w-2.5 h-2.5 ${syncLed.spin ? 'animate-spin' : ''}`} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
              <div className="text-xs">
                <div className="font-semibold">WebSocket Sync</div>
                <div>Status: {syncLed.label}</div>
                <div>{syncLed.description}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`${statusBadgeClassName} ${connectionLed.color}`}
                aria-label={`WebSocket ${wsConnectionStatus}`}
              >
                <ConnectionLedIcon className="w-2.5 h-2.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
              <div className="text-xs">
                <div className="font-semibold">WebSocket Connection</div>
                <div>Status: {wsConnectionStatus}</div>
                <div>{connectionLed.label}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={statusBadgeClassName}
                style={{ backgroundColor: activityLed.bg }}
                aria-label="WebSocket activity"
              >
                <Mail className={`w-2.5 h-2.5 ${activityProgress > 0 ? 'text-black/80' : 'text-zinc-400'}`} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
              <div className="text-xs">
                <div className="font-semibold">Message Activity</div>
                {connectionAgeMs !== null ? (
                  <>
                    <div>Last message: {Math.round(connectionAgeMs / 1000)}s ago</div>
                    <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> Messages last minute: {messagesLastMinute}</div>
                    <div className="flex items-center gap-1"><ArrowDown className="w-3 h-3" /> Received last minute: {receivedMessagesLastMinute}</div>
                    <div className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Sent last minute: {sentMessagesLastMinute}</div>
                    <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> Messages this second: {messagesThisSecond}</div>
                    <div className="flex items-center gap-1"><ArrowDown className="w-3 h-3" /> Received this second: {receivedMessagesThisSecond}</div>
                    <div className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Sent this second: {sentMessagesThisSecond}</div>
                    <div>LED fades from full brightness to off over 30 seconds.</div>
                  </>
                ) : (
                  <div>No WebSocket messages received yet.</div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <PerformanceLed icon={Cpu} className="min-w-[16px] h-[16px] px-0.5 rounded border border-zinc-700" iconClassName="w-2.5 h-2.5 text-black/80" />
      </div>
      <div className={`sticky top-0 z-30 backdrop-blur-sm ${headerStageHasSos ? 'bg-[#2A0B0B]/95 border-b border-red-500/70' : 'bg-black/95 border-b border-[#FF4500]'}`}>
        <div className="max-w-5xl mx-auto px-2 sm:px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
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
