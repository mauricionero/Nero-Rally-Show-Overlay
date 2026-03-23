import React, { useMemo, useState, useEffect } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { useSearchParams } from 'react-router-dom';
import TimesTab from '../components/setup/TimesTab.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Flag, RotateCcw, Car, Timer, Lock, Unlock } from 'lucide-react';
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
  const { stages, currentStageId, wsEnabled, wsConnectionStatus, wsLastMessageAt, connectWebSocket, setClientRole } = useRally();
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [openStageIds, setOpenStageIds] = useState([]);
  const [connectionNow, setConnectionNow] = useState(() => Date.now());
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);

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

  const connectionAgeMs = wsLastMessageAt ? Math.max(0, connectionNow - wsLastMessageAt) : null;
  const connectionQuality = (() => {
    if (!wsEnabled) return { color: 'bg-zinc-700', label: t('header.local') };
    if (wsConnectionStatus === 'connecting') return { color: 'bg-[#FACC15] animate-pulse', label: t('config.connecting') };
    if (wsConnectionStatus === 'connected') {
      if (connectionAgeMs === null || connectionAgeMs <= 1000) return { color: 'bg-[#22C55E]', label: 'Great' };
      if (connectionAgeMs <= 5000) return { color: 'bg-[#84CC16]', label: 'Good' };
      if (connectionAgeMs <= 15000) return { color: 'bg-[#FACC15]', label: 'Fair' };
      if (connectionAgeMs <= 30000) return { color: 'bg-[#F97316]', label: 'Poor' };
      return { color: 'bg-[#EF4444]', label: 'Bad' };
    }
    if (wsConnectionStatus === 'suspended') return { color: 'bg-[#F97316]', label: 'Suspended' };
    if (wsConnectionStatus === 'failed' || wsConnectionStatus === 'error') return { color: 'bg-[#EF4444]', label: 'Failed' };
    return { color: 'bg-zinc-700', label: 'Disconnected' };
  })();

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
                {wsEnabled && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={`ml-2 inline-flex w-2.5 h-2.5 rounded-full ${connectionQuality.color}`}
                          aria-label={`WebSocket ${wsConnectionStatus}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
                        <div className="text-xs">
                          <div className="font-semibold">WebSocket</div>
                          <div>Status: {wsConnectionStatus}</div>
                          <div>Quality: {connectionQuality.label}</div>
                          {connectionAgeMs !== null && (
                            <div>Last message: {Math.round(connectionAgeMs / 1000)}s ago</div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
