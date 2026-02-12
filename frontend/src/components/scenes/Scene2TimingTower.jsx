import React, { useEffect, useState, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { getPilotStatus, getRunningTime, sortPilotsByStatus, parseTime } from '../../utils/rallyHelpers';
import { ChevronRight, Radio, RotateCcw, Flag } from 'lucide-react';

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
    chromaKey, logoUrl, lapTimes, stagePilots 
  } = useRally();
  const { t } = useTranslation();
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedPilotId, setSelectedPilotId] = useState(null);
  const [expandedPilotId, setExpandedPilotId] = useState(null);
  
  const currentStage = stages.find(s => s.id === currentStageId);
  const isLapRace = currentStage?.type === 'Lap Race';
  const isSSStage = currentStage?.type === 'SS';

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  // Calculate sorted pilots based on stage type
  const sortedPilotsData = useMemo(() => {
    if (!currentStageId || !currentStage) return [];
    
    if (isLapRace) {
      return calculateLapRaceData(pilots, currentStageId, lapTimes, stagePilots, currentStage.numberOfLaps || 5);
    }
    
    // SS Stage - use existing logic
    const sortedPilots = sortPilotsByStatus(pilots, currentStageId, startTimes, times);
    return sortedPilots.map((pilot, index) => {
      const status = getPilotStatus(pilot.id, currentStageId, startTimes, times);
      return {
        pilot,
        position: index + 1,
        status,
        isFinished: status === 'finished',
        isRacing: status === 'racing'
      };
    });
  }, [pilots, currentStageId, currentStage, isLapRace, lapTimes, stagePilots, startTimes, times]);

  useEffect(() => {
    if (!selectedPilotId && sortedPilotsData.length > 0) {
      const activePilot = sortedPilotsData.find(d => d.pilot.isActive && d.pilot.streamUrl);
      if (activePilot) setSelectedPilotId(activePilot.pilot.id);
    }
  }, [sortedPilotsData, selectedPilotId]);

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
  const leader = finished[0];

  const handleArrowClick = (e, pilotId) => {
    e.stopPropagation();
    if (expandedPilotId === pilotId) setExpandedPilotId(null);
    setSelectedPilotId(pilotId);
  };

  const handleRowClick = (pilotId) => {
    if (!pilots.find(p => p.id === pilotId)?.streamUrl) return;
    setExpandedPilotId(expandedPilotId === pilotId ? null : pilotId);
  };

  const renderPilotRow = (data, index) => {
    const { pilot, position, completedLaps, totalTimeMs, isFinished, isRacing } = data;
    const category = categories.find(c => c.id === pilot.categoryId);
    const isExpanded = expandedPilotId === pilot.id;
    const hasStream = pilot.streamUrl;
    
    let displayTime = '';
    let timeColor = 'text-zinc-500';
    let statusColor = 'bg-zinc-700';
    
    if (isLapRace) {
      if (isFinished) {
        displayTime = formatTime(totalTimeMs);
        timeColor = 'text-[#22C55E]';
        statusColor = 'bg-[#22C55E]';
      } else if (isRacing) {
        displayTime = `Lap ${completedLaps}/${currentStage?.numberOfLaps || 0}`;
        timeColor = 'text-[#FACC15]';
        statusColor = 'bg-[#FACC15]';
      }
    } else {
      // SS Stage logic
      const startTime = startTimes[pilot.id]?.[currentStageId];
      const finishTime = times[pilot.id]?.[currentStageId];
      
      if (isFinished && finishTime) {
        displayTime = finishTime;
        timeColor = 'text-[#22C55E]';
        statusColor = 'bg-[#22C55E]';
      } else if (isRacing && startTime) {
        displayTime = getRunningTime(startTime);
        timeColor = 'text-[#FF8C00]';
        statusColor = 'bg-[#FF8C00]';
      } else if (startTime) {
        displayTime = `Start: ${startTime}`;
        timeColor = 'text-zinc-500';
      }
    }

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
              {pilot.name}
            </span>
          </div>
          
          {/* Time/Gap */}
          <div className="text-right flex-shrink-0 ml-2">
            <span className={`font-mono text-sm ${timeColor}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {displayTime}
            </span>
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

  const selectedPilot = pilots.find(p => p.id === selectedPilotId);
  const selectedPilotData = sortedPilotsData.find(d => d.pilot.id === selectedPilotId);

  return (
    <div className="relative w-full h-full flex" data-testid="scene-2-timing-tower">
      {/* Left Side - Compact Timing Tower */}
      <div className="w-[280px] bg-gradient-to-b from-black/95 to-black/80 backdrop-blur-sm overflow-y-auto">
        {/* Header with diagonal accent */}
        <div className="relative p-4 pb-3 overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#FF4500]/20 rotate-45" />
          {logoUrl && (
            <div className="flex justify-center mb-3 relative z-10">
              <img 
                src={logoUrl} 
                alt="Channel Logo" 
                className="w-1/2 max-h-16 object-contain"
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
              Live Timing
            </h2>
          </div>
          {currentStage && (
            <div className="flex items-center gap-2 mt-1 relative z-10">
              <span className="text-zinc-400 text-xs font-bold uppercase">
                {isSSStage && currentStage.ssNumber ? `SS${currentStage.ssNumber} ` : ''}
                {currentStage.name}
                {isLapRace && ` (${currentStage.numberOfLaps} laps)`}
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
                {isLapRace ? 'Racing' : 'On Stage'}
              </span>
            </div>
            {racing.map((data, index) => renderPilotRow(data, index))}
          </div>
        )}

        {/* Finished Section */}
        {finished.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 bg-[#22C55E]/20 border-l-2 border-[#22C55E]">
              <span className="text-[#22C55E] text-xs font-bold uppercase">Finished</span>
            </div>
            {finished.map((data, index) => renderPilotRow(data, index))}
          </div>
        )}

        {/* Not Started Section */}
        {notStarted.length > 0 && (
          <div>
            <div className="px-3 py-1 bg-zinc-800/50 border-l-2 border-zinc-600">
              <span className="text-zinc-400 text-xs font-bold uppercase">
                {isLapRace ? 'Not Started' : 'Will Start'}
              </span>
            </div>
            {notStarted.map((data, index) => renderPilotRow(data, index))}
          </div>
        )}
      </div>

      {/* Right Side - Main Stream */}
      <div className="flex-1 relative" style={{ backgroundColor: chromaKey }}>
        {selectedPilot && selectedPilot.streamUrl && !hideStreams ? (
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
                  {isLapRace && selectedPilotData && (
                    <p className="text-[#FACC15] text-lg font-mono">
                      Lap {selectedPilotData.completedLaps || 0}/{currentStage?.numberOfLaps || 0}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-white text-xl">Select a pilot with an active stream</p>
          </div>
        )}
      </div>
    </div>
  );
}
