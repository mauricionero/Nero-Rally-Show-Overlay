import React from 'react';
import { useRally } from '../../contexts/RallyContext';

export default function Scene5SplitComparison() {
  const { pilots, stages, times, currentStageId } = useRally();
  const currentStage = stages.find(s => s.id === currentStageId);

  // Get times for current stage and sort
  const comparison = pilots
    .map(pilot => {
      const time = currentStageId ? times[pilot.id]?.[currentStageId] : null;
      // Convert time string to seconds for comparison
      let timeInSeconds = 0;
      if (time) {
        const parts = time.split(':');
        if (parts.length >= 2) {
          const minutes = parseInt(parts[0]) || 0;
          const seconds = parseFloat(parts[1]) || 0;
          timeInSeconds = minutes * 60 + seconds;
        }
      }
      return { ...pilot, time, timeInSeconds };
    })
    .filter(p => p.time && p.timeInSeconds > 0)
    .sort((a, b) => a.timeInSeconds - b.timeInSeconds)
    .slice(0, 10); // Top 10 only

  const fastest = comparison[0];

  return (
    <div className="relative w-full h-full flex items-center justify-center p-8" data-testid="scene-5-split-comparison">
      <div className="w-full max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold uppercase text-[#FF4500]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Split Comparison
          </h1>
          {currentStage && (
            <p className="text-zinc-400 text-2xl mt-2">{currentStage.name}</p>
          )}
        </div>

        {comparison.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-2xl">No times recorded for current stage</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comparison.map((pilot, index) => {
              const gap = fastest && pilot.id !== fastest.id
                ? pilot.timeInSeconds - fastest.timeInSeconds
                : 0;
              const barWidth = fastest
                ? ((pilot.timeInSeconds / fastest.timeInSeconds) * 100).toFixed(2)
                : 100;

              return (
                <div key={pilot.id} className="bg-black/95 backdrop-blur-sm border border-white/10 p-4 rounded">
                  <div className="flex items-center gap-4">
                    {/* Position */}
                    <div className="w-12 text-center">
                      <span className={`text-3xl font-bold ${
                        index === 0 ? 'text-[#FACC15]' :
                        index === 1 ? 'text-zinc-300' :
                        index === 2 ? 'text-[#CD7F32]' :
                        'text-white'
                      }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {index + 1}
                      </span>
                    </div>

                    {/* Pilot Info */}
                    <div className="w-64">
                      <div className="flex items-center gap-3">
                        {pilot.picture ? (
                          <img src={pilot.picture} alt={pilot.name} className="w-10 h-10 rounded object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center text-sm font-bold">
                            {pilot.name.charAt(0)}
                          </div>
                        )}
                        <span className="text-white text-lg font-bold uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {pilot.name}
                        </span>
                      </div>
                    </div>

                    {/* Bar Chart */}
                    <div className="flex-1 relative">
                      <div className="h-12 bg-zinc-900 rounded overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#FF4500] to-[#FACC15] transition-all duration-300"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>

                    {/* Time */}
                    <div className="w-32 text-right">
                      <div className="text-white text-xl font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {pilot.time}
                      </div>
                      {gap > 0 && (
                        <div className="text-zinc-400 text-sm font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          +{gap.toFixed(3)}s
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
