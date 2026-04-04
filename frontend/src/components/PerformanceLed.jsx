import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { getLedLoadColor } from '../utils/ledLoadColors.js';

const getTargetFps = () => {
  const screenRate = Number(globalThis?.screen?.frameRate || 0);
  if (Number.isFinite(screenRate) && screenRate >= 30 && screenRate <= 240) {
    return Math.round(screenRate);
  }
  return 60;
};

const getFpsLevel = (fps, targetFps) => {
  const safeTarget = Math.max(30, Number(targetFps) || 60);
  const safeFps = Math.max(0, Number(fps) || 0);
  const ratio = safeFps / safeTarget;

  if (ratio >= 0.98) return 0;
  if (ratio >= 0.95) return 1;
  if (ratio >= 0.9) return 2;
  if (ratio >= 0.85) return 3;
  if (ratio >= 0.8) return 4;
  if (ratio >= 0.7) return 5;
  if (ratio >= 0.6) return 6;
  if (ratio >= 0.5) return 7;
  if (ratio >= 0.4) return 8;
  if (ratio >= 0.25) return 9;
  return 10;
};

const useFpsSample = () => {
  const [fps, setFps] = useState(0);
  const lastFrameTimeRef = useRef(null);
  const frameCountRef = useRef(0);
  const windowStartRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return undefined;
    }

    let rafId = null;

    const onFrame = (timestamp) => {
      if (document.visibilityState !== 'visible') {
        lastFrameTimeRef.current = timestamp;
        frameCountRef.current = 0;
        windowStartRef.current = timestamp;
        rafId = window.requestAnimationFrame(onFrame);
        return;
      }

      if (windowStartRef.current <= 0) {
        windowStartRef.current = timestamp;
      }

      if (lastFrameTimeRef.current !== null) {
        const delta = timestamp - lastFrameTimeRef.current;
        if (delta > 0 && delta < 1000) {
          frameCountRef.current += 1;
        }
      }

      lastFrameTimeRef.current = timestamp;

      const elapsed = timestamp - windowStartRef.current;
      if (elapsed >= 1000) {
        setFps((frameCountRef.current / elapsed) * 1000);
        frameCountRef.current = 0;
        windowStartRef.current = timestamp;
      }

      rafId = window.requestAnimationFrame(onFrame);
    };

    rafId = window.requestAnimationFrame(onFrame);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return fps;
};

export default function PerformanceLed({ className, icon: Icon = Cpu, iconClassName = '' }) {
  const fps = useFpsSample();
  const targetFps = useMemo(() => getTargetFps(), []);
  const fpsLevel = getFpsLevel(fps, targetFps);
  const color = getLedLoadColor(fpsLevel);
  const containerClassName = className || 'relative w-3 h-3 rounded-full border border-zinc-700 flex items-center justify-center';

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={containerClassName}
            style={{ backgroundColor: color }}
          >
            {Icon && <Icon className={iconClassName || 'w-2 h-2 text-black/80'} />}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
          <div className="text-xs space-y-1">
            <div className="font-semibold">CPU / FPS</div>
            <div>FPS: {Math.round(fps)} / {targetFps}</div>
            <div className="text-[10px] text-zinc-400">Color is based only on current FPS.</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
