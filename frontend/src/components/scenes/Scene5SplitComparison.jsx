import React, { useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { parseTime } from '../../utils/rallyHelpers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export default function Scene5SplitComparison() {
  const { pilots, stages, times } = useRally();
  const [selectedStageId, setSelectedStageId] = useState(stages[0]?.id || null);
  
  const selectedStage = stages.find(s => s.id === selectedStageId);

  // Get times for selected stage and sort
  const comparison = pilots
    .map(pilot => {
      const time = selectedStageId ? times[pilot.id]?.[selectedStageId] : null;
      const timeInSeconds = time ? parseTime(time) : 0;
      return { ...pilot, time, timeInSeconds };
    })
    .filter(p => p.time && p.timeInSeconds > 0)
    .sort((a, b) => a.timeInSeconds - b.timeInSeconds)
    .slice(0, 10); // Top 10 only

  const fastest = comparison[0];

  return (
    <div className="relative w-full h-full flex items-center justify-center p-8" data-testid="scene-5-split-comparison">
      <div className="w-full max-w-6xl">
        {/* Header with Stage Selector */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold uppercase text-[#FF4500]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            SS Time Comparison
          </h1>
          <div className="flex justify-center mt-4">
            <Select value={selectedStageId || ''} onValueChange={setSelectedStageId}>
              <SelectTrigger className="w-[400px] bg-[#18181B] border-zinc-700 text-white">
                <SelectValue placeholder="Select stage to compare" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.ssNumber ? `SS${stage.ssNumber} - ` : ''}{stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {comparison.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-2xl">
              {selectedStageId ? 'No times recorded for this stage' : 'Select a stage to compare'}
            </p>
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
                    <div className="w-72">
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
                    <div className="w-40 text-right">
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

        {selectedStage && (
          <div className="mt-8 text-center">
            <p className="text-zinc-400 text-sm">
              Comparing times for {selectedStage.ssNumber ? `SS${selectedStage.ssNumber} - ` : ''}{selectedStage.name}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
