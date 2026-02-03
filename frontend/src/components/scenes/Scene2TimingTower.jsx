import React from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';

export default function Scene2TimingTower() {
  const { pilots, stages, times, currentStageId } = useRally();
  const currentStage = stages.find(s => s.id === currentStageId);
  const activePilots = pilots.filter(p => p.isActive && p.streamUrl);

  // Calculate leaderboard for current stage
  const leaderboard = pilots
    .map(pilot => {
      const time = currentStageId ? times[pilot.id]?.[currentStageId] : null;
      return { ...pilot, time };
    })
    .filter(p => p.time)
    .sort((a, b) => a.time.localeCompare(b.time));

  const leader = leaderboard[0];

  return (
    <div className="relative w-full h-full flex" data-testid="scene-2-timing-tower">
      {/* Left Side - Timing Tower */}
      <div className="w-1/3 bg-black/95 backdrop-blur-sm p-8 overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-[#FF4500] text-3xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Timing Tower
          </h2>
          {currentStage && (
            <p className="text-zinc-400 text-sm mt-1">{currentStage.name}</p>
          )}
        </div>

        {leaderboard.length === 0 ? (
          <p className="text-zinc-500 text-center py-12">No times recorded yet</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((pilot, index) => {
              const gap = leader && pilot.id !== leader.id ? '+' + (parseFloat(pilot.time) - parseFloat(leader.time)).toFixed(3) : 'LEADER';
              return (
                <div
                  key={pilot.id}
                  className="bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 text-center">
                      <span className="text-2xl font-bold text-[#FACC15]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {pilot.name}
                      </p>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-white font-mono text-lg" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {pilot.time}
                        </span>
                        <span className="text-zinc-400 text-sm font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {gap}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Side - Stream */}
      <div className="flex-1 p-8">
        {activePilots.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              No Active Streams
            </p>
          </div>
        ) : (
          <div className="h-full bg-black rounded overflow-hidden border-2 border-[#FF4500]">
            <iframe
              src={activePilots[0].streamUrl}
              className="w-full h-full"
              frameBorder="0"
              allow="autoplay; fullscreen"
              allowFullScreen
              title={activePilots[0].name}
            />
            <div className="absolute bottom-8 right-8">
              <div className="bg-black/95 backdrop-blur-sm p-4 border-l-4 border-[#FF4500]">
                <p className="text-white font-bold text-2xl uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {activePilots[0].name}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
