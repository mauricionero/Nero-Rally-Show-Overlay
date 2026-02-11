import React, { useEffect, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { getPilotStatus, getRunningTime, sortPilotsByStatus, parseTime } from '../../utils/rallyHelpers';
import { ChevronRight, Radio } from 'lucide-react';

export default function Scene2TimingTower({ hideStreams = false }) {
  const { pilots, categories, stages, times, startTimes, currentStageId, chromaKey, logoUrl } = useRally();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedPilotId, setSelectedPilotId] = useState(null);
  const [expandedPilotId, setExpandedPilotId] = useState(null);
  const currentStage = stages.find(s => s.id === currentStageId);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedPilotId) {
      const activePilot = pilots.find(p => p.isActive && p.streamUrl);
      if (activePilot) setSelectedPilotId(activePilot.id);
    }
  }, [pilots, selectedPilotId]);

  if (!currentStageId) {
    return (
      <div className="relative w-full h-full flex items-center justify-center" data-testid="scene-2-timing-tower">
        <p className="text-white text-2xl">No current stage selected</p>
      </div>
    );
  }

  const sortedPilots = sortPilotsByStatus(pilots, currentStageId, startTimes, times);
  const racing = sortedPilots.filter(p => getPilotStatus(p.id, currentStageId, startTimes, times) === 'racing');
  const finished = sortedPilots.filter(p => getPilotStatus(p.id, currentStageId, startTimes, times) === 'finished');
  const notStarted = sortedPilots.filter(p => getPilotStatus(p.id, currentStageId, startTimes, times) === 'not_started');
  const leader = finished[0];

  // Get overall position for a pilot
  const getOverallPosition = (pilotId) => {
    const allSorted = [...finished, ...racing, ...notStarted];
    return allSorted.findIndex(p => p.id === pilotId) + 1;
  };

  const handleArrowClick = (e, pilotId) => {
    e.stopPropagation();
    if (expandedPilotId === pilotId) setExpandedPilotId(null);
    setSelectedPilotId(pilotId);
  };

  const handleRowClick = (pilotId) => {
    if (!pilots.find(p => p.id === pilotId)?.streamUrl) return;
    setExpandedPilotId(expandedPilotId === pilotId ? null : pilotId);
  };

  const renderPilotRow = (pilot, index, status) => {
    const startTime = startTimes[pilot.id]?.[currentStageId];
    const finishTime = times[pilot.id]?.[currentStageId];
    const category = categories.find(c => c.id === pilot.categoryId);
    const isSelectedForMain = pilot.id === selectedPilotId;
    const isExpanded = pilot.id === expandedPilotId;
    const position = getOverallPosition(pilot.id);
    
    let displayTime = '-';
    let gap = '';

    if (status === 'racing' && startTime) {
      displayTime = getRunningTime(startTime);
    } else if (status === 'finished' && finishTime) {
      displayTime = finishTime;
      if (leader && pilot.id !== leader.id) {
        const pilotSeconds = parseTime(finishTime);
        const leaderSeconds = parseTime(times[leader.id]?.[currentStageId]);
        gap = '+' + (pilotSeconds - leaderSeconds).toFixed(3);
      }
    } else if (status === 'not_started' && startTime) {
      displayTime = startTime;
    }

    const statusColors = {
      racing: { bg: 'bg-gradient-to-r from-[#FF8C00]/20 to-transparent', border: 'border-[#FF8C00]', text: 'text-[#FACC15]' },
      finished: { bg: 'bg-gradient-to-r from-[#22C55E]/20 to-transparent', border: 'border-[#22C55E]', text: 'text-[#22C55E]' },
      not_started: { bg: 'bg-gradient-to-r from-zinc-700/20 to-transparent', border: 'border-zinc-600', text: 'text-zinc-500' }
    };
    const colors = statusColors[status];

    return (
      <div
        key={pilot.id}
        className={`relative overflow-hidden transition-all duration-300 ${
          pilot.streamUrl ? 'cursor-pointer' : ''
        } ${isSelectedForMain ? 'translate-x-2' : ''}`}
      >
        {/* Racing stripe accent */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: category?.color || '#3f3f46' }}
        />
        
        {/* Main row */}
        <div 
          className={`${colors.bg} border-l-4 ${colors.border} ml-1 hover:bg-white/10 transition-colors`}
          onClick={() => handleRowClick(pilot.id)}
        >
          <div className="flex items-center gap-2 p-2">
            {/* Position badge */}
            <div className={`w-8 h-8 flex items-center justify-center font-black text-lg ${
              position === 1 ? 'bg-[#FFD700] text-black' :
              position === 2 ? 'bg-[#C0C0C0] text-black' :
              position === 3 ? 'bg-[#CD7F32] text-black' :
              'bg-zinc-800 text-white'
            }`} style={{ 
              fontFamily: 'Barlow Condensed, sans-serif',
              clipPath: 'polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)'
            }}>
              {position}
            </div>

            {/* Small stream thumbnail or avatar - always visible */}
            <div className="relative flex-shrink-0">
              {pilot.streamUrl && !hideStreams ? (
                <div className="w-14 h-9 rounded overflow-hidden bg-black border border-zinc-700">
                  <StreamPlayer
                    pilotId={pilot.id}
                    streamUrl={pilot.streamUrl}
                    name={pilot.name}
                    className="w-full h-full"
                    forceMute={true}
                    showMuteIndicator={false}
                    />
                  </div>
                ) : pilot.picture ? (
                  <img src={pilot.picture} alt={pilot.name} className="w-10 h-10 rounded object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center">
                    <span className="text-sm font-bold text-zinc-600">{pilot.name.charAt(0)}</span>
                  </div>
                )}
              </div>

            {/* Pilot info */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold uppercase text-sm truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {pilot.name}
              </p>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs font-bold ${colors.text}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {displayTime}
                </span>
                {gap && (
                  <span className="text-red-400 text-xs font-mono font-bold">{gap}</span>
                )}
              </div>
            </div>

            {/* Arrow button */}
            {pilot.streamUrl && (
              <button
                onClick={(e) => handleArrowClick(e, pilot.id)}
                className={`w-7 h-10 flex items-center justify-center transition-all duration-200 ${
                  isSelectedForMain 
                    ? 'text-[#FF4500] bg-[#FF4500]/30 shadow-[0_0_15px_rgba(255,69,0,0.7)]' 
                    : 'text-zinc-500 hover:text-white hover:bg-white/10'
                }`}
                style={{ clipPath: 'polygon(0 0, 70% 0, 100% 50%, 70% 100%, 0 100%)' }}
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${isSelectedForMain ? 'scale-110' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Expanded inline stream - only render when expanded */}
        {isExpanded && pilot.streamUrl && !hideStreams && (
          <div className="px-2 pb-2 pt-1 ml-1 bg-black/50">
            <div className="w-full h-[140px] rounded overflow-hidden border-2 border-[#FF4500] bg-black shadow-[0_0_20px_rgba(255,69,0,0.4)]">
              <StreamPlayer
                pilotId={pilot.id}
                streamUrl={pilot.streamUrl}
                name={pilot.name}
                className="w-full h-full"
                forceUnmute={true}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const selectedPilot = pilots.find(p => p.id === selectedPilotId);
  const selectedPosition = selectedPilot ? getOverallPosition(selectedPilot.id) : null;
  const selectedStatus = selectedPilot ? getPilotStatus(selectedPilot.id, currentStageId, startTimes, times) : null;
  const selectedCategory = selectedPilot ? categories.find(c => c.id === selectedPilot.categoryId) : null;

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
          <h2 className="text-[#FF4500] text-2xl font-black uppercase tracking-wider relative z-10" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Live Timing
          </h2>
          {currentStage && (
            <div className="flex items-center gap-2 mt-1 relative z-10">
              <span className="text-zinc-400 text-xs font-bold uppercase">
                {currentStage.ssNumber ? `SS${currentStage.ssNumber}` : ''} {currentStage.name}
              </span>
            </div>
          )}
        </div>

        {/* Pilot list */}
        <div className="space-y-1 px-2 pb-4">
          {racing.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-2 py-1">
                <div className="w-2 h-2 rounded-full bg-[#FACC15] animate-pulse" />
                <span className="text-[#FACC15] text-xs font-bold uppercase tracking-wider">On Stage</span>
              </div>
              <div className="space-y-1">
                {racing.map((pilot, idx) => renderPilotRow(pilot, idx, 'racing'))}
              </div>
            </div>
          )}

          {finished.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2 px-2 py-1">
                <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                <span className="text-[#22C55E] text-xs font-bold uppercase tracking-wider">Finished</span>
              </div>
              <div className="space-y-1">
                {finished.map((pilot, idx) => renderPilotRow(pilot, idx, 'finished'))}
              </div>
            </div>
          )}

          {notStarted.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2 px-2 py-1">
                <div className="w-2 h-2 rounded-full bg-zinc-500" />
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Waiting</span>
              </div>
              <div className="space-y-1">
                {notStarted.map((pilot, idx) => renderPilotRow(pilot, idx, 'not_started'))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Main Stream (wider) */}
      <div className="flex-1 p-4 flex flex-col">
        {!selectedPilot || !selectedPilot.streamUrl ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {selectedPilot ? 'No Stream Available' : 'Click a pilot to view'}
            </p>
          </div>
        ) : (
          <div className="relative flex-1 rounded-lg overflow-hidden border-2 border-[#FF4500]">
            {/* Stream */}
            {hideStreams ? (
              <div className="w-full h-full" style={{ backgroundColor: chromaKey }} />
            ) : (
              <StreamPlayer
                pilotId={selectedPilot.id}
                streamUrl={selectedPilot.streamUrl}
                name={selectedPilot.name}
                className="w-full h-full"
              />
            )}

            {/* LIVE Badge */}
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded">
              <Radio className="w-4 h-4 animate-pulse" />
              <span className="text-sm font-black uppercase tracking-wider">LIVE</span>
            </div>

            {/* Stage info badge */}
            {currentStage && (
              <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm px-4 py-2 rounded">
                <span className="text-[#FF4500] text-lg font-black uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {currentStage.ssNumber ? `SS${currentStage.ssNumber}` : currentStage.name}
                </span>
              </div>
            )}

            {/* Bottom overlay - Driver info bar */}
            <div className="absolute bottom-0 left-0 right-0">
              {/* Diagonal racing stripe */}
              <div 
                className="h-1 w-full"
                style={{ 
                  background: `linear-gradient(90deg, ${selectedCategory?.color || '#FF4500'} 0%, transparent 100%)`
                }}
              />
              
              {/* Info bar */}
              <div className="bg-gradient-to-t from-black via-black/95 to-transparent pt-8 pb-4 px-6">
                <div className="flex items-end justify-between">
                  {/* Left - Position & Name */}
                  <div className="flex items-end gap-4">
                    {/* Position badge */}
                    <div className={`w-16 h-16 flex items-center justify-center font-black text-3xl ${
                      selectedPosition === 1 ? 'bg-[#FFD700] text-black' :
                      selectedPosition === 2 ? 'bg-[#C0C0C0] text-black' :
                      selectedPosition === 3 ? 'bg-[#CD7F32] text-black' :
                      'bg-zinc-800 text-white'
                    }`} style={{ 
                      fontFamily: 'Barlow Condensed, sans-serif',
                      clipPath: 'polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)'
                    }}>
                      P{selectedPosition}
                    </div>
                    
                    {/* Name */}
                    <div>
                      <p className="text-white font-black text-3xl uppercase tracking-wide" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {selectedPilot.name}
                      </p>
                      {selectedCategory && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedCategory.color }} />
                          <span className="text-zinc-400 text-sm font-bold uppercase">{selectedCategory.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right - Time */}
                  <div className="text-right">
                    {selectedStatus === 'racing' && (
                      <>
                        <p className="text-zinc-400 text-xs uppercase tracking-wider">Stage Time</p>
                        <p className="text-[#FACC15] text-4xl font-mono font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {getRunningTime(startTimes[selectedPilot.id]?.[currentStageId])}
                        </p>
                      </>
                    )}
                    {selectedStatus === 'finished' && (
                      <>
                        <p className="text-zinc-400 text-xs uppercase tracking-wider">Stage Time</p>
                        <p className="text-[#22C55E] text-4xl font-mono font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {times[selectedPilot.id]?.[currentStageId] || '-'}
                        </p>
                      </>
                    )}
                    {selectedStatus === 'not_started' && (
                      <>
                        <p className="text-zinc-400 text-xs uppercase tracking-wider">Start Time</p>
                        <p className="text-white text-4xl font-mono font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {startTimes[selectedPilot.id]?.[currentStageId] || '-'}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
