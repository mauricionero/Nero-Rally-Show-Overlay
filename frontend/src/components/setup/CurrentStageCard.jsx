import React, { useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import DateInput from '../DateInput.jsx';
import RollingClockInput from '../RollingClockInput.jsx';
import DebugIdText from './DebugIdText.jsx';
import { compareStagesBySchedule } from '../../utils/stageSchedule.js';
import {
  getStageTitle,
  isLapTimingStageType,
  SUPER_PRIME_STAGE_TYPE
} from '../../utils/stageTypes.js';
import { getLapRaceStageMetaParts } from '../../utils/rallyHelpers.js';
import { Car, Flag, RotateCcw, Timer } from 'lucide-react';

const getStageTypeIcon = (type) => {
  switch (type) {
    case 'SS': return Flag;
    case SUPER_PRIME_STAGE_TYPE: return Flag;
    case 'Lap Race': return RotateCcw;
    case 'Liaison': return Car;
    case 'Service Park': return Timer;
    default: return Flag;
  }
};

const getStageTypeColor = (type) => {
  switch (type) {
    case 'SS': return 'text-[#FF4500]';
    case SUPER_PRIME_STAGE_TYPE: return 'text-orange-400';
    case 'Lap Race': return 'text-[#FACC15]';
    case 'Liaison': return 'text-blue-400';
    case 'Service Park': return 'text-green-400';
    default: return 'text-zinc-400';
  }
};

export default function CurrentStageCard({ showDebugIds = false }) {
  const { t } = useTranslation();
  const {
    stages,
    currentStageId,
    setCurrentStageId,
    eventIsOver,
    setEventIsOver,
    eventReplayStartDate,
    setEventReplayStartDate,
    eventReplayStartTime,
    setEventReplayStartTime,
    eventReplayStageIntervalSeconds,
    setEventReplayStageIntervalSeconds
  } = useRally();

  const sortedStages = useMemo(() => [...stages].sort(compareStagesBySchedule), [stages]);
  const currentStage = stages.find((stage) => stage.id === currentStageId);
  const getLapRaceMetaText = (stage) => (
    getLapRaceStageMetaParts({
      stage,
      lapsLabel: t('scene3.laps').toLowerCase(),
      passesLabel: t('theRace.finishLinePassesShort'),
      maxTimeLabel: t('theRace.lapRaceMaxTimeMinutes')
    }).join(' • ')
  );

  return (
    <Card className="bg-[#18181B] border-zinc-800">
      <CardHeader>
        <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          {t('scene1.currentStage')} (Live)
        </CardTitle>
        <CardDescription className="text-zinc-400">
          {t('common.select')} - affects overlay display
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="min-w-0">
            <Select value={currentStageId || ''} onValueChange={setCurrentStageId}>
              <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white" data-testid="select-current-stage">
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent>
                {sortedStages.map((stage) => {
                  const Icon = getStageTypeIcon(stage.type);
                  return (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${getStageTypeColor(stage.type)}`} />
                        {getStageTitle(stage)}
                        {showDebugIds && <DebugIdText id={stage.id} />}
                        {isLapTimingStageType(stage.type) && getLapRaceMetaText(stage) && ` (${getLapRaceMetaText(stage)})`}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_200px_180px] md:items-start">
            <label className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-[#09090B] px-4 py-3">
              <Switch
                checked={eventIsOver}
                onCheckedChange={(checked) => setEventIsOver(checked === true)}
              />
              <div>
                <p className="text-sm text-white">{t('config.eventIsOver')}</p>
                <p className="text-xs text-zinc-500">{t('config.eventIsOverHint')}</p>
              </div>
            </label>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{t('theRace.replayStartDate')}</p>
              <DateInput
                value={eventReplayStartDate || ''}
                onCommit={setEventReplayStartDate}
                className="bg-[#09090B] border-zinc-700 text-white"
                disabled={!eventIsOver}
                data-testid="input-event-replay-start-date"
              />
              <p className="text-xs text-zinc-500">{t('theRace.replayStartDateHint')}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{t('theRace.replayStartTime')}</p>
              <RollingClockInput
                value={eventReplayStartTime || ''}
                onCommit={setEventReplayStartTime}
                showHours={false}
                showSeconds={true}
                decimals={0}
                placeholder={t('theRace.replayStartTimePlaceholder')}
                className="bg-[#09090B] border-zinc-700 text-white font-mono"
                disabled={!eventIsOver}
                data-testid="input-event-replay-start-time"
              />
              <p className="text-xs text-zinc-500">{t('theRace.replayStartTimeHint')}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{t('theRace.replayStageIntervalSeconds')}</p>
              <Input
                type="number"
                min="0"
                step="1"
                value={eventReplayStageIntervalSeconds ?? 0}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setEventReplayStageIntervalSeconds(Number.isFinite(nextValue) && nextValue >= 0 ? Math.trunc(nextValue) : 0);
                }}
                className="bg-[#09090B] border-zinc-700 text-white"
                disabled={!eventIsOver}
                data-testid="input-event-replay-stage-interval-seconds"
              />
              <p className="text-xs text-zinc-500">{t('theRace.replayStageIntervalSecondsHint')}</p>
            </div>
          </div>
        </div>
        {currentStage && (
          <div className="mt-2 space-y-1">
            <p className="text-[#FACC15] font-bold flex items-center gap-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <span className="w-2 h-2 bg-[#FACC15] rounded-full animate-pulse" />
              LIVE: {getStageTitle(currentStage)}
              {showDebugIds && <DebugIdText id={currentStage.id} className="text-zinc-400" />}
              {isLapTimingStageType(currentStage.type) && getLapRaceMetaText(currentStage) && ` (${getLapRaceMetaText(currentStage)})`}
            </p>
            {(currentStage.game || currentStage.gameStageName) && (
              <p className="text-xs text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {currentStage.game && <span>{t('theRace.game')}: {currentStage.game}</span>}
                {currentStage.game && currentStage.gameStageName && <span> • </span>}
                {currentStage.gameStageName && <span>{t('theRace.gameStageName')}: {currentStage.gameStageName}</span>}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
