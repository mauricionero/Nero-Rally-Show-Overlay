import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { PilotTelemetryHud } from '../PilotTelemetryHud.jsx';
import CurrentStageBadge from '../CurrentStageBadge.jsx';
import { LiveStartInformationValue } from '../LiveStartInformationValue.jsx';
import { MapWeatherBadges } from '../PlacemarkMapFeed.jsx';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Clock3, Radio, UserRound, VideoOff } from 'lucide-react';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { sortPilotsByDisplayOrder } from '../../utils/displayOrder.js';
import { formatClockFromDate } from '../../utils/timeFormat.js';
import { useSecondAlignedClock } from '../../hooks/useSecondAlignedClock.js';
import { getResolvedBrandingLogoUrl } from '../../utils/branding.js';
import {
  getReferenceNow,
  getResolvedStageStartDateTime
} from '../../utils/rallyHelpers.js';
import { getStageTitle, isLapTimingStageType } from '../../utils/stageTypes.js';
import {
  buildPilotOverlayPlaybackMap,
  getPilotEffectiveStageId,
  resolvePilotOverlayPlayback
} from '../../utils/overlayReplayResolver.js';
import { buildReplayStageScheduleMap } from '../../utils/replaySchedule.js';
import { getPilotTelemetryForId } from '../../utils/pilotIdentity.js';

const SCENE_5_CONFIG_KEY = 'scene5MonitorConfig';

const LAYOUTS = [
  { id: '1', name: '1 Stream', cols: 1, rows: 1, slots: 1 },
  { id: '1x2', name: '1x2 Vertical', cols: 1, rows: 2, slots: 2 },
  { id: '2x1', name: '2x1 Horizontal', cols: 2, rows: 1, slots: 2 },
  { id: '2x2', name: '2x2 Grid', cols: 2, rows: 2, slots: 4 },
  { id: '3x2', name: '3x2 Grid', cols: 3, rows: 2, slots: 6 },
  { id: '3x3', name: '3x3 Grid', cols: 3, rows: 3, slots: 9 }
];

const formatMonitorClock = (date = new Date()) => formatClockFromDate(date, 0);

const getTelemetryConnectionLabel = (telemetry = {}) => (
  String(telemetry?.connectionType || telemetry?.source || '').trim()
);

const getTelemetryConnectionStrength = (telemetry = {}) => {
  const numericValue = Number(telemetry?.connectionStrength);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  if (numericValue <= 4) {
    return Math.max(1, Math.min(4, Math.round(numericValue)));
  }

  return Math.max(1, Math.min(4, Math.ceil(numericValue / 25)));
};

