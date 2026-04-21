import React from 'react';
import { Flag, RotateCcw, Car, Timer } from 'lucide-react';
import {
  SUPER_PRIME_STAGE_TYPE,
  getStageTitle,
  LAP_RACE_STAGE_TYPE,
  LIAISON_STAGE_TYPE,
  SERVICE_PARK_STAGE_TYPE,
  SS_STAGE_TYPE
} from '../utils/stageTypes.js';

const getStageIcon = (type) => {
  switch (type) {
    case SS_STAGE_TYPE:
      return Flag;
    case SUPER_PRIME_STAGE_TYPE:
      return Flag;
    case LAP_RACE_STAGE_TYPE:
      return RotateCcw;
    case LIAISON_STAGE_TYPE:
      return Car;
    case SERVICE_PARK_STAGE_TYPE:
      return Timer;
    default:
      return Flag;
  }
};

const getStageIconColor = (type) => {
  switch (type) {
    case SS_STAGE_TYPE:
      return '#FF4500';
    case SUPER_PRIME_STAGE_TYPE:
      return '#FB923C';
    case LAP_RACE_STAGE_TYPE:
      return '#FACC15';
    case LIAISON_STAGE_TYPE:
      return '#3B82F6';
    case SERVICE_PARK_STAGE_TYPE:
      return '#22C55E';
    default:
      return '#FF4500';
  }
};

export default function CurrentStageBadge({
  stage,
  className = '',
  titleClassName = 'text-white font-bold uppercase text-sm truncate'
}) {
  if (!stage) {
    return null;
  }

  const Icon = getStageIcon(stage.type);

  return (
    <div className={`bg-black/90 backdrop-blur-sm px-3 py-2 rounded border border-[#FF4500] shadow-2xl z-20 flex items-center gap-2 ${className}`.trim()}>
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: getStageIconColor(stage.type) }} />
      <p className={titleClassName} style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
        {getStageTitle(stage)}
      </p>
    </div>
  );
}
