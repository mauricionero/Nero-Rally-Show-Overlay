import React, { useState, useEffect, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { parseTime, getPilotStatus, getRunningTime } from '../../utils/rallyHelpers';
import { Flag, RotateCcw, Car, Timer } from 'lucide-react';

// Helper to calculate Lap Race positions and data
const calculateLapRaceLeaderboard = (pilots, stageId, lapTimes, stagePilots, numberOfLaps) => {
  const selectedPilotIds = stagePilots[stageId] || pilots.map(p => p.id);
  const selectedPilots = pilots.filter(p => selectedPilotIds.includes(p.id));
  
  const pilotData = selectedPilots.map(pilot => {
    const pilotLaps = lapTimes[pilot.id]?.[stageId] || [];
    const completedLaps = pilotLaps.filter(t => t && t.trim() !== '').length;
    
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
    
    const isFinished = completedLaps >= numberOfLaps;
    const isRacing = completedLaps > 0 && !isFinished;
    
    return { 
      ...pilot,
      completedLaps, 
      totalTimeMs,
      isFinished,
      isRacing,
      hasTime: completedLaps > 0,
      sortTime: isFinished ? totalTimeMs : (isRacing ? totalTimeMs + 999999999 : Infinity)
    };
  });

  // Sort: finished first (by time), then racing (by laps desc, time asc), then not started
  pilotData.sort((a, b) => {
    // Both finished - sort by total time
    if (a.isFinished && b.isFinished) return a.totalTimeMs - b.totalTimeMs;
    // Finished comes before racing
    if (a.isFinished && !b.isFinished) return -1;
    if (!a.isFinished && b.isFinished) return 1;
    // Both racing - sort by laps (desc), then time (asc)
    if (a.isRacing && b.isRacing) {
      if (b.completedLaps !== a.completedLaps) return b.completedLaps - a.completedLaps;
      return a.totalTimeMs - b.totalTimeMs;
    }
    // Racing comes before not started
    if (a.isRacing && !b.isRacing) return -1;
    if (!a.isRacing && b.isRacing) return 1;
    return 0;
  });

  return pilotData;
};

// Format milliseconds to readable time string
const formatTimeMs = (ms) => {
  if (!ms) return '-';
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = (totalSecs % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
};

export default function Scene3Leaderboard({ hideStreams = false }) {
  const { pilots, stages, times, startTimes, categories, logoUrl, lapTimes, stagePilots } = useRally();
  const { t } = useTranslation();
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [selectedStageType, setSelectedStageType] = useState('all'); // 'all', 'ss', 'lapRace'
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const selectedStage = stages.find(s => s.id === selectedStageId);
  
  // Filter stages by type
  const ssStages = stages.filter(s => s.type === 'SS');
  const lapRaceStages = stages.filter(s => s.type === 'Lap Race');
  
  // Sort stages by start time
  const sortedSSStages = [...ssStages].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  const sortedLapRaceStages = [...lapRaceStages].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  // Calculate leaderboard based on selected stage/type
  const leaderboard = useMemo(() => {
    // If a specific stage is selected
    if (selectedStageId && selectedStage) {
      if (selectedStage.type === 'Lap Race') {
        // Lap Race leaderboard
        return calculateLapRaceLeaderboard(pilots, selectedStageId, lapTimes, stagePilots, selectedStage.numberOfLaps || 5);
      } else if (selectedStage.type === 'SS') {
        // Single SS stage leaderboard
        return pilots.map(pilot => {
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
          
          // Calculate overall time: sum of all SS up to and including the selected stage
          let overallTime = 0;
          let completedStages = 0;
          let hasRunningInOverall = false;
          
          for (const stage of sortedSSStages) {
            const stageFinishTime = times[pilot.id]?.[stage.id];
            
            if (stageFinishTime) {
              overallTime += parseTime(stageFinishTime);
              completedStages++;
            } else if (stage.id === selectedStageId) {
              const stageStatus = getPilotStatus(pilot.id, stage.id, startTimes, times);
              const stageStartTime = startTimes[pilot.id]?.[stage.id];
              if (stageStatus === 'racing' && stageStartTime) {
                const runningTime = getRunningTime(stageStartTime);
                overallTime += parseTime(runningTime) || 0;
                hasRunningInOverall = true;
              }
            }
            
            if (stage.id === selectedStageId) break;
          }
          
          const overallMinutes = Math.floor(overallTime / 60);
          const overallSeconds = (overallTime % 60).toFixed(3).padStart(6, '0');
          const overallDisplay = (completedStages > 0 || hasRunningInOverall) ? `${overallMinutes}:${overallSeconds}` : '-';
          const overallColor = hasRunningInOverall ? 'text-[#FACC15]' : 'text-white';
          
          return {
            ...pilot,
            displayTime,
            timeColor,
            sortTime,
            overallTime,
            overallDisplay,
            overallColor,
            hasTime: status === 'finished' || status === 'racing',
            status
          };
        }).sort((a, b) => {
          if (!a.hasTime && !b.hasTime) return 0;
          if (!a.hasTime) return 1;
          if (!b.hasTime) return -1;
          return a.sortTime - b.sortTime;
        });
      }
    }
    
    // Overall SS standings (default)
    return pilots.map(pilot => {
      let totalTime = 0;
      let completedStages = 0;
      let hasRunningStage = false;
      
      sortedSSStages.forEach(stage => {
        const finishTime = times[pilot.id]?.[stage.id];
        if (finishTime) {
          totalTime += parseTime(finishTime);
          completedStages++;
        } else {
          const status = getPilotStatus(pilot.id, stage.id, startTimes, times);
          const startTime = startTimes[pilot.id]?.[stage.id];
          if (status === 'racing' && startTime && !hasRunningStage) {
            const runningTime = getRunningTime(startTime);
            totalTime += parseTime(runningTime);
            hasRunningStage = true;
          }
        }
      });

      const totalMinutes = Math.floor(totalTime / 60);
      const totalSeconds = (totalTime % 60).toFixed(3).padStart(6, '0');
      const displayTime = (completedStages > 0 || hasRunningStage) ? `${totalMinutes}:${totalSeconds}` : '-';

      return {
        ...pilot,
        totalTime,
        completedStages,
        displayTime,
        timeColor: hasRunningStage ? 'text-[#FACC15]' : 'text-white',
        sortTime: (completedStages > 0 || hasRunningStage) ? totalTime : Infinity,
        overallDisplay: displayTime,
        hasTime: completedStages > 0 || hasRunningStage
      };
    }).sort((a, b) => {
      if (!a.hasTime && !b.hasTime) return 0;
      if (!a.hasTime) return 1;
      if (!b.hasTime) return -1;
      return a.sortTime - b.sortTime;
    });
  }, [selectedStageId, selectedStage, pilots, times, startTimes, lapTimes, stagePilots, sortedSSStages]);

  const leader = leaderboard.find(p => p.hasTime);
  const isLapRaceSelected = selectedStage?.type === 'Lap Race';

  // Get stage icon based on type
  const getStageIcon = (type) => {
    switch (type) {
      case 'SS': return Flag;
      case 'Lap Race': return RotateCcw;
      case 'Liaison': return Car;
      case 'Service Park': return Timer;
      default: return Flag;
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center p-8" data-testid="scene-3-leaderboard">
      {/* Logo - Top Right */}
      {logoUrl && (
        <div className="absolute top-8 right-8 z-10">
          <img 
            src={logoUrl} 
            alt="Channel Logo" 
            className="h-28 max-w-[280px] object-contain"
          />
        </div>
      )}

      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene3.selectView')}</Label>
            <Select value={selectedStageId || 'overall'} onValueChange={(val) => setSelectedStageId(val === 'overall' ? null : val)}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">
                  <div className="flex items-center gap-2">
                    <Flag className="w-4 h-4 text-[#FF4500]" />
                    {t('scene3.overallRallyStandings')}
                  </div>
                </SelectItem>
                
                {/* SS Stages */}
                {sortedSSStages.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-zinc-500 uppercase border-t border-zinc-700 mt-1">
                      Special Stages
                    </div>
                    {sortedSSStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <Flag className="w-4 h-4 text-[#FF4500]" />
                          {stage.ssNumber ? `SS${stage.ssNumber} - ` : ''}{stage.name}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
                
                {/* Lap Race Stages */}
                {sortedLapRaceStages.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-zinc-500 uppercase border-t border-zinc-700 mt-1">
                      Lap Races
                    </div>
                    {sortedLapRaceStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <RotateCcw className="w-4 h-4 text-[#FACC15]" />
                          {stage.name} ({stage.numberOfLaps} laps)
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </LeftControls>

      <div className="w-full max-w-6xl">
        {/* Header - Shows selected stage name */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            {selectedStage ? (
              <>
                {React.createElement(getStageIcon(selectedStage.type), { 
                  className: `w-10 h-10 ${selectedStage.type === 'Lap Race' ? 'text-[#FACC15]' : 'text-[#FF4500]'}` 
                })}
              </>
            ) : (
              <Flag className="w-10 h-10 text-[#FF4500]" />
            )}
          </div>
          <h1 className="text-6xl font-bold uppercase text-[#FF4500] mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {selectedStage 
              ? (selectedStage.type === 'SS' && selectedStage.ssNumber 
                  ? `SS${selectedStage.ssNumber} - ${selectedStage.name}`
                  : selectedStage.name)
              : 'Overall Standings'
            }
          </h1>
          {isLapRaceSelected && selectedStage && (
            <p className="text-zinc-400 text-xl">{selectedStage.numberOfLaps} Laps</p>
          )}
        </div>

        {/* Leaderboard Table */}
        <div className="bg-black/95 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#18181B] text-white border-b border-white/10">
                <th className="p-1 w-1"></th>
                <th className="p-4 text-left uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pos</th>
                <th className="p-4 text-left uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pilot</th>
                {isLapRaceSelected ? (
                  <>
                    <th className="p-4 text-center uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Laps</th>
                    <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Total Time</th>
                  </>
                ) : selectedStageId ? (
                  <>
                    <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>SS Time</th>
                    <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Overall</th>
                  </>
                ) : (
                  <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Overall</th>
                )}
                <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((pilot, index) => {
                // Calculate gap
                let gap = '-';
                if (leader && pilot.id !== leader.id && pilot.hasTime) {
                  if (isLapRaceSelected) {
                    if (pilot.isFinished && leader.isFinished) {
                      const gapMs = pilot.totalTimeMs - leader.totalTimeMs;
                      gap = '+' + formatTimeMs(gapMs);
                    } else if (pilot.isRacing || pilot.isFinished) {
                      const lapDiff = (leader.completedLaps || 0) - (pilot.completedLaps || 0);
                      if (lapDiff > 0) {
                        gap = `+${lapDiff} lap${lapDiff > 1 ? 's' : ''}`;
                      }
                    }
                  } else {
                    gap = '+' + (pilot.sortTime - leader.sortTime).toFixed(3) + 's';
                  }
                } else if (pilot.hasTime && pilot.id === leader?.id) {
                  gap = 'LEADER';
                }
                
                const category = categories.find(c => c.id === pilot.categoryId);

                return (
                  <tr
                    key={pilot.id}
                    className="border-b border-white/10 hover:bg-white/5 transition-colors relative">
                    <td className="p-1 w-1 relative">
                      {category && (
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
                      )}
                    </td>
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
                        {pilot.streamUrl && pilot.isActive && !hideStreams ? (
                          <div className="w-32 h-18 rounded overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
                            <StreamPlayer
                              pilotId={pilot.id}
                              streamUrl={pilot.streamUrl}
                              name={pilot.name}
                              className="w-full h-full"
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
                    
                    {isLapRaceSelected ? (
                      <>
                        <td className="p-4 text-center">
                          <span className={`text-xl font-mono ${
                            pilot.isFinished ? 'text-[#22C55E]' : 
                            pilot.isRacing ? 'text-[#FACC15]' : 
                            'text-zinc-500'
                          }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {pilot.completedLaps || 0}/{selectedStage?.numberOfLaps || 0}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`text-2xl font-mono ${
                            pilot.isFinished ? 'text-[#22C55E]' : 
                            pilot.isRacing ? 'text-[#FACC15]' : 
                            'text-zinc-500'
                          }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {pilot.hasTime ? formatTimeMs(pilot.totalTimeMs) : '-'}
                          </span>
                        </td>
                      </>
                    ) : selectedStageId ? (
                      <>
                        <td className="p-4 text-right">
                          <span className={`text-2xl font-mono ${pilot.timeColor}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {pilot.displayTime}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`text-xl font-mono ${pilot.overallColor || 'text-white'}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {pilot.overallDisplay}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td className="p-4 text-right">
                        <span className={`text-xl font-mono ${pilot.timeColor}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {pilot.overallDisplay}
                        </span>
                      </td>
                    )}
                    
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
