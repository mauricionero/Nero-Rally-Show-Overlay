import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Smartphone, Timer, SquarePen } from 'lucide-react';
import { getTimingSourceLabel, normalizeTimingSource, TIMING_SOURCES } from '../utils/timingSource.js';

const SOURCE_ICON_BY_TYPE = {
  [TIMING_SOURCES.MOBILE]: Smartphone,
  [TIMING_SOURCES.TIMES]: Timer,
  [TIMING_SOURCES.SETUP]: SquarePen
};

export default function TimingSourceIndicator({ source, className = '' }) {
  const normalizedSource = normalizeTimingSource(source);
  const label = getTimingSourceLabel(normalizedSource);

  if (!normalizedSource || !label) {
    return null;
  }

  const Icon = SOURCE_ICON_BY_TYPE[normalizedSource];
  if (!Icon) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-400 ${className}`.trim()}
            aria-label={label}
          >
            <Icon className="h-2.5 w-2.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-[#111827] text-white border border-[#374151]">
          <div className="text-xs">source: {label}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
