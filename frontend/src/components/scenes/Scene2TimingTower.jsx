import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { FeedSelect } from '../FeedSelect.jsx';
import { PlacemarkMapFeed, MapWeatherBadges } from '../PlacemarkMapFeed.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { PilotTelemetryHud } from '../PilotTelemetryHud.jsx';
import { LiveStartInformationValue } from '../LiveStartInformationValue.jsx';
import StatusPill from '../StatusPill.jsx';
import { buildLapRaceLeaderboard, getLapRaceStageMetaParts, getReferenceNow, parseTime, getStageDateTime, isJumpStartForStage } from '../../utils/rallyHelpers';
import { ChevronRight, Radio, RotateCcw, Flag, Video, Map as MapIcon } from 'lucide-react';
import { buildFeedOptions, findFeedByValue, getFeedOptionValue } from '../../utils/feedOptions.js';
import { getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { getResolvedBrandingLogoUrl } from '../../utils/branding.js';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { getStageNumberLabel, isLapRaceStageType, isSpecialStageType } from '../../utils/stageTypes.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { usePilotStatusMotion } from '../../hooks/usePilotStatusMotion.js';
import { usePilotPositionMotion } from '../../hooks/usePilotPositionMotion.js';
import { useScheduledPilotBuckets } from '../../hooks/useScheduledPilotBuckets.js';
import { useFastClock } from '../../hooks/useFastClock.js';
import { useSecondAlignedClock } from '../../hooks/useSecondAlignedClock.js';
import { sortPilotsByDisplayOrder } from '../../utils/displayOrder.js';
import { formatDurationMs, formatSecondsValue } from '../../utils/timeFormat.js';
import { buildPilotMapMarkers } from '../../utils/pilotMapMarkers.js';
import { getPilotTelemetryForId } from '../../utils/pilotIdentity.js';

const TIMING_TOWER_WIDTH_KEY = 'scene2TimingTowerWidth';
const SCENE_2_CONFIG_KEY = 'scene2Config';
const DEFAULT_TOWER_WIDTH = 300;
const MIN_TOWER_WIDTH = 260;
const MAX_TOWER_WIDTH = 460;
const abbreviateCompactName = (name) => {
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

export default function Scene2TimingTower({ hideStreams = false }) {
  const { 
    pilots, categories, stages, times, startTimes, realStartTimes, currentStageId, 
    chromaKey, logoUrl, lapTimes, stagePilots, cameras, externalMedia, mapPlacemarks, retiredStages, stageAlerts, timeDecimals, debugDate, pilotTelemetryByPilotId
  } = useRally();
  const resolvedLogoUrl = getResolvedBrandingLogoUrl(logoUrl);
  const { t } = useTranslation();
  const pilotMapMarkers = useMemo(() => buildPilotMapMarkers(pilots, categories, pilotTelemetryByPilotId), [pilots, categories, pilotTelemetryByPilotId]);
  
  const [selectedFeedValue, setSelectedFeedValue] = useState(() => (
    loadSceneConfig(SCENE_2_CONFIG_KEY, { selectedFeedValue: null }).selectedFeedValue
  ));
  const [expandedPilotId, setExpandedPilotId] = useState(() => (
    loadSceneConfig(SCENE_2_CONFIG_KEY, { expandedPilotId: null }).expandedPilotId
  ));
  const [finishedDisplayMode, setFinishedDisplayMode] = useState(() => (
    loadSceneConfig(SCENE_2_CONFIG_KEY, { finishedDisplayMode: 'time' }).finishedDisplayMode || 'time'
  ));
  const [towerWidth, setTowerWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_TOWER_WIDTH;
    }

    const storedWidth = parseInt(window.localStorage.getItem(TIMING_TOWER_WIDTH_KEY) || '', 10);
    return Number.isFinite(storedWidth)
      ? Math.min(MAX_TOWER_WIDTH, Math.max(MIN_TOWER_WIDTH, storedWidth))
      : DEFAULT_TOWER_WIDTH;
  });
  const resizeStateRef = useRef(null);
  
  const currentStage = stages.find(s => s.id === currentStageId);
  const isLapRace = isLapRaceStageType(currentStage?.type);
  const isSSStage = isSpecialStageType(currentStage?.type);
  const currentStageLapMeta = useMemo(() => (
    getLapRaceStageMetaParts({
      stage: currentStage,
      lapsLabel: t('scene3.laps').toLowerCase(),
      maxTimeLabel: t('theRace.lapRaceMaxTimeMinutes')
    }).join(' • ')
  ), [currentStage, t]);
  const lapFastClockEnabled = Boolean(currentStageId && isLapRace && timeDecimals > 0);
  const currentFastTime = useFastClock(lapFastClockEnabled);
  const currentSecondAlignedTime = useSecondAlignedClock(Boolean(currentStageId && isLapRace && !lapFastClockEnabled));
  const sceneNow = useMemo(() => (
    getReferenceNow(
      debugDate,
      lapFastClockEnabled ? new Date(currentFastTime) : currentSecondAlignedTime
    )
  ), [currentFastTime, currentSecondAlignedTime, debugDate, lapFastClockEnabled]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TIMING_TOWER_WIDTH_KEY, String(towerWidth));
    }
  }, [towerWidth]);

  useEffect(() => {
    saveSceneConfig(SCENE_2_CONFIG_KEY, {
      selectedFeedValue,
      expandedPilotId,
      finishedDisplayMode
    });
  }, [selectedFeedValue, expandedPilotId, finishedDisplayMode]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!resizeStateRef.current) {
        return;
      }

      const { startX, startWidth } = resizeStateRef.current;
      const nextWidth = Math.min(
        MAX_TOWER_WIDTH,
        Math.max(MIN_TOWER_WIDTH, startWidth + (event.clientX - startX))
      );
      setTowerWidth(nextWidth);
    };

    const handleMouseUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const displaySortedPilots = useMemo(() => (
    sortPilotsByDisplayOrder(pilots, categories)
  ), [pilots, categories]);

  const displayOrderByPilotId = useMemo(() => (
    new Map(displaySortedPilots.map((pilot, index) => [pilot.id, index]))
  ), [displaySortedPilots]);

  const sortedLapRacePilotsData = useMemo(() => {
    if (!currentStageId || !currentStage || !isLapRace) return [];
    return buildLapRaceLeaderboard({
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
  }, [currentStage, currentStageId, displayOrderByPilotId, isLapRace, lapTimes, pilots, retiredStages, sceneNow, stagePilots, startTimes, timeDecimals, times]);
  const isLapRaceStageFinished = useMemo(() => (
    isLapRace
      && sortedLapRacePilotsData.length > 0
      && sortedLapRacePilotsData.every((entry) => entry.retired || entry.isFinished)
  ), [isLapRace, sortedLapRacePilotsData]);
  const stageHeaderTime = useMemo(() => {
    if (!currentStage) {
      return '';
    }

    return currentStage.startTime || '';
  }, [currentStage]);

  const specialStageBaseItems = useMemo(() => {
    if (!currentStageId || !currentStage || isLapRace) {
      return [];
    }

    return pilots.map((pilot) => {
      const startTime = startTimes[pilot.id]?.[currentStageId] || '';
      const finishTime = times[pilot.id]?.[currentStageId] || '';
      const retired = !!retiredStages?.[pilot.id]?.[currentStageId];
      const startDateTime = getStageDateTime(currentStage.date, startTime);
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
          finished: finishTime ? parseTime(finishTime) : Number.MAX_SAFE_INTEGER,
          not_started: displayOrder,
          retired: displayOrder
        }
      };
    });
  }, [currentStage, currentStageId, displayOrderByPilotId, isLapRace, pilots, retiredStages, startTimes, times]);

  const orderedSpecialStageItems = useScheduledPilotBuckets(specialStageBaseItems, {
    racing: 0,
    pre_start: 1,
    finished: 2,
    not_started: 3,
    retired: 4
  });

  const sortedPilotsData = useMemo(() => {
    if (isLapRace) {
      return sortedLapRacePilotsData;
    }

    return orderedSpecialStageItems.map((item, index) => ({
      ...item,
      position: index + 1,
      status: item.currentStatus === 'pre_start' ? 'not_started' : item.currentStatus,
      preStart: item.currentStatus === 'pre_start',
      isFinished: item.currentStatus === 'finished',
      isRacing: item.currentStatus === 'racing'
    }));
  }, [isLapRace, orderedSpecialStageItems, sortedLapRacePilotsData]);

  useEffect(() => {
    if (!selectedFeedValue && sortedPilotsData.length > 0) {
      const activePilot = sortedPilotsData.find(d => d.pilot.isActive && d.pilot.streamUrl);
      if (activePilot) {
        setSelectedFeedValue(getFeedOptionValue('pilot', activePilot.pilot.id));
      }
    }
  }, [sortedPilotsData, selectedFeedValue]);

  // Build list of available feeds (cameras first, then pilots with streams)
  // MUST be before any early returns to follow React Hook rules
  const availableFeeds = useMemo(() => {
    const pilotPositions = Object.fromEntries(sortedPilotsData.map((data) => [data.pilot.id, data.position]));
    return buildFeedOptions({ pilots, cameras, externalMedia, stages, mapPlacemarks, pilotPositions });
  }, [pilots, cameras, externalMedia, stages, mapPlacemarks, sortedPilotsData]);

  useEffect(() => {
    if (!selectedFeedValue && availableFeeds.length > 0) {
      setSelectedFeedValue(availableFeeds[0].value);
      return;
    }

    if (selectedFeedValue && !findFeedByValue(availableFeeds, selectedFeedValue)) {
      setSelectedFeedValue(availableFeeds[0]?.value || null);
    }
  }, [availableFeeds, selectedFeedValue]);

  useEffect(() => {
    if (expandedPilotId && !pilots.some((pilot) => pilot.id === expandedPilotId)) {
      setExpandedPilotId(null);
    }
  }, [expandedPilotId, pilots]);

  const categoryById = useMemo(() => (
    new Map(categories.map((category) => [category.id, category]))
  ), [categories]);

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
      if (isJumpStartForStage(pilot.id, currentStageId, startTimes, realStartTimes)) {
        next.add(pilot.id);
      }
    });
    return next;
  }, [currentStageId, pilots, realStartTimes, startTimes]);

  const pilotUiMetaById = useMemo(() => (
    new Map(pilots.map((pilot) => [
      pilot.id,
      {
        category: categoryById.get(pilot.categoryId) || null,
        fullName: pilot.name,
        compactName: abbreviateCompactName(pilot.name),
        hasStream: Boolean(pilot.streamUrl),
        alert: currentStageId ? alertByPilotId.has(pilot.id) : false,
        jumpStart: currentStageId ? jumpStartByPilotId.has(pilot.id) : false
      }
    ]))
  ), [alertByPilotId, categoryById, currentStageId, jumpStartByPilotId, pilots]);

  const towerItems = useMemo(() => {
    const onStage = sortedPilotsData.filter((data) => data.status === 'racing' || data.preStart);
    const onStageOrdered = [...onStage].sort((a, b) => {
      if (a.preStart === b.preStart) return 0;
      return a.preStart ? 1 : -1;
    });
    const finished = sortedPilotsData.filter((data) => data.status === 'finished');
    const notStarted = sortedPilotsData.filter((data) => data.status === 'not_started' && !data.preStart);
    const retired = sortedPilotsData.filter((data) => data.status === 'retired');

    return [...onStageOrdered, ...finished, ...notStarted, ...retired].map((data) => ({
      ...data,
      key: data.pilot.id,
      statusKey: data.preStart ? 'pre_start' : data.status
    }));
  }, [sortedPilotsData]);
  const {
    displayedItems: displayedTowerItems,
    getStatusMotionClassName,
    pilotStatusMotionConfig,
    isStatusTransitionActive
  } = usePilotStatusMotion(towerItems);
  const { setMotionRef } = usePilotPositionMotion(displayedTowerItems, {
    disabled: isStatusTransitionActive
  });
  const { onStageOrdered, finished, notStarted, retired } = useMemo(() => {
    const onStage = [];
    const finishedItems = [];
    const notStartedItems = [];
    const retiredItems = [];

    displayedTowerItems.forEach((item) => {
      if (item.statusKey === 'racing' || item.statusKey === 'pre_start') {
        onStage.push(item);
        return;
      }
      if (item.statusKey === 'finished') {
        finishedItems.push(item);
        return;
      }
      if (item.statusKey === 'retired') {
        retiredItems.push(item);
        return;
      }
      notStartedItems.push(item);
    });

    return {
      onStageOrdered: onStage,
      finished: finishedItems,
      notStarted: notStartedItems,
      retired: retiredItems
    };
  }, [displayedTowerItems]);

  const sectionPositionByPilotId = useMemo(() => {
    const positionMap = new Map();

    if (isLapRace) {
      sortedLapRacePilotsData.forEach((data, index) => {
        positionMap.set(data.pilot.id, index + 1);
      });
      return positionMap;
    }

    onStageOrdered.forEach((data, index) => {
      positionMap.set(data.pilot.id, index + 1);
    });
    finished.forEach((data, index) => {
      positionMap.set(data.pilot.id, index + 1);
    });
    notStarted.forEach((data, index) => {
      positionMap.set(data.pilot.id, index + 1);
    });
    retired.forEach((data, index) => {
      positionMap.set(data.pilot.id, index + 1);
    });

    return positionMap;
  }, [finished, isLapRace, notStarted, onStageOrdered, retired, sortedLapRacePilotsData]);
  const leader = isLapRace ? sortedLapRacePilotsData[0] : finished[0];

  if (!currentStageId) {
    return (
      <div className="relative w-full h-full flex items-center justify-center" data-testid="scene-2-timing-tower">
        <p className="text-white text-2xl">{t('scene2.noCurrentStage')}</p>
      </div>
    );
  }

  const handleArrowClick = (e, pilotId) => {
    e.stopPropagation();
    if (expandedPilotId === pilotId) setExpandedPilotId(null);
    setSelectedFeedValue(getFeedOptionValue('pilot', pilotId));
  };

  const handleRowClick = (pilotId) => {
    if (!pilots.find(p => p.id === pilotId)?.streamUrl) return;
    setExpandedPilotId(expandedPilotId === pilotId ? null : pilotId);
  };

  const handleResizeStart = (event) => {
    event.preventDefault();
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: towerWidth
    };
  };

  const renderPilotRow = (data, index) => {
    const { pilot, completedLaps, totalTimeMs, totalTimeText, totalTimeMode, isFinished, isRacing, startTime, finishTime, retired } = data;
    const pilotTelemetry = getPilotTelemetryForId(pilotTelemetryByPilotId, pilot.id);
    const pilotUiMeta = pilotUiMetaById.get(pilot.id) || {};
    const category = pilotUiMeta.category || null;
    const isExpanded = expandedPilotId === pilot.id;
    const hasStream = pilotUiMeta.hasStream || false;
    const alert = pilotUiMeta.alert || false;
    const jumpStart = pilotUiMeta.jumpStart || false;
    
    const rowStatusKey = retired ? 'retired' : (data.statusKey || data.currentStatus || data.status || '');
    let timeColor = 'text-zinc-500';
    const numberStatusKey = isLapRace
      ? (isFinished ? 'finished' : isRacing ? 'racing' : 'not_started')
      : (rowStatusKey || (isFinished ? 'finished' : isRacing ? 'racing' : 'not_started'));
    const numberColorClass = (() => {
      if (numberStatusKey === 'retired') return 'text-red-400';
      if (numberStatusKey === 'finished') return 'text-[#22C55E]';
      if (numberStatusKey === 'racing') return isLapRace ? 'text-[#FACC15]' : 'text-[#FF8C00]';
      if (numberStatusKey === 'pre_start') return 'text-[#FF8C00]';
      return 'text-zinc-500';
    })();
    
    if (isLapRace) {
      if (isFinished) {
        timeColor = 'text-[#22C55E]';
      } else if (isRacing) {
        timeColor = 'text-[#FACC15]';
      }
    } else {
      if (rowStatusKey === 'retired') {
        timeColor = 'text-red-400';
      } else if (isFinished && finishTime) {
        timeColor = retired ? 'text-amber-400' : 'text-[#22C55E]';
      } else if (isRacing) {
        timeColor = 'text-[#FF8C00]';
      }
    }

    const rowDisplayName = (finishTime || retired || startTime || isLapRace)
      ? pilotUiMeta.compactName
      : pilotUiMeta.fullName;

    // Calculate gap from leader
    let gap = '';
    if ((isFinished || isRacing) && leader && leader.pilot.id !== pilot.id) {
      if (isLapRace) {
        const lapDiff = (leader.completedLaps || 0) - (completedLaps || 0);
        if (lapDiff > 0) {
          gap = `+${lapDiff} ${t('scene3.laps').toLowerCase()}`;
        } else {
          const leaderTime = leader.totalTimeMs;
          const pilotTime = totalTimeMs;
          if (leaderTime && pilotTime) {
            const gapMs = pilotTime - leaderTime;
            gap = `+${formatDurationMs(gapMs, timeDecimals, { fallback: '' })}`;
          }
        }
      } else {
        const leaderTime = parseTime(leader.finishTime);
        const pilotTime = parseTime(finishTime);
        if (leaderTime && pilotTime) {
          const gapSeconds = pilotTime - leaderTime;
          gap = `+${formatSecondsValue(gapSeconds, timeDecimals, '')}s`;
        }
      }
    }
    const showGap = finishedDisplayMode === 'gap' && Boolean(gap) && leader && leader.pilot.id !== pilot.id;
    const displayValueClass = showGap ? 'text-zinc-400' : timeColor;

    return (
      <div
        key={pilot.id}
        ref={(node) => setMotionRef(pilot.id, node)}
        className={getStatusMotionClassName(pilot.id)}
        style={{
          '--pilot-status-motion-exit': `${pilotStatusMotionConfig.exitDuration}ms`,
          '--pilot-status-motion-enter': `${pilotStatusMotionConfig.enterDuration}ms`,
          '--pilot-status-motion-distance': `${pilotStatusMotionConfig.distance}px`,
          '--pilot-status-motion-easing': pilotStatusMotionConfig.easing
        }}
      >
        <div 
          onClick={() => handleRowClick(pilot.id)}
          className={`relative flex items-center px-3 py-2 border-b border-zinc-800/50 transition-all duration-300 ${
            hasStream ? 'cursor-pointer hover:bg-white/5' : ''
          } ${isExpanded ? 'bg-white/10' : ''}`}
          style={{ willChange: 'transform' }}
        >
          {/* Category stripe */}
          {category && (
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
          )}
          
          {/* Position */}
          <div className="w-7 flex-shrink-0">
            <span
              className={`font-bold text-sm ${numberColorClass}`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {index + 1}
            </span>
          </div>
          
          {/* Pilot name */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white text-sm font-bold uppercase truncate block" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {rowDisplayName}
              </span>
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
          </div>
          
          {/* Time / Gap */}
          <div className="text-right flex-shrink-0 ml-2">
            {isLapRace ? (
              <span className={`font-mono text-sm ${displayValueClass}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {showGap
                  ? gap
                  : isFinished
                    ? `${totalTimeMode === 'bestLap' ? `${t('times.bestLapShort')} • ` : ''}${totalTimeText || (totalTimeMs ? formatDurationMs(totalTimeMs, timeDecimals, { fallback: '' }) : '')}`
                    : isRacing
                      ? `${completedLaps > 0 ? `${t('times.lap')} ${data.totalLaps > 0 ? `${completedLaps}/${data.totalLaps}` : completedLaps}` : ''}${totalTimeMs ? `${completedLaps > 0 ? ' • ' : ''}${formatDurationMs(totalTimeMs, timeDecimals, { fallback: '' })}` : ''}`
                    : ''}
              </span>
            ) : showGap ? (
              <span className={`font-mono text-sm ${displayValueClass}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {gap}
              </span>
            ) : (
              <LiveStartInformationValue
                startTime={startTime}
                finishTime={finishTime}
                retired={retired}
                stageDate={currentStage?.date}
                startLabel={t('status.start')}
                retiredLabel={t('status.retired')}
                liveStatus={data.currentStatus}
                debugDate={debugDate}
                className={`font-mono text-sm ${displayValueClass}`}
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
            )}
          </div>
          
          {/* Arrow */}
          {hasStream && (
            <button
              onClick={(e) => handleArrowClick(e, pilot.id)}
              className="ml-2 text-zinc-500 hover:text-white transition-colors"
            >
              <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
        
        {/* Expanded stream */}
        {isExpanded && hasStream && !hideStreams && (
          <div className="relative h-32 bg-black m-2 rounded overflow-hidden">
            <StreamPlayer
              pilotId={pilot.id}
              streamUrl={pilot.streamUrl}
              name={pilot.name}
              className="w-full h-full"
              muted={true}
            />
            <PilotTelemetryHud pilot={pilot} telemetry={pilotTelemetry} compact raised />
          </div>
        )}
      </div>
    );
  };

  const selectedFeed = findFeedByValue(availableFeeds, selectedFeedValue);
  const selectedPilot = selectedFeed?.type === 'pilot' ? pilots.find((pilot) => pilot.id === selectedFeed.id) : null;
  const selectedPilotData = selectedFeed?.type === 'pilot'
    ? sortedPilotsData.find((data) => data.pilot.id === selectedFeed.id)
    : null;
  const selectedPilotMeta = selectedPilot
    ? [selectedPilot.car, selectedPilot.team].filter(Boolean).join(' • ')
    : '';
  const SelectedMediaIcon = selectedFeed?.type === 'media'
    ? getExternalMediaIconComponent(selectedFeed.icon)
    : null;
  const selectedPilotSectionPosition = selectedPilot
    ? sectionPositionByPilotId.get(selectedPilot.id) || selectedPilotData?.position || null
    : null;
  const selectedPilotTelemetry = getPilotTelemetryForId(pilotTelemetryByPilotId, selectedPilot?.id);

  return (
    <div className="relative w-full h-full flex" data-testid="scene-2-timing-tower">
      <LeftControls>
        <div className="space-y-4">
          {availableFeeds.length > 0 && (
            <div>
              <p className="text-white text-xs uppercase mb-2 block">{t('scene2.selectFeed')}</p>
              <FeedSelect
                value={selectedFeedValue || ''}
                onValueChange={setSelectedFeedValue}
                feeds={availableFeeds}
                placeholder={t('scene2.selectFeed')}
                triggerClassName="bg-[#18181B] border-zinc-700 text-white text-sm"
                contentClassName="bg-[#18181B] border-zinc-700 text-white"
                groupLabels={{
                  cameras: t('streams.additionalCameras'),
                  media: t('config.externalMedia'),
                  maps: t('config.stageMaps'),
                  pilots: t('tabs.pilots')
                }}
              />
            </div>
          )}
          <div>
            <p className="text-white text-xs uppercase mb-2 block">{t('scene2.finishedDisplay')}</p>
            <Select value={finishedDisplayMode} onValueChange={setFinishedDisplayMode}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time">{t('scene2.showTime')}</SelectItem>
                <SelectItem value="gap">{t('scene2.showGap')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </LeftControls>

      {/* Left Side - Compact Timing Tower */}
      <div
        className="bg-gradient-to-b from-black/95 to-black/80 backdrop-blur-sm overflow-y-auto"
        style={{ width: `${towerWidth}px` }}
      >
        {/* Header with diagonal accent */}
        <div className="relative p-4 pb-3 overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#FF4500]/20 rotate-45" />
          {resolvedLogoUrl && (
            <div className="flex justify-center mb-3 relative z-10">
              <img 
                src={resolvedLogoUrl} 
                alt="Channel Logo" 
                className="w-1/2 max-h-24 object-contain"
              />
            </div>
          )}
          <div className="flex items-center gap-2 relative z-10">
            {isLapRace ? (
              <RotateCcw className="w-5 h-5 text-[#FACC15]" />
            ) : (
              <Flag className="w-5 h-5 text-[#FF4500]" />
            )}
            <h2 className="text-[#FF4500] text-2xl font-black uppercase tracking-wider" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {t('scene2.liveTiming')}
            </h2>
          </div>
          {currentStage && (
            <div className="flex items-center gap-2 mt-1 relative z-10">
              <span className="text-zinc-400 text-xs font-bold uppercase">
                {isSSStage && currentStage.ssNumber ? `${getStageNumberLabel(currentStage)} ` : ''}
                {currentStage.name}
                {isLapRace && currentStageLapMeta && ` (${currentStageLapMeta})`}
              </span>
              {stageHeaderTime && (
                <span className={`text-xs font-bold font-mono ${isLapRace ? 'text-[#FACC15]' : 'text-zinc-300'}`}>
                  {stageHeaderTime}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Racing Section */}
        {onStageOrdered.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 bg-[#FF8C00]/20 border-l-2 border-[#FF8C00]">
              <span className="text-[#FF8C00] text-xs font-bold uppercase flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" />
                {isLapRace ? t('scene2.racing') : t('scene2.onStage')}
              </span>
            </div>
            {onStageOrdered.map((data, index) => renderPilotRow(data, index))}
          </div>
        )}

        {/* Finished Section */}
        {finished.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 bg-[#22C55E]/20 border-l-2 border-[#22C55E]">
              <span className="text-[#22C55E] text-xs font-bold uppercase flex items-center gap-1">
                <Flag className="w-3 h-3" />
                {t('scene2.finished')}
              </span>
            </div>
            {finished.map((data, index) => renderPilotRow(data, index))}
          </div>
        )}

        {/* Not Started Section */}
        {notStarted.length > 0 && (
          <div>
            <div className="px-3 py-1 bg-zinc-800/50 border-l-2 border-zinc-600">
              <span className="text-zinc-400 text-xs font-bold uppercase">
                {isLapRace ? t('scene2.notStarted') : t('scene2.willStart')}
              </span>
            </div>
            {notStarted.map((data, index) => renderPilotRow(data, index))}
          </div>
        )}

        {retired.length > 0 && (
          <div className="mt-2">
            <div className="px-3 py-1 bg-red-500/15 border-l-2 border-red-500">
              <span className="text-red-400 text-xs font-bold uppercase">
                {t('status.retired')}
              </span>
            </div>
            {retired.map((data, index) => renderPilotRow(data, index))}
          </div>
        )}
      </div>

      <div
        onMouseDown={handleResizeStart}
        className="group relative w-2 cursor-col-resize flex-shrink-0 bg-black/40 hover:bg-black/60 transition-colors"
        title="Resize timing tower"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-zinc-700 group-hover:bg-[#FF4500]" />
      </div>

      {/* Right Side - Main Stream */}
      <div className="flex-1 relative" style={{ backgroundColor: chromaKey }}>
        {selectedFeed?.type === 'media' ? (
          <>
            <iframe
              src={selectedFeed.url}
              className="w-full h-full border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={selectedFeed.name}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
              <div className="flex items-center gap-4">
                {SelectedMediaIcon && <SelectedMediaIcon className="w-8 h-8 text-[#FF4500]" />}
                <p className="text-white text-3xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {selectedFeed.name}
                </p>
              </div>
            </div>
          </>
        ) : selectedFeed?.type === 'stage-map' ? (
          <>
            <PlacemarkMapFeed placemark={selectedFeed} pilotMarkers={pilotMapMarkers} className="w-full h-full" />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
              <div className="flex items-center gap-4">
                <MapIcon className="w-8 h-8 text-[#FF4500]" />
                <div className="relative min-w-0 flex-1 pr-44">
                  <p className="text-white text-3xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {selectedFeed.name}
                  </p>
                  {selectedFeed.placemarkName && (
                    <p className="text-zinc-300 text-sm uppercase tracking-wide min-w-0 truncate mt-1">
                      {selectedFeed.placemarkName}
                    </p>
                  )}
                  <MapWeatherBadges placemark={selectedFeed} className="absolute right-0 bottom-0" />
                </div>
              </div>
            </div>
          </>
        ) : selectedFeed?.type === 'camera' && selectedFeed.streamUrl && !hideStreams ? (
          <>
            <StreamPlayer
              pilotId={selectedFeed.id}
              streamUrl={selectedFeed.streamUrl}
              name={selectedFeed.name}
              className="w-full h-full"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
              <div className="flex items-center gap-4">
                <Video className="w-8 h-8 text-[#FF4500]" />
                <p className="text-white text-3xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {selectedFeed.name}
                </p>
              </div>
            </div>
          </>
        ) : selectedPilot && selectedPilot.streamUrl && !hideStreams ? (
          /* Pilot Feed */
          <>
            <StreamPlayer
              pilotId={selectedPilot.id}
              streamUrl={selectedPilot.streamUrl}
              name={selectedPilot.name}
              className="w-full h-full"
            />
            <PilotTelemetryHud pilot={selectedPilot} telemetry={selectedPilotTelemetry} raised />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
              <div className="flex items-center gap-4">
                {selectedPilot?.carNumber && (
                  <div className="bg-[#FF4500] px-3 py-1 rounded">
                    <span className="text-white font-bold text-2xl">{selectedPilot.carNumber}</span>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-white text-3xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      {selectedPilot.name}
                    </p>
                    {selectedPilotSectionPosition && (
                      <span className="text-[#22C55E] text-xl font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        #{selectedPilotSectionPosition}
                      </span>
                    )}
                  </div>
                  {selectedPilotMeta && (
                    <p className="text-zinc-300 text-sm uppercase tracking-wide mt-1">
                      {selectedPilotMeta}
                    </p>
                  )}
                  {isLapRace && selectedPilotData && (
                    <p className="text-[#FACC15] text-lg font-mono">
                      {t('times.lap')} {selectedPilotData.totalLaps > 0 ? `${selectedPilotData.completedLaps || 0}/${selectedPilotData.totalLaps}` : (selectedPilotData.completedLaps || 0)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : hideStreams && selectedFeed ? (
          <div className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-white text-xl">{t('scene2.noPilotsOrCameras')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
