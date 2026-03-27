import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { usePerformanceHealth } from '../hooks/usePerformanceHealth.js';
import { getLedLoadColor } from '../utils/ledLoadColors.js';

export default function PerformanceLed({ className, icon: Icon = null, iconClassName = '' }) {
  const { grade, metricLabel, metricValue, metrics } = usePerformanceHealth();
  const color = getLedLoadColor(grade);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`relative w-3 h-3 rounded-full border border-zinc-700 flex items-center justify-center ${className || ''}`}
            style={{ backgroundColor: color }}
          >
            {Icon && <Icon className={iconClassName || 'w-2 h-2 text-black/80'} />}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
          <div className="text-xs space-y-1">
            <div className="font-semibold">Performance Load</div>
            <div>Load score: {grade}/10</div>
            <div>FPS: {Math.round(metrics.fps)} (score {metrics.fpsScore}/10)</div>
            <div>Avg frame: {metrics.avgFrameMs.toFixed(1)}ms (score {metrics.frameScore}/10)</div>
            <div>Worst frame: {Math.round(metrics.maxFrameMs)}ms (score {metrics.stallScore}/10)</div>
            <div>Long tasks: {metrics.longTaskCount} (worst {Math.round(metrics.longTaskWorst)}ms, score {metrics.longScore}/10)</div>
            <div className="text-[10px] text-zinc-400">All scores refresh every 2 seconds.</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
