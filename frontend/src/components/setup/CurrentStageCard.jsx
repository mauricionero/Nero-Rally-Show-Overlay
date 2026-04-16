import React, { useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import DebugIdText from './DebugIdText.jsx';
import { compareStagesBySchedule } from '../../utils/stageSchedule.js';
import {
  getStageTitle,
  isLapRaceStageType,
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
  const { stages, currentStageId, setCurrentStageId } = useRally();

  const sortedStages = useMemo(() => [...stages].sort(compareStagesBySchedule), [stages]);
  const currentStage = stages.find((stage) => stage.id === currentStageId);
  const getLapRaceMetaText = (stage) => (
    getLapRaceStageMetaParts({
      stage,
      lapsLabel: t('scene3.laps').toLowerCase(),
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
                    {isLapRaceStageType(stage.type) && getLapRaceMetaText(stage) && ` (${getLapRaceMetaText(stage)})`}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {currentStage && (
          <p className="mt-2 text-[#FACC15] font-bold flex items-center gap-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <span className="w-2 h-2 bg-[#FACC15] rounded-full animate-pulse" />
            LIVE: {getStageTitle(currentStage)}
            {showDebugIds && <DebugIdText id={currentStage.id} className="text-zinc-400" />}
            {isLapRaceStageType(currentStage.type) && getLapRaceMetaText(currentStage) && ` (${getLapRaceMetaText(currentStage)})`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