function ConnectionIndicator({ telemetry = {}, className = '' }) {
  const label = getTelemetryConnectionLabel(telemetry);
  const strength = getTelemetryConnectionStrength(telemetry);

  if (!label && strength <= 0) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/75 px-3 py-1.5 backdrop-blur-sm ${className}`.trim()}>
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-200">
        {label || 'link'}
      </span>
      <div className="flex items-end gap-0.5">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={bar <= strength ? 'bg-[#22C55E]' : 'bg-white/20'}
            style={{
              width: 3,
              height: 4 + (bar * 3),
              borderRadius: 999
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MonitorInfoWidget({
  t,
  currentStage = null,
  currentStagePlacemark = null,
  nextPilotToStart = null,
  isLapRace = false,
  sceneNow = new Date(),
  eventIsOver = false
}) {
  return (
    <div className="relative min-h-0 h-full overflow-hidden rounded-2xl border border-[#FF4500]/35 bg-[radial-gradient(circle_at_top_left,rgba(255,69,0,0.18),transparent_38%),linear-gradient(180deg,rgba(10,10,12,0.96),rgba(6,6,8,0.92))] p-4 shadow-[0_14px_38px_rgba(0,0,0,0.4)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF4500]/70 to-transparent" />
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-400">
              {t('scene5.raceMonitor')}
            </p>
            {currentStage ? (
              <div className="mt-2">
                <CurrentStageBadge
                  stage={currentStage}
                  className="static inline-flex left-auto top-auto translate-x-0 border-white/10 bg-black/10 px-2 py-1 shadow-none"
                  titleClassName="truncate text-xs font-bold uppercase text-white"
                />
              </div>
            ) : (
              <p className="mt-2 text-sm font-bold uppercase text-zinc-300">
                {t('scene2.noCurrentStage')}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-right shadow-inner shadow-black/30">
            <div className="flex items-center justify-end gap-2 text-zinc-400">
              <Clock3 className="h-4 w-4 text-[#FACC15]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{t('scene5.currentClock')}</span>
            </div>
            <div className="mt-1 text-2xl font-bold text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {formatMonitorClock(sceneNow)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <UserRound className="h-4 w-4 text-[#FF4500]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                {isLapRace ? t('scene5.massStart') : t('scene5.nextToStart')}
              </span>
            </div>
            {isLapRace ? (
              <p className="mt-2 text-lg font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {t('scene5.lapRaceNoSingleStarter')}
              </p>
            ) : nextPilotToStart ? (
              <>
                <p className="mt-2 truncate text-xl font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {nextPilotToStart.name}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-zinc-400">
                  #{nextPilotToStart.carNumber || '?'} • {nextPilotToStart.startClockText}
                </p>
              </>
            ) : (
              <p className="mt-2 text-base font-bold uppercase text-zinc-300" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {t('scene5.noUpcomingStart')}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <Radio className="h-4 w-4 text-[#38BDF8]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                {t('scene5.weather')}
              </span>
            </div>
            <div className="mt-2">
              {currentStagePlacemark ? (
                <div className="space-y-2">
                  <p className="truncate text-sm font-bold uppercase tracking-wide text-zinc-300">
                    {currentStagePlacemark.name}
                  </p>
                  <MapWeatherBadges placemark={currentStagePlacemark} className="flex-wrap" />
                </div>
              ) : (
                <p className="text-lg font-bold uppercase text-zinc-300" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('scene5.noWeatherSource')}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 text-xs uppercase tracking-wide text-zinc-400">
          <span>{eventIsOver ? t('scene5.replayMode') : t('scene5.liveMode')}</span>
          <span>{currentStage ? getStageTitle(currentStage) : t('scene2.noCurrentStage')}</span>
        </div>
      </div>
    </div>
  );
}

function PilotMonitorCard({
  pilot,
  pilotPlayback = null,
  telemetry = {},
  stage = null,
  hideStreams = false,
  resolveReplayStreamUrlOnMount = null,
  replayStageScheduleById = null,
  debugDate = '',
  t
}) {
  const replayIdentity = pilotPlayback?.mode === 'replay'
    ? `${pilot.id}:${pilotPlayback?.baseUrl || ''}:${pilotPlayback?.effectiveStageId || ''}`
    : `live-${pilot.id}`;
  const hasVideo = Boolean(pilotPlayback?.hasVideo);
  const placeholderLabel = hideStreams
    ? t('scene5.streamHidden')
    : t('scene5.noLiveFeed');

  return (
    <div className="relative min-h-0 h-full overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(14,14,18,0.96),rgba(8,8,10,0.96))] shadow-[0_10px_24px_rgba(0,0,0,0.30)]">
      {stage && (
        <CurrentStageBadge
          stage={stage}
          className="absolute left-1/2 top-1 z-20 -translate-x-1/2 border-white/10 bg-black/10 px-2 py-0.5 shadow-none"
          titleClassName="truncate text-[10px] font-bold uppercase text-white"
        />
      )}

      <div className="absolute right-2 top-1 z-20">
        <ConnectionIndicator telemetry={telemetry} />
      </div>

      <div className="relative min-h-0 h-full">
        {!hideStreams && hasVideo ? (
          <StreamPlayer
            key={replayIdentity}
            pilotId={pilot.id}
            streamUrl={pilotPlayback?.baseUrl || pilotPlayback?.streamUrl || ''}
            name={pilot.name}
            className="h-full w-full"
            showControls={pilotPlayback?.mode === 'replay'}
            interactive={pilotPlayback?.mode === 'replay'}
            replayMountIdentity={pilotPlayback?.mode === 'replay' ? replayIdentity : ''}
            resolveStreamUrlOnMount={pilotPlayback?.mode === 'replay' && typeof resolveReplayStreamUrlOnMount === 'function' ? () => resolveReplayStreamUrlOnMount(pilot) : null}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,69,0,0.16),transparent_34%),linear-gradient(180deg,rgba(18,18,22,0.98),rgba(10,10,12,0.98))]">
            <div className="text-center">
              <VideoOff className="mx-auto h-9 w-9 text-zinc-500" />
              <p className="mt-3 text-lg font-bold uppercase tracking-[0.28em] text-zinc-400" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {placeholderLabel}
              </p>
            </div>
          </div>
        )}

        <PilotTelemetryHud pilot={pilot} telemetry={telemetry} trackLengthTotal={stage?.distance} compact raised />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-1.5 pt-6">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 10px rgba(0,0,0,0.95)' }}>
                <span className="mr-2 text-xs text-zinc-400">#{pilot.carNumber || '?'}</span>
                {pilot.name}
              </p>
              {pilot.team && (
                <p className="mt-1 truncate text-xs uppercase tracking-wide text-zinc-300">
                  {pilot.team}
                </p>
              )}
            </div>

            {stage && (
              <LiveStartInformationValue
                startTime={pilot.startTimeForStage || ''}
                finishTime={pilot.finishTimeForStage || ''}
                retired={pilot.retiredForStage === true}
                stageDate={stage.date}
                stageId={stage.id}
                replayStageScheduleById={replayStageScheduleById}
                debugDate={debugDate}
                className="text-right text-sm font-bold text-zinc-100"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Scene5Monitor({ hideStreams = false }) {
  const {
    pilots,
    stages,
    eventName,
    logoUrl,
    currentStageId,
    startTimes,
    times,
    categories,
    mapPlacemarks,
    debugDate,
    retiredStages,
    pilotTelemetryByPilotId,
    eventIsOver,
    eventReplayStartDate,
    eventReplayStartTime,
    eventReplayStageIntervalSeconds
  } = useRally();
  const { t } = useTranslation();
  const resolvedLogoUrl = getResolvedBrandingLogoUrl(logoUrl);
  const initialSceneConfig = useMemo(
    () => loadSceneConfig(SCENE_5_CONFIG_KEY, { selectedLayout: '3x3', selectedPilotIds: null }),
    []
  );
  const [selectedLayout, setSelectedLayout] = useState(initialSceneConfig.selectedLayout || '3x3');
  const [selectedPilotIds, setSelectedPilotIds] = useState(initialSceneConfig.selectedPilotIds ?? null);

  const layout = LAYOUTS.find((entry) => entry.id === selectedLayout) || LAYOUTS[LAYOUTS.length - 1];
  const currentSecondAlignedTime = useSecondAlignedClock(true);
  const sceneNow = useMemo(() => getReferenceNow(debugDate, currentSecondAlignedTime), [currentSecondAlignedTime, debugDate]);
  const currentStage = stages.find((stage) => stage.id === currentStageId) || null;
  const isLapRace = isLapTimingStageType(currentStage?.type);
  const currentStagePlacemark = useMemo(() => (
    mapPlacemarks.find((placemark) => placemark.id === currentStage?.mapPlacemarkId) || null
  ), [currentStage?.mapPlacemarkId, mapPlacemarks]);

  const replayPilotStageSignature = useMemo(() => (
    pilots.map((pilot) => `${pilot.id}:${String(pilot.currentStageId || '').trim()}`).join('|')
  ), [pilots]);
  const replaySnapshotKey = eventIsOver
    ? `${currentStageId || ''}__${eventReplayStartDate || ''}__${eventReplayStartTime || ''}__${eventReplayStageIntervalSeconds || 0}__${replayPilotStageSignature}`
    : '';
  const replayStageScheduleById = useMemo(() => (
    eventIsOver
      ? buildReplayStageScheduleMap({
          stages,
          times,
          replayStartDate: eventReplayStartDate,
          replayStartTime: eventReplayStartTime,
          replayStageIntervalSeconds: eventReplayStageIntervalSeconds
        })
      : null
  ), [eventIsOver, eventReplayStartDate, eventReplayStartTime, eventReplayStageIntervalSeconds, stages, times]);
  const replayPlaybackSnapshotRef = useRef({ key: '', map: null });
  if (!eventIsOver) {
    replayPlaybackSnapshotRef.current = { key: '', map: null };
  } else if (replayPlaybackSnapshotRef.current.key !== replaySnapshotKey) {
    replayPlaybackSnapshotRef.current = {
      key: replaySnapshotKey,
      map: buildPilotOverlayPlaybackMap({
        pilots,
        globalCurrentStageId: currentStageId,
        eventIsOver: true,
        stages,
        times,
        now: sceneNow,
        replayStartDate: eventReplayStartDate,
        replayStartTime: eventReplayStartTime,
        replayStageIntervalSeconds: eventReplayStageIntervalSeconds
      })
    };
  }
  const livePilotPlaybackById = useMemo(() => (
    buildPilotOverlayPlaybackMap({
      pilots,
      globalCurrentStageId: currentStageId,
      eventIsOver: false
    })
  ), [currentStageId, pilots]);
  const pilotPlaybackById = eventIsOver
    ? (replayPlaybackSnapshotRef.current.map || new Map())
    : livePilotPlaybackById;
  const resolveReplayStreamUrlOnMount = useCallback((pilot) => (
    resolvePilotOverlayPlayback({
      pilot,
      globalCurrentStageId: currentStageId,
      eventIsOver: true,
      stages,
      times,
      now: getReferenceNow(debugDate, new Date()),
      replayStartDate: eventReplayStartDate,
      replayStartTime: eventReplayStartTime,
      replayStageIntervalSeconds: eventReplayStageIntervalSeconds
    }).streamUrl || ''
  ), [currentStageId, debugDate, eventReplayStageIntervalSeconds, eventReplayStartDate, eventReplayStartTime, stages, times]);

  const displaySortedPilots = useMemo(() => (
    sortPilotsByDisplayOrder(pilots, categories)
  ), [categories, pilots]);
  const maxDisplayedPilotCount = Math.max(0, layout.slots - 1);

  React.useEffect(() => {
    if (selectedPilotIds !== null) {
      return;
    }

    const defaultPilotIds = displaySortedPilots
      .slice(0, maxDisplayedPilotCount)
      .map((pilot) => pilot.id);
    setSelectedPilotIds(defaultPilotIds);
  }, [displaySortedPilots, maxDisplayedPilotCount, selectedPilotIds]);

  React.useEffect(() => {
    if (!Array.isArray(selectedPilotIds)) {
      return;
    }

    const orderedSelectedIds = displaySortedPilots
      .map((pilot) => pilot.id)
      .filter((pilotId) => selectedPilotIds.includes(pilotId))
      .slice(0, maxDisplayedPilotCount);

    const currentSelectionKey = selectedPilotIds.join('|');
    const nextSelectionKey = orderedSelectedIds.join('|');

    if (currentSelectionKey !== nextSelectionKey) {
      setSelectedPilotIds(orderedSelectedIds);
    }
  }, [displaySortedPilots, maxDisplayedPilotCount, selectedPilotIds]);

  const monitorPilots = useMemo(() => {
    return displaySortedPilots.map((pilot) => {
      const telemetry = getPilotTelemetryForId(pilotTelemetryByPilotId, pilot.id);
      const playback = pilotPlaybackById.get(pilot.id);
      const effectiveStageId = getPilotEffectiveStageId(pilot, currentStageId);
      const effectiveStage = stages.find((stage) => stage.id === effectiveStageId) || currentStage || null;

      return {
        ...pilot,
        telemetry,
        pilotPlayback: playback,
        effectiveStage
      };
    });
  }, [currentStage, currentStageId, displaySortedPilots, pilotPlaybackById, pilotTelemetryByPilotId, stages]);

  const selectedPilotIdSet = useMemo(() => new Set(Array.isArray(selectedPilotIds) ? selectedPilotIds : []), [selectedPilotIds]);

  const visiblePilots = useMemo(() => (
    monitorPilots
      .filter((pilot) => !Array.isArray(selectedPilotIds) || selectedPilotIdSet.has(pilot.id))
      .slice(0, maxDisplayedPilotCount)
      .map((pilot) => ({
      ...pilot,
      startTimeForStage: pilot.effectiveStage ? (startTimes[pilot.id]?.[pilot.effectiveStage.id] || '') : '',
      finishTimeForStage: pilot.effectiveStage ? (times[pilot.id]?.[pilot.effectiveStage.id] || '') : '',
      retiredForStage: pilot.effectiveStage ? !!retiredStages?.[pilot.id]?.[pilot.effectiveStage.id] : false
    }))
  ), [maxDisplayedPilotCount, monitorPilots, retiredStages, selectedPilotIdSet, selectedPilotIds, startTimes, times]);

  const nextPilotToStart = useMemo(() => {
    if (!currentStage || isLapRace) {
      return null;
    }

    const candidates = displaySortedPilots
      .map((pilot) => {
        const startTime = startTimes[pilot.id]?.[currentStage.id] || '';
        const resolvedStartDateTime = getResolvedStageStartDateTime({
          stageId: currentStage.id,
          stageDate: currentStage.date,
          startTime,
          replayStageScheduleById
        });

        return {
          pilot,
          startTime,
          resolvedStartDateTime
        };
      })
      .filter((entry) => entry.startTime && entry.resolvedStartDateTime instanceof Date && !Number.isNaN(entry.resolvedStartDateTime.getTime()))
      .filter((entry) => sceneNow < entry.resolvedStartDateTime)
      .sort((a, b) => a.resolvedStartDateTime.getTime() - b.resolvedStartDateTime.getTime());

    if (candidates.length === 0) {
      return null;
    }

    const nextEntry = candidates[0];
    return {
      ...nextEntry.pilot,
      startClockText: formatMonitorClock(nextEntry.resolvedStartDateTime).slice(0, 5)
    };
  }, [currentStage, displaySortedPilots, isLapRace, replayStageScheduleById, retiredStages, sceneNow, startTimes, times]);

  const gridStyle = useMemo(() => ({
    gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`
  }), [layout.cols, layout.rows]);

  const emptySlots = Math.max(0, layout.slots - 1 - visiblePilots.length);

  React.useEffect(() => {
    saveSceneConfig(SCENE_5_CONFIG_KEY, {
      selectedLayout,
      selectedPilotIds
    });
  }, [selectedLayout, selectedPilotIds]);

  const togglePilotSelection = useCallback((pilotId) => {
    setSelectedPilotIds((current) => {
      const baseSelection = Array.isArray(current)
        ? current
        : displaySortedPilots
          .slice(0, maxDisplayedPilotCount)
          .map((pilot) => pilot.id);

      return baseSelection.includes(pilotId)
        ? baseSelection.filter((value) => value !== pilotId)
        : baseSelection.length >= maxDisplayedPilotCount
          ? baseSelection
        : [...baseSelection, pilotId];
    });
  }, [displaySortedPilots, maxDisplayedPilotCount]);

  return (
    <div className="relative h-full w-full" data-testid="scene-5-monitor">
      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs uppercase text-white">{t('scene5.layout')}</Label>
            <Select value={selectedLayout} onValueChange={setSelectedLayout}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAYOUTS.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-zinc-400">
            <p className="font-bold uppercase tracking-[0.18em] text-zinc-300">{t('scene5.monitor')}</p>
            <p className="mt-2">{t('scene5.monitorHint')}</p>
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase text-white">
              {t('scene1.selectItems')} ({visiblePilots.length}/{Math.max(0, layout.slots - 1)})
            </Label>
            <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-3">
              {displaySortedPilots.map((pilot) => {
                const checked = selectedPilotIdSet.has(pilot.id);

                return (
                  <label key={pilot.id} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePilotSelection(pilot.id)}
                    />
                    <span className="truncate uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      #{pilot.carNumber || '?'} {pilot.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </LeftControls>

      <div className="flex h-full w-full min-h-0 flex-col p-2 pt-3">
        <div className="mb-1 flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/35 px-4 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-3xl font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {eventName || t('theRace.eventName')}
            </p>
          </div>

          {resolvedLogoUrl && (
            <img
              src={resolvedLogoUrl}
              alt={eventName || t('header.title')}
              className="max-h-14 w-auto object-contain"
            />
          )}
        </div>

        <div className="grid flex-1 min-h-0 gap-1" style={gridStyle}>
          <MonitorInfoWidget
            t={t}
            currentStage={currentStage}
            currentStagePlacemark={currentStagePlacemark}
            nextPilotToStart={nextPilotToStart}
            isLapRace={isLapRace}
            sceneNow={sceneNow}
            eventIsOver={eventIsOver}
          />

          {visiblePilots.map((pilot) => (
            <PilotMonitorCard
              key={pilot.id}
              pilot={pilot}
              pilotPlayback={pilot.pilotPlayback}
              telemetry={pilot.telemetry}
              stage={pilot.effectiveStage}
              hideStreams={hideStreams}
              resolveReplayStreamUrlOnMount={resolveReplayStreamUrlOnMount}
              replayStageScheduleById={replayStageScheduleById}
              debugDate={debugDate}
              t={t}
            />
          ))}

          {Array.from({ length: emptySlots }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="rounded-xl border border-dashed border-white/10 bg-black/20"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
