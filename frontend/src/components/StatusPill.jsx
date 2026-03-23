import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const VARIANT_STYLES = {
  alert: 'bg-amber-500/30 text-amber-200',
  jumpStart: 'bg-red-500/30 text-red-200',
  info: 'bg-blue-500/30 text-blue-200'
};

const VARIANT_FALLBACK_TEXT = {
  alert: '!',
  jumpStart: '!',
  info: 'i'
};

export default function StatusPill({
  variant = 'alert',
  text,
  icon,
  className = '',
  tooltipTitle,
  tooltipText,
  tooltipSide = 'top'
}) {
  const baseStyle = 'flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded';
  const colorStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.alert;
  const content = icon ?? text ?? VARIANT_FALLBACK_TEXT[variant];
  const pill = (
    <span className={`${baseStyle} ${colorStyle} ${className}`.trim()}>
      {content}
    </span>
  );

  if (!tooltipTitle && !tooltipText) {
    return pill;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {pill}
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} className="max-w-[220px] bg-zinc-900 text-zinc-100 border border-zinc-700 text-xs">
          <div className="space-y-1">
            {tooltipTitle && <div className="font-semibold text-white">{tooltipTitle}</div>}
            {tooltipText && <div className="text-zinc-300">{tooltipText}</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
