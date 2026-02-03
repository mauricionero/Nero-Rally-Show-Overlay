import React, { useState, useEffect } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { StreamThumbnail } from '../StreamThumbnail.jsx';
import { CategoryBar } from '../CategoryBadge.jsx';
import { parseTime, getPilotStatus, getRunningTime } from '../../utils/rallyHelpers';

export default function Scene3Leaderboard() {
  const { pilots, stages, times, startTimes, categories } = useRally();
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const selectedStage = stages.find(s => s.id === selectedStageId);
  
  // Filter only SS type stages
  const ssStages = stages.filter(s => s.type === 'SS');

  // Sort stages by start time
  const sortedSSStages = [...ssStages].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  // Auto-select first SS stage if none selected
  useEffect(() => {
    if (!selectedStageId && sortedSSStages.length > 0) {
      setSelectedStageId(sortedSSStages[0].id);
    }
  }, [sortedSSStages, selectedStageId]);

  // Calculate leaderboard
  const leaderboard = pilots.map(pilot => {
    if (selectedStageId) {
      // Single stage leaderboard
      const status = getPilotStatus(pilot.id, selectedStageId, startTimes, times);
      const startTime = startTimes[pilot.id]?.[selectedStageId];
      const finishTime = times[pilot.id]?.[selectedStageId];
      
      let displayTime = '-';
      let timeColor = 'text-white';
      let sortTime = Infinity;
      
      if (status === 'racing' && startTime) {
        displayTime = getRunningTime(startTime);
        timeColor = 'text-[#FACC15]';
        sortTime = parseTime(displayTime) || Infinity;
      } else if (status === 'finished' && finishTime) {
        displayTime = finishTime;
        timeColor = 'text-white';
        sortTime = parseTime(finishTime);
      }
      
      // Calculate overall time up to this stage
      let overallTime = 0;
      let overallStages = 0;
      sortedSSStages.forEach(stage => {
        const stageTime = times[pilot.id]?.[stage.id];
        if (stageTime) {
          overallTime += parseTime(stageTime);
          overallStages++;
        }
        // Stop at current selected stage
        if (stage.id === selectedStageId) return;
      });
      
      const overallMinutes = Math.floor(overallTime / 60);
      const overallSeconds = (overallTime % 60).toFixed(3).padStart(6, '0');
      const overallDisplay = overallStages > 0 ? `${overallMinutes}:${overallSeconds}` : '-';
      
      return {
        ...pilot,
        displayTime,
        timeColor,
        sortTime,
        overallTime,
        overallDisplay,
        hasTime: status === 'finished' || status === 'racing',
        status
      };
    } else {
      // Overall leaderboard
      let totalTime = 0;
      let completedStages = 0;
      
      sortedSSStages.forEach(stage => {
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
        timeColor: 'text-white',
        sortTime: completedStages > 0 ? totalTime : Infinity,
        overallDisplay: displayTime,
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
      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="text-white text-xs uppercase mb-2 block">Select Stage</Label>
            <Select value={selectedStageId || 'overall'} onValueChange={(val) => setSelectedStageId(val === 'overall' ? null : val)}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">Overall Standings</SelectItem>
                {sortedSSStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.ssNumber ? `SS${stage.ssNumber} - ` : ''}{stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </LeftControls>

      <div className="w-full max-w-6xl">
        {/* Header - Shows selected stage name */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold uppercase text-[#FF4500] mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {selectedStage 
              ? `${selectedStage.ssNumber ? `SS${selectedStage.ssNumber} - ` : ''}${selectedStage.name}`
              : 'Overall Standings'
            }
          </h1>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-black/95 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#18181B] text-white border-b border-white/10">
                <th className="p-4 text-left uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pos</th>
                <th className="p-4 text-left uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pilot</th>
                {selectedStageId && (
                  <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>SS Time</th>
                )}
                <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Overall</th>
                <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((pilot, index) => {
                const gap = leader && pilot.id !== leader.id && pilot.hasTime
                  ? '+' + (pilot.sortTime - leader.sortTime).toFixed(3) + 's'
                  : pilot.hasTime ? 'LEADER' : '-';
                
                const category = categories.find(c => c.id === pilot.categoryId);

                return (
                  <tr
                    key={pilot.id}
                    className="border-b border-white/10 hover:bg-white/5 transition-colors relative">
                    {category && (
                      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
                    )}
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
                        {/* 16:9 Stream thumbnail or avatar fallback */}
                        {pilot.streamUrl && pilot.isActive ? (
                          <div className="w-32 h-18 rounded overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
                            <iframe
                              src={pilot.streamUrl}
                              className="w-full h-full"
                              frameBorder="0"
                              allow="autoplay"
                              title={`${pilot.name}-thumb`}
                              style={{ pointerEvents: 'none' }}
                            />
                          </div>
                        ) : pilot.picture ? (
                          <img src={pilot.picture} alt={pilot.name} className="w-12 h-12 rounded object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center">
                            <span className="text-lg font-bold text-zinc-600">{pilot.name.charAt(0)}</span>
                          </div>
                        )}
                        <span className="text-white text-xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {pilot.name}
                        </span>
                      </div>
                    </td>
                    {selectedStageId && (
                      <td className="p-4 text-right">
                        <span className={`text-2xl font-mono ${pilot.timeColor}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {pilot.displayTime}
                        </span>
                      </td>
                    )}
                    <td className="p-4 text-right">
                      <span className="text-white text-xl font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {pilot.overallDisplay}
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
