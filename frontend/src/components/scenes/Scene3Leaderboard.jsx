import React, { useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { parseTime } from '../../utils/rallyHelpers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export default function Scene3Leaderboard() {
  const { pilots, stages, times } = useRally();
  const [selectedStageId, setSelectedStageId] = useState(stages[0]?.id || null);
  
  const selectedStage = stages.find(s => s.id === selectedStageId);

  // Calculate leaderboard for selected stage or overall
  const leaderboard = pilots.map(pilot => {
    if (selectedStageId) {
      // Single stage leaderboard
      const time = times[pilot.id]?.[selectedStageId];
      return {
        ...pilot,
        displayTime: time || '-',
        sortTime: time ? parseTime(time) : Infinity,
        hasTime: !!time
      };
    } else {
      // Overall leaderboard
      let totalTime = 0;
      let completedStages = 0;
      
      stages.forEach(stage => {
        const time = times[pilot.id]?.[stage.id];
        if (time) {
          totalTime += parseTime(time);
          completedStages++;
        }
      });

      const totalMinutes = Math.floor(totalTime / 60);
      const totalSeconds = (totalTime % 60).toFixed(3).padStart(6, '0');
      const displayTime = completedStages > 0 ? `${totalMinutes}:${totalSeconds}` : '-';

      return {
        ...pilot,
        totalTime,
        completedStages,
        displayTime,
        sortTime: completedStages > 0 ? totalTime : Infinity,
        hasTime: completedStages > 0
      };
    }
  }).sort((a, b) => {
    if (!a.hasTime && !b.hasTime) return 0;
    if (!a.hasTime) return 1;
    if (!b.hasTime) return -1;
    return a.sortTime - b.sortTime;
  });

  const leader = leaderboard.find(p => p.hasTime);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-8" data-testid="scene-3-leaderboard">
      <div className="w-full max-w-5xl">
        {/* Header with Stage Selector */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold uppercase text-[#FF4500] mb-4" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {selectedStageId ? 'Stage Results' : 'Overall Leaderboard'}
          </h1>
          <div className="flex justify-center">
            <Select value={selectedStageId || 'overall'} onValueChange={(val) => setSelectedStageId(val === 'overall' ? null : val)}>
              <SelectTrigger className="w-[300px] bg-[#18181B] border-zinc-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">Overall Standings</SelectItem>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.ssNumber ? `SS${stage.ssNumber} - ` : ''}{stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-black/95 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#18181B] text-white border-b border-white/10">
                <th className="p-4 text-left uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pos</th>
                <th className="p-4 text-left uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pilot</th>
                {!selectedStageId && (
                  <th className="p-4 text-center uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Stages</th>
                )}
                <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {selectedStageId ? 'SS Time' : 'Total Time'}
                </th>
                <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((pilot, index) => {
                const gap = leader && pilot.id !== leader.id && pilot.hasTime
                  ? '+' + (pilot.sortTime - leader.sortTime).toFixed(3) + 's'
                  : pilot.hasTime ? 'LEADER' : '-';

                return (
                  <tr
                    key={pilot.id}
                    className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <span className={`text-3xl font-bold ${
                        index === 0 && pilot.hasTime ? 'text-[#FACC15]' :
                        index === 1 && pilot.hasTime ? 'text-zinc-300' :
                        index === 2 && pilot.hasTime ? 'text-[#CD7F32]' :
                        'text-white'
                      }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {pilot.hasTime ? index + 1 : '-'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {pilot.picture ? (
                          <img src={pilot.picture} alt={pilot.name} className="w-12 h-12 rounded object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center text-lg font-bold">
                            {pilot.name.charAt(0)}
                          </div>
                        )}
                        <span className="text-white text-xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {pilot.name}
                        </span>
                      </div>
                    </td>
                    {!selectedStageId && (
                      <td className="p-4 text-center">
                        <span className="text-zinc-400 font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {pilot.completedStages}/{stages.length}
                        </span>
                      </td>
                    )}
                    <td className="p-4 text-right">
                      <span className="text-white text-2xl font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {pilot.displayTime}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-zinc-400 text-lg font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {gap}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {leaderboard.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-xl">No data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
