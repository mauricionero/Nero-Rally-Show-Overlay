import React, { useState, useEffect, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { StartInformationValue } from '../StartInformationValue.jsx';
import { parseTime, getPilotStatus, getReferenceNow, getRunningTime, isPilotRetiredForStage, startInformationTime } from '../../utils/rallyHelpers';
import { compareStagesBySchedule } from '../../utils/stageSchedule.js';
import { Flag, RotateCcw, Car, Timer } from 'lucide-react';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { getStageTitle, isLapRaceStageType, isSpecialStageType, SUPER_PRIME_STAGE_TYPE } from '../../utils/stageTypes.js';
const SCENE_3_CONFIG_KEY = 'scene3Config';

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

// Format cumulative rally time from seconds, switching to HH:MM:SS.fff above 1 hour
const formatOverallTime = (totalSeconds) => {
  if (!totalSeconds) return '-';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = (totalSeconds % 60).toFixed(3).padStart(6, '0');

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds}`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  return `${String(totalMinutes).padStart(2, '0')}:${seconds}`;
};

export default function Scene3Leaderboard({ hideStreams = false }) {
  const { pilots, stages, times, startTimes, retiredStages, categories, logoUrl, lapTimes, stagePilots, debugDate, currentStageId, isStageAlert } = useRally();
  const { t } = useTranslation();
  const [selectedStageId, setSelectedStageId] = useState(() => loadSceneConfig(SCENE_3_CONFIG_KEY, { selectedStageId: null }).selectedStageId);
  const [followCurrentStage, setFollowCurrentStage] = useState(() => loadSceneConfig(SCENE_3_CONFIG_KEY, { followCurrentStage: true }).followCurrentStage);
  const [currentTime, setCurrentTime] = useState(new Date());
  const sceneNow = useMemo(() => getReferenceNow(debugDate, currentTime), [debugDate, currentTime]);
  
  const selectedStage = stages.find(s => s.id === selectedStageId);
  
  // Filter stages by type
  const ssStages = stages.filter(s => isSpecialStageType(s.type));
  const lapRaceStages = stages.filter(s => isLapRaceStageType(s.type));
  const sortedAllStages = useMemo(() => [...stages].sort(compareStagesBySchedule), [stages]);
  
  // Sort stages by start time
  const sortedSSStages = [...ssStages].sort(compareStagesBySchedule);

  const sortedLapRaceStages = [...lapRaceStages].sort(compareStagesBySchedule);

  const referenceSpecialStage = useMemo(() => {
    if (selectedStage && isSpecialStageType(selectedStage.type)) {
      return selectedStage;
    }

    if (!currentStageId) {
      return sortedSSStages[sortedSSStages.length - 1] || null;
    }

    const currentStageIndex = sortedAllStages.findIndex((stage) => stage.id === currentStageId);
    if (currentStageIndex === -1) {
      return sortedSSStages[sortedSSStages.length - 1] || null;
    }

    return [...sortedAllStages.slice(0, currentStageIndex + 1)]
      .reverse()
      .find((stage) => isSpecialStageType(stage.type)) || null;
  }, [selectedStage, currentStageId, sortedAllStages, sortedSSStages]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (followCurrentStage && currentStageId && stages.some((stage) => stage.id === currentStageId) && currentStageId !== selectedStageId) {
      setSelectedStageId(currentStageId);
    }
  }, [followCurrentStage, currentStageId, stages, selectedStageId]);

  useEffect(() => {
    if (selectedStageId && !stages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(null);
    }
  }, [selectedStageId, stages]);

  useEffect(() => {
    saveSceneConfig(SCENE_3_CONFIG_KEY, {
      selectedStageId,
      followCurrentStage
    });
  }, [selectedStageId, followCurrentStage]);

  // Calculate leaderboard based on selected stage/type
  const leaderboard = useMemo(() => {
    const sortByRetirementAndTime = (entries) => (
      [...entries].sort((a, b) => {
        if (a.isRetired !== b.isRetired) {
          return a.isRetired ? 1 : -1;
        }

        if (a.isRetired && b.isRetired) {
          if (b.completedStages !== a.completedStages) {
            return b.completedStages - a.completedStages;
          }
        }

        if (!a.hasTime && !b.hasTime) return 0;
        if (!a.hasTime) return 1;
        if (!b.hasTime) return -1;
        return a.sortTime - b.sortTime;
      })
    );

    // If a specific stage is selected
    if (selectedStageId && selectedStage) {
      if (isLapRaceStageType(selectedStage.type)) {
        // Lap Race leaderboard
        return calculateLapRaceLeaderboard(pilots, selectedStageId, lapTimes, stagePilots, selectedStage.numberOfLaps || 5);
      } else if (isSpecialStageType(selectedStage.type)) {
        // Single special stage leaderboard
        return sortByRetirementAndTime(pilots.map(pilot => {
          const timeInfo = startInformationTime({
            pilotId: pilot.id,
            stageId: selectedStageId,
            startTimes,
            times,
            retiredStages,
            stageDate: selectedStage?.date,
            now: sceneNow,
            startLabel: t('status.start'),
            retiredLabel: t('status.retired')
          });
          
          let displayTime = '-';
          let timeColor = 'text-white';
          let sortTime = Infinity;
          
          if (timeInfo.status === 'retired') {
            displayTime = timeInfo.text;
            timeColor = 'text-red-400';
          } else if (timeInfo.status === 'racing' && timeInfo.timer) {
            displayTime = timeInfo.text;
            timeColor = 'text-[#FACC15]';
            sortTime = parseTime(timeInfo.timer) || Infinity;
          } else if (timeInfo.status === 'finished' && timeInfo.finishTime) {
            displayTime = timeInfo.text;
            timeColor = timeInfo.retired ? 'text-amber-400' : 'text-white';
            sortTime = parseTime(timeInfo.finishTime);
          } else if (timeInfo.text) {
            displayTime = timeInfo.text;
            timeColor = 'text-zinc-400';
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
              const stageStatus = getPilotStatus(pilot.id, stage.id, startTimes, times, retiredStages, stage.date, sceneNow);
              const stageStartTime = startTimes[pilot.id]?.[stage.id];
              if (stageStatus === 'racing' && stageStartTime) {
                const runningTime = getRunningTime(stageStartTime, stage.date, sceneNow);
                overallTime += parseTime(runningTime) || 0;
                hasRunningInOverall = true;
              }
            }
            
            if (stage.id === selectedStageId) break;
          }
          
          const overallDisplay = (completedStages > 0 || hasRunningInOverall) ? formatOverallTime(overallTime) : '-';
          const overallColor = hasRunningInOverall ? 'text-[#FACC15]' : 'text-white';
          
          return {
            ...pilot,
            displayTime,
            timeInfo,
            timeColor,
            sortTime,
            overallTime,
            overallDisplay,
            overallColor,
            hasTime: timeInfo.status === 'finished' || timeInfo.status === 'racing',
            status: timeInfo.status,
            completedStages,
            isRetired: timeInfo.retired
          };
        }));
      }
    }
    
    // Overall SS standings (default)
    return sortByRetirementAndTime(pilots.map(pilot => {
      let totalTime = 0;
      let completedStages = 0;
      let hasRunningStage = false;
      const isRetired = referenceSpecialStage
        ? isPilotRetiredForStage(pilot.id, referenceSpecialStage.id, retiredStages)
        : false;
      
      sortedSSStages.forEach(stage => {
        const finishTime = times[pilot.id]?.[stage.id];
        if (finishTime) {
          totalTime += parseTime(finishTime);
          completedStages++;
        } else {
          const status = getPilotStatus(pilot.id, stage.id, startTimes, times, retiredStages, stage.date, sceneNow);
          const startTime = startTimes[pilot.id]?.[stage.id];
          if (status === 'racing' && startTime && !hasRunningStage) {
            const runningTime = getRunningTime(startTime, stage.date, sceneNow);
            totalTime += parseTime(runningTime);
            hasRunningStage = true;
          }
        }
      });

      const displayTime = (completedStages > 0 || hasRunningStage) ? formatOverallTime(totalTime) : '-';

      return {
        ...pilot,
        totalTime,
        completedStages,
        displayTime,
        timeColor: hasRunningStage ? 'text-[#FACC15]' : 'text-white',
        sortTime: (completedStages > 0 || hasRunningStage) ? totalTime : Infinity,
        overallDisplay: displayTime,
        hasTime: completedStages > 0 || hasRunningStage,
        isRetired
      };
    }));
  }, [selectedStageId, selectedStage, pilots, times, startTimes, retiredStages, lapTimes, stagePilots, sortedSSStages, sceneNow, referenceSpecialStage, t]);

  const leader = leaderboard.find(p => p.hasTime);
  const isLapRaceSelected = isLapRaceStageType(selectedStage?.type);
  const alertStageId = selectedStageId || currentStageId || null;

  // Get stage icon based on type
  const getStageIcon = (type) => {
    switch (type) {
      case 'SS': return Flag;
      case SUPER_PRIME_STAGE_TYPE: return Flag;
      case 'Lap Race': return RotateCcw;
      case 'Liaison': return Car;
      case 'Service Park': return Timer;
      default: return Flag;
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center p-8 overflow-hidden" data-testid="scene-3-leaderboard">
      {/* Logo - Top Right */}
      {logoUrl && (
        <div className="absolute top-4 right-8 z-10">
          <img 
            src={logoUrl} 
            alt="Channel Logo" 
            className="h-28 max-w-[280px] object-contain"
          />
        </div>
      )}

      <LeftControls>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={followCurrentStage}
              onCheckedChange={(checked) => setFollowCurrentStage(checked === true)}
            />
            <div>
              <p className="text-sm text-white">{t('scene3.followCurrentStage')}</p>
              <p className="text-xs text-zinc-500">{t('scene3.followCurrentStageHint')}</p>
            </div>
          </label>

          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene3.selectView')}</Label>
            <Select value={selectedStageId || 'overall'} onValueChange={(val) => setSelectedStageId(val === 'overall' ? null : val)} disabled={followCurrentStage}>
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
                      {t('scene3.specialStages')}
                    </div>
                    {sortedSSStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <Flag className={`w-4 h-4 ${stage.type === SUPER_PRIME_STAGE_TYPE ? 'text-orange-400' : 'text-[#FF4500]'}`} />
                          {getStageTitle(stage)}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
                
                {/* Lap Race Stages */}
                {sortedLapRaceStages.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-zinc-500 uppercase border-t border-zinc-700 mt-1">
                      {t('scene3.lapRaces')}
                    </div>
                    {sortedLapRaceStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <RotateCcw className="w-4 h-4 text-[#FACC15]" />
                          {stage.name} ({stage.numberOfLaps} {t('scene3.laps').toLowerCase()})
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

      <div className="w-full max-w-6xl h-full flex flex-col min-h-0">
        {/* Header - Shows selected stage name */}
        <div className="text-center mb-8 mt-6 flex-shrink-0">
          <div className="flex items-center justify-center gap-3 mb-2">
            {selectedStage ? (
              <>
                {React.createElement(getStageIcon(selectedStage.type), { 
                  className: `w-10 h-10 ${selectedStage.type === 'Lap Race' ? 'text-[#FACC15]' : selectedStage.type === SUPER_PRIME_STAGE_TYPE ? 'text-orange-400' : 'text-[#FF4500]'}` 
                })}
              </>
            ) : (
              <Flag className="w-10 h-10 text-[#FF4500]" />
            )}
          </div>
          <h1 className="text-6xl font-bold uppercase text-[#FF4500] mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {selectedStage 
              ? getStageTitle(selectedStage)
              : t('scene3.overallStandings')
            }
          </h1>
          {isLapRaceSelected && selectedStage && (
            <p className="text-zinc-400 text-xl">{selectedStage.numberOfLaps} {t('scene3.laps')}</p>
          )}
        </div>

        {/* Leaderboard Table */}
        <div className="bg-black/95 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden flex-1 min-h-0">
          <div className="h-full overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#18181B] text-white border-b border-white/10 sticky top-0 z-10">
                <th className="p-1 w-1"></th>
                <th className="p-4 text-left uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('scene3.pos')}</th>
                <th className="p-4 text-left uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('scene3.pilot')}</th>
                {isLapRaceSelected ? (
                  <>
                    <th className="p-4 text-center uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('scene3.laps')}</th>
                    <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('scene3.totalTime')}</th>
                  </>
                ) : selectedStageId ? (
                  <>
                    <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('scene3.ssTime')}</th>
                    <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('scene3.overall')}</th>
                  </>
                ) : (
                  <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('scene3.overall')}</th>
                )}
                <th className="p-4 text-right uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('scene3.gap')}</th>
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
                        gap = `+${lapDiff} ${t('scene3.laps').toLowerCase()}`;
                      }
                    }
                  } else {
                    gap = '+' + (pilot.sortTime - leader.sortTime).toFixed(3) + 's';
                  }
                } else if (pilot.hasTime && pilot.id === leader?.id) {
                  gap = t('scene3.leader');
                }
                
                const category = categories.find(c => c.id === pilot.categoryId);
                const pilotMeta = [pilot.car, pilot.team].filter(Boolean).join(' • ');
                const alert = alertStageId ? isStageAlert(pilot.id, alertStageId) : false;

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
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-white text-xl font-bold uppercase truncate block" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              {pilot.name}
                            </span>
                            {alert && (
                              <span className="flex-shrink-0 bg-amber-500/30 text-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                {t('status.alert')}
                              </span>
                            )}
                            {pilot.isRetired && (
                              <span className="flex-shrink-0 bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                RET
                              </span>
                            )}
                          </div>
                          {pilotMeta && (
                            <span className="text-zinc-400 text-xs uppercase tracking-wide truncate block leading-tight mt-0.5">
                              {pilotMeta}
                            </span>
                          )}
                        </div>
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
                          <StartInformationValue
                            info={pilot.timeInfo}
                            fallback={pilot.displayTime}
                            className={`text-2xl font-mono ${pilot.timeColor}`}
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                          />
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
