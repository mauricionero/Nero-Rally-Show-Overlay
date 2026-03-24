import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { FeedSelect } from '../FeedSelect.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { LiveStartInformationValue } from '../LiveStartInformationValue.jsx';
import StatusPill from '../StatusPill.jsx';
import { parseTime, getStageDateTime, isJumpStartForStage } from '../../utils/rallyHelpers';
import { ChevronRight, Radio, RotateCcw, Flag, Video } from 'lucide-react';
import { buildFeedOptions, findFeedByValue, getFeedOptionValue } from '../../utils/feedOptions.js';
import { getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { getStageNumberLabel, isLapRaceStageType, isSpecialStageType } from '../../utils/stageTypes.js';
import { usePilotStatusMotion } from '../../hooks/usePilotStatusMotion.js';
import { usePilotPositionMotion } from '../../hooks/usePilotPositionMotion.js';
import { useScheduledPilotBuckets } from '../../hooks/useScheduledPilotBuckets.js';
import { sortPilotsByDisplayOrder } from '../../utils/displayOrder.js';
import { formatDurationMs, formatSecondsValue } from '../../utils/timeFormat.js';

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

// Helper to calculate positions for Lap Race
const calculateLapRaceData = (pilots, stageId, lapTimes, stagePilots, numberOfLaps) => {
  const selectedPilotIds = stagePilots[stageId] || pilots.map(p => p.id);
  const selectedPilots = pilots.filter(p => selectedPilotIds.includes(p.id));
  
  const pilotData = selectedPilots.map(pilot => {
    const pilotLaps = lapTimes[pilot.id]?.[stageId] || [];
    const completedLaps = pilotLaps.filter(t => t && t.trim() !== '').length;
    
    let totalTimeMs = 0;
    pilotLaps.forEach(lapTime => {
      if (!lapTime) return;
      const parts = lapTime.split(':');
      if (parts.length >= 2) {
        const hours = parts.length === 3 ? parseInt(parts[0]) || 0 : 0;
        const mins = parts.length === 3 ? parseInt(parts[1]) || 0 : parseInt(parts[0]) || 0;
        const secsStr = parts.length === 3 ? parts[2] : parts[1];
        const [secs, ms] = (secsStr || '0').split('.');
        totalTimeMs += (hours * 3600 + mins * 60 + parseFloat(secs || 0) + parseFloat(`0.${ms || 0}`)) * 1000;
      }
    });
    
    const isFinished = completedLaps >= numberOfLaps;
    const isRacing = completedLaps > 0 && !isFinished;
    
    return { 
      pilot, 
      completedLaps, 
      totalTimeMs,
      isFinished,
      isRacing,
      status: isFinished ? 'finished' : (isRacing ? 'racing' : 'not_started')
    };
  });

  pilotData.sort((a, b) => {
    if (b.completedLaps !== a.completedLaps) return b.completedLaps - a.completedLaps;
    if (a.completedLaps === 0) return 0;
    return a.totalTimeMs - b.totalTimeMs;
  });

  return pilotData.map((data, index) => ({
    ...data,
    position: index + 1
  }));
};

export default function Scene2TimingTower({ hideStreams = false }) {
  const { 
    pilots, categories, stages, times, startTimes, realStartTimes, currentStageId, 
    chromaKey, logoUrl, lapTimes, stagePilots, cameras, externalMedia, retiredStages, isStageAlert, timeDecimals
  } = useRally();
  const { t } = useTranslation();
  
  const [selectedFeedValue, setSelectedFeedValue] = useState(() => loadSceneConfig(SCENE_2_CONFIG_KEY, { selectedFeedValue: null }).selectedFeedValue);
  const [expandedPilotId, setExpandedPilotId] = useState(() => loadSceneConfig(SCENE_2_CONFIG_KEY, { expandedPilotId: null }).expandedPilotId);
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
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TIMING_TOWER_WIDTH_KEY, String(towerWidth));
    }
  }, [towerWidth]);

  useEffect(() => {
    saveSceneConfig(SCENE_2_CONFIG_KEY, {
      selectedFeedValue,
      expandedPilotId
    });
  }, [selectedFeedValue, expandedPilotId]);

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

  const sortedLapRacePilotsData = useMemo(() => {
    if (!currentStageId || !currentStage || !isLapRace) return [];
    return calculateLapRaceData(pilots, currentStageId, lapTimes, stagePilots, currentStage.numberOfLaps || 5);
  }, [currentStage, currentStageId, isLapRace, lapTimes, pilots, stagePilots]);

  const displaySortedPilots = useMemo(() => (
    sortPilotsByDisplayOrder(pilots, categories)
  ), [pilots, categories]);

  const displayOrderByPilotId = useMemo(() => (
    new Map(displaySortedPilots.map((pilot, index) => [pilot.id, index]))
  ), [displaySortedPilots]);

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
        fixedStatus: finishTime ? 'finished' : (retired ? 'retired' : 'not_started'),
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
    return buildFeedOptions({ pilots, cameras, externalMedia, pilotPositions });
  }, [pilots, cameras, externalMedia, sortedPilotsData]);

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

  const pilotUiMetaById = useMemo(() => (
    new Map(pilots.map((pilot) => [
      pilot.id,
      {
        category: categoryById.get(pilot.categoryId) || null,
        fullName: pilot.name,
        compactName: abbreviateCompactName(pilot.name),
        hasStream: Boolean(pilot.streamUrl),
        alert: currentStageId ? isStageAlert(pilot.id, currentStageId) : false,
        jumpStart: currentStageId ? isJumpStartForStage(pilot.id, currentStageId, startTimes, realStartTimes) : false
      }
    ]))
  ), [categories, categoryById, currentStageId, isStageAlert, pilots, realStartTimes, startTimes]);

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
  const onStageOrdered = displayedTowerItems.filter((data) => data.statusKey === 'racing' || data.statusKey === 'pre_start');
  const finished = displayedTowerItems.filter((data) => data.statusKey === 'finished');
  const notStarted = displayedTowerItems.filter((data) => data.statusKey === 'not_started');
  const retired = displayedTowerItems.filter((data) => data.statusKey === 'retired');
  const leader = finished[0];

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
    const { pilot, completedLaps, totalTimeMs, isFinished, isRacing, startTime, finishTime, retired } = data;
    const pilotUiMeta = pilotUiMetaById.get(pilot.id) || {};
    const category = pilotUiMeta.category || null;
    const isExpanded = expandedPilotId === pilot.id;
    const hasStream = pilotUiMeta.hasStream || false;
    const alert = pilotUiMeta.alert || false;
    const jumpStart = pilotUiMeta.jumpStart || false;
    
    let timeColor = 'text-zinc-500';
    let statusColor = 'bg-zinc-700';
    
    if (isLapRace) {
      if (isFinished) {
        timeColor = 'text-[#22C55E]';
        statusColor = 'bg-[#22C55E]';
      } else if (isRacing) {
        timeColor = 'text-[#FACC15]';
        statusColor = 'bg-[#FACC15]';
      }
    } else {
      if (data.currentStatus === 'retired') {
        timeColor = 'text-red-400';
        statusColor = 'bg-[#EF4444]';
      } else if (isFinished && finishTime) {
        timeColor = retired ? 'text-amber-400' : 'text-[#22C55E]';
        statusColor = retired ? 'bg-[#F59E0B]' : 'bg-[#22C55E]';
      } else if (isRacing) {
        timeColor = 'text-[#FF8C00]';
        statusColor = 'bg-[#FF8C00]';
      }
    }

    const rowDisplayName = (finishTime || retired || startTime || isLapRace)
      ? pilotUiMeta.compactName
      : pilotUiMeta.fullName;

    // Calculate gap from leader
    let gap = '';
    if (isFinished && leader && leader.pilot.id !== pilot.id) {
      if (isLapRace) {
        const leaderTime = leader.totalTimeMs;
        const pilotTime = totalTimeMs;
        if (leaderTime && pilotTime) {
          const gapMs = pilotTime - leaderTime;
          gap = `+${formatDurationMs(gapMs, timeDecimals, { fallback: '' })}`;
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
              className={`font-bold text-sm ${statusColor === 'bg-zinc-700' ? 'text-zinc-500' : statusColor.replace('bg-', 'text-')}`}
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
          
          {/* Time/Gap */}
          <div className="text-right flex-shrink-0 ml-2">
            {isLapRace ? (
              <span className={`font-mono text-sm ${timeColor}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {isFinished ? formatDurationMs(totalTimeMs, timeDecimals, { fallback: '' }) : (isRacing ? `${t('times.lap')} ${completedLaps}/${currentStage?.numberOfLaps || 0}` : '')}
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
                className={`font-mono text-sm ${timeColor}`}
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
            )}
            {gap && (
              <span className="text-zinc-500 text-xs ml-2 font-mono">{gap}</span>
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
          <div className="h-32 bg-black m-2 rounded overflow-hidden">
            <StreamPlayer
              pilotId={pilot.id}
              streamUrl={pilot.streamUrl}
              name={pilot.name}
              className="w-full h-full"
              muted={true}
            />
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
                  pilots: t('tabs.pilots')
                }}
              />
            </div>
          )}
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
          {logoUrl && (
            <div className="flex justify-center mb-3 relative z-10">
              <img 
                src={logoUrl} 
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
                {isLapRace && ` (${currentStage.numberOfLaps} ${t('scene3.laps').toLowerCase()})`}
              </span>
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
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
              <div className="flex items-center gap-4">
                {selectedPilotData && (
                  <div className="bg-[#FF4500] px-3 py-1 rounded">
                    <span className="text-white font-bold text-2xl">P{selectedPilotData.position}</span>
                  </div>
                )}
                <div>
                  <p className="text-white text-3xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {selectedPilot.name}
                  </p>
                  {selectedPilotMeta && (
                    <p className="text-zinc-300 text-sm uppercase tracking-wide mt-1">
                      {selectedPilotMeta}
                    </p>
                  )}
                  {isLapRace && selectedPilotData && (
                    <p className="text-[#FACC15] text-lg font-mono">
                      {t('times.lap')} {selectedPilotData.completedLaps || 0}/{currentStage?.numberOfLaps || 0}
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
