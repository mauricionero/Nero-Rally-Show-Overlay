import React, { useState, useEffect, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { getResolvedBrandingLogoUrl } from '../../utils/branding.js';
import { LeftControls } from '../LeftControls.jsx';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import StatusPill from '../StatusPill.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { LiveStartInformationValue } from '../LiveStartInformationValue.jsx';
import { LiveOverallTimeValue } from '../LiveOverallTimeValue.jsx';
import {
  getReferenceNow,
  getStageDateTime,
  isJumpStartForStage,
  isPilotRetiredForStage,
  parseTime,
  startInformationTime
} from '../../utils/rallyHelpers';
import { compareStagesBySchedule } from '../../utils/stageSchedule.js';
import { Flag, RotateCcw, Car, Timer } from 'lucide-react';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { getStageTitle, isLapRaceStageType, isSpecialStageType, SUPER_PRIME_STAGE_TYPE } from '../../utils/stageTypes.js';
import { usePilotStatusMotion } from '../../hooks/usePilotStatusMotion.js';
import { usePilotPositionMotion } from '../../hooks/usePilotPositionMotion.js';
import { useFastClock } from '../../hooks/useFastClock.js';
import { useSecondAlignedClock } from '../../hooks/useSecondAlignedClock.js';
import { formatDurationMs, formatDurationSeconds, formatSecondsValue } from '../../utils/timeFormat.js';

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

export default function Scene3Leaderboard({ hideStreams = false }) {
  const { pilots, stages, times, startTimes, realStartTimes, retiredStages, categories, logoUrl, lapTimes, stagePilots, debugDate, currentStageId, isStageAlert, timeDecimals } = useRally();
  const resolvedLogoUrl = getResolvedBrandingLogoUrl(logoUrl);
  const { t } = useTranslation();
  const [selectedStageId, setSelectedStageId] = useState(() => loadSceneConfig(SCENE_3_CONFIG_KEY, { selectedStageId: null }).selectedStageId);
  const [followCurrentStage, setFollowCurrentStage] = useState(() => loadSceneConfig(SCENE_3_CONFIG_KEY, { followCurrentStage: true }).followCurrentStage);
  
  const selectedStage = stages.find(s => s.id === selectedStageId);
  const selectedSpecialStageSelected = Boolean(selectedStageId && selectedStage && isSpecialStageType(selectedStage.type));
  const fastClockEnabled = selectedSpecialStageSelected && timeDecimals > 0;
  const currentFastTime = useFastClock(fastClockEnabled);
  const currentSecondAlignedTime = useSecondAlignedClock(selectedSpecialStageSelected && !fastClockEnabled);
  const sceneNow = useMemo(() => (
    getReferenceNow(
      debugDate,
      fastClockEnabled ? new Date(currentFastTime) : currentSecondAlignedTime
    )
  ), [debugDate, fastClockEnabled, currentFastTime, currentSecondAlignedTime]);
  const alertStageId = selectedStageId || currentStageId || null;
  
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

  const selectedSpecialStageIndex = useMemo(() => (
    selectedStage && isSpecialStageType(selectedStage.type)
      ? sortedSSStages.findIndex((stage) => stage.id === selectedStage.id)
      : -1
  ), [selectedStage, sortedSSStages]);

  const ssStagesUpToSelected = useMemo(() => (
    selectedSpecialStageIndex >= 0
      ? sortedSSStages.slice(0, selectedSpecialStageIndex + 1)
      : sortedSSStages
  ), [selectedSpecialStageIndex, sortedSSStages]);

  const referenceSpecialStageIndex = useMemo(() => (
    referenceSpecialStage
      ? sortedSSStages.findIndex((stage) => stage.id === referenceSpecialStage.id)
      : -1
  ), [referenceSpecialStage, sortedSSStages]);

  const ssStagesUpToReference = useMemo(() => (
    referenceSpecialStageIndex >= 0
      ? sortedSSStages.slice(0, referenceSpecialStageIndex + 1)
      : sortedSSStages
  ), [referenceSpecialStageIndex, sortedSSStages]);

  const categoryById = useMemo(() => (
    new Map(categories.map((category) => [category.id, category]))
  ), [categories]);

  const pilotUiMetaById = useMemo(() => (
    new Map(pilots.map((pilot) => [
      pilot.id,
      {
        category: categoryById.get(pilot.categoryId) || null,
        pilotMeta: [pilot.car, pilot.team].filter(Boolean).join(' • '),
        alert: alertStageId ? isStageAlert(pilot.id, alertStageId) : false,
        jumpStart: alertStageId ? isJumpStartForStage(pilot.id, alertStageId, startTimes, realStartTimes) : false
      }
    ]))
  ), [alertStageId, categoryById, isStageAlert, pilots, realStartTimes, startTimes]);

  const displayOrderByPilotId = useMemo(() => (
    new Map(pilots.map((pilot, index) => [pilot.id, index]))
  ), [pilots]);

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
          const startTime = startTimes[pilot.id]?.[selectedStageId] || '';
          const finishTime = times[pilot.id]?.[selectedStageId] || '';
          const retired = !!retiredStages?.[pilot.id]?.[selectedStageId];
          const timeInfo = startInformationTime({
            pilotId: pilot.id,
            stageId: selectedStageId,
            startTimes,
            times,
            retiredStages,
            stageDate: selectedStage.date,
            now: sceneNow,
            decimals: timeDecimals,
            startLabel: t('status.start'),
            retiredLabel: t('status.retired')
          });
          const stageStartDateTime = getStageDateTime(selectedStage.date, startTime);
          const status = finishTime
            ? 'finished'
            : retired
              ? 'retired'
              : timeInfo.status === 'racing'
                ? 'racing'
                : 'not_started';
          const displayTime = timeInfo.text || '-';
          const timeColor = status === 'retired'
            ? 'text-red-400'
            : status === 'finished'
              ? 'text-white'
              : status === 'racing'
                ? 'text-[#FACC15]'
                : 'text-zinc-400';
          const sortTime = finishTime
            ? parseTime(finishTime)
            : (status === 'racing' && stageStartDateTime
              ? Math.max(0, sceneNow.getTime() - stageStartDateTime.getTime())
              : (displayOrderByPilotId.get(pilot.id) ?? Number.MAX_SAFE_INTEGER));
          const completedStages = ssStagesUpToSelected.reduce((count, stage) => (
            times[pilot.id]?.[stage.id] ? count + 1 : count
          ), 0);
          const overallTime = ssStagesUpToSelected.reduce((total, stage) => {
            const stageFinishTime = times[pilot.id]?.[stage.id];
            return stageFinishTime ? total + parseTime(stageFinishTime) : total;
          }, 0);
          const overallDisplay = completedStages > 0
            ? formatDurationSeconds(overallTime, timeDecimals, { showHoursIfNeeded: true, padMinutes: true })
            : '-';
          
          return {
            ...pilot,
            displayTime,
            timeInfo,
            timeColor,
            sortTime,
            overallTime,
            overallDisplay,
            overallColor: 'text-white',
            hasTime: !!(finishTime || startTime),
            status,
            completedStages,
            isRetired: retired
          };
        }));
      }
    }
    
    // Overall SS standings (default)
    return sortByRetirementAndTime(pilots.map(pilot => {
      let totalTime = 0;
      let completedStages = 0;
      const isRetired = referenceSpecialStage
        ? isPilotRetiredForStage(pilot.id, referenceSpecialStage.id, retiredStages)
        : false;
      
      sortedSSStages.forEach(stage => {
        const finishTime = times[pilot.id]?.[stage.id];
        if (finishTime) {
          totalTime += parseTime(finishTime);
          completedStages++;
        }
      });

      const displayTime = completedStages > 0
        ? formatDurationSeconds(totalTime, timeDecimals, { showHoursIfNeeded: true, padMinutes: true })
        : '-';

      return {
        ...pilot,
        totalTime,
        completedStages,
        displayTime,
        timeColor: 'text-white',
        sortTime: completedStages > 0 ? totalTime : Infinity,
        overallDisplay: displayTime,
        hasTime: completedStages > 0,
        isRetired
      };
    }));
  }, [selectedStageId, selectedStage, pilots, times, startTimes, retiredStages, lapTimes, stagePilots, sortedSSStages, referenceSpecialStage, timeDecimals, displayOrderByPilotId, sceneNow, t]);

  const isLapRaceSelected = isLapRaceStageType(selectedStage?.type);
  const leaderboardStatusItems = useMemo(() => (
    leaderboard.map((pilot) => ({
      ...pilot,
      key: pilot.id,
      statusKey: isLapRaceSelected
        ? (pilot.isFinished ? 'finished' : (pilot.isRacing ? 'racing' : 'not_started'))
        : (pilot.isRetired ? 'retired' : (pilot.status || (pilot.hasTime ? 'finished' : 'not_started')))
    }))
  ), [isLapRaceSelected, leaderboard]);
  const {
    displayedItems: displayedLeaderboard,
    getStatusMotionClassName,
    pilotStatusMotionConfig,
    isStatusTransitionActive
  } = usePilotStatusMotion(leaderboardStatusItems);
  const { setMotionRef } = usePilotPositionMotion(displayedLeaderboard, {
    disabled: isStatusTransitionActive
  });
  const displayLeader = displayedLeaderboard.find((pilot) => pilot.hasTime);

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
      {resolvedLogoUrl && (
        <div className="absolute top-4 right-8 z-10">
          <img 
            src={resolvedLogoUrl} 
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
              {displayedLeaderboard.map((pilot, index) => {
                // Calculate gap
                let gap = '-';
                if (displayLeader && pilot.id !== displayLeader.id && pilot.hasTime) {
                  if (isLapRaceSelected) {
                    if (pilot.isFinished && displayLeader.isFinished) {
                      const gapMs = pilot.totalTimeMs - displayLeader.totalTimeMs;
                      gap = '+' + formatDurationMs(gapMs, timeDecimals);
                    } else if (pilot.isRacing || pilot.isFinished) {
                      const lapDiff = (displayLeader.completedLaps || 0) - (pilot.completedLaps || 0);
                      if (lapDiff > 0) {
                        gap = `+${lapDiff} ${t('scene3.laps').toLowerCase()}`;
                      }
                    }
                  } else {
                    gap = '+' + formatSecondsValue(pilot.sortTime - displayLeader.sortTime, timeDecimals) + 's';
                  }
                } else if (pilot.hasTime && pilot.id === displayLeader?.id) {
                  gap = t('scene3.leader');
                }
                
                const pilotUiMeta = pilotUiMetaById.get(pilot.id) || {};
                const category = pilotUiMeta.category || null;
                const pilotMeta = pilotUiMeta.pilotMeta || '';
                const alert = pilotUiMeta.alert || false;
                const jumpStart = pilotUiMeta.jumpStart || false;

                return (
                  <tr
                    key={pilot.id}
                    ref={(node) => setMotionRef(pilot.id, node)}
                    className={`border-b border-white/10 hover:bg-white/5 transition-colors relative ${getStatusMotionClassName(pilot.id)}`}
                    style={{
                      willChange: 'transform',
                      '--pilot-status-motion-exit': `${pilotStatusMotionConfig.exitDuration}ms`,
                      '--pilot-status-motion-enter': `${pilotStatusMotionConfig.enterDuration}ms`,
                      '--pilot-status-motion-distance': `${pilotStatusMotionConfig.distance}px`,
                      '--pilot-status-motion-easing': pilotStatusMotionConfig.easing
                    }}>
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
                              <StatusPill
                                variant="alert"
                                text={t('status.alert')}
                                tooltipTitle={t('status.alertLabel')}
                                tooltipText={t('status.alertTooltip')}
                              />
                            )}
                            {jumpStart && (
                              <StatusPill
                                variant="jumpStart"
                                text={t('status.jumpStart')}
                                tooltipTitle={t('times.jumpStart')}
                                tooltipText={t('times.jumpStartTooltip')}
                              />
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
                            {pilot.hasTime ? formatDurationMs(pilot.totalTimeMs, timeDecimals) : '-'}
                          </span>
                        </td>
                      </>
                    ) : selectedStageId ? (
                      <>
                        <td className="p-4 text-right">
                      <LiveStartInformationValue
                        startTime={startTimes[pilot.id]?.[selectedStageId] || ''}
                        finishTime={times[pilot.id]?.[selectedStageId] || ''}
                        retired={!!retiredStages?.[pilot.id]?.[selectedStageId]}
                        stageDate={selectedStage?.date}
                        startLabel={t('status.start')}
                        retiredLabel={t('status.retired')}
                        fallback={pilot.displayTime}
                        liveStatus={pilot.timeInfo?.status}
                        debugDate={debugDate}
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
