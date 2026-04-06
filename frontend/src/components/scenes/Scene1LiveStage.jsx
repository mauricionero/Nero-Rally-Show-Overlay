import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { PlacemarkMapFeed, MapWeatherBadges } from '../PlacemarkMapFeed.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { LiveStartInformationValue } from '../LiveStartInformationValue.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import StatusPill from '../StatusPill.jsx';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import * as rallyHelpers from '../../utils/rallyHelpers';
import { ChevronLeft, ChevronRight, Flag, Maximize2, Minimize2, RotateCcw, Video, Map as MapIcon } from 'lucide-react';
import { getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { getStageTitle, isLapRaceStageType, isSpecialStageType } from '../../utils/stageTypes.js';
import { usePilotStatusMotion } from '../../hooks/usePilotStatusMotion.js';
import { usePilotPositionMotion } from '../../hooks/usePilotPositionMotion.js';
import { useScheduledPilotBuckets } from '../../hooks/useScheduledPilotBuckets.js';
import { useFastClock } from '../../hooks/useFastClock.js';
import { useSecondAlignedClock } from '../../hooks/useSecondAlignedClock.js';
import { formatDurationMs } from '../../utils/timeFormat.js';
import { sortPilotsByDisplayOrder } from '../../utils/displayOrder.js';
import { buildStageMapFeeds } from '../../utils/feedOptions.js';
import { buildPilotMapMarkers } from '../../utils/pilotMapMarkers.js';
import { getResolvedBrandingLogoUrl } from '../../utils/branding.js';

const LAYOUTS = [
  { id: '1', name: '1 Stream', cols: 1, rows: 1, slots: 1 },
  { id: '1x2', name: '1x2 Vertical', cols: 1, rows: 2, slots: 2 },
  { id: '2x1', name: '2x1 Horizontal', cols: 2, rows: 1, slots: 2 },
  { id: '2x2', name: '2x2 Grid', cols: 2, rows: 2, slots: 4 },
  { id: '3x2', name: '3x2 Grid', cols: 3, rows: 2, slots: 6 }
];
const SCENE_1_CONFIG_KEY = 'scene1Config';
const abbreviateTickerName = (name) => {
  if (!name) return '';

  return name
    .split(/\s*\/\s*/)
    .map((part) => {
      const words = part.trim().split(/\s+/).filter(Boolean);

      if (words.length <= 1) {
        return part.trim();
      }

      const firstInitial = words[0][0]?.toUpperCase() || '';
      const lastName = words[words.length - 1];
      return `${firstInitial}. ${lastName}`;
    })
    .join(' / ');
};


export default function Scene1LiveStage({ hideStreams = false }) {
  const { 
    pilots, stages, currentStageId, startTimes, realStartTimes, times, categories, 
    chromaKey, logoUrl, lapTimes, stagePilots,
    cameras, externalMedia, mapPlacemarks, debugDate, retiredStages, stageAlerts, pilotTelemetryByPilotId, timeDecimals
  } = useRally();
  const resolvedLogoUrl = getResolvedBrandingLogoUrl(logoUrl);
  const { t } = useTranslation();
  const initialSceneConfig = useMemo(
    () => loadSceneConfig(SCENE_1_CONFIG_KEY, { selectedLayout: '2x2', isExpandedView: false, selectedSlotIds: [] }),
    []
  );
  
  const [selectedLayout, setSelectedLayout] = useState(initialSceneConfig.selectedLayout);
  const [draftSelectedLayout, setDraftSelectedLayout] = useState(initialSceneConfig.selectedLayout);
  const [isExpandedView, setIsExpandedView] = useState(initialSceneConfig.isExpandedView);

  // helper to render an icon for a media item
  const renderIcon = (iconName) => {
    const Icon = getExternalMediaIconComponent(iconName);
    return <Icon className="w-5 h-5 text-[#FF4500]" />;
  };
  const [selectedSlotIds, setSelectedSlotIds] = useState(initialSceneConfig.selectedSlotIds);
  const [draftSelectedSlotIds, setDraftSelectedSlotIds] = useState(initialSceneConfig.selectedSlotIds);
  const [bottomScroll, setBottomScroll] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const bottomContainerRef = useRef(null);
  const bottomTrackRef = useRef(null);
  const bottomMetricsRef = useRef({ maxScroll: 0, bottomScroll: 0 });
  
  const currentStage = stages.find(s => s.id === currentStageId);
  const activeMedia = externalMedia.filter(m => m.url);
  const activeStageMaps = useMemo(() => buildStageMapFeeds({ stages, mapPlacemarks }), [stages, mapPlacemarks]);
  const pilotMapMarkers = useMemo(() => buildPilotMapMarkers(pilots, categories, pilotTelemetryByPilotId), [pilots, categories, pilotTelemetryByPilotId]);
  const isLapRace = isLapRaceStageType(currentStage?.type);
  const isSSStage = isSpecialStageType(currentStage?.type);
  const lapFastClockEnabled = Boolean(currentStageId && isLapRace && timeDecimals > 0);
  const currentFastTime = useFastClock(lapFastClockEnabled);
  const currentSecondAlignedTime = useSecondAlignedClock(Boolean(currentStageId && isLapRace && !lapFastClockEnabled));
  const sceneNow = useMemo(() => (
    rallyHelpers.getReferenceNow(
      debugDate,
      lapFastClockEnabled ? new Date(currentFastTime) : currentSecondAlignedTime
    )
  ), [currentFastTime, currentSecondAlignedTime, debugDate, lapFastClockEnabled]);
  const activeCameras = cameras.filter(c => c.isActive && c.streamUrl);
  const validSlotIds = useMemo(() => new Set([
    ...pilots.filter((pilot) => pilot.isActive && pilot.streamUrl).map((pilot) => pilot.id),
    ...activeCameras.map((camera) => camera.id),
    ...activeMedia.map((media) => `media-${media.id}`),
    ...activeStageMaps.map((feed) => feed.value)
  ]), [pilots, activeCameras, activeMedia, activeStageMaps]);
  const displaySortedPilots = useMemo(() => (
    sortPilotsByDisplayOrder(pilots, categories)
  ), [pilots, categories]);
  const displayOrderByPilotId = useMemo(() => (
    new Map(displaySortedPilots.map((pilot, index) => [pilot.id, index]))
  ), [displaySortedPilots]);
  const categoryById = useMemo(() => (
    new Map(categories.map((category) => [category.id, category]))
  ), [categories]);
  const tickerPilotMetaById = useMemo(() => (
    new Map(pilots.map((pilot) => [
      pilot.id,
      {
        category: categoryById.get(pilot.categoryId) || null,
        abbreviatedName: abbreviateTickerName(pilot.name),
        pilotMeta: [pilot.car, pilot.team].filter(Boolean).join(' • ')
      }
    ]))
  ), [categoryById, pilots]);
  
  const layout = LAYOUTS.find(l => l.id === selectedLayout) || LAYOUTS[3];
  const draftLayout = LAYOUTS.find(l => l.id === draftSelectedLayout) || LAYOUTS[3];
  const activePilots = pilots.filter(p => p.isActive && p.streamUrl);
  const specialStageTickerBaseItems = useMemo(() => {
    if (!currentStageId || !currentStage || isLapRace || !isSSStage) {
      return [];
    }

    return pilots.map((pilot) => {
      const startTime = startTimes[pilot.id]?.[currentStageId] || '';
      const finishTime = times[pilot.id]?.[currentStageId] || '';
      const retired = !!retiredStages?.[pilot.id]?.[currentStageId];
      const startDateTime = rallyHelpers.getStageDateTime(currentStage.date, startTime);
      const displayOrder = displayOrderByPilotId.get(pilot.id) ?? Number.MAX_SAFE_INTEGER;

      return {
        id: pilot.id,
        pilot,
        startTime,
        finishTime,
        retired,
        fixedStatus: retired ? 'retired' : (finishTime ? 'finished' : 'not_started'),
        preStartAtMs: startDateTime ? startDateTime.getTime() - 10000 : null,
        startAtMs: startDateTime ? startDateTime.getTime() : null,
        sortValues: {
          racing: displayOrder,
          pre_start: displayOrder,
          finished: finishTime ? rallyHelpers.parseTime(finishTime) : Number.MAX_SAFE_INTEGER,
          not_started: displayOrder,
          retired: displayOrder
        }
      };
    });
  }, [currentStage, currentStageId, displayOrderByPilotId, isLapRace, isSSStage, pilots, retiredStages, startTimes, times]);

  const orderedSpecialStageTickerItems = useScheduledPilotBuckets(specialStageTickerBaseItems, {
    racing: 0,
    pre_start: 1,
    finished: 2,
    not_started: 3,
    retired: 4
  });
  
  // Calculate sorted pilots based on stage type
  const sortedPilotsWithPositions = useMemo(() => {
    if (!currentStageId || !currentStage) {
      return pilots.map((p, i) => ({ pilot: p, position: i + 1, completedLaps: 0 }));
    }
    
    if (isLapRace) {
      return rallyHelpers.buildLapRaceLeaderboard({
        pilots,
        stage: currentStage,
        lapTimes,
        stagePilots,
        startTimes,
        times,
        retiredStages,
        now: sceneNow,
        timeDecimals,
        fallbackOrderByPilotId: displayOrderByPilotId
      });
    }

    return orderedSpecialStageTickerItems.map((item, index) => ({
      pilot: item.pilot,
      position: index + 1,
      completedLaps: 0,
      isFinished: item.currentStatus === 'finished',
      currentStatus: item.currentStatus,
      startTime: item.startTime,
      finishTime: item.finishTime,
      retired: item.retired
    }));
  }, [currentStage, currentStageId, displayOrderByPilotId, isLapRace, lapTimes, orderedSpecialStageTickerItems, pilots, retiredStages, sceneNow, stagePilots, startTimes, timeDecimals, times]);

  const pilotStageMetaById = useMemo(() => (
    new Map(sortedPilotsWithPositions.map((data) => [data.pilot.id, data]))
  ), [sortedPilotsWithPositions]);
  const isLapRaceStageFinished = useMemo(() => (
    isLapRace
      && sortedPilotsWithPositions.length > 0
      && sortedPilotsWithPositions.every((entry) => entry.retired || entry.isFinished)
  ), [isLapRace, sortedPilotsWithPositions]);

  const alertByPilotId = useMemo(() => {
    if (!currentStageId) return new Set();
    return new Set(
      Object.keys(stageAlerts || {}).filter((pilotId) => stageAlerts?.[pilotId]?.[currentStageId])
    );
  }, [currentStageId, stageAlerts]);

  const jumpStartByPilotId = useMemo(() => {
    if (!currentStageId) return new Set();
    const next = new Set();
    pilots.forEach((pilot) => {
      if (rallyHelpers.isJumpStartForStage(pilot.id, currentStageId, startTimes, realStartTimes)) {
        next.add(pilot.id);
      }
    });
    return next;
  }, [currentStageId, pilots, realStartTimes, startTimes]);

  // Calculate max scroll based on the actual ticker track width
  useEffect(() => {
    const container = bottomContainerRef.current;
    const track = bottomTrackRef.current;

    if (!container || !track) {
      return undefined;
    }

    let animationFrameId = null;

    const applyBottomMetrics = () => {
      const nextMaxScroll = Math.max(0, track.scrollWidth - container.clientWidth);
      const nextBottomScroll = Math.min(bottomMetricsRef.current.bottomScroll, nextMaxScroll);
      const metricsChanged = (
        bottomMetricsRef.current.maxScroll !== nextMaxScroll ||
        bottomMetricsRef.current.bottomScroll !== nextBottomScroll
      );

      if (!metricsChanged) {
        return;
      }

      bottomMetricsRef.current = {
        maxScroll: nextMaxScroll,
        bottomScroll: nextBottomScroll
      };

      setMaxScroll((prev) => (prev === nextMaxScroll ? prev : nextMaxScroll));
      setBottomScroll((prev) => (prev === nextBottomScroll ? prev : nextBottomScroll));
    };

    const updateBottomMetrics = () => {
      if (animationFrameId !== null) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        applyBottomMetrics();
      });
    };

    applyBottomMetrics();

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(updateBottomMetrics);
      resizeObserver.observe(container);
      resizeObserver.observe(track);
      return () => {
        resizeObserver.disconnect();
        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId);
        }
      };
    }

    window.addEventListener('resize', updateBottomMetrics);
    return () => {
      window.removeEventListener('resize', updateBottomMetrics);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [sortedPilotsWithPositions, pilots]);

  useEffect(() => {
    bottomMetricsRef.current.bottomScroll = bottomScroll;
  }, [bottomScroll]);
  
  // Auto-select active pilots up to layout slots
  useEffect(() => {
    if (selectedSlotIds.length === 0 && draftSelectedSlotIds.length === 0 && activePilots.length > 0) {
      const defaultSlotIds = activePilots.slice(0, draftLayout.slots).map((pilot) => pilot.id);
      setSelectedSlotIds(defaultSlotIds);
      setDraftSelectedSlotIds(defaultSlotIds);
    }
  }, [activePilots, draftLayout.slots, selectedSlotIds.length, draftSelectedSlotIds.length]);

  useEffect(() => {
    setSelectedSlotIds((prev) => {
      const next = prev.filter((slotId) => validSlotIds.has(slotId));
      return next.length === prev.length ? prev : next;
    });

    setDraftSelectedSlotIds((prev) => {
      const next = prev.filter((slotId) => validSlotIds.has(slotId));
      return next.length === prev.length ? prev : next;
    });
  }, [validSlotIds]);

  useEffect(() => {
    setSelectedSlotIds((prev) => (prev.length > layout.slots ? prev.slice(0, layout.slots) : prev));
  }, [layout.slots]);

  useEffect(() => {
    setDraftSelectedSlotIds((prev) => (prev.length > draftLayout.slots ? prev.slice(0, draftLayout.slots) : prev));
  }, [draftLayout.slots]);

  useEffect(() => {
    saveSceneConfig(SCENE_1_CONFIG_KEY, {
      selectedLayout,
      isExpandedView,
      selectedSlotIds
    });
  }, [selectedLayout, isExpandedView, selectedSlotIds]);

  const toggleSlot = (slotId) => {
    setDraftSelectedSlotIds(prev => {
      if (prev.includes(slotId)) {
        return prev.filter(id => id !== slotId);
      } else if (prev.length < draftLayout.slots) {
        return [...prev, slotId];
      }
      return prev;
    });
  };

  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (dragIndex === dropIndex) return;

    setDraftSelectedSlotIds(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(dragIndex, 1);
      newOrder.splice(dropIndex, 0, removed);
      return newOrder;
    });
  };

  const hasPendingSelectionChanges = draftSelectedSlotIds.length !== selectedSlotIds.length
    || draftSelectedSlotIds.some((slotId, index) => slotId !== selectedSlotIds[index]);
  const hasPendingLayoutChanges = draftSelectedLayout !== selectedLayout;
  const hasPendingChanges = hasPendingLayoutChanges || hasPendingSelectionChanges;
  const tickerStatusItems = useMemo(() => (
    sortedPilotsWithPositions.map(({ pilot, position, completedLaps, isFinished, currentStatus, status, retired }) => {
      let statusKey = 'idle';

      if (isLapRace) {
        statusKey = retired ? 'retired' : (status || (isFinished ? 'finished' : (completedLaps > 0 ? 'racing' : 'not_started')));
      } else if (isSSStage) {
        statusKey = currentStatus || 'not_started';
      }

      return {
        pilot,
        position,
        completedLaps,
        isFinished,
        key: pilot.id,
        statusKey
      };
    })
  ), [isLapRace, isSSStage, sortedPilotsWithPositions]);
  const {
    displayedItems: displayedTickerItems,
    getStatusMotionClassName,
    pilotStatusMotionConfig,
    isStatusTransitionActive
  } = usePilotStatusMotion(tickerStatusItems);
  const { setMotionRef } = usePilotPositionMotion(displayedTickerItems, {
    disabled: isStatusTransitionActive
  });

  const getDisplayItem = (slotId) => {
    // Check if it's a camera
    const camera = cameras.find(c => c.id === slotId);
    if (camera) {
      return { type: 'camera', ...camera };
    }
    if (slotId.startsWith('stage-map:')) {
      return activeStageMaps.find((feed) => feed.value === slotId) || null;
    }
    // Check external media
    if (slotId.startsWith('media-')) {
      const mid = slotId.replace('media-', '');
      const media = externalMedia.find(m => m.id === mid);
      if (media) return { type: 'media', ...media };
    }
    // Otherwise it's a pilot
    const pilot = pilots.find(p => p.id === slotId);
    return pilot ? { type: 'pilot', ...pilot } : null;
  };

  const displayItems = selectedSlotIds.map(id => getDisplayItem(id)).filter(Boolean);
  const sceneInset = isExpandedView ? '2px' : '2rem';

  const gridStyle = {
    height: currentStage && currentStageId ? 'calc(100% - 230px)' : '100%',
    gap: isExpandedView ? '2px' : '1rem',
    gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`
  };

  // Get pilot position and lap info for Lap Race
  const getPilotLapInfo = (pilotId) => {
    const data = pilotStageMetaById.get(pilotId);
    if (!data) return null;
    const lastLapDurationMs = Array.isArray(data.lapDurations) && data.lapDurations.length > 0
      ? [...data.lapDurations].reverse().find((value) => Number.isFinite(value) && value > 0)
      : null;
    return {
      position: data.position,
      completedLaps: data.completedLaps || 0,
      isFinished: data.isFinished || false,
      isRacing: data.isRacing || false,
      status: data.status || 'not_started',
      totalLaps: rallyHelpers.getLapRaceConfiguredLapCount(currentStage),
      totalTimeMode: data.totalTimeMode || 'cumulative',
      totalTimeText: data.totalTimeText || data.stageTotalText || '',
      lastLapText: lastLapDurationMs ? formatDurationMs(lastLapDurationMs, timeDecimals, { fallback: '' }) : '',
      displayText: data.displayText || data.stageTotalText || '',
      retired: data.retired || false
    };
  };

  const handleBottomTickerWheel = (event) => {
    if (maxScroll <= 0) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

    if (!delta) {
      return;
    }

    event.preventDefault();
    setBottomScroll((prev) => Math.max(0, Math.min(maxScroll, prev + delta)));
  };

  // Get stage display name - always show stage name, not event name
  const getStageDisplayName = () => {
    if (!currentStage) return '';

    if (isSSStage) {
      return getStageTitle(currentStage, ' ');
    }

    return currentStage.name;
  };

  const stageScheduleTime = useMemo(() => {
    if (!currentStage?.startTime) {
      return '';
    }

    if (!isLapRace) {
      return currentStage.startTime;
    }

    if (!rallyHelpers.hasStageDateTimePassed(currentStage.startTime, currentStage.date, sceneNow)) {
      return currentStage.startTime;
    }

    if (isLapRaceStageFinished) {
      return '';
    }

    return rallyHelpers.getRunningTime(currentStage.startTime, currentStage.date, sceneNow, timeDecimals);
  }, [currentStage, isLapRace, isLapRaceStageFinished, sceneNow, timeDecimals]);

  return (
    <div className="relative w-full h-full" style={{ padding: sceneInset }} data-testid="scene-1-live-stage">
      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.cameraSpacing')}</Label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExpandedView((prev) => !prev)}
              className="w-full justify-start border-zinc-700 bg-[#18181B] text-white hover:bg-zinc-800"
              data-testid="scene1-expand-view-button"
            >
              {isExpandedView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              {isExpandedView ? t('scene1.retractView') : t('scene1.expandView')}
            </Button>
            <p className="mt-2 text-xs text-zinc-500">
              {t('scene1.cameraSpacingHint')}
            </p>
          </div>

          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.layout')}</Label>
            <Select value={draftSelectedLayout} onValueChange={setDraftSelectedLayout}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAYOUTS.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.selectItems')} ({draftSelectedSlotIds.length}/{draftLayout.slots})</Label>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {/* Camera Options - First priority */}
              {activeCameras.length > 0 && (
                <div className="pb-2 border-b border-zinc-700 mb-2">
                  <div className="text-xs text-zinc-500 uppercase mb-2">{t('streams.additionalCameras')}</div>
                  {activeCameras.map((camera) => (
                    <div key={camera.id} className="flex items-center space-x-2 mb-1">
                      <Checkbox
                        id={`camera-${camera.id}`}
                        checked={draftSelectedSlotIds.includes(camera.id)}
                        onCheckedChange={() => toggleSlot(camera.id)}
                        disabled={!draftSelectedSlotIds.includes(camera.id) && draftSelectedSlotIds.length >= draftLayout.slots}
                      />
                      <label htmlFor={`camera-${camera.id}`} className="text-white text-sm cursor-pointer flex items-center gap-2">
                        <Video className="w-4 h-4 text-[#FF4500]" />
                        {camera.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {/* External Media options - second priority */}
              {activeMedia.length > 0 && (
                <div className="pb-2 border-b border-zinc-700 mb-2">
                  <div className="text-xs text-zinc-500 uppercase mb-2">{t('scene1.externalMedia')}</div>
                  {activeMedia.map((m) => {
                    const slotId = `media-${m.id}`;
                    return (
                      <div key={m.id} className="flex items-center space-x-2 mb-1">
                        <Checkbox
                          id={`media-${m.id}`}
                          checked={draftSelectedSlotIds.includes(slotId)}
                          onCheckedChange={() => toggleSlot(slotId)}
                          disabled={!draftSelectedSlotIds.includes(slotId) && draftSelectedSlotIds.length >= draftLayout.slots}
                        />
                        <label htmlFor={`media-${m.id}`} className="text-white text-sm cursor-pointer flex items-center gap-2">
                          {renderIcon(m.icon)}
                          {m.name}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeStageMaps.length > 0 && (
                <div className="pb-2 border-b border-zinc-700 mb-2">
                  <div className="text-xs text-zinc-500 uppercase mb-2">{t('config.stageMaps')}</div>
                  {activeStageMaps.map((feed) => (
                    <div key={feed.value} className="flex items-center space-x-2 mb-1">
                      <Checkbox
                        id={feed.value}
                        checked={draftSelectedSlotIds.includes(feed.value)}
                        onCheckedChange={() => toggleSlot(feed.value)}
                        disabled={!draftSelectedSlotIds.includes(feed.value) && draftSelectedSlotIds.length >= draftLayout.slots}
                      />
                      <label htmlFor={feed.value} className="text-white text-sm cursor-pointer flex items-center gap-2">
                        <MapIcon className="w-4 h-4 text-[#FF4500]" />
                        {feed.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Pilot Options - Third priority */}
              {activePilots.length > 0 && (
                <div className="text-xs text-zinc-500 uppercase mb-2">{t('tabs.pilots')}</div>
              )}
              {activePilots.map((pilot) => {
                const lapInfo = isLapRace ? getPilotLapInfo(pilot.id) : null;
                return (
                  <div key={pilot.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`pilot-${pilot.id}`}
                      checked={draftSelectedSlotIds.includes(pilot.id)}
                      onCheckedChange={() => toggleSlot(pilot.id)}
                      disabled={!draftSelectedSlotIds.includes(pilot.id) && draftSelectedSlotIds.length >= draftLayout.slots}
                    />
                    <label htmlFor={`pilot-${pilot.id}`} className="text-white text-sm cursor-pointer flex items-center gap-2">
                      {lapInfo && (
                        <span className="text-[#FF4500] font-bold text-xs">P{lapInfo.position}</span>
                      )}
                      {pilot.name}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {draftSelectedSlotIds.length > 0 && (
            <div>
              <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.reorderDragDrop')}</Label>
              <div className="space-y-1">
                {draftSelectedSlotIds.map((slotId, index) => {
                  const camera = cameras.find(c => c.id === slotId);
                  const media = slotId.startsWith('media-')
                    ? externalMedia.find(m => m.id === slotId.replace('media-', ''))
                    : null;
                  const stageMap = !camera && !media && slotId.startsWith('stage-map:')
                    ? activeStageMaps.find((feed) => feed.value === slotId)
                    : null;
                  const pilot = !camera && !media && !stageMap ? pilots.find(p => p.id === slotId) : null;
                  let label = '';
                  if (media) label = media.name;
                  else if (stageMap) label = stageMap.name;
                  else if (camera) label = camera.name;
                  else if (pilot) label = pilot.name;
                  const isCamera = !!camera;
                  if (!label) return null;

                  return (
                    <div
                      key={slotId}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      className="bg-[#18181B] border border-zinc-700 p-2 rounded cursor-move hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-xs">{index + 1}.</span>
                        {media && renderIcon(media.icon)}
                        {stageMap && <MapIcon className="w-3 h-3 text-[#FF4500]" />}
                        {isCamera && <Video className="w-3 h-3 text-[#FF4500]" />}
                        <span className="text-white text-sm">{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Button
            type="button"
            onClick={() => {
              const nextSelectedSlotIds = draftSelectedSlotIds.slice(0, draftLayout.slots);
              setSelectedLayout(draftSelectedLayout);
              setSelectedSlotIds(nextSelectedSlotIds);
              setDraftSelectedSlotIds(nextSelectedSlotIds);
            }}
            disabled={!hasPendingChanges}
            className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {t('common.apply')}
          </Button>
        </div>
      </LeftControls>

      <div className="grid" style={gridStyle}>
        {displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-full col-span-full">
            <div className="text-center">
              <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {t('scene1.noItemsSelected')}
              </p>
              <p className="text-zinc-400 mt-2">{t('scene1.selectPilotsOrMedia')}</p>
            </div>
          </div>
        ) : (
          displayItems.map((item) => {
            // External media item
            if (item.type === 'media') {
              return (
                <div key={item.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: chromaKey }}>
                  <iframe
                    src={item.url}
                    className="w-full h-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={item.name}
                  />
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                    {renderIcon(item.icon)}
                    <p className="text-white font-bold text-lg uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1)' }}>
                      {item.name}
                    </p>
                  </div>
                </div>
              );
            }

            if (item.type === 'stage-map') {
              return (
                <div key={item.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: chromaKey }}>
                  <PlacemarkMapFeed placemark={item} pilotMarkers={pilotMapMarkers} className="w-full h-full" />
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                    <div className="flex items-center gap-2">
                      <MapIcon className="w-5 h-5 text-[#FF4500]" />
                      <div className="min-w-0 flex-1 relative pr-32">
                        <p className="text-white font-bold text-lg uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1)' }}>
                          {item.name}
                        </p>
                        {item.placemarkName && (
                          <p className="text-zinc-300 text-xs uppercase tracking-wide truncate mt-1">
                            {item.placemarkName}
                          </p>
                        )}
                        <MapWeatherBadges placemark={item} className="absolute right-0 bottom-0" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // Camera Item
            if (item.type === 'camera') {
              return (
                <div key={item.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: chromaKey }}>
                  <StreamPlayer
                    pilotId={item.id}
                    streamUrl={item.streamUrl}
                    name={item.name}
                    className="w-full h-full"
                  />
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                    <div className="flex items-center gap-2">
                      <Video className="w-5 h-5 text-[#FF4500]" />
                      <p className="text-white font-bold text-lg uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1)' }}>
                        {item.name}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            // Pilot Stream Item
            const pilot = item;
            const category = categoryById.get(pilot.categoryId);
            const lapInfo = isLapRace ? getPilotLapInfo(pilot.id) : null;
            const alert = currentStageId ? alertByPilotId.has(pilot.id) : false;
            const jumpStart = currentStageId ? jumpStartByPilotId.has(pilot.id) : false;
            const pilotStageMeta = pilotStageMetaById.get(pilot.id);
            const liveStatus = isSSStage ? (pilotStageMeta?.currentStatus || 'not_started') : '';
            const startTime = currentStageId ? (startTimes[pilot.id]?.[currentStageId] || '') : '';
            const finishTime = currentStageId ? (times[pilot.id]?.[currentStageId] || '') : '';
            const retired = currentStageId ? !!retiredStages?.[pilot.id]?.[currentStageId] : false;
            
            let displayTime = '';
            let timeColor = 'text-zinc-400';
            let positionBadge = null;
            let showLiveTime = false;
            
            if (isLapRace && lapInfo) {
              const finishedLapDisplay = lapInfo.isFinished
                ? `${lapInfo.totalTimeMode === 'bestLap' ? `${t('times.bestLapShort')} • ` : ''}${lapInfo.totalTimeText || lapInfo.displayText || ''}`
                : '';
              // Lap Race display
              positionBadge = (
                <div className="absolute top-2 left-2 bg-black/80 px-2 py-1 rounded flex items-center gap-1">
                  <span className="text-[#FF4500] font-bold text-lg">P{lapInfo.position}</span>
                  <span className="text-zinc-400 text-sm">
                    Lap {lapInfo.completedLaps}/{lapInfo.totalLaps}
                  </span>
                </div>
              );
              if (lapInfo.retired) {
                displayTime = t('status.retired');
                timeColor = 'text-red-400';
              } else if (lapInfo.isFinished && finishedLapDisplay) {
                displayTime = finishedLapDisplay;
                timeColor = 'text-[#22C55E]';
              } else if (lapInfo.displayText) {
                displayTime = lapInfo.displayText;
                timeColor = lapInfo.isFinished
                  ? 'text-[#22C55E]'
                  : lapInfo.isRacing
                    ? 'text-[#FACC15]'
                    : 'text-zinc-400';
              } else if (lapInfo.isFinished) {
                displayTime = 'FINISHED';
                timeColor = 'text-[#22C55E]';
              }
            } else if (isSSStage) {
              showLiveTime = true;

              if (liveStatus === 'retired') {
                timeColor = 'text-red-400';
              } else if (liveStatus === 'racing') {
                timeColor = 'text-[#FF8C00]';
              } else if (liveStatus === 'finished' && finishTime) {
                timeColor = retired ? 'text-amber-400' : 'text-[#22C55E]';
              } else if (startTime) {
                timeColor = 'text-zinc-500';
              }
            }
            
            return (
              <div key={pilot.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: hideStreams ? chromaKey : 'black' }}>
                {category && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 z-10" style={{ backgroundColor: category.color }} />
                )}
                {positionBadge}
                {!hideStreams && (
                  <StreamPlayer
                    pilotId={pilot.id}
                    streamUrl={pilot.streamUrl}
                    name={pilot.name}
                    className="w-full h-full"
                  />
                )}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-white font-bold text-lg uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1), 2px 2px 4px rgba(0,0,0,1), -1px -1px 2px rgba(0,0,0,1)' }}>
                        <span className="text-zinc-400 text-base mr-2" style={{ textShadow: '0 0 6px rgba(0,0,0,1)' }}>#{pilot.startOrder || '?'}</span>
                        {pilot.name}
                      </p>
                      {alert && (
                        <StatusPill
                          variant="alert"
                          text={t('status.alert')}
                          tooltipTitle={t('status.alertLabel')}
                          tooltipText={t('status.alertTooltip')}
                        />
                      )}
                      {jumpStart && (
                        <StatusPill
                          variant="jumpStart"
                          text={t('status.jumpStart')}
                          tooltipTitle={t('times.jumpStart')}
                          tooltipText={t('times.jumpStartTooltip')}
                        />
                      )}
                    </div>
                    {showLiveTime && (
                      <LiveStartInformationValue
                        as="p"
                        startTime={startTime}
                        finishTime={finishTime}
                        retired={retired}
                        stageDate={currentStage?.date}
                        startLabel={t('status.start')}
                        retiredLabel={t('status.retired')}
                        liveStatus={liveStatus}
                        debugDate={debugDate}
                        className={`font-mono text-lg font-bold ${timeColor}`}
                        style={{ fontFamily: 'JetBrains Mono, monospace', textShadow: '0 0 10px rgba(0,0,0,1), 2px 2px 6px rgba(0,0,0,1), -1px -1px 3px rgba(0,0,0,1)' }}
                      />
                    )}
                    {!showLiveTime && displayTime && (
                      <p
                        className={`font-mono text-lg font-bold ${timeColor}`}
                        style={{ fontFamily: 'JetBrains Mono, monospace', textShadow: '0 0 10px rgba(0,0,0,1), 2px 2px 6px rgba(0,0,0,1), -1px -1px 3px rgba(0,0,0,1)' }}
                      >
                        {displayTime}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Panel - Current Stage Info */}
      {currentStage && currentStageId && (
        <div className="absolute" style={{ bottom: sceneInset, left: sceneInset, right: sceneInset }}>
          <div className="bg-black/95 backdrop-blur-sm border-l-4 border-[#FF4500] overflow-hidden mb-4">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isLapRace ? (
                  <RotateCcw className="w-6 h-6 text-[#FACC15]" />
                ) : (
                  <Flag className="w-6 h-6 text-[#FF4500]" />
                )}
                <div>
                  <p className="text-zinc-400 text-sm uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {isLapRace ? 'Race' : 'Current Stage'}
                  </p>
                  <div className="mt-1 flex items-end gap-6">
                    <p className="text-white text-3xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      {getStageDisplayName()}
                    </p>
                    {stageScheduleTime && (
                      <p className="text-zinc-300 text-2xl font-bold font-mono leading-none">
                        {stageScheduleTime}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {resolvedLogoUrl && (
                <img 
                  src={resolvedLogoUrl} 
                  alt="Channel Logo" 
                  className="h-16 max-w-[200px] object-contain"
                />
              )}
            </div>
          </div>

          {/* Bottom Ticker - Pilots sorted by position */}
          <div className="relative bg-black/95 backdrop-blur-sm border-t-2 border-[#FF4500]">
            {bottomScroll > 0 && (
              <button
                onClick={() => setBottomScroll(Math.max(0, bottomScroll - 200))}
                className="absolute left-0 top-0 bottom-0 z-10 bg-black/90 hover:bg-black px-2 text-white"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <div className="overflow-hidden px-10" ref={bottomContainerRef} onWheel={handleBottomTickerWheel}>
              <div 
                ref={bottomTrackRef}
                className="flex gap-2 py-2 transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${bottomScroll}px)` }}
              >
                {displayedTickerItems.map(({ pilot, position, completedLaps, isFinished, statusKey }) => {
                  const pilotMetaInfo = tickerPilotMetaById.get(pilot.id) || {};
                  const category = pilotMetaInfo.category || null;
                  const pilotMeta = pilotMetaInfo.pilotMeta || '';
                  const lapInfo = isLapRace ? getPilotLapInfo(pilot.id) : null;
                  const alert = currentStageId ? alertByPilotId.has(pilot.id) : false;
                  const jumpStart = currentStageId ? jumpStartByPilotId.has(pilot.id) : false;
                  const startTime = currentStageId ? (startTimes[pilot.id]?.[currentStageId] || '') : '';
                  const finishTime = currentStageId ? (times[pilot.id]?.[currentStageId] || '') : '';
                  const retired = currentStageId ? !!retiredStages?.[pilot.id]?.[currentStageId] : false;
                  
                  let borderColor = 'border-zinc-700';
                  let timeDisplay = '';
                  let timeColor = 'text-zinc-500';
                  let showLiveTime = false;
                  
                  if (isLapRace) {
                  if (isFinished) {
                      borderColor = 'border-[#22C55E]';
                      timeDisplay = `${lapInfo?.totalTimeMode === 'bestLap' ? `${t('times.bestLapShort')} • ` : ''}${lapInfo?.totalTimeText || 'FINISHED'}`;
                      timeColor = 'text-[#22C55E]';
                    } else if (completedLaps > 0) {
                      borderColor = 'border-[#FACC15]';
                      timeDisplay = `Lap ${lapInfo?.totalLaps > 0 ? `${completedLaps}/${lapInfo.totalLaps}` : completedLaps}${lapInfo?.lastLapText ? ` • ${lapInfo.lastLapText}` : ''}`;
                      timeColor = 'text-[#FACC15]';
                    } else if (lapInfo?.displayText) {
                      timeDisplay = lapInfo.displayText;
                      timeColor = 'text-zinc-400';
                    }
                  } else if (isSSStage) {
                    showLiveTime = true;

                    if (statusKey === 'retired') {
                      borderColor = 'border-red-500';
                      timeColor = 'text-red-400';
                    } else if (statusKey === 'finished' && finishTime) {
                      borderColor = retired ? 'border-amber-400' : 'border-[#22C55E]';
                      timeColor = retired ? 'text-amber-400' : 'text-[#22C55E]';
                    } else if (statusKey === 'racing') {
                      borderColor = 'border-[#FF8C00]';
                      timeColor = 'text-[#FF8C00]';
                    }
                  }
                  
                  return (
                    <div 
                      key={pilot.id} 
                      ref={(node) => setMotionRef(pilot.id, node)}
                      className={`relative flex-shrink-0 w-[170px] bg-white/5 border-2 ${borderColor} px-4 py-2.5 transition-all duration-500 ease-out ${getStatusMotionClassName(pilot.id)}`}
                      style={{
                        order: position,
                        willChange: 'transform',
                        '--pilot-status-motion-exit': `${pilotStatusMotionConfig.exitDuration}ms`,
                        '--pilot-status-motion-enter': `${pilotStatusMotionConfig.enterDuration}ms`,
                        '--pilot-status-motion-distance': `${pilotStatusMotionConfig.distance}px`,
                        '--pilot-status-motion-easing': pilotStatusMotionConfig.easing
                      }}
                    >
                      {category && (
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
                      )}
                      <div className="pl-2 min-w-0">
                        {isLapRace && (
                          <span className="block text-[#FF4500] font-bold text-sm leading-none mb-1">P{position}</span>
                        )}
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-white text-sm font-bold uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              {pilotMetaInfo.abbreviatedName || pilot.name}
                            </p>
                            {alert && (
                              <StatusPill
                                variant="alert"
                                text={t('status.alert')}
                                tooltipTitle={t('status.alertLabel')}
                                tooltipText={t('status.alertTooltip')}
                              />
                            )}
                            {jumpStart && (
                              <StatusPill
                                variant="jumpStart"
                                text={t('status.jumpStart')}
                                tooltipTitle={t('times.jumpStart')}
                                tooltipText={t('times.jumpStartTooltip')}
                              />
                            )}
                          </div>
                          {pilotMeta && (
                            <p className="text-zinc-400 text-[11px] leading-tight truncate">
                              {pilotMeta}
                            </p>
                          )}
                          {showLiveTime && (
                            <LiveStartInformationValue
                              as="p"
                              startTime={startTime}
                              finishTime={finishTime}
                              retired={retired}
                              stageDate={currentStage?.date}
                              startLabel={t('status.start')}
                              retiredLabel={t('status.retired')}
                              liveStatus={statusKey}
                              debugDate={debugDate}
                              className={`font-mono text-xs truncate ${timeColor}`}
                              style={{ fontFamily: 'JetBrains Mono, monospace' }}
                            />
                          )}
                          {!showLiveTime && timeDisplay && (
                            <p className={`font-mono text-xs truncate ${timeColor}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {timeDisplay}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {bottomScroll < maxScroll && maxScroll > 0 && (
              <button
                onClick={() => setBottomScroll(Math.min(maxScroll, bottomScroll + 200))}
                className="absolute right-0 top-0 bottom-0 z-10 bg-black/90 hover:bg-black px-2 text-white"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
