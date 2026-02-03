import React, { useEffect, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { getPilotStatus, getRunningTime } from '../../utils/rallyHelpers';

export default function Scene1LiveStage() {
  const { pilots, stages, currentStageId, startTimes, times } = useRally();
  const [currentTime, setCurrentTime] = useState(new Date());
  const currentStage = stages.find(s => s.id === currentStageId);
  
  // Update current time every 100ms for running timers
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  // Get active pilots with streams
  const activePilots = pilots.filter(p => p.isActive && p.streamUrl);

  const getGridClass = () => {
    const count = activePilots.length;
    if (count === 0) return 'grid-cols-1';
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count === 3) return 'grid-cols-3';
    return 'grid-cols-2 grid-rows-2';
  };

  return (
    <div className="relative w-full h-full p-8" data-testid="scene-1-live-stage">
      {/* Stream Grid */}
      <div className={`grid ${getGridClass()} gap-4 h-[calc(100%-180px)]`}>
        {activePilots.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                No Active Streams
              </p>
              <p className="text-zinc-400 mt-2">Enable pilot streams in setup</p>
            </div>
          </div>
        ) : (
          activePilots.map((pilot) => {
            const status = currentStageId ? getPilotStatus(pilot.id, currentStageId, startTimes, times) : 'not_started';
            const startTime = currentStageId ? startTimes[pilot.id]?.[currentStageId] : null;
            const finishTime = currentStageId ? times[pilot.id]?.[currentStageId] : null;
            
            return (
              <div
                key={pilot.id}
                className="relative bg-black rounded overflow-hidden border-2 border-[#FF4500]">
                <iframe
                  src={pilot.streamUrl}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  title={pilot.name}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-white font-bold text-lg uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      {pilot.name}
                    </p>
                    {status === 'racing' && startTime && (
                      <p className="text-[#FACC15] font-mono text-sm" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {getRunningTime(startTime)}
                      </p>
                    )}
                    {status === 'finished' && finishTime && (
                      <p className="text-[#22C55E] font-mono text-sm" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {finishTime}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Lower Third - Current Stage Info with Top 3 */}
      {currentStage && currentStageId && (
        <div className="absolute bottom-8 left-8 right-8">
          <div className="bg-black/95 backdrop-blur-sm border-l-4 border-[#FF4500] overflow-hidden">
            <div className="flex items-stretch">
              {/* Current Stage */}
              <div className="p-6 flex-1">
                <p className="text-zinc-400 text-sm uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>Current Stage</p>
                <p className="text-white text-3xl font-bold uppercase mt-1" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {currentStage.ssNumber ? `SS${currentStage.ssNumber}` : ''} {currentStage.name}
                </p>
              </div>
              
              {/* Top 3 Times */}
              <div className="flex gap-2 p-4 bg-black/50">
                {pilots
                  .map(p => ({
                    ...p,
                    time: times[p.id]?.[currentStageId],
                    status: getPilotStatus(p.id, currentStageId, startTimes, times)
                  }))
                  .filter(p => p.time)
                  .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
                  .slice(0, 3)
                  .map((pilot, idx) => (
                    <div key={pilot.id} className="bg-white/5 border border-white/10 px-4 py-2 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold ${
                          idx === 0 ? 'text-[#FACC15]' : idx === 1 ? 'text-zinc-300' : 'text-[#CD7F32]'
                        }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-bold uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                            {pilot.name}
                          </p>
                          <p className="text-white font-mono text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {pilot.time}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
