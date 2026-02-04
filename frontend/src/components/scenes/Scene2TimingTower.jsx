import React, { useEffect, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { getPilotStatus, getRunningTime, sortPilotsByStatus, parseTime } from '../../utils/rallyHelpers';
import { ChevronRight } from 'lucide-react';

export default function Scene2TimingTower({ hideStreams = false }) {
  const { pilots, categories, stages, times, startTimes, currentStageId, chromaKey } = useRally();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedPilotId, setSelectedPilotId] = useState(null); // For main stream display
  const [expandedPilotId, setExpandedPilotId] = useState(null); // For inline expanded stream
  const currentStage = stages.find(s => s.id === currentStageId);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  // Auto-select first active pilot for main display
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

  const handleArrowClick = (e, pilotId) => {
    e.stopPropagation();
    if (expandedPilotId === pilotId) {
      setExpandedPilotId(null);
    }
    setSelectedPilotId(pilotId);
  };

  const handleRowClick = (pilotId) => {
    if (!pilots.find(p => p.id === pilotId)?.streamUrl) return;
    
    if (expandedPilotId === pilotId) {
      // Collapse
      setExpandedPilotId(null);
    } else {
      // Expand inline
      setExpandedPilotId(pilotId);
    }
  };

  const renderPilotRow = (pilot, index, status) => {
    const startTime = startTimes[pilot.id]?.[currentStageId];
    const finishTime = times[pilot.id]?.[currentStageId];
    const category = categories.find(c => c.id === pilot.categoryId);
    const isSelectedForMain = pilot.id === selectedPilotId;
    const isExpanded = pilot.id === expandedPilotId;
    
    let displayTime = '-';
    let gap = '';

    if (status === 'racing' && startTime) {
      displayTime = getRunningTime(startTime);
    } else if (status === 'finished' && finishTime) {
      displayTime = finishTime;
      if (leader && pilot.id !== leader.id) {
        const pilotSeconds = parseTime(finishTime);
        const leaderSeconds = parseTime(times[leader.id]?.[currentStageId]);
        gap = '+' + (pilotSeconds - leaderSeconds).toFixed(3) + 's';
      }
    } else if (status === 'not_started' && startTime) {
      displayTime = 'Start: ' + startTime;
    }

    // Status border color
    let statusBorder = 'border-zinc-700';
    if (status === 'racing') statusBorder = 'border-t-[#FF8C00] border-r-[#FF8C00] border-b-[#FF8C00]';
    else if (status === 'finished') statusBorder = 'border-t-[#1a5f1a] border-r-[#1a5f1a] border-b-[#1a5f1a]';

    return (
      <div
        key={pilot.id}
        className={`relative bg-white/5 border-2 border-l-4 ${statusBorder} transition-all duration-300 ${
          pilot.streamUrl ? 'cursor-pointer hover:bg-white/10' : ''
        } ${isSelectedForMain ? 'border-r-[#FF4500]' : ''}`}
        style={{ borderLeftColor: category?.color || '#3f3f46' }}
      >
        {/* Main row content */}
        <div 
          className="flex items-center gap-3 p-2"
          onClick={() => handleRowClick(pilot.id)}
        >
          {/* Avatar/Initials (always show avatar in list, streams are muted/hidden) */}
          {pilot.picture ? (
            <img src={pilot.picture} alt={pilot.name} className="w-12 h-12 rounded object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-zinc-600">{pilot.name.charAt(0)}</span>
            </div>
          )}
          
          <div className="w-8 text-center">
            <span className={`text-xl font-bold ${
              status === 'racing' ? 'text-[#FACC15]' : 
              status === 'finished' ? 'text-[#22C55E]' : 
              'text-zinc-500'
            }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {index + 1}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-white font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {pilot.name}
            </p>
            <div className="flex justify-between items-center mt-1">
              <span className={`font-mono text-sm ${
                status === 'racing' ? 'text-[#FACC15]' : 
                status === 'finished' ? 'text-white' : 
                'text-zinc-500'
              }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {displayTime}
              </span>
              {gap && (
                <span className="text-zinc-400 text-xs font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {gap}
                </span>
              )}
            </div>
          </div>

          {/* Arrow button to send to main display */}
          {pilot.streamUrl && (
            <button
              onClick={(e) => handleArrowClick(e, pilot.id)}
              className={`w-8 h-full flex items-center justify-center transition-all duration-200 rounded ${
                isSelectedForMain 
                  ? 'text-[#FF4500] bg-[#FF4500]/20 shadow-[0_0_10px_rgba(255,69,0,0.5)]' 
                  : 'text-zinc-500 hover:text-white hover:bg-white/10'
              }`}
              title="Show in main display"
            >
              <ChevronRight className={`w-5 h-5 transition-transform ${isSelectedForMain ? 'scale-125' : ''}`} />
            </button>
          )}
        </div>

        {/* Expanded inline stream */}
        {isExpanded && pilot.streamUrl && !hideStreams && (
          <div 
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ height: '180px' }}
          >
            <div className="p-3 pt-0">
              <div className="w-full h-[160px] rounded overflow-hidden border-2 border-[#FF4500] bg-black">
                <StreamPlayer
                  pilotId={pilot.id}
                  streamUrl={pilot.streamUrl}
                  name={pilot.name}
                  className="w-full h-full"
                  forceUnmute={true}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const selectedPilot = pilots.find(p => p.id === selectedPilotId);

  return (
    <div className="relative w-full h-full flex" data-testid="scene-2-timing-tower">
      {/* Left Side - Timing Tower */}
      <div className="w-1/3 bg-black/95 backdrop-blur-sm p-6 overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-[#FF4500] text-3xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Timing Tower
          </h2>
          {currentStage && (
            <p className="text-zinc-400 text-sm mt-1">
              {currentStage.ssNumber ? `SS${currentStage.ssNumber} - ` : ''}{currentStage.name}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {racing.length > 0 && (
            <div>
              <h3 className="text-[#FACC15] text-sm font-bold uppercase mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                At the SS
              </h3>
              <div className="space-y-2">
                {racing.map((pilot, idx) => renderPilotRow(pilot, idx, 'racing'))}
              </div>
            </div>
          )}

          {finished.length > 0 && (
            <div>
              <h3 className="text-[#22C55E] text-sm font-bold uppercase mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                Finished
              </h3>
              <div className="space-y-2">
                {finished.map((pilot, idx) => renderPilotRow(pilot, idx, 'finished'))}
              </div>
            </div>
          )}

          {notStarted.length > 0 && (
            <div>
              <h3 className="text-zinc-500 text-sm font-bold uppercase mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                Will Start
              </h3>
              <div className="space-y-2">
                {notStarted.map((pilot, idx) => renderPilotRow(pilot, idx, 'not_started'))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Main Stream */}
      <div className="flex-1 p-8">
        {!selectedPilot || !selectedPilot.streamUrl ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {selectedPilot ? 'No Stream Available' : 'Select a Pilot'}
            </p>
          </div>
        ) : hideStreams ? (
          <div className="h-full rounded overflow-hidden border-2 border-[#FF4500] relative" style={{ backgroundColor: chromaKey }}>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-4">
              <p className="text-white font-bold text-2xl uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {selectedPilot.name}
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full bg-black rounded overflow-hidden border-2 border-[#FF4500] relative">
            <StreamPlayer
              pilotId={selectedPilot.id}
              streamUrl={selectedPilot.streamUrl}
              name={selectedPilot.name}
              className="w-full h-full"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-4">
              <p className="text-white font-bold text-2xl uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {selectedPilot.name}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
