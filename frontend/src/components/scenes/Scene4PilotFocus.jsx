import React, { useState, useEffect, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { FeedSelect } from '../FeedSelect.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { getPilotStatus, getReferenceNow, getRunningTime, hasStageDateTimePassed } from '../../utils/rallyHelpers';
import { Flag, RotateCcw, Car, Timer, Video } from 'lucide-react';
import { buildFeedOptions, findFeedByValue } from '../../utils/feedOptions.js';
import { getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { getPilotScheduledEndTime } from '../../utils/pilotSchedule.js';
import { compareStagesBySchedule } from '../../utils/stageSchedule.js';
import {
  getStageNumberLabel,
  getStageTitle,
  isLapRaceStageType,
  isSpecialStageType,
  SUPER_PRIME_STAGE_TYPE
} from '../../utils/stageTypes.js';

// Helper to get stage type icon
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

// Helper to get stage type color
const getStageTypeColor = (type) => {
  switch (type) {
    case 'SS': return '#FF4500';
    case SUPER_PRIME_STAGE_TYPE: return '#FB923C';
    case 'Lap Race': return '#FACC15';
    case 'Liaison': return '#3B82F6';
    case 'Service Park': return '#22C55E';
    default: return '#FF4500';
  }
};

// Format milliseconds to readable time
const formatTimeMs = (ms) => {
  if (!ms) return '-';
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = (totalSecs % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
};

// Calculate lap duration from timestamps
const calculateLapDuration = (currentLapTime, previousLapTime, startTime) => {
  const parseTimeToMs = (timeStr) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length < 2) return null;
    const hours = parts.length === 3 ? parseInt(parts[0]) || 0 : 0;
    const mins = parts.length === 3 ? parseInt(parts[1]) || 0 : parseInt(parts[0]) || 0;
    const secsStr = parts.length === 3 ? parts[2] : parts[1];
    const [secs, ms] = (secsStr || '0').split('.');
    return (hours * 3600 + mins * 60 + parseFloat(secs || 0) + parseFloat(`0.${ms || 0}`)) * 1000;
  };

  const currentMs = parseTimeToMs(currentLapTime);
  const previousMs = previousLapTime ? parseTimeToMs(previousLapTime) : (startTime ? parseTimeToMs(startTime) : null);
  
  if (currentMs === null || previousMs === null) return null;
  
  const diffMs = currentMs - previousMs;
  if (diffMs < 0) return null;
  
  return diffMs;
};

export default function Scene4PilotFocus({ hideStreams = false }) {
  const { 
    pilots, stages, times, startTimes, currentStageId, chromaKey, logoUrl,
    lapTimes, stagePilots, cameras, externalMedia, debugDate
  } = useRally();
  const { t } = useTranslation();
  
  const [selectedPilotId, setSelectedPilotId] = useState(pilots[0]?.id || null);
  const [selectedStageId, setSelectedStageId] = useState(currentStageId || stages[0]?.id || null);
  const [selectedMainFeedValue, setSelectedMainFeedValue] = useState('none');
  const [currentTime, setCurrentTime] = useState(new Date());
  const sceneNow = useMemo(() => getReferenceNow(debugDate, currentTime), [debugDate, currentTime]);

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

  // Update to current stage if it changes
  useEffect(() => {
    if (currentStageId && currentStageId !== selectedStageId) {
      setSelectedStageId(currentStageId);
    }
  }, [currentStageId]);

  const focusPilot = pilots.find(p => p.id === selectedPilotId);
  const selectedStage = stages.find(s => s.id === selectedStageId);
  const isLapRace = isLapRaceStageType(selectedStage?.type);

  // Get pilot's stage times with sorted stages
  const sortedStages = useMemo(() => {
    return [...stages].sort(compareStagesBySchedule);
  }, [stages]);

  // Build pilot stage data based on stage type
  const pilotStageData = useMemo(() => {
    if (!focusPilot) return [];
    
    return sortedStages.map((stage) => {
      const isLap = isLapRaceStageType(stage.type);
      const isSS = isSpecialStageType(stage.type);
      
      if (isLap) {
        // Lap Race data
        const pilotLaps = lapTimes[focusPilot.id]?.[stage.id] || [];
        const completedLaps = pilotLaps.filter(t => t && t.trim() !== '').length;
        const numberOfLaps = stage.numberOfLaps || 5;
        const isFinished = completedLaps >= numberOfLaps;
        const isRacing = completedLaps > 0 && !isFinished;
        
        // Calculate total time
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
        
        // Calculate individual lap durations
        const lapDurations = pilotLaps.map((lapTime, idx) => {
          if (!lapTime) return null;
          const prevLapTime = idx > 0 ? pilotLaps[idx - 1] : null;
          return calculateLapDuration(lapTime, prevLapTime, stage.startTime);
        });
        
        let displayTime = '-';
        let status = 'not_started';
        
        if (isFinished) {
          displayTime = formatTimeMs(totalTimeMs);
          status = 'finished';
        } else if (isRacing) {
          displayTime = `Lap ${completedLaps}/${numberOfLaps}`;
          status = 'racing';
        }
        
        return {
          stage,
          time: displayTime,
          status,
          isLapRace: true,
          completedLaps,
          numberOfLaps,
          totalTimeMs,
          pilotLaps,
          lapDurations
        };
      } else if (isSS) {
        // SS Stage data
        const status = getPilotStatus(focusPilot.id, stage.id, startTimes, times, stage.date, sceneNow);
        const startTime = startTimes[focusPilot.id]?.[stage.id];
        const finishTime = times[focusPilot.id]?.[stage.id];
        
        let displayTime = '-';
        if (status === 'racing' && startTime) {
          displayTime = getRunningTime(startTime, stage.date, sceneNow);
        } else if (status === 'finished' && finishTime) {
          displayTime = finishTime;
        } else if (status === 'not_started' && startTime) {
          displayTime = 'Start: ' + startTime;
        }

        return {
          stage,
          time: displayTime,
          status,
          isLapRace: false
        };
      } else {
        // Liaison / Service Park
        const startTime = startTimes[focusPilot.id]?.[stage.id];
        const endTime = getPilotScheduledEndTime(stage, focusPilot);

        let displayTime = `${startTime || ''} -> ${endTime || ''}`.trim();
        let status = 'not_started';

        if (!displayTime) {
          displayTime = '-';
        }

        if (endTime && hasStageDateTimePassed(endTime, stage.date, sceneNow)) {
          status = 'finished';
        } else if (startTime && hasStageDateTimePassed(startTime, stage.date, sceneNow)) {
          status = 'racing';
        }

        return {
          stage,
          time: displayTime,
          status,
          isLapRace: false
        };
      }
    });
  }, [sortedStages, focusPilot, lapTimes, startTimes, times, sceneNow]);

  const selectedStageData = pilotStageData.find(d => d.stage.id === selectedStageId);
  const availableFeeds = useMemo(() => buildFeedOptions({ pilots, cameras, externalMedia }), [pilots, cameras, externalMedia]);
  const selectedMainFeed = selectedMainFeedValue === 'none' ? null : findFeedByValue(availableFeeds, selectedMainFeedValue);
  const SelectedMediaIcon = selectedMainFeed?.type === 'media'
    ? getExternalMediaIconComponent(selectedMainFeed.icon)
    : null;
  const showFocusPilotPip = !!selectedMainFeed
    && !!focusPilot?.streamUrl
    && !hideStreams
    && !(selectedMainFeed.type === 'pilot' && selectedMainFeed.id === focusPilot.id);

  useEffect(() => {
    if (selectedMainFeedValue !== 'none' && !findFeedByValue(availableFeeds, selectedMainFeedValue)) {
      setSelectedMainFeedValue('none');
    }
  }, [availableFeeds, selectedMainFeedValue]);

  // Early return after all hooks
  if (!focusPilot) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="scene-4-pilot-focus">
        <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          {t('scene4.noPilotSelected')}
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex" data-testid="scene-4-pilot-focus">
      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene4.selectPilot')}</Label>
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
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene4.selectStage')}</Label>
            <Select value={selectedStageId} onValueChange={setSelectedStageId}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortedStages.map((stage) => {
                  const Icon = getStageIcon(stage.type);
                  return (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" style={{ color: getStageTypeColor(stage.type) }} />
                        {getStageTitle(stage)}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Main Feed Selection */}
          {availableFeeds.length > 0 && (
            <div>
              <Label className="text-white text-xs uppercase mb-2 block">{t('scene4.mainFeed')}</Label>
              <FeedSelect
                value={selectedMainFeedValue}
                onValueChange={setSelectedMainFeedValue}
                feeds={availableFeeds}
                placeholder={t('scene4.mainFeed')}
                noneOption={{ value: 'none', label: t('scene4.noneUsesPilotStream') }}
                triggerClassName="bg-[#18181B] border-zinc-700 text-white text-sm"
                contentClassName="bg-[#18181B] border-zinc-700 text-white"
                groupLabels={{
                  cameras: t('streams.additionalCameras'),
                  media: t('config.externalMedia'),
                  pilots: t('tabs.pilots')
                }}
              />
            </div>
          )}
        </div>
      </LeftControls>

      <div className="flex-1 p-8 flex flex-col gap-5 min-h-0">
        <div className="bg-white/5 border border-white/10 rounded-xl px-6 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {focusPilot.picture ? (
              <img
                src={focusPilot.picture}
                alt={focusPilot.name}
                className="w-16 h-16 rounded-full object-cover flex-shrink-0 border-2 border-[#FF4500]"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 border-2 border-[#FF4500]">
                <span className="text-2xl font-bold text-white">{focusPilot.name.charAt(0)}</span>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-3xl font-bold uppercase text-white truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {focusPilot.name}
                </h2>
                {focusPilot.carNumber && (
                  <span className="inline-block bg-[#FF4500] text-white text-sm font-bold px-2 py-0.5 rounded">
                    #{focusPilot.carNumber}
                  </span>
                )}
                {focusPilot.isActive && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FF4500] rounded-full">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    <span className="text-white text-xs font-bold uppercase">{t('scene4.live')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            {(focusPilot.car || focusPilot.team) && (
              <div className="bg-black/50 border border-white/10 rounded-lg px-4 py-2 min-w-[220px]">
                {focusPilot.car && (
                  <p className="text-zinc-200 text-sm uppercase tracking-wide truncate">
                    {focusPilot.car}
                  </p>
                )}
                {focusPilot.team && (
                  <p className="text-zinc-400 text-sm uppercase tracking-wide truncate mt-0.5">
                    {focusPilot.team}
                  </p>
                )}
              </div>
            )}

            {logoUrl && (
              <img
                src={logoUrl}
                alt="Channel Logo"
                className="w-32 max-h-16 object-contain flex-shrink-0"
              />
            )}
          </div>
        </div>

        <div className="flex-1 flex gap-6 min-h-0">
          {/* Stream Display */}
          <div className="flex-1 min-h-0">
            {selectedMainFeed?.type === 'media' ? (
              <div className="h-full bg-black rounded overflow-hidden border-2 border-[#FF4500] relative">
                <iframe
                  src={selectedMainFeed.url}
                  className="w-full h-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={selectedMainFeed.name}
                />

                <div className="absolute top-4 left-4 bg-black/90 backdrop-blur-sm px-3 py-2 rounded border border-[#FF4500] flex items-center gap-2">
                  {SelectedMediaIcon && <SelectedMediaIcon className="w-4 h-4 text-[#FF4500]" />}
                  <span className="text-white font-bold uppercase text-sm" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {selectedMainFeed.name}
                  </span>
                </div>

                {selectedStageData && (
                  <div className="absolute top-4 right-4 bg-black/90 backdrop-blur-sm p-4 rounded border border-[#FF4500]">
                    <div className="flex items-center gap-2 mb-1">
                      {React.createElement(getStageIcon(selectedStage?.type), {
                        className: 'w-4 h-4',
                        style: { color: getStageTypeColor(selectedStage?.type) }
                      })}
                      <p className="text-zinc-400 text-xs uppercase">
                        {isSpecialStageType(selectedStage?.type) && selectedStage?.ssNumber ? getStageNumberLabel(selectedStage) : selectedStage?.name}
                      </p>
                    </div>
                    <p className={`text-2xl font-mono font-bold ${
                      selectedStageData.status === 'racing' ? 'text-[#FACC15]' :
                      selectedStageData.status === 'finished' ? 'text-[#22C55E]' :
                      'text-zinc-500'
                    }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {selectedStageData.time}
                    </p>
                  </div>
                )}

                {showFocusPilotPip && (
                  <div className="absolute bottom-6 right-6 w-64 h-36 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl">
                    <StreamPlayer
                      pilotId={focusPilot.id}
                      streamUrl={focusPilot.streamUrl}
                      name={focusPilot.name}
                      className="w-full h-full"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                      <p className="text-white text-xs font-bold uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {focusPilot.name}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : selectedMainFeed ? (
              /* Selected feed as main with focus pilot PiP */
              <div className="h-full bg-black rounded overflow-hidden border-2 border-[#FF4500] relative">
                {!hideStreams && selectedMainFeed.streamUrl && (
                  <StreamPlayer
                    pilotId={selectedMainFeed.id}
                    streamUrl={selectedMainFeed.streamUrl}
                    name={selectedMainFeed.name}
                    className="w-full h-full"
                  />
                )}
                
                <div className="absolute top-4 left-4 bg-black/90 backdrop-blur-sm px-3 py-2 rounded border border-[#FF4500] flex items-center gap-2">
                  {selectedMainFeed.type === 'camera' && <Video className="w-4 h-4 text-[#FF4500]" />}
                  <span className="text-white font-bold uppercase text-sm" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {selectedMainFeed.name}
                  </span>
                </div>
                
                {selectedStageData && (
                  <div className="absolute top-4 right-4 bg-black/90 backdrop-blur-sm p-4 rounded border border-[#FF4500]">
                    <div className="flex items-center gap-2 mb-1">
                      {React.createElement(getStageIcon(selectedStage?.type), { 
                        className: 'w-4 h-4',
                        style: { color: getStageTypeColor(selectedStage?.type) }
                      })}
                      <p className="text-zinc-400 text-xs uppercase">
                        {isSpecialStageType(selectedStage?.type) && selectedStage?.ssNumber ? getStageNumberLabel(selectedStage) : selectedStage?.name}
                      </p>
                    </div>
                    <p className={`text-2xl font-mono font-bold ${
                      selectedStageData.status === 'racing' ? 'text-[#FACC15]' :
                      selectedStageData.status === 'finished' ? 'text-[#22C55E]' :
                      'text-zinc-500'
                    }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {selectedStageData.time}
                    </p>
                  </div>
                )}
                
                {showFocusPilotPip && (
                  <div className="absolute bottom-6 right-6 w-64 h-36 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl">
                    <StreamPlayer
                      pilotId={focusPilot.id}
                      streamUrl={focusPilot.streamUrl}
                      name={focusPilot.name}
                      className="w-full h-full"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                      <p className="text-white text-xs font-bold uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {focusPilot.name}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : focusPilot.streamUrl && !hideStreams ? (
              /* Pilot stream as main (original behavior) */
              <div className="h-full bg-black rounded overflow-hidden border-2 border-[#FF4500] relative">
                <StreamPlayer
                  pilotId={focusPilot.id}
                  streamUrl={focusPilot.streamUrl}
                  name={focusPilot.name}
                  className="w-full h-full"
                />
                {selectedStageData && (
                  <div className="absolute top-4 right-4 bg-black/90 backdrop-blur-sm p-4 rounded border border-[#FF4500]">
                    <div className="flex items-center gap-2 mb-1">
                      {React.createElement(getStageIcon(selectedStage?.type), { 
                        className: 'w-4 h-4',
                        style: { color: getStageTypeColor(selectedStage?.type) }
                      })}
                      <p className="text-zinc-400 text-xs uppercase">
                        {isSpecialStageType(selectedStage?.type) && selectedStage?.ssNumber ? getStageNumberLabel(selectedStage) : selectedStage?.name}
                      </p>
                    </div>
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
            ) : hideStreams && (focusPilot.streamUrl || selectedMainFeed) ? (
              <div className="h-full rounded overflow-hidden border-2 border-[#FF4500] relative" style={{ backgroundColor: chromaKey }}>
                {selectedStageData && (
                  <div className="absolute top-4 right-4 bg-black/90 backdrop-blur-sm p-4 rounded border border-[#FF4500]">
                    <div className="flex items-center gap-2 mb-1">
                      {React.createElement(getStageIcon(selectedStage?.type), { 
                        className: 'w-4 h-4',
                        style: { color: getStageTypeColor(selectedStage?.type) }
                      })}
                      <p className="text-zinc-400 text-xs uppercase">
                        {isSpecialStageType(selectedStage?.type) && selectedStage?.ssNumber ? getStageNumberLabel(selectedStage) : selectedStage?.name}
                      </p>
                    </div>
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
              <div className="h-full rounded border-2 border-[#FF4500] flex items-center justify-center" style={{ backgroundColor: hideStreams ? chromaKey : 'black' }}>
                <p className="text-zinc-500 text-xl">{t('scene4.noStreamAvailable')}</p>
              </div>
            )}
          </div>

          {/* Right Side - Pilot Info */}
          <div className="w-1/3 bg-black/95 backdrop-blur-sm p-6 overflow-y-auto min-h-0">
            {/* Selected Stage Detail (for Lap Race, show lap breakdown) */}
            {selectedStageData && selectedStageData.isLapRace && (
              <div className="mb-6 p-4 bg-white/5 rounded border border-[#FACC15]/30">
                <h3 className="text-lg font-bold uppercase text-[#FACC15] mb-3 flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  <RotateCcw className="w-5 h-5" />
                  {selectedStage?.name} - {t('scene4.lapTimes')}
                </h3>
                <div className="space-y-2">
                  {Array.from({ length: selectedStageData.numberOfLaps }, (_, i) => {
                    const lapTime = selectedStageData.pilotLaps?.[i];
                    const lapDuration = selectedStageData.lapDurations?.[i];
                    const isCompleted = !!lapTime;
                    
                    return (
                      <div key={i} className={`flex justify-between items-center p-2 rounded ${
                        isCompleted ? 'bg-[#22C55E]/10 border border-[#22C55E]/30' : 'bg-zinc-800/50'
                      }`}>
                        <span className="text-zinc-400 text-sm">{t('times.lap')} {i + 1}</span>
                        <div className="text-right">
                          {isCompleted ? (
                            <span className="text-[#22C55E] font-mono text-sm" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {lapDuration ? formatTimeMs(lapDuration) : '-'}
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-sm">-</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {selectedStageData.totalTimeMs > 0 && (
                    <div className="flex justify-between items-center p-2 rounded bg-[#FACC15]/20 border border-[#FACC15]/50 mt-3">
                      <span className="text-[#FACC15] font-bold text-sm">{t('scene4.total')}</span>
                      <span className="text-[#FACC15] font-mono font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {formatTimeMs(selectedStageData.totalTimeMs)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* All Stage Times */}
            <div>
              <h3 className="text-xl font-bold uppercase text-[#FF4500] mb-3" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {t('scene4.allStageTimes')}
              </h3>
              <div className="space-y-2">
                {pilotStageData.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">{t('scene4.noStagesRegistered')}</p>
                ) : (
                  pilotStageData.map((item) => {
                    const Icon = getStageIcon(item.stage.type);
                    const stageColor = getStageTypeColor(item.stage.type);
                    
                    return (
                      <div 
                        key={item.stage.id} 
                        className={`border p-3 cursor-pointer transition-colors ${
                          item.stage.id === selectedStageId 
                            ? 'bg-[#FF4500]/20 border-[#FF4500]' 
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }`}
                        onClick={() => setSelectedStageId(item.stage.id)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" style={{ color: stageColor }} />
                            <span className="text-zinc-400 uppercase text-sm" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              {isSpecialStageType(item.stage.type) && item.stage.ssNumber ? getStageNumberLabel(item.stage) : item.stage.name}
                            </span>
                          </div>
                          <span className={`text-lg font-mono ${
                            item.status === 'racing' ? 'text-[#FACC15]' :
                            item.status === 'finished' ? 'text-white' :
                            'text-zinc-500'
                          }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {item.time}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
