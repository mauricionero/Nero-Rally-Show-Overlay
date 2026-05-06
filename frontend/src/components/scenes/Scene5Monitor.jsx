import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { PilotTelemetryHud } from '../PilotTelemetryHud.jsx';
import CurrentStageBadge from '../CurrentStageBadge.jsx';
import { LiveStartInformationValue } from '../LiveStartInformationValue.jsx';
import { PlacemarkMapFeed, MapWeatherBadges, PlacemarkWeatherNowNext } from '../PlacemarkMapFeed.jsx';
import StatusPill from '../StatusPill.jsx';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Clock3, Map as MapIcon, Radio, UserRound, Video, VideoOff } from 'lucide-react';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { sortPilotsByDisplayOrder } from '../../utils/displayOrder.js';
import { buildStageMapFeeds } from '../../utils/feedOptions.js';
import { buildPilotMapMarkers } from '../../utils/pilotMapMarkers.js';
import { formatClockFromDate, formatDurationSeconds } from '../../utils/timeFormat.js';
import { useSecondAlignedClock } from '../../hooks/useSecondAlignedClock.js';
import { getResolvedBrandingLogoUrl } from '../../utils/branding.js';
import {
  getReferenceNow,
  getResolvedStageStartDateTime,
  getPilotStageTimingInfo,
  getStartInformationFromValues,
  isJumpStartForStage,
  isPilotRetiredForStage
} from '../../utils/rallyHelpers.js';
import { getStageTitle, isLapTimingStageType } from '../../utils/stageTypes.js';
import {
  buildPilotOverlayPlaybackMap,
  getPilotEffectiveStageId,
  resolvePilotOverlayPlayback
} from '../../utils/overlayReplayResolver.js';
import { buildReplayStageScheduleMap } from '../../utils/replaySchedule.js';
import { getPilotTelemetryForId } from '../../utils/pilotIdentity.js';
import { getPilotTelemetryGForce, toFiniteTelemetryNumber } from '../../utils/pilotTelemetry.js';

const SCENE_5_CONFIG_KEY = 'scene5MonitorConfig';

const LAYOUTS = [
  { id: '1', name: '1 Stream', cols: 1, rows: 1, slots: 1 },
  { id: '1x2', name: '1x2 Vertical', cols: 1, rows: 2, slots: 2 },
  { id: '2x1', name: '2x1 Horizontal', cols: 2, rows: 1, slots: 2 },
  { id: '2x2', name: '2x2 Grid', cols: 2, rows: 2, slots: 4 },
  { id: '3x2', name: '3x2 Grid', cols: 3, rows: 2, slots: 6 },
  { id: '3x3', name: '3x3 Grid', cols: 3, rows: 3, slots: 9 }
];

const formatMonitorClock = (date = new Date()) => formatClockFromDate(date, 0);

const getTelemetryConnectionLabel = (telemetry = {}) => (
  String(telemetry?.connectionType || telemetry?.source || '').trim()
);

const getTelemetryConnectionStrength = (telemetry = {}) => {
  const numericValue = Number(telemetry?.connectionStrength);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  if (numericValue <= 4) {
    return Math.max(1, Math.min(4, Math.round(numericValue)));
  }

  return Math.max(1, Math.min(4, Math.ceil(numericValue / 25)));
};

