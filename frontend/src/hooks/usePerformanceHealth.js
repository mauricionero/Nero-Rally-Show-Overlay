import { useEffect, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const SCORE_WEIGHTS = {
  fps: 5,
  frame: 3,
  long: 2,
  stall: 1
};

const detectRefreshRate = async () => new Promise((resolve) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    resolve(60);
    return;
  }

  const frameSamples = [];
  let lastTime = null;
  let sampleCount = 0;
  const sampleLimit = 70;

  const onFrame = (time) => {
    if (lastTime !== null) {
      const delta = time - lastTime;
      if (delta > 0 && delta < 100) {
        frameSamples.push(delta);
      }
    }
    lastTime = time;
    sampleCount += 1;

    if (sampleCount >= sampleLimit) {
      if (frameSamples.length < 10) {
        resolve(60);
        return;
      }

      const sorted = [...frameSamples].sort((a, b) => a - b);
      const medianDelta = sorted[Math.floor(sorted.length / 2)];
      const measuredFps = 1000 / medianDelta;
      const normalizedFps = clamp(Math.round(measuredFps / 5) * 5, 50, 240);
      resolve(normalizedFps);
      return;
    }

    window.requestAnimationFrame(onFrame);
  };

  window.requestAnimationFrame(onFrame);
});

const computeGrade = ({ fpsScore, frameScore, longScore, stallScore }) => {
  const weightedSum = (
    (clamp(Number(fpsScore) || 0, 0, 10) * SCORE_WEIGHTS.fps) +
    (clamp(Number(frameScore) || 0, 0, 10) * SCORE_WEIGHTS.frame) +
    (clamp(Number(longScore) || 0, 0, 10) * SCORE_WEIGHTS.long) +
    (clamp(Number(stallScore) || 0, 0, 10) * SCORE_WEIGHTS.stall)
  );
  const totalWeight = SCORE_WEIGHTS.fps + SCORE_WEIGHTS.frame + SCORE_WEIGHTS.long + SCORE_WEIGHTS.stall;
  const normalized = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
  return clamp(Math.round(normalized), 0, 10);
};

const getFpsScore = (fps, targetFps) => {
  const safeTargetFps = Math.max(30, Number(targetFps) || 60);
  const ratio = fps / safeTargetFps;
  return (
    ratio >= 0.97 ? 0
      : ratio >= 0.9 ? 2
      : ratio >= 0.75 ? 5
      : ratio >= 0.55 ? 8
      : 10
  );
};

const getFrameScore = (avgFrameMs) => {
  return (
    avgFrameMs <= 18 ? 0
      : avgFrameMs <= 25 ? 3
      : avgFrameMs <= 33 ? 5
      : avgFrameMs <= 50 ? 7
      : 9
  );
};

const getLongScore = (longTaskCount, longTaskWorst) => {
  if (longTaskWorst >= 200) return 10;
  if (longTaskWorst >= 120) return 8;
  if (longTaskWorst >= 80) return 6;
  if (longTaskWorst >= 50) return 5;
  if (longTaskWorst >= 20) return 3;
  if (longTaskCount > 0) return 2;
  return 0;
};

const getStallScore = (maxFrameMs) => {
  return (
    maxFrameMs >= 250 ? 10
      : maxFrameMs >= 150 ? 8
      : maxFrameMs >= 100 ? 6
      : maxFrameMs >= 60 ? 4
      : maxFrameMs >= 40 ? 2
      : 0
  );
};

const getInitialTargetFps = () => {
  const screenRate = Number(globalThis?.screen?.frameRate || 0);
  if (Number.isFinite(screenRate) && screenRate >= 30 && screenRate <= 240) {
    return Math.round(screenRate);
  }
  return 60;
};

export const usePerformanceHealth = ({ enabled = true } = {}) => {
  const [state, setState] = useState(() => ({
    grade: 0,
    metricLabel: 'FPS',
    metricValue: '--',
    metrics: {
      fps: 0,
      avgFrameMs: 0,
      maxFrameMs: 0,
      longTaskCount: 0,
      longTaskWorst: 0,
      fpsScore: 0,
      frameScore: 0,
      longScore: 0,
      stallScore: 0,
      targetFps: getInitialTargetFps()
    }
  }));

  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);
  const frameCountRef = useRef(0);
  const sumFrameDeltaRef = useRef(0);
  const maxFrameDeltaRef = useRef(0);
  const longTaskCountRef = useRef(0);
  const longTaskWorstRef = useRef(0);
  const lastTickRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const observerRef = useRef(null);
  const targetFpsRef = useRef(getInitialTargetFps());

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    detectRefreshRate().then((detected) => {
      if (!cancelled && Number.isFinite(detected)) {
        targetFpsRef.current = detected;
      }
    });

    const tickRaf = (time) => {
      if (lastFrameRef.current !== null) {
        const delta = time - lastFrameRef.current;
        if (delta >= 0 && delta < 1000) {
          frameCountRef.current += 1;
          sumFrameDeltaRef.current += delta;
          if (delta > maxFrameDeltaRef.current) {
            maxFrameDeltaRef.current = delta;
          }
        }
      }
      lastFrameRef.current = time;
      rafRef.current = window.requestAnimationFrame(tickRaf);
    };

    rafRef.current = window.requestAnimationFrame(tickRaf);

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        observerRef.current = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            longTaskCountRef.current += 1;
            if (entry.duration > longTaskWorstRef.current) {
              longTaskWorstRef.current = entry.duration;
            }
          });
        });
        observerRef.current.observe({ entryTypes: ['longtask'] });
      } catch (error) {
        observerRef.current = null;
      }
    }

    const interval = setInterval(() => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = Math.max(1, now - lastTickRef.current);
      const frameCount = frameCountRef.current;
      const fps = frameCount > 0 ? (frameCount / elapsed) * 1000 : 0;
      const avgFrameMs = frameCount > 0 ? sumFrameDeltaRef.current / frameCount : 0;
      const maxFrameMs = maxFrameDeltaRef.current;
      const longTaskCount = longTaskCountRef.current;
      const longTaskWorst = longTaskWorstRef.current;

      frameCountRef.current = 0;
      sumFrameDeltaRef.current = 0;
      maxFrameDeltaRef.current = 0;
      longTaskCountRef.current = 0;
      longTaskWorstRef.current = 0;
      lastTickRef.current = now;

      setState((prev) => {
        const targetFps = targetFpsRef.current;
        const nextMetrics = {
          ...prev.metrics,
          fps,
          avgFrameMs,
          maxFrameMs,
          longTaskCount,
          longTaskWorst,
          targetFps
        };

        // Scores always reflect the currently displayed raw values.
        nextMetrics.fpsScore = getFpsScore(nextMetrics.fps, targetFps);
        nextMetrics.frameScore = getFrameScore(nextMetrics.avgFrameMs);
        nextMetrics.longScore = getLongScore(nextMetrics.longTaskCount, nextMetrics.longTaskWorst);
        nextMetrics.stallScore = getStallScore(nextMetrics.maxFrameMs);

        const grade = computeGrade(nextMetrics);

        return {
          grade,
          metricLabel: 'All Metrics',
          metricValue: `${Math.round(nextMetrics.fps)} / ${Math.round(targetFps)}`,
          metrics: nextMetrics
        };
      });
    }, 2000);

    return () => {
      window.clearInterval(interval);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      cancelled = true;
    };
  }, [enabled]);

  return state;
};
