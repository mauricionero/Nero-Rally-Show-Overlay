import React, { useState, useEffect, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { getPilotStatus, getRunningTime } from '../../utils/rallyHelpers';
import { Flag, RotateCcw, Car, Timer } from 'lucide-react';

// Helper to get stage type icon
const getStageIcon = (type) => {
  switch (type) {
    case 'SS': return Flag;
    case 'Lap Race': return RotateCcw;
    case 'Liaison': return Car;
    case 'Service Park': return Timer;
    default: return Flag;
  }
};

// Helper to get stage type color
const getStageTypeColor = (type) => {
  switch (type) {
    case 'SS': return '#FF4500';
    case 'Lap Race': return '#FACC15';
    case 'Liaison': return '#3B82F6';
    case 'Service Park': return '#22C55E';
    default: return '#FF4500';
  }
};

// Format milliseconds to readable time
const formatTimeMs = (ms) => {
  if (!ms) return '-';
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = (totalSecs % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
};

// Calculate lap duration from timestamps
const calculateLapDuration = (currentLapTime, previousLapTime, startTime) => {
  const parseTimeToMs = (timeStr) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length < 2) return null;
    const hours = parts.length === 3 ? parseInt(parts[0]) || 0 : 0;
    const mins = parts.length === 3 ? parseInt(parts[1]) || 0 : parseInt(parts[0]) || 0;
    const secsStr = parts.length === 3 ? parts[2] : parts[1];
    const [secs, ms] = (secsStr || '0').split('.');
    return (hours * 3600 + mins * 60 + parseFloat(secs || 0) + parseFloat(`0.${ms || 0}`)) * 1000;
  };

  const currentMs = parseTimeToMs(currentLapTime);
  const previousMs = previousLapTime ? parseTimeToMs(previousLapTime) : (startTime ? parseTimeToMs(startTime) : null);
  
  if (currentMs === null || previousMs === null) return null;
  
  const diffMs = currentMs - previousMs;
  if (diffMs < 0) return null;
  
  return diffMs;
};