function ConnectionIndicator({ telemetry = {}, className = '' }) {
  const label = getTelemetryConnectionLabel(telemetry);
  const strength = getTelemetryConnectionStrength(telemetry);

  if (!label && strength <= 0) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/75 px-3 py-1.5 backdrop-blur-sm ${className}`.trim()}>
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-200">
        {label || 'link'}
      </span>
      <div className="flex items-end gap-0.5">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={bar <= strength ? 'bg-[#22C55E]' : 'bg-white/20'}
            style={{
              width: 3,
              height: 4 + (bar * 3),
              borderRadius: 999
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FeedStatusIcon({ pilotPlayback = null, className = '' }) {
  if (!pilotPlayback?.hasVideo) {
    return null;
  }

  const isReplay = pilotPlayback?.mode === 'replay';
  const Icon = Video;
  const iconColor = isReplay ? 'text-[#FACC15]' : 'text-[#38BDF8]';

  return <Icon className={`h-4 w-4 flex-shrink-0 ${iconColor} ${className}`.trim()} />;
}

function MonitorInfoWidget({
  t,
  currentStage = null,
  currentStagePlacemark = null,
  nextPilotToStart = null,
  isLapRace = false,
  sceneNow = new Date(),
  eventIsOver = false,
  replayStartDate = '',
  replayStartTime = '',
  stageClockText = ''
}) {
  const replayClock = useMemo(() => {
    if (!eventIsOver) {
      return null;
    }

    const datePart = String(replayStartDate || '').trim();
    const timePart = String(replayStartTime || '').trim();
    if (!datePart || !timePart) {
      return null;
    }

    const replayStart = new Date(`${datePart}T${timePart}:00`);
    if (Number.isNaN(replayStart.getTime())) {
      return null;
    }

    const elapsedMs = Math.max(0, sceneNow.getTime() - replayStart.getTime());
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [eventIsOver, replayStartDate, replayStartTime, sceneNow]);

  return (
    <div className="relative min-h-0 h-full overflow-hidden rounded-2xl border border-[#FF4500]/35 bg-[radial-gradient(circle_at_top_left,rgba(255,69,0,0.14),transparent_34%),linear-gradient(180deg,rgba(10,10,12,0.96),rgba(6,6,8,0.92))] px-3 py-2 shadow-[0_14px_38px_rgba(0,0,0,0.4)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF4500]/70 to-transparent" />
      <div className="flex items-center gap-3">
        <div className="flex-none">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-400">
            {t('scene5.raceMonitor')}
          </p>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,1.1fr)_auto] gap-3">
          <div className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <div className="flex items-center gap-2 text-zinc-400">
              <UserRound className="h-4 w-4 text-[#FF4500]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                {isLapRace ? t('scene5.massStart') : t('scene5.nextToStart')}
              </span>
            </div>
            <div className="mt-1 truncate text-sm font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {isLapRace ? t('scene5.lapRaceNoSingleStarter') : (nextPilotToStart ? `#${nextPilotToStart.carNumber || '?'} ${nextPilotToStart.name}${nextPilotToStart.startClockText ? ` • ${nextPilotToStart.startClockText}` : ''}` : t('scene5.noUpcomingStart'))}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            {currentStagePlacemark ? (
              <PlacemarkWeatherNowNext
                placemark={currentStagePlacemark}
                title={t('scene5.weather')}
                nowLabel={t('common.now')}
                nextHourLabel={t('common.in1h')}
                layout="split"
                compact
                frame="bare"
                className="w-full"
              />
            ) : (
              <div className="flex items-center gap-2 text-zinc-400">
                <Radio className="h-4 w-4 text-[#38BDF8]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                  {t('scene5.weather')}
                </span>
                <div className="truncate text-sm font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {t('scene5.noWeatherSource')}
                </div>
              </div>
            )}
          </div>

          <div className="flex-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 shadow-inner shadow-black/30">
            <div className={`grid gap-3 ${stageClockText ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="min-w-0 text-right">
                <div className="flex items-center justify-end gap-2 text-zinc-400">
                  <Clock3 className="h-4 w-4 text-[#FACC15]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                    {eventIsOver ? t('scene5.replayClock') : t('scene5.currentClock')}
                  </span>
                </div>
                <div className="mt-1 text-xl font-bold text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {eventIsOver ? (replayClock || '--:--:--') : formatMonitorClock(sceneNow)}
                </div>
              </div>

              {stageClockText && (
                <div className="min-w-0 border-l border-white/10 pl-3 text-right">
                  <div className="flex items-center justify-end gap-2 text-zinc-400">
                    <Clock3 className="h-3.5 w-3.5 text-[#38BDF8]" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em]">{t('scene5.stageClock')}</span>
                  </div>
                  <div className="mt-1 text-lg font-bold text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {stageClockText}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PilotMonitorRow({
  pilot,
  pilotPlayback = null,
  telemetry = {},
  stage = null,
  stageTimingInfo = null,
  alert = false,
  jumpStart = false,
  retired = false,
  hideStreams = false,
  hideTelemetry = false,
  resolveReplayStreamUrlOnMount = null,
  replayStageScheduleById = null,
  debugDate = '',
  t
}) {
  const hasVideo = Boolean(pilotPlayback?.hasVideo);
  const replayIdentity = pilotPlayback?.mode === 'replay'
    ? `${pilot.id}:${pilotPlayback?.baseUrl || ''}:${pilotPlayback?.effectiveStageId || ''}`
    : `live-${pilot.id}`;

  const speed = toFiniteTelemetryNumber(telemetry?.speed);
  const gForce = getPilotTelemetryGForce(telemetry);
  const rpmReal = toFiniteTelemetryNumber(telemetry?.rpmReal ?? telemetry?.rpm);
  const rpmPercentage = toFiniteTelemetryNumber(telemetry?.rpmPercentage);
  const distance = toFiniteTelemetryNumber(telemetry?.distance);
  const heading = toFiniteTelemetryNumber(telemetry?.heading);
  const gear = toFiniteTelemetryNumber(telemetry?.gear);
  const gpsPrecision = toFiniteTelemetryNumber(telemetry?.gpsPrecision);
  const connectionStrength = toFiniteTelemetryNumber(telemetry?.connectionStrength);
  const telemetryMetrics = [
    { key: 'speed', value: Number.isFinite(speed) ? `${Math.round(speed)}` : '-', suffix: 'km/h' },
    { key: 'gforce', value: Number.isFinite(gForce) ? `${gForce >= 10 ? gForce.toFixed(0) : gForce.toFixed(1)}` : '-', suffix: 'G' },
    { key: 'rpm', value: Number.isFinite(rpmPercentage) ? `${Math.round(rpmPercentage)}` : (Number.isFinite(rpmReal) ? `${Math.round(rpmReal)}` : '-'), suffix: Number.isFinite(rpmPercentage) ? '%' : '' },
    { key: 'distance', value: Number.isFinite(distance) ? `${Math.round(distance)}` : '-', suffix: 'm' },
    { key: 'heading', value: Number.isFinite(heading) ? `${Math.round(heading)}` : '-', suffix: '°' },
    { key: 'gear', value: Number.isFinite(gear) ? (gear === -1 ? 'R' : `${Math.trunc(gear)}`) : '-', suffix: '' },
    { key: 'gps', value: Number.isFinite(gpsPrecision) ? `${gpsPrecision.toFixed(gpsPrecision >= 10 ? 0 : 1)}` : '-', suffix: 'm' },
    { key: 'link', value: Number.isFinite(connectionStrength) ? `${Math.round(connectionStrength)}` : '-', suffix: '' }
  ];
  const timingStatus = stageTimingInfo?.status || 'not_started';
  const timingStatusText = timingStatus === 'finished'
    ? t('scene2.finished')
    : timingStatus === 'racing'
      ? t('scene2.racing')
      : timingStatus === 'retired'
        ? t('status.retired')
        : t('scene2.notStarted');
  const timingStatusClass = timingStatus === 'finished'
    ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25'
    : timingStatus === 'racing'
      ? 'bg-amber-500/15 text-amber-200 border-amber-500/25'
      : timingStatus === 'retired'
        ? 'bg-red-500/15 text-red-200 border-red-500/25'
        : 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25';
  const timingDisplayText = stageTimingInfo?.displayText || stageTimingInfo?.text || stageTimingInfo?.timer || '-';
  const stageTitle = stage ? getStageTitle(stage) : t('scene2.noCurrentStage');

  return (
    <div className="grid grid-cols-[10rem_minmax(0,1.45fr)_minmax(0,1.45fr)_minmax(0,14rem)] gap-0 border-b border-white/10 bg-black/25">
      <div className="relative overflow-hidden border-r border-white/10 bg-black/60 p-1">
        {hasVideo && !hideStreams ? (
          <StreamPlayer
            key={replayIdentity}
            pilotId={pilot.id}
            streamUrl={pilotPlayback?.baseUrl || pilotPlayback?.streamUrl || ''}
            name={pilot.name}
            className="h-[4.5rem] w-full"
            showControls={false}
            interactive
            showMuteIndicator={false}
            forceMute
            replayMountIdentity={pilotPlayback?.mode === 'replay' ? replayIdentity : ''}
            resolveStreamUrlOnMount={pilotPlayback?.mode === 'replay' && typeof resolveReplayStreamUrlOnMount === 'function' ? () => resolveReplayStreamUrlOnMount(pilot) : null}
          />
        ) : (
          <div className="flex h-[4.5rem] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,69,0,0.16),transparent_34%),linear-gradient(180deg,rgba(18,18,22,0.98),rgba(10,10,12,0.98))]">
            <div className="text-center">
              <VideoOff className="mx-auto h-5 w-5 text-zinc-500" />
              <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                {hideStreams ? t('scene5.streamHidden') : t('scene5.noLiveFeed')}
              </p>
            </div>
          </div>
        )}

      </div>

      <div className="min-w-0 border-r border-white/10 px-2 py-1.5">
        <div className="flex min-h-[4.5rem] flex-col justify-center">
          <div className="min-w-0">
              <p className="truncate text-[14px] font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                <span className="mr-2 text-sm text-zinc-400">#{pilot.carNumber || '?'}</span>
                {pilot.name}
                <FeedStatusIcon pilotPlayback={pilotPlayback} className="ml-2 inline-block align-middle" />
                {alert && (
                  <span className="ml-2 inline-flex">
                    <StatusPill
                    variant="alert"
                    text={t('status.alert')}
                    className="text-[9px] px-1.5 py-0.5"
                    tooltipTitle={t('status.alertLabel')}
                    tooltipText={t('status.alertTooltip')}
                  />
                </span>
              )}
              {jumpStart && (
                <span className="ml-1 inline-flex">
                  <StatusPill
                    variant="jumpStart"
                    text={t('status.jumpStart')}
                    className="text-[9px] px-1.5 py-0.5"
                    tooltipTitle={t('times.jumpStart')}
                    tooltipText={t('times.jumpStartTooltip')}
                  />
                </span>
              )}
              {retired && (
                <span className="ml-1 inline-flex rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-300">
                  RET
                </span>
              )}
            </p>
            {pilot.team && (
              <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-zinc-300">
                {pilot.team}
              </p>
            )}
            {stage && (
              <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                {getStageTitle(stage)}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 border-r border-white/10 px-2 py-1.5">
        {hideTelemetry ? (
          <div className="flex h-[4.5rem] items-center justify-center text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            {t('common.hide')} {t('pilotTelemetry.telemetry')}
          </div>
        ) : (
          <div className="grid h-[4.5rem] grid-cols-4 grid-rows-2 gap-x-2 gap-y-1 content-center">
            {telemetryMetrics.map((metric) => (
              <div key={metric.key} className="flex items-center justify-center gap-0.5 rounded border border-white/10 px-1 py-0.5">
                <span className="font-mono text-[11px] font-bold leading-none text-white">{metric.value}</span>
                {metric.suffix && (
                  <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-zinc-400">{metric.suffix}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 px-2 py-1.5">
        <div className="flex h-[4.5rem] flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${timingStatusClass}`}>
              {timingStatusText}
            </span>
            <p className={`truncate text-[9px] font-bold uppercase tracking-[0.2em] ${timingStatus === 'finished' ? 'text-emerald-300' : timingStatus === 'racing' ? 'text-[#FACC15]' : timingStatus === 'retired' ? 'text-red-300' : 'text-zinc-400'}`}>
              {stageTitle}
            </p>
          </div>
          <div className={`mt-1 text-[16px] font-bold leading-none ${timingStatus === 'finished' ? 'text-emerald-300' : timingStatus === 'racing' ? 'text-[#FACC15]' : timingStatus === 'retired' ? 'text-red-300' : 'text-zinc-400'}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {timingDisplayText}
          </div>
          {stageTimingInfo?.isCountdown && (
            <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.22em] text-amber-300">
              {t('scene2.willStart')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PilotMonitorCard({
  pilot,
  pilotPlayback = null,
  telemetry = {},
  stage = null,
  hideStreams = false,
  hideTelemetry = false,
  videoOsdLevel = 'complete',
  resolveReplayStreamUrlOnMount = null,
  replayStageScheduleById = null,
  debugDate = '',
  t
}) {
  const replayIdentity = pilotPlayback?.mode === 'replay'
    ? `${pilot.id}:${pilotPlayback?.baseUrl || ''}:${pilotPlayback?.effectiveStageId || ''}`
    : `live-${pilot.id}`;
  const hasVideo = Boolean(pilotPlayback?.hasVideo);
  const placeholderLabel = hideStreams
    ? t('scene5.streamHidden')
    : t('scene5.noLiveFeed');
  const showOsd = videoOsdLevel !== 'nothing';
  const showMoreOsd = videoOsdLevel === 'more' || videoOsdLevel === 'complete';
  const showCompleteOsd = videoOsdLevel === 'complete';

  return (
    <div className="relative min-h-0 h-full overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(14,14,18,0.96),rgba(8,8,10,0.96))] shadow-[0_10px_24px_rgba(0,0,0,0.30)]">
      {showCompleteOsd && stage && (
        <CurrentStageBadge
          stage={stage}
          className="absolute left-1/2 top-1 z-20 -translate-x-1/2 border-transparent bg-transparent px-2 py-0.5 shadow-none backdrop-blur-0 pointer-events-none"
          titleClassName="truncate text-[10px] font-bold uppercase text-white"
        />
      )}

      {showCompleteOsd && (
        <div className="absolute right-2 top-1 z-20">
          <ConnectionIndicator telemetry={telemetry} />
        </div>
      )}

      <div className="relative min-h-0 h-full">
        {!hideStreams && hasVideo ? (
          <StreamPlayer
            key={replayIdentity}
            pilotId={pilot.id}
            streamUrl={pilotPlayback?.baseUrl || pilotPlayback?.streamUrl || ''}
            name={pilot.name}
            className="h-full w-full"
            showControls={pilotPlayback?.mode === 'replay'}
            interactive={pilotPlayback?.mode === 'replay'}
            replayMountIdentity={pilotPlayback?.mode === 'replay' ? replayIdentity : ''}
            resolveStreamUrlOnMount={pilotPlayback?.mode === 'replay' && typeof resolveReplayStreamUrlOnMount === 'function' ? () => resolveReplayStreamUrlOnMount(pilot) : null}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,69,0,0.16),transparent_34%),linear-gradient(180deg,rgba(18,18,22,0.98),rgba(10,10,12,0.98))]">
            <div className="text-center">
              <VideoOff className="mx-auto h-9 w-9 text-zinc-500" />
              <p className="mt-3 text-lg font-bold uppercase tracking-[0.28em] text-zinc-400" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {placeholderLabel}
              </p>
            </div>
          </div>
        )}

        {!hideTelemetry && (
          <PilotTelemetryHud pilot={pilot} telemetry={telemetry} trackLengthTotal={stage?.distance} compact raised />
        )}

        {showOsd && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-1.5 pt-6">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white">
                    #{pilot.startOrder || '?'}
                  </span>
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white">
                    #{pilot.carNumber || '?'}
                  </span>
                  {showMoreOsd && (
                    <p className="truncate text-lg font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 10px rgba(0,0,0,0.95)' }}>
                      {pilot.name}
                      <FeedStatusIcon pilotPlayback={pilotPlayback} className="ml-2 inline-block align-middle" />
                    </p>
                  )}
                </div>
                {showMoreOsd && pilot.team && (
                  <p className="mt-1 truncate text-xs uppercase tracking-wide text-zinc-300">
                    {pilot.team}
                  </p>
                )}
              </div>

              {showCompleteOsd && stage && (
                <LiveStartInformationValue
                  startTime={pilot.startTimeForStage || ''}
                  finishTime={pilot.finishTimeForStage || ''}
                  retired={pilot.retiredForStage === true}
                  stageDate={stage.date}
                  stageId={stage.id}
                  replayStageScheduleById={replayStageScheduleById}
                  debugDate={debugDate}
                  className="text-right text-sm font-bold text-zinc-100"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MonitorMapCard({ mapFeed, pilotMarkers = [], t }) {
  return (
    <div className="relative min-h-0 h-full overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(14,14,18,0.96),rgba(8,8,10,0.96))] shadow-[0_10px_24px_rgba(0,0,0,0.30)]">
      <PlacemarkMapFeed placemark={mapFeed} pilotMarkers={pilotMarkers} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-1.5 pt-6">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MapIcon className="h-4 w-4 flex-shrink-0 text-[#FF4500]" />
              <p className="truncate text-lg font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 10px rgba(0,0,0,0.95)' }}>
                {mapFeed.name}
              </p>
            </div>
            {mapFeed.placemarkName && (
              <p className="mt-1 truncate text-xs uppercase tracking-wide text-zinc-300">
                {mapFeed.placemarkName}
              </p>
            )}
          </div>

          <MapWeatherBadges placemark={mapFeed} className="shrink-0" />
        </div>
      </div>
    </div>
  );
}

export default function Scene5Monitor({ hideStreams = false, hideTelemetry = false }) {
  const {
    pilots,
    stages,
    eventName,
    logoUrl,
    currentStageId,
    startTimes,
    realStartTimes,
    times,
    categories,
    mapPlacemarks,
    debugDate,
    retiredStages,
    isStageAlert,
    pilotTelemetryByPilotId,
    timeDecimals,
    eventIsOver,
    eventReplayStartDate,
    eventReplayStartTime,
    eventReplayStageIntervalSeconds,
    getStreamConfig
  } = useRally();
  const { t } = useTranslation();
  const resolvedLogoUrl = getResolvedBrandingLogoUrl(logoUrl);
  const initialSceneConfig = useMemo(
    () => loadSceneConfig(SCENE_5_CONFIG_KEY, {
      selectedDisplayMode: 'table',
      selectedLayout: '3x3',
      selectedItemIds: null,
      selectedVideoOsdLevel: 'complete',
      showTelemetry: true
    }),
    []
  );
  const [selectedDisplayMode, setSelectedDisplayMode] = useState(initialSceneConfig.selectedDisplayMode || 'table');
  const [selectedLayout, setSelectedLayout] = useState(initialSceneConfig.selectedLayout || '3x3');
  const [selectedItemIds, setSelectedItemIds] = useState(initialSceneConfig.selectedItemIds ?? initialSceneConfig.selectedPilotIds ?? null);
  const [selectedVideoOsdLevel, setSelectedVideoOsdLevel] = useState(initialSceneConfig.selectedVideoOsdLevel || 'complete');
  const [showTelemetry, setShowTelemetry] = useState(initialSceneConfig.showTelemetry ?? true);

  const layout = LAYOUTS.find((entry) => entry.id === selectedLayout) || LAYOUTS[LAYOUTS.length - 1];
  const tableDensityClass = layout.cols >= 3 ? 'text-[11px]' : 'text-[12px]';
  const isTableMode = selectedDisplayMode === 'table';
  const currentSecondAlignedTime = useSecondAlignedClock(true);
  const sceneNow = useMemo(() => getReferenceNow(debugDate, currentSecondAlignedTime), [currentSecondAlignedTime, debugDate]);
  const currentStage = stages.find((stage) => stage.id === currentStageId) || null;
  const isLapRace = isLapTimingStageType(currentStage?.type);
  const activeStageMaps = useMemo(() => buildStageMapFeeds({ stages, mapPlacemarks }), [mapPlacemarks, stages]);
  const pilotMapMarkers = useMemo(() => buildPilotMapMarkers(pilots, categories, pilotTelemetryByPilotId), [categories, pilotTelemetryByPilotId, pilots]);
  const currentStagePlacemark = useMemo(() => (
    mapPlacemarks.find((placemark) => placemark.id === currentStage?.mapPlacemarkId) || null
  ), [currentStage?.mapPlacemarkId, mapPlacemarks]);
  const replayStageScheduleById = useMemo(() => (
    eventIsOver
      ? buildReplayStageScheduleMap({
          stages,
          times,
          replayStartDate: eventReplayStartDate,
          replayStartTime: eventReplayStartTime,
          replayStageIntervalSeconds: eventReplayStageIntervalSeconds
        })
      : null
  ), [eventIsOver, eventReplayStartDate, eventReplayStartTime, eventReplayStageIntervalSeconds, stages, times]);
  const currentStageClockInfo = useMemo(() => {
    if (!currentStage?.id) {
      return null;
    }

    const stageStartDateTime = getResolvedStageStartDateTime({
      stageId: currentStage.id,
      stageDate: currentStage.date,
      startTime: currentStage.startTime || '',
      replayStageScheduleById
    });

    if (!(stageStartDateTime instanceof Date) || Number.isNaN(stageStartDateTime.getTime())) {
      return null;
    }

    const stageStartInfo = getStartInformationFromValues({
      startTime: currentStage.startTime || '',
      stageDate: currentStage.date,
      stageStartDateTime,
      now: sceneNow,
      decimals: timeDecimals,
      includeLabel: false,
      startLabel: t('status.start'),
      retiredLabel: t('status.retired')
    });

    if (stageStartInfo?.status === 'not_started' && stageStartDateTime.getTime() > sceneNow.getTime()) {
      return formatDurationSeconds(
        (stageStartDateTime.getTime() - sceneNow.getTime()) / 1000,
        timeDecimals,
        {
          fallback: '--:--:--',
          showHoursIfNeeded: true,
          padMinutes: true
        }
      );
    }

    return stageStartInfo?.timer || stageStartInfo?.text || '';
  }, [currentStage?.date, currentStage?.id, currentStage?.startTime, replayStageScheduleById, sceneNow, t, timeDecimals]);
  const effectiveHideTelemetry = hideTelemetry || !showTelemetry;

  const replayPilotStageSignature = useMemo(() => (
    pilots.map((pilot) => `${pilot.id}:${String(pilot.currentStageId || '').trim()}`).join('|')
  ), [pilots]);
  const replaySnapshotKey = eventIsOver
    ? `${currentStageId || ''}__${eventReplayStartDate || ''}__${eventReplayStartTime || ''}__${eventReplayStageIntervalSeconds || 0}__${replayPilotStageSignature}`
    : '';
  const replayPlaybackSnapshotRef = useRef({ key: '', map: null });
  if (!eventIsOver) {
    replayPlaybackSnapshotRef.current = { key: '', map: null };
  } else if (replayPlaybackSnapshotRef.current.key !== replaySnapshotKey) {
    replayPlaybackSnapshotRef.current = {
      key: replaySnapshotKey,
      map: buildPilotOverlayPlaybackMap({
        pilots,
        globalCurrentStageId: currentStageId,
        eventIsOver: true,
        stages,
        times,
        now: sceneNow,
        replayStartDate: eventReplayStartDate,
        replayStartTime: eventReplayStartTime,
        replayStageIntervalSeconds: eventReplayStageIntervalSeconds
      })
    };
  }
  const livePilotPlaybackById = useMemo(() => (
    buildPilotOverlayPlaybackMap({
      pilots,
      globalCurrentStageId: currentStageId,
      eventIsOver: false
    })
  ), [currentStageId, pilots]);
  const pilotPlaybackById = eventIsOver
    ? (replayPlaybackSnapshotRef.current.map || new Map())
    : livePilotPlaybackById;
  const resolveReplayStreamUrlOnMount = useCallback((pilot) => (
    resolvePilotOverlayPlayback({
      pilot,
      globalCurrentStageId: currentStageId,
      eventIsOver: true,
      stages,
      times,
      now: getReferenceNow(debugDate, new Date()),
      replayStartDate: eventReplayStartDate,
      replayStartTime: eventReplayStartTime,
      replayStageIntervalSeconds: eventReplayStageIntervalSeconds
    }).streamUrl || ''
  ), [currentStageId, debugDate, eventReplayStageIntervalSeconds, eventReplayStartDate, eventReplayStartTime, stages, times]);

  const displaySortedPilots = useMemo(() => (
    sortPilotsByDisplayOrder(pilots, categories)
  ), [categories, pilots]);
  const displayItems = useMemo(() => ([
    ...activeStageMaps,
    ...displaySortedPilots.map((pilot) => ({
      type: 'pilot',
      value: `pilot:${pilot.id}`,
      id: pilot.id,
      pilot
    }))
  ]), [activeStageMaps, displaySortedPilots]);
  const selectablePilotItems = useMemo(() => (
    displayItems.filter((item) => item.type === 'pilot')
  ), [displayItems]);
  const totalSelectableItemCount = displayItems.length;

  React.useEffect(() => {
    if (selectedItemIds !== null) {
      return;
    }

    const defaultItemIds = selectablePilotItems.map((item) => item.value);
    setSelectedItemIds(defaultItemIds);
  }, [selectablePilotItems, selectedItemIds]);

  React.useEffect(() => {
    if (!Array.isArray(selectedItemIds)) {
      return;
    }

    const availableItemIds = new Set(displayItems.map((item) => item.value));
    const orderedSelectedIds = displayItems
      .map((item) => item.value)
      .filter((itemId) => selectedItemIds.includes(itemId) && availableItemIds.has(itemId));

    const currentSelectionKey = selectedItemIds.join('|');
    const nextSelectionKey = orderedSelectedIds.join('|');

    if (currentSelectionKey !== nextSelectionKey) {
      setSelectedItemIds(orderedSelectedIds);
    }
  }, [displayItems, selectedItemIds]);

  const monitorPilots = useMemo(() => {
    return displaySortedPilots.map((pilot) => {
      const telemetry = getPilotTelemetryForId(pilotTelemetryByPilotId, pilot.id);
      const playback = pilotPlaybackById.get(pilot.id);
      const effectiveStageId = getPilotEffectiveStageId(pilot, currentStageId);
      const effectiveStage = stages.find((stage) => stage.id === effectiveStageId) || currentStage || null;
      const streamConfig = getStreamConfig(pilot.id);
      const alert = effectiveStage ? isStageAlert?.(pilot.id, effectiveStage.id) : false;
      const jumpStart = effectiveStage ? isJumpStartForStage(pilot.id, effectiveStage.id, startTimes, realStartTimes) : false;
      const retired = effectiveStage ? isPilotRetiredForStage(pilot.id, effectiveStage.id, retiredStages) : false;
      const stageTimingInfo = effectiveStage ? getPilotStageTimingInfo({
        pilotId: pilot.id,
        pilot,
        stage: effectiveStage,
        startTimes,
        times,
        retiredStages,
        replayStageScheduleById,
        now: sceneNow,
        timeDecimals,
        includeLabel: true,
        startLabel: t('status.start'),
        retiredLabel: t('status.retired')
      }) : null;

      return {
        ...pilot,
        telemetry,
        pilotPlayback: playback,
        effectiveStage,
        streamConfig,
        stageTimingInfo,
        alert,
        jumpStart,
        retired,
      };
    });
  }, [currentStage, currentStageId, displaySortedPilots, getStreamConfig, isStageAlert, pilotPlaybackById, pilotTelemetryByPilotId, realStartTimes, replayStageScheduleById, retiredStages, sceneNow, stages, startTimes, t, timeDecimals, times]);

  const selectedItemIdSet = useMemo(() => new Set(Array.isArray(selectedItemIds) ? selectedItemIds : []), [selectedItemIds]);
  const selectedItemCount = Array.isArray(selectedItemIds) ? selectedItemIds.length : selectablePilotItems.length;
  const monitorPilotById = useMemo(() => new Map(monitorPilots.map((pilot) => [pilot.id, pilot])), [monitorPilots]);
  const visiblePilots = useMemo(() => (
    monitorPilots.filter((pilot) => !Array.isArray(selectedItemIds) || selectedItemIdSet.has(`pilot:${pilot.id}`))
  ), [monitorPilots, selectedItemIdSet, selectedItemIds]);
  const visibleGridItems = useMemo(() => (
    displayItems.filter((item) => !Array.isArray(selectedItemIds) || selectedItemIdSet.has(item.value))
  ), [displayItems, selectedItemIdSet, selectedItemIds]);

  const nextPilotToStart = useMemo(() => {
    if (!currentStage || isLapRace) {
      return null;
    }

    const candidates = displaySortedPilots
      .map((pilot) => {
        const startTime = startTimes[pilot.id]?.[currentStage.id] || '';
        const resolvedStartDateTime = getResolvedStageStartDateTime({
          stageId: currentStage.id,
          stageDate: currentStage.date,
          startTime,
          replayStageScheduleById
        });

        return {
          pilot,
          startTime,
          resolvedStartDateTime
        };
      })
      .filter((entry) => entry.startTime && entry.resolvedStartDateTime instanceof Date && !Number.isNaN(entry.resolvedStartDateTime.getTime()))
      .filter((entry) => sceneNow < entry.resolvedStartDateTime)
      .sort((a, b) => a.resolvedStartDateTime.getTime() - b.resolvedStartDateTime.getTime());

    if (candidates.length === 0) {
      return null;
    }

    const nextEntry = candidates[0];
    return {
      ...nextEntry.pilot,
      startClockText: formatMonitorClock(nextEntry.resolvedStartDateTime).slice(0, 5)
    };
  }, [currentStage, displaySortedPilots, isLapRace, replayStageScheduleById, sceneNow, startTimes]);

  React.useEffect(() => {
    saveSceneConfig(SCENE_5_CONFIG_KEY, {
      selectedDisplayMode,
      selectedLayout,
      selectedItemIds,
      selectedVideoOsdLevel,
      showTelemetry
    });
  }, [selectedDisplayMode, selectedItemIds, selectedLayout, selectedVideoOsdLevel, showTelemetry]);

  const toggleItemSelection = useCallback((itemId) => {
    setSelectedItemIds((current) => {
      const baseSelection = Array.isArray(current)
        ? current
        : selectablePilotItems.map((item) => item.value);

      return baseSelection.includes(itemId)
        ? baseSelection.filter((value) => value !== itemId)
        : [...baseSelection, itemId];
    });
  }, [selectablePilotItems]);

  return (
    <div className="relative h-full w-full" data-testid="scene-5-monitor">
      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs uppercase text-white">{t('scene5.viewMode')}</Label>
            <Select value={selectedDisplayMode} onValueChange={setSelectedDisplayMode}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="table">{t('scene5.table')}</SelectItem>
                <SelectItem value="grid">{t('scene5.grid')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedDisplayMode === 'grid' && (
            <div>
              <Label className="mb-2 block text-xs uppercase text-white">{t('scene5.layout')}</Label>
              <Select value={selectedLayout} onValueChange={setSelectedLayout}>
                <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAYOUTS.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-2 block text-xs uppercase text-white">{t('scene5.videoOsd')}</Label>
            <Select value={selectedVideoOsdLevel} onValueChange={setSelectedVideoOsdLevel}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nothing">{t('scene5.osdNothing')}</SelectItem>
                <SelectItem value="reduced">{t('scene5.osdReduced')}</SelectItem>
                <SelectItem value="more">{t('scene5.osdMore')}</SelectItem>
                <SelectItem value="complete">{t('scene5.osdComplete')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <Checkbox
              checked={showTelemetry}
              onCheckedChange={(checked) => setShowTelemetry(checked === true)}
            />
            <span>{t('scene5.showTelemetry')}</span>
          </label>

          <div>
            <Label className="mb-2 block text-xs uppercase text-white">
              {t('scene1.selectItems')} ({selectedItemCount}/{totalSelectableItemCount})
            </Label>
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-3">
              {activeStageMaps.length > 0 && (
                <div className="pb-2">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{t('config.stageMaps')}</p>
                  <div className="space-y-2">
                    {activeStageMaps.map((feed) => {
                      const checked = selectedItemIdSet.has(feed.value);
                      return (
                        <label key={feed.value} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleItemSelection(feed.value)}
                          />
                          <MapIcon className="h-3.5 w-3.5 shrink-0 text-[#FF4500]" />
                          <span className="truncate uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                            {feed.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{t('tabs.pilots')}</p>
                <div className="space-y-2">
                  {displaySortedPilots.map((pilot) => {
                    const itemId = `pilot:${pilot.id}`;
                    const checked = selectedItemIdSet.has(itemId);
                    const playback = pilotPlaybackById.get(pilot.id);

                    return (
                      <label key={pilot.id} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleItemSelection(itemId)}
                        />
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2 uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          <span className="truncate">
                            #{pilot.carNumber || '?'} {pilot.name}
                          </span>
                          <FeedStatusIcon pilotPlayback={playback} />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          </div>
        </LeftControls>

      <div className="flex h-full w-full min-h-0 flex-col p-2 pt-3">
        <div className="mb-1 flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/35 px-4 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-3xl font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {eventName || t('theRace.eventName')}
            </p>
          </div>

          {resolvedLogoUrl && (
            <img
              src={resolvedLogoUrl}
              alt={eventName || t('header.title')}
              className="max-h-14 w-auto object-contain"
            />
          )}
        </div>

        <div className="mb-1 flex-none">
          <MonitorInfoWidget
            t={t}
            currentStage={currentStage}
          currentStagePlacemark={currentStagePlacemark}
          nextPilotToStart={nextPilotToStart}
          isLapRace={isLapRace}
          sceneNow={sceneNow}
          eventIsOver={eventIsOver}
          replayStartDate={eventReplayStartDate}
          replayStartTime={eventReplayStartTime}
          stageClockText={currentStageClockInfo}
        />
        </div>

        <div className={`flex-1 min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-black/65 ${isTableMode ? tableDensityClass : ''}`}>
          <div className="flex h-full min-h-0 flex-col overflow-auto">
            {isTableMode ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/70 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                    {t('scene5.table')}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                    {visiblePilots.length}/{displaySortedPilots.length}
                  </p>
                </div>
                <div className="sticky top-0 z-20 grid grid-cols-[12rem_minmax(0,1.45fr)_minmax(0,1.45fr)_minmax(0,14rem)] gap-2 border-b border-white/10 bg-[#111113]/95 px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400 backdrop-blur-sm">
                  <div>{t('scene5.onboard')}</div>
                  <div>{t('scene3.pilot')}</div>
                  <div>{t('pilotTelemetry.telemetry')}</div>
                  <div>{t('scene5.timing')}</div>
                </div>

                <div className="space-y-0">
                  {visiblePilots.map((pilot) => (
                    <PilotMonitorRow
                      key={pilot.id}
                      pilot={pilot}
                      pilotPlayback={pilot.pilotPlayback}
                      telemetry={pilot.telemetry}
                      stage={pilot.effectiveStage}
                      stageTimingInfo={pilot.stageTimingInfo}
                      alert={pilot.alert}
                      jumpStart={pilot.jumpStart}
                      retired={pilot.retired}
                      hideStreams={hideStreams}
                      hideTelemetry={effectiveHideTelemetry}
                      resolveReplayStreamUrlOnMount={resolveReplayStreamUrlOnMount}
                      replayStageScheduleById={replayStageScheduleById}
                      debugDate={debugDate}
                      t={t}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/70 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                    {t('scene5.grid')}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                    {Math.min(visibleGridItems.length, layout.slots)}/{totalSelectableItemCount}
                  </p>
                </div>
                <div
                  className="grid flex-1 min-h-0 auto-rows-fr gap-2 p-2"
                  style={{
                    gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`
                  }}
                >
                  {visibleGridItems.slice(0, layout.slots).map((item) => {
                    if (item.type === 'stage-map') {
                      return (
                        <MonitorMapCard
                          key={item.value}
                          mapFeed={item}
                          pilotMarkers={pilotMapMarkers}
                          t={t}
                        />
                      );
                    }

                    const pilot = monitorPilotById.get(item.id);
                    if (!pilot) {
                      return null;
                    }

                    return (
                      <PilotMonitorCard
                        key={pilot.id}
                        pilot={pilot}
                        pilotPlayback={pilot.pilotPlayback}
                        telemetry={pilot.telemetry}
                        stage={pilot.effectiveStage}
                        hideStreams={hideStreams}
                        hideTelemetry={effectiveHideTelemetry}
                        videoOsdLevel={selectedVideoOsdLevel}
                        resolveReplayStreamUrlOnMount={resolveReplayStreamUrlOnMount}
                        replayStageScheduleById={replayStageScheduleById}
                        debugDate={debugDate}
                        t={t}
                      />
                    );
                  })}
                  {Array.from({ length: Math.max(0, layout.slots - visibleGridItems.slice(0, layout.slots).length) }).map((_, index) => (
                    <div
                      key={`empty-${index}`}
                      className="rounded-xl border border-dashed border-white/10 bg-black/20"
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
