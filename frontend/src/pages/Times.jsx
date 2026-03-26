import React, { useMemo, useState, useEffect } from 'react';
import { useRallyMeta, useRallyWs } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { useSearchParams } from 'react-router-dom';
import TimesTab from '../components/setup/TimesTab.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import { Flag, RotateCcw, Car, Timer, Lock, Unlock } from 'lucide-react';
import PerformanceLed from '../components/PerformanceLed.jsx';
import { compareStagesBySchedule, formatStageScheduleRange } from '../utils/stageSchedule.js';
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

export default function Times() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { stages } = useRallyMeta();
  const { wsEnabled, wsConnectionStatus, wsLastMessageAt, connectWebSocket, setClientRole } = useRallyWs();
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [openStageIds, setOpenStageIds] = useState([]);
  const [connectionNow, setConnectionNow] = useState(() => Date.now());
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [messagesLastMinute, setMessagesLastMinute] = useState(0);
  const [messagesThisSecond, setMessagesThisSecond] = useState(0);
  const messageBucketsRef = React.useRef(new Array(60).fill(0));
  const messageBucketIndexRef = React.useRef(0);
  const messageBucketTotalRef = React.useRef(0);
  const messageSecondAlertRef = React.useRef(false);

  useEffect(() => {
    document.title = `${t('header.title')} - ${t('header.times')}`;
  }, [t]);

  const sortedStages = useMemo(() => [...stages].sort(compareStagesBySchedule), [stages]);
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
      connectWebSocket(wsKey, { readOnly: false, readHistory: true, requestSnapshot: true, publishSnapshot: false, role: 'times' });
    }
  }, [searchParams, wsConnectionStatus, connectWebSocket, autoConnectAttempted]);

  useEffect(() => {
    if (!wsEnabled) return undefined;
    const interval = setInterval(() => setConnectionNow(Date.now()), 3000);
    return () => clearInterval(interval);
  }, [wsEnabled]);

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

  const connectionAgeMs = wsLastMessageAt ? Math.max(0, connectionNow - wsLastMessageAt) : null;
  const connectionLed = (() => {
    if (!wsEnabled) return { color: 'rgba(63, 63, 70, 0.65)', glow: '0 0 0 rgba(0,0,0,0)', label: 'Local only' };
    if (wsConnectionStatus === 'connecting') return { color: 'rgba(250, 204, 21, 1)', glow: '0 0 12px rgba(250, 204, 21, 0.45)', label: t('config.connecting') };
    if (wsConnectionStatus === 'connected') return { color: 'rgba(34, 197, 94, 1)', glow: '0 0 12px rgba(34, 197, 94, 0.45)', label: t('config.connected') };
    if (wsConnectionStatus === 'suspended') return { color: 'rgba(249, 115, 22, 1)', glow: '0 0 12px rgba(249, 115, 22, 0.35)', label: 'Suspended' };
    if (wsConnectionStatus === 'failed' || wsConnectionStatus === 'error') return { color: 'rgba(239, 68, 68, 1)', glow: '0 0 12px rgba(239, 68, 68, 0.35)', label: 'Failed' };
    return { color: 'rgba(63, 63, 70, 0.65)', glow: '0 0 0 rgba(0,0,0,0)', label: 'Disconnected' };
  })();
  const activityProgress = wsEnabled && wsConnectionStatus === 'connected' && connectionAgeMs !== null
    ? Math.max(0, 1 - (connectionAgeMs / 30000))
    : 0;
  const activityColor = (() => {
    if (messagesLastMinute >= 500) return '239, 68, 68';
    if (messagesLastMinute >= 250) return '249, 115, 22';
    if (messagesLastMinute >= 100) return '250, 204, 21';
    return '34, 197, 94';
  })();
  const activityLed = {
    color: activityProgress > 0
      ? `rgba(${activityColor}, ${0.2 + (0.8 * activityProgress)})`
      : 'rgba(63, 63, 70, 0.45)',
    glow: activityProgress > 0
      ? `0 0 ${8 + (18 * activityProgress)}px rgba(${activityColor}, ${0.18 + (0.5 * activityProgress)})`
      : '0 0 0 rgba(0,0,0,0)'
  };

  const headerStage = selectedStage;
  const StageIcon = headerStage ? getStageTypeIcon(headerStage.type) : Flag;
  const stageLabel = headerStage
    ? (isSpecialStageType(headerStage.type) ? getStageTitle(headerStage, ' - ') : headerStage.name)
    : t('times.selectStageToEdit');
  const stageSchedule = headerStage ? getDisplayedStageSchedule(headerStage) : '';
  const stageMeta = headerStage
    ? (isLapRaceStageType(headerStage.type) ? `${headerStage.numberOfLaps || 0} ${t('scene3.laps').toLowerCase()}` : '')
    : '';

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      <div className="fixed top-0.5 right-0.5 z-50 flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex w-2.5 h-2.5 rounded-full border border-zinc-700"
                style={{ backgroundColor: connectionLed.color, boxShadow: connectionLed.glow }}
                aria-label={`WebSocket ${wsConnectionStatus}`}
              />
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
              <span
                className="inline-flex w-2.5 h-2.5 rounded-full border border-zinc-700"
                style={{ backgroundColor: activityLed.color, boxShadow: activityLed.glow }}
                aria-label="WebSocket activity"
              />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
              <div className="text-xs">
                <div className="font-semibold">Message Activity</div>
                {connectionAgeMs !== null ? (
                  <>
                    <div>Last message: {Math.round(connectionAgeMs / 1000)}s ago</div>
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
        <PerformanceLed className="w-2.5 h-2.5" />
      </div>
      <div className="sticky top-0 z-30 bg-black/95 border-b border-[#FF4500] backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <StageIcon className="w-6 h-6 text-[#FF4500] flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase text-zinc-400">
                  {headerStage ? t('times.editingStage') : t('times.noStageSelected')}
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
              <div className="text-[11px] uppercase text-zinc-500">
                {t('times.selectStageHelp')}
              </div>
              <select
                value={selectedStageId || ''}
                onChange={(e) => {
                  const nextId = e.target.value || null;
                  setSelectedStageId(nextId);
                  setOpenStageIds(nextId ? [nextId] : []);
                }}
                className="bg-[#18181B] border border-zinc-700 text-white text-sm rounded px-2 py-1 w-full md:w-[240px]"
              >
                <option value="">{t('times.selectStageToEdit')}</option>
                {sortedStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {getStageTitle(stage)}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                {selectedStageId ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>{t('times.editingStage')}</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{t('times.noStageSelected')}</span>
                  </>
                )}
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
        />
      </div>
    </div>
  );
}
