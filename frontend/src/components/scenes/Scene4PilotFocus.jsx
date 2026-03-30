import React, { useState, useEffect, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { getResolvedBrandingLogoUrl } from '../../utils/branding.js';
import { LeftControls } from '../LeftControls.jsx';
import { FeedSelect } from '../FeedSelect.jsx';
import { PlacemarkMapFeed, MapWeatherBadges } from '../PlacemarkMapFeed.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { StartInformationValue } from '../StartInformationValue.jsx';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import StatusPill from '../StatusPill.jsx';
import { getReferenceNow, hasStageDateTimePassed, startInformationTime, isJumpStartForStage } from '../../utils/rallyHelpers';
import { Flag, RotateCcw, Car, Timer, Video, Map as MapIcon } from 'lucide-react';
import { buildFeedOptions, findFeedByValue } from '../../utils/feedOptions.js';
import { getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { getPilotScheduledEndTime } from '../../utils/pilotSchedule.js';
import { compareStagesBySchedule } from '../../utils/stageSchedule.js';
import { useSecondAlignedClock } from '../../hooks/useSecondAlignedClock.js';
import { formatClockFromDate, formatDurationMs } from '../../utils/timeFormat.js';
import { buildPilotMapMarkers } from '../../utils/pilotMapMarkers.js';
import {
  getStageNumberLabel,
  getStageTitle,
  isLapRaceStageType,
  isSpecialStageType,
  SUPER_PRIME_STAGE_TYPE
} from '../../utils/stageTypes.js';
const SCENE_4_CONFIG_KEY = 'scene4Config';

const getScene4StatusClassName = (status) => (
  status === 'racing'
    ? 'text-[#FACC15]'
    : status === 'finished'
      ? 'text-[#22C55E]'
      : status === 'retired'
        ? 'text-red-400'
        : 'text-zinc-500'
);

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

const getScene4SpecialStageDisplay = (timeInfo, now, decimals) => {
  if (!timeInfo) {
    return '-';
  }

  if (timeInfo.status === 'racing' && timeInfo.startTime) {
    return `${timeInfo.startTime} -> ${formatClockFromDate(now, decimals)}`;
  }

  if (timeInfo.status === 'finished' && timeInfo.startTime && timeInfo.finishTime) {
    return `${timeInfo.startTime} -> ${timeInfo.finishTime}`;
  }

  return timeInfo.text || '-';
};

function Scene4StageTimeValue({
  info,
  fallback = '',
  status = 'not_started',
  finishedClassName = 'text-[#22C55E]',
  className = '',
  style,
  as: Component = 'span'
}) {
  const displayText = fallback || info?.text || '';
  const statusClassName = status === 'finished'
    ? finishedClassName
    : getScene4StatusClassName(status);

  if (status === 'racing' && displayText.includes(' -> ')) {
    const [left, right] = displayText.split(' -> ', 2);

    return (
      <Component className={`${className} text-white`} style={style}>
        <span>{left} -&gt; </span>
        <span className={statusClassName}>{right}</span>
      </Component>
    );
  }

  return (
    <StartInformationValue
      as={Component}
      info={info}
      fallback={fallback}
      className={`${className} ${statusClassName}`.trim()}
      style={style}
    />
  );
}

export default function Scene4PilotFocus({ hideStreams = false }) {
  const { 
    pilots, categories, stages, times, startTimes, realStartTimes, currentStageId, chromaKey, logoUrl,
    lapTimes, stagePilots, cameras, externalMedia, mapPlacemarks, debugDate, retiredStages, isStageAlert, timeDecimals, pilotTelemetryByPilotId
  } = useRally();
  const resolvedLogoUrl = getResolvedBrandingLogoUrl(logoUrl);
  const { t } = useTranslation();
  
  const [selectedPilotId, setSelectedPilotId] = useState(() => loadSceneConfig(SCENE_4_CONFIG_KEY, { selectedPilotId: pilots[0]?.id || null }).selectedPilotId);
  const [selectedStageId, setSelectedStageId] = useState(() => loadSceneConfig(SCENE_4_CONFIG_KEY, { selectedStageId: currentStageId || stages[0]?.id || null }).selectedStageId);
  const [followCurrentStage, setFollowCurrentStage] = useState(() => loadSceneConfig(SCENE_4_CONFIG_KEY, { followCurrentStage: true }).followCurrentStage);
  const [selectedMainFeedValue, setSelectedMainFeedValue] = useState(() => loadSceneConfig(SCENE_4_CONFIG_KEY, { selectedMainFeedValue: 'none' }).selectedMainFeedValue);
  const currentTime = useSecondAlignedClock();
  const sceneNow = useMemo(() => getReferenceNow(debugDate, currentTime), [debugDate, currentTime]);
  const pilotMapMarkers = useMemo(() => buildPilotMapMarkers(pilots, categories, pilotTelemetryByPilotId), [pilots, categories, pilotTelemetryByPilotId]);

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

  useEffect(() => {
    if (followCurrentStage && currentStageId && stages.some((stage) => stage.id === currentStageId) && currentStageId !== selectedStageId) {
      setSelectedStageId(currentStageId);
    }
  }, [followCurrentStage, currentStageId, stages, selectedStageId]);

  useEffect(() => {
    if (selectedPilotId && !pilots.some((pilot) => pilot.id === selectedPilotId)) {
      setSelectedPilotId(pilots[0]?.id || null);
    }
  }, [selectedPilotId, pilots]);

  useEffect(() => {
    if (selectedStageId && !stages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(currentStageId || stages[0]?.id || null);
    }
  }, [selectedStageId, stages, currentStageId]);

  const focusPilot = pilots.find(p => p.id === selectedPilotId);
  const selectedStage = stages.find(s => s.id === selectedStageId);
  const isLapRace = isLapRaceStageType(selectedStage?.type);
  const hasStageAlert = focusPilot && selectedStageId
    ? isStageAlert(focusPilot.id, selectedStageId)
    : false;
  const hasJumpStart = focusPilot && selectedStageId
    ? isJumpStartForStage(focusPilot.id, selectedStageId, startTimes, realStartTimes)
    : false;

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
          displayTime = formatDurationMs(totalTimeMs, timeDecimals);
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
        const timeInfo = startInformationTime({
          pilotId: focusPilot.id,
          stageId: stage.id,
          startTimes,
          times,
          retiredStages,
          stageDate: stage.date,
          now: sceneNow,
          decimals: timeDecimals,
          startLabel: t('status.start'),
          retiredLabel: t('status.retired')
        });
        const displayTime = getScene4SpecialStageDisplay(timeInfo, sceneNow, timeDecimals);
        const displayInfo = displayTime !== (timeInfo.text || '')
          ? {
              ...timeInfo,
              label: '',
              signal: null,
              text: displayTime
            }
          : timeInfo;

        return {
          stage,
          time: displayTime,
          timeInfo: displayInfo,
          status: timeInfo.status,
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
  }, [sortedStages, focusPilot, lapTimes, startTimes, times, retiredStages, sceneNow, t, timeDecimals]);

  const selectedStageData = pilotStageData.find(d => d.stage.id === selectedStageId);
  const availableFeeds = useMemo(() => buildFeedOptions({ pilots, cameras, externalMedia, stages, mapPlacemarks }), [pilots, cameras, externalMedia, stages, mapPlacemarks]);
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

  useEffect(() => {
    saveSceneConfig(SCENE_4_CONFIG_KEY, {
      selectedPilotId,
      selectedStageId,
      followCurrentStage,
      selectedMainFeedValue
    });
  }, [selectedPilotId, selectedStageId, followCurrentStage, selectedMainFeedValue]);

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
            <label className="flex items-start gap-3 cursor-pointer mb-3">
              <Checkbox
                checked={followCurrentStage}
                onCheckedChange={(checked) => setFollowCurrentStage(checked === true)}
              />
              <div>
                <p className="text-sm text-white">{t('scene4.followCurrentStage')}</p>
                <p className="text-xs text-zinc-500">{t('scene4.followCurrentStageHint')}</p>
              </div>
            </label>
            <Select value={selectedStageId} onValueChange={setSelectedStageId} disabled={followCurrentStage}>
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
                  maps: t('config.stageMaps'),
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
                {hasStageAlert && (
                  <StatusPill
                    variant="alert"
                    text={t('status.alert')}
                    className="text-[11px] px-2"
                    tooltipTitle={t('status.alertLabel')}
                    tooltipText={t('status.alertTooltip')}
                  />
                )}
                {hasJumpStart && (
                  <StatusPill
                    variant="jumpStart"
                    text={t('status.jumpStart')}
                    className="text-[11px] px-2"
                    tooltipTitle={t('times.jumpStart')}
                    tooltipText={t('times.jumpStartTooltip')}
                  />
                )}
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

            {resolvedLogoUrl && (
              <img
                src={resolvedLogoUrl}
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
                    <Scene4StageTimeValue
                      as="p"
                      info={selectedStageData.timeInfo}
                      fallback={selectedStageData.time}
                      status={selectedStageData.status}
                      className="text-2xl font-mono font-bold"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
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
            ) : selectedMainFeed?.type === 'stage-map' ? (
              <div className="h-full bg-black rounded overflow-hidden border-2 border-[#FF4500] relative">
                <PlacemarkMapFeed placemark={selectedMainFeed} pilotMarkers={pilotMapMarkers} className="w-full h-full" />

                <div className="absolute top-4 left-4 bg-black/90 backdrop-blur-sm px-3 py-2 rounded border border-[#FF4500] flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-[#FF4500]" />
                  <div className="min-w-0 relative pr-36">
                    <span className="block text-white font-bold uppercase text-sm truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      {selectedMainFeed.name}
                    </span>
                    {selectedMainFeed.placemarkName && (
                      <span className="block text-zinc-300 text-[11px] uppercase tracking-wide truncate mt-1">
                        {selectedMainFeed.placemarkName}
                      </span>
                    )}
                    <MapWeatherBadges placemark={selectedMainFeed} className="absolute right-0 bottom-0" />
                  </div>
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
                    <Scene4StageTimeValue
                      as="p"
                      info={selectedStageData.timeInfo}
                      fallback={selectedStageData.time}
                      status={selectedStageData.status}
                      className="text-2xl font-mono font-bold"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
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
                    <Scene4StageTimeValue
                      as="p"
                      info={selectedStageData.timeInfo}
                      fallback={selectedStageData.time}
                      status={selectedStageData.status}
                      className="text-2xl font-mono font-bold"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
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
                    <Scene4StageTimeValue
                      as="p"
                      info={selectedStageData.timeInfo}
                      fallback={selectedStageData.time}
                      status={selectedStageData.status}
                      className="text-2xl font-mono font-bold"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
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
                    <Scene4StageTimeValue
                      as="p"
                      info={selectedStageData.timeInfo}
                      fallback={selectedStageData.time}
                      status={selectedStageData.status}
                      className="text-2xl font-mono font-bold"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
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
                              {lapDuration ? formatDurationMs(lapDuration, timeDecimals) : '-'}
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
                        {formatDurationMs(selectedStageData.totalTimeMs, timeDecimals)}
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
                    const alert = focusPilot ? isStageAlert(focusPilot.id, item.stage.id) : false;
                    const jumpStart = focusPilot ? isJumpStartForStage(focusPilot.id, item.stage.id, startTimes, realStartTimes) : false;
                    
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
                            </div>
                          <Scene4StageTimeValue
                            info={item.timeInfo}
                            fallback={item.time}
                            status={item.status}
                            finishedClassName="text-white"
                            className="text-lg font-mono"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                          />
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
