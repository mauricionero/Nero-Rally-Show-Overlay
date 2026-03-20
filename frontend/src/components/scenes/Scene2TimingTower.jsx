import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { FeedSelect } from '../FeedSelect.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { StartInformationValue } from '../StartInformationValue.jsx';
import { getPilotStatus, getReferenceNow, sortPilotsByStatus, parseTime, startInformationTime } from '../../utils/rallyHelpers';
import { ChevronRight, Radio, RotateCcw, Flag, Video } from 'lucide-react';
import { buildFeedOptions, findFeedByValue, getFeedOptionValue } from '../../utils/feedOptions.js';
import { getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { getStageNumberLabel, isLapRaceStageType, isSpecialStageType } from '../../utils/stageTypes.js';

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

// Format milliseconds to readable time
const formatTime = (ms) => {
  if (!ms) return '';
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = (totalSecs % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
};

export default function Scene2TimingTower({ hideStreams = false }) {
  const { 
    pilots, categories, stages, times, startTimes, currentStageId, 
    chromaKey, logoUrl, lapTimes, stagePilots, cameras, externalMedia, debugDate, retiredStages
  } = useRally();
  const { t } = useTranslation();
  
  const [currentTime, setCurrentTime] = useState(new Date());
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
  const sceneNow = useMemo(() => getReferenceNow(debugDate, currentTime), [debugDate, currentTime]);
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

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

  // Calculate sorted pilots based on stage type
  const sortedPilotsData = useMemo(() => {
    if (!currentStageId || !currentStage) return [];
    
    if (isLapRace) {
      return calculateLapRaceData(pilots, currentStageId, lapTimes, stagePilots, currentStage.numberOfLaps || 5);
    }
    
    // SS Stage - use existing logic
    const sortedPilots = sortPilotsByStatus(pilots, categories, currentStageId, startTimes, times, retiredStages, currentStage?.date, sceneNow);
    return sortedPilots.map((pilot, index) => {
      const status = getPilotStatus(pilot.id, currentStageId, startTimes, times, retiredStages, currentStage?.date, sceneNow);
      return {
        pilot,
        position: index + 1,
        status,
        isFinished: status === 'finished',
        isRacing: status === 'racing'
      };
    });
  }, [pilots, currentStageId, currentStage, isLapRace, lapTimes, stagePilots, startTimes, times, retiredStages, sceneNow]);

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

  if (!currentStageId) {
    return (
      <div className="relative w-full h-full flex items-center justify-center" data-testid="scene-2-timing-tower">
        <p className="text-white text-2xl">{t('scene2.noCurrentStage')}</p>
      </div>
    );
  }

  const racing = sortedPilotsData.filter(d => d.status === 'racing');
  const finished = sortedPilotsData.filter(d => d.status === 'finished');
  const notStarted = sortedPilotsData.filter(d => d.status === 'not_started');
  const retired = sortedPilotsData.filter(d => d.status === 'retired');
  const leader = finished[0];

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
    const { pilot, position, completedLaps, totalTimeMs, isFinished, isRacing } = data;
    const category = categories.find(c => c.id === pilot.categoryId);
    const isExpanded = expandedPilotId === pilot.id;
    const hasStream = pilot.streamUrl;
    
    let displayTime = '';
    let displayTimeInfo = null;
    let timeColor = 'text-zinc-500';
    let statusColor = 'bg-zinc-700';
    
    if (isLapRace) {
      if (isFinished) {
        displayTime = formatTime(totalTimeMs);
        timeColor = 'text-[#22C55E]';
        statusColor = 'bg-[#22C55E]';
      } else if (isRacing) {
        displayTime = `${t('times.lap')} ${completedLaps}/${currentStage?.numberOfLaps || 0}`;
        timeColor = 'text-[#FACC15]';
        statusColor = 'bg-[#FACC15]';
      }
    } else {
      // SS Stage logic
      const timeInfo = startInformationTime({
        pilotId: pilot.id,
        stageId: currentStageId,
        startTimes,
        times,
        retiredStages,
        stageDate: currentStage?.date,
        now: sceneNow,
        startLabel: t('status.start'),
        retiredLabel: t('status.retired')
      });
      displayTimeInfo = timeInfo;
      
      if (data.status === 'retired') {
        displayTime = timeInfo.text;
        timeColor = 'text-red-400';
        statusColor = 'bg-[#EF4444]';
      } else if (isFinished && timeInfo.finishTime) {
        displayTime = timeInfo.text;
        timeColor = timeInfo.retired ? 'text-amber-400' : 'text-[#22C55E]';
        statusColor = timeInfo.retired ? 'bg-[#F59E0B]' : 'bg-[#22C55E]';
      } else if (isRacing && timeInfo.timer) {
        displayTime = timeInfo.text;
        timeColor = 'text-[#FF8C00]';
        statusColor = 'bg-[#FF8C00]';
      } else if (timeInfo.text) {
        displayTime = timeInfo.text;
        timeColor = 'text-zinc-500';
      }
    }

    const rowDisplayName = displayTime ? abbreviateCompactName(pilot.name) : pilot.name;

    // Calculate gap from leader
    let gap = '';
    if (isFinished && leader && leader.pilot.id !== pilot.id) {
      if (isLapRace) {
        const leaderTime = leader.totalTimeMs;
        const pilotTime = totalTimeMs;
        if (leaderTime && pilotTime) {
          const gapMs = pilotTime - leaderTime;
          gap = `+${formatTime(gapMs)}`;
        }
      } else {
        const leaderTime = parseTime(times[leader.pilot.id]?.[currentStageId]);
        const pilotTime = parseTime(times[pilot.id]?.[currentStageId]);
        if (leaderTime && pilotTime) {
          const gapMs = pilotTime - leaderTime;
          const gapSecs = gapMs / 1000;
          gap = `+${gapSecs.toFixed(3)}s`;
        }
      }
    }

    return (
      <div key={pilot.id}>
        <div 
          onClick={() => handleRowClick(pilot.id)}
          className={`relative flex items-center px-3 py-2 border-b border-zinc-800/50 transition-all duration-300 ${
            hasStream ? 'cursor-pointer hover:bg-white/5' : ''
          } ${isExpanded ? 'bg-white/10' : ''}`}
        >
          {/* Category stripe */}
          {category && (
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
          )}
          
          {/* Position */}
          <div className="w-8 flex-shrink-0 ml-2">
            <span className="text-[#FF4500] font-bold text-sm">{position}</span>
          </div>
          
          {/* Status indicator */}
          <div className="w-2 h-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: statusColor.replace('bg-', '') === 'zinc-700' ? '#3f3f46' : statusColor.replace('bg-[', '').replace(']', '') }} />
          
          {/* Pilot name */}
          <div className="flex-1 min-w-0">
            <span className="text-white text-sm font-bold uppercase truncate block" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {rowDisplayName}
            </span>
          </div>
          
          {/* Time/Gap */}
          <div className="text-right flex-shrink-0 ml-2">
            <StartInformationValue
              info={displayTimeInfo}
              fallback={displayTime}
              className={`font-mono text-sm ${timeColor}`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
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
        {racing.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 bg-[#FF8C00]/20 border-l-2 border-[#FF8C00]">
              <span className="text-[#FF8C00] text-xs font-bold uppercase flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" />
                {isLapRace ? t('scene2.racing') : t('scene2.onStage')}
              </span>
            </div>
            {racing.map((data, index) => renderPilotRow(data, index))}
          </div>
        )}

        {/* Finished Section */}
        {finished.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 bg-[#22C55E]/20 border-l-2 border-[#22C55E]">
              <span className="text-[#22C55E] text-xs font-bold uppercase">{t('scene2.finished')}</span>
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