export default function Scene4PilotFocus({ hideStreams = false }) {
  const { 
    pilots, stages, times, startTimes, currentStageId, chromaKey, logoUrl,
    lapTimes, stagePilots
  } = useRally();
  
  const [selectedPilotId, setSelectedPilotId] = useState(pilots[0]?.id || null);
  const [selectedStageId, setSelectedStageId] = useState(currentStageId || stages[0]?.id || null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedPilotId && pilots.length > 0) {
      setSelectedPilotId(pilots[0].id);
    }
  }, [pilots, selectedPilotId]);

  useEffect(() => {
    if (!selectedStageId && stages.length > 0) {
      setSelectedStageId(stages[0].id);
    }
  }, [stages, selectedStageId]);

  // Update to current stage if it changes
  useEffect(() => {
    if (currentStageId && currentStageId !== selectedStageId) {
      setSelectedStageId(currentStageId);
    }
  }, [currentStageId]);

  const focusPilot = pilots.find(p => p.id === selectedPilotId);
  const selectedStage = stages.find(s => s.id === selectedStageId);
  const isLapRace = selectedStage?.type === 'Lap Race';
  const isSSStage = selectedStage?.type === 'SS';

  // Get pilot's stage times with sorted stages
  const sortedStages = useMemo(() => {
    return [...stages].sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [stages]);

  // Build pilot stage data based on stage type
  const pilotStageData = useMemo(() => {
    if (!focusPilot) return [];
    
    return sortedStages.map((stage) => {
      const isLap = stage.type === 'Lap Race';
      const isSS = stage.type === 'SS';
      
      if (isLap) {
        // Lap Race data
        const pilotLaps = lapTimes[focusPilot.id]?.[stage.id] || [];
        const completedLaps = pilotLaps.filter(t => t && t.trim() !== '').length;
        const numberOfLaps = stage.numberOfLaps || 5;
        const isFinished = completedLaps >= numberOfLaps;
        const isRacing = completedLaps > 0 && !isFinished;
        
        // Calculate total time
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
        
        // Calculate individual lap durations
        const lapDurations = pilotLaps.map((lapTime, idx) => {
          if (!lapTime) return null;
          const prevLapTime = idx > 0 ? pilotLaps[idx - 1] : null;
          return calculateLapDuration(lapTime, prevLapTime, stage.startTime);
        });
        
        let displayTime = '-';
        let status = 'not_started';
        
        if (isFinished) {
          displayTime = formatTimeMs(totalTimeMs);
          status = 'finished';
        } else if (isRacing) {
          displayTime = `Lap ${completedLaps}/${numberOfLaps}`;
          status = 'racing';
        }
        
        return {
          stage,
          time: displayTime,
          status,
          isLapRace: true,
          completedLaps,
          numberOfLaps,
          totalTimeMs,
          pilotLaps,
          lapDurations
        };
      } else if (isSS) {
        // SS Stage data
        const status = getPilotStatus(focusPilot.id, stage.id, startTimes, times);
        const startTime = startTimes[focusPilot.id]?.[stage.id];
        const finishTime = times[focusPilot.id]?.[stage.id];
        
        let displayTime = '-';
        if (status === 'racing' && startTime) {
          displayTime = getRunningTime(startTime);
        } else if (status === 'finished' && finishTime) {
          displayTime = finishTime;
        } else if (status === 'not_started' && startTime) {
          displayTime = 'Start: ' + startTime;
        }

        return {
          stage,
          time: displayTime,
          status,
          isLapRace: false
        };
      } else {
        // Liaison / Service Park
        const startTime = startTimes[focusPilot.id]?.[stage.id];
        const endTime = times[focusPilot.id]?.[stage.id];
        
        let displayTime = '-';
        let status = 'not_started';
        
        if (endTime) {
          displayTime = `${startTime || '?'} → ${endTime}`;
          status = 'finished';
        } else if (startTime) {
          displayTime = `Start: ${startTime}`;
          status = 'racing';
        }

        return {
          stage,
          time: displayTime,
          status,
          isLapRace: false
        };
      }
    });
  }, [sortedStages, focusPilot, lapTimes, startTimes, times]);

  const selectedStageData = pilotStageData.find(d => d.stage.id === selectedStageId);

  // Early return after all hooks
  if (!focusPilot) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="scene-4-pilot-focus">
        <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          No Pilot Selected
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex" data-testid="scene-4-pilot-focus">
      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="text-white text-xs uppercase mb-2 block">Select Pilot</Label>
            <Select value={selectedPilotId} onValueChange={setSelectedPilotId}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pilots.map((pilot) => (
                  <SelectItem key={pilot.id} value={pilot.id}>
                    {pilot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-white text-xs uppercase mb-2 block">Select Stage</Label>
            <Select value={selectedStageId} onValueChange={setSelectedStageId}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortedStages.map((stage) => {
                  const Icon = getStageIcon(stage.type);
                  return (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" style={{ color: getStageTypeColor(stage.type) }} />
                        {stage.type === 'SS' && stage.ssNumber ? `SS${stage.ssNumber} - ` : ''}
                        {stage.name}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </LeftControls>

      {/* Stream Display */}
      <div className="flex-1 p-8">
        {focusPilot.streamUrl && !hideStreams ? (
          <div className="h-full bg-black rounded overflow-hidden border-2 border-[#FF4500] relative">
            <StreamPlayer
              pilotId={focusPilot.id}
              streamUrl={focusPilot.streamUrl}
              name={focusPilot.name}
              className="w-full h-full"
            />
            {selectedStageData && (
              <div className="absolute top-4 right-4 bg-black/90 backdrop-blur-sm p-4 rounded border border-[#FF4500]">
                <div className="flex items-center gap-2 mb-1">
                  {React.createElement(getStageIcon(selectedStage?.type), { 
                    className: 'w-4 h-4',
                    style: { color: getStageTypeColor(selectedStage?.type) }
                  })}
                  <p className="text-zinc-400 text-xs uppercase">
                    {selectedStage?.type === 'SS' && selectedStage?.ssNumber ? `SS${selectedStage.ssNumber}` : selectedStage?.name}
                  </p>
                </div>
                <p className={`text-2xl font-mono font-bold ${
                  selectedStageData.status === 'racing' ? 'text-[#FACC15]' :
                  selectedStageData.status === 'finished' ? 'text-[#22C55E]' :
                  'text-zinc-500'
                }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {selectedStageData.time}
                </p>
              </div>
            )}
          </div>
        ) : hideStreams && focusPilot.streamUrl ? (
          <div className="h-full rounded overflow-hidden border-2 border-[#FF4500] relative" style={{ backgroundColor: chromaKey }}>
            {selectedStageData && (
              <div className="absolute top-4 right-4 bg-black/90 backdrop-blur-sm p-4 rounded border border-[#FF4500]">
                <div className="flex items-center gap-2 mb-1">
                  {React.createElement(getStageIcon(selectedStage?.type), { 
                    className: 'w-4 h-4',
                    style: { color: getStageTypeColor(selectedStage?.type) }
                  })}
                  <p className="text-zinc-400 text-xs uppercase">
                    {selectedStage?.type === 'SS' && selectedStage?.ssNumber ? `SS${selectedStage.ssNumber}` : selectedStage?.name}
                  </p>
                </div>
                <p className={`text-2xl font-mono font-bold ${
                  selectedStageData.status === 'racing' ? 'text-[#FACC15]' :
                  selectedStageData.status === 'finished' ? 'text-[#22C55E]' :
                  'text-zinc-500'
                }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {selectedStageData.time}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full rounded border-2 border-[#FF4500] flex items-center justify-center" style={{ backgroundColor: hideStreams ? chromaKey : 'black' }}>
            <p className="text-zinc-500 text-xl">No stream available</p>
          </div>
        )}
      </div>

      {/* Right Side - Pilot Info */}
      <div className="w-1/3 bg-black/95 backdrop-blur-sm p-6 overflow-y-auto">

        {/* Logo - Top Center */}
        {logoUrl && (
          <div className="flex justify-center mb-4">
            <img 
              src={logoUrl} 
              alt="Channel Logo" 
              className="w-1/2 max-h-16 object-contain"
            />
          </div>
        )}

        {/* Pilot Header */}
        <div className="text-center mb-6">
          {focusPilot.picture ? (
            <img
              src={focusPilot.picture}
              alt={focusPilot.name}
              className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-4 border-[#FF4500]"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-zinc-800 mx-auto mb-3 flex items-center justify-center border-4 border-[#FF4500]">
              <span className="text-4xl font-bold text-white">{focusPilot.name.charAt(0)}</span>
            </div>
          )}
          <h2 className="text-3xl font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {focusPilot.name}
          </h2>
          {focusPilot.carNumber && (
            <span className="inline-block bg-[#FF4500] text-white text-sm font-bold px-2 py-0.5 rounded mt-1">
              #{focusPilot.carNumber}
            </span>
          )}
          {focusPilot.isActive && (
            <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-[#FF4500] rounded-full ml-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white text-xs font-bold uppercase">LIVE</span>
            </div>
          )}
        </div>

        {/* Selected Stage Detail (for Lap Race, show lap breakdown) */}
        {selectedStageData && selectedStageData.isLapRace && (
          <div className="mb-6 p-4 bg-white/5 rounded border border-[#FACC15]/30">
            <h3 className="text-lg font-bold uppercase text-[#FACC15] mb-3 flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              <RotateCcw className="w-5 h-5" />
              {selectedStage?.name} - Lap Times
            </h3>
            <div className="space-y-2">
              {Array.from({ length: selectedStageData.numberOfLaps }, (_, i) => {
                const lapTime = selectedStageData.pilotLaps?.[i];
                const lapDuration = selectedStageData.lapDurations?.[i];
                const isCompleted = !!lapTime;
                
                return (
                  <div key={i} className={`flex justify-between items-center p-2 rounded ${
                    isCompleted ? 'bg-[#22C55E]/10 border border-[#22C55E]/30' : 'bg-zinc-800/50'
                  }`}>
                    <span className="text-zinc-400 text-sm">Lap {i + 1}</span>
                    <div className="text-right">
                      {isCompleted ? (
                        <>
                          <span className="text-[#22C55E] font-mono text-sm" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {lapDuration ? formatTimeMs(lapDuration) : '-'}
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-600 text-sm">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {selectedStageData.totalTimeMs > 0 && (
                <div className="flex justify-between items-center p-2 rounded bg-[#FACC15]/20 border border-[#FACC15]/50 mt-3">
                  <span className="text-[#FACC15] font-bold text-sm">TOTAL</span>
                  <span className="text-[#FACC15] font-mono font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {formatTimeMs(selectedStageData.totalTimeMs)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Stage Times */}
        <div>
          <h3 className="text-xl font-bold uppercase text-[#FF4500] mb-3" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            All Stage Times
          </h3>
          <div className="space-y-2">
            {pilotStageData.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">No stages registered</p>
            ) : (
              pilotStageData.map((item) => {
                const Icon = getStageIcon(item.stage.type);
                const stageColor = getStageTypeColor(item.stage.type);
                
                return (
                  <div 
                    key={item.stage.id} 
                    className={`border p-3 cursor-pointer transition-colors ${
                      item.stage.id === selectedStageId 
                        ? 'bg-[#FF4500]/20 border-[#FF4500]' 
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                    onClick={() => setSelectedStageId(item.stage.id)}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" style={{ color: stageColor }} />
                        <span className="text-zinc-400 uppercase text-sm" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {item.stage.type === 'SS' && item.stage.ssNumber ? `SS${item.stage.ssNumber}` : item.stage.name}
                        </span>
                      </div>
                      <span className={`text-lg font-mono ${
                        item.status === 'racing' ? 'text-[#FACC15]' :
                        item.status === 'finished' ? 'text-white' :
                        'text-zinc-500'
                      }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {item.time}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
