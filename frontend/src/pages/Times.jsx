import React, { useMemo, useState, useEffect } from 'react';
import { useRallyMeta, useRallyTiming, useRallyWs } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { useSearchParams } from 'react-router-dom';
import TimesTab from '../components/setup/TimesTab.jsx';
import { LanguageSelectorCompact } from '../components/LanguageSelector.jsx';
import { Car, Flag, Lock, RotateCcw, Timer, Unlock } from 'lucide-react';
import WsLedStrip from '../components/WsLedStrip.jsx';
import useWsActivityCounters from '../hooks/useWsActivityCounters.js';
import SosAlertStack from '../components/SosAlertStack.jsx';
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
    connectSyncChannel,
    setClientRole
  } = useRallyWs();
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [openStageIds, setOpenStageIds] = useState([]);
  const [lastAutoConnectAttemptAt, setLastAutoConnectAttemptAt] = useState(0);
  const wsActivity = useWsActivityCounters({
    enabled: true,
    wsReceivedPulse,
    wsSentPulse
  });

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
    const wsKey = searchParams.get('ws');
    if (!wsKey || wsConnectionStatus === 'connected' || wsConnectionStatus === 'connecting') {
      return undefined;
    }

    const now = Date.now();
    const retryDelayMs = lastAutoConnectAttemptAt > 0 ? 3000 : 0;
    const elapsedMs = now - Number(lastAutoConnectAttemptAt || 0);
    const remainingDelayMs = Math.max(0, retryDelayMs - elapsedMs);

    const timeoutId = window.setTimeout(() => {
      setLastAutoConnectAttemptAt(Date.now());
      connectSyncChannel(wsKey, { readOnly: false, readHistory: true, role: 'times' });
    }, remainingDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [connectSyncChannel, lastAutoConnectAttemptAt, searchParams, wsConnectionStatus]);

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
    ? (isLapRaceStageType(headerStage.type) ? `${headerStage.numberOfLaps || 0} ${t('scene3.laps').toLowerCase()}` : '')
    : '';

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
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
