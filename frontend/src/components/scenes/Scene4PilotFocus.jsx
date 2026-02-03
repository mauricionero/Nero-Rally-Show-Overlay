import React, { useState, useEffect } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { getPilotStatus, getRunningTime } from '../../utils/rallyHelpers';

export default function Scene4PilotFocus() {
  const { pilots, stages, times, startTimes, currentStageId } = useRally();
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

  const focusPilot = pilots.find(p => p.id === selectedPilotId);
  const selectedStage = stages.find(s => s.id === selectedStageId);

  if (!focusPilot) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="scene-4-pilot-focus">
        <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          No Pilot Selected
        </p>
      </div>
    );
  }

  // Get pilot's stage times with sorted stages
  const sortedStages = [...stages].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  const pilotStageData = sortedStages.map((stage) => {
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
      stage: stage,
      time: displayTime,
      status
    };
  });

  const selectedStageData = pilotStageData.find(d => d.stage.id === selectedStageId);

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
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.ssNumber ? `SS${stage.ssNumber}` : stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </LeftControls>

      {/* Stream Display */}
      <div className="flex-1 p-8">
        {focusPilot.streamUrl ? (
          <div className="h-full bg-black rounded overflow-hidden border-2 border-[#FF4500] relative">
            <iframe
              src={focusPilot.streamUrl}
              className="w-full h-full"
              frameBorder="0"
              allow="autoplay; fullscreen"
              allowFullScreen
              title={focusPilot.name}
            />
            {selectedStageData && (
              <div className="absolute top-4 right-4 bg-black/90 backdrop-blur-sm p-4 rounded border border-[#FF4500]">
                <p className="text-zinc-400 text-xs uppercase">
                  {selectedStage?.ssNumber ? `SS${selectedStage.ssNumber}` : selectedStage?.name}
                </p>
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
          <div className="h-full bg-black rounded border-2 border-[#FF4500] flex items-center justify-center">
            <p className="text-zinc-500 text-xl">No stream available</p>
          </div>
        )}
      </div>

      {/* Right Side - Pilot Info */}
      <div className="w-1/3 bg-black/95 backdrop-blur-sm p-6 overflow-y-auto">

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
          {focusPilot.isActive && (
            <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-[#FF4500] rounded-full">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white text-xs font-bold uppercase">LIVE</span>
            </div>
          )}
        </div>

        {/* Stage Times */}
        <div>
          <h3 className="text-xl font-bold uppercase text-[#FF4500] mb-3" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            All Stage Times
          </h3>
          <div className="space-y-2">
            {pilotStageData.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">No stages registered</p>
            ) : (
              pilotStageData.map((item) => (
                <div 
                  key={item.stage.id} 
                  className={`border p-3 ${
                    item.stage.id === selectedStageId ? 'bg-[#FF4500]/20 border-[#FF4500]' : 'bg-white/5 border-white/10'
                  }`}>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400 uppercase text-sm" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      {item.stage.ssNumber ? `SS${item.stage.ssNumber}` : item.stage.name}
                    </span>
                    <span className={`text-lg font-mono ${
                      item.status === 'racing' ? 'text-[#FACC15]' :
                      item.status === 'finished' ? 'text-white' :
                      'text-zinc-500'
                    }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {item.time}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
