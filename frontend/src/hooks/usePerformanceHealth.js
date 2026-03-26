import { useEffect, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const computeGrade = ({ fpsScore, frameScore, longScore, stallScore }) => {
  const average = (fpsScore + frameScore + longScore + stallScore) / 4;
  return clamp(Math.round(average), 0, 10);
};

const getFpsScore = (fps) => (
  fps >= 55 ? 0
    : fps >= 45 ? 2
    : fps >= 30 ? 5
    : fps >= 20 ? 8
    : 10
);

const getFrameScore = (avgFrameMs) => (
  avgFrameMs <= 18 ? 0
    : avgFrameMs <= 25 ? 3
    : avgFrameMs <= 33 ? 5
    : avgFrameMs <= 50 ? 7
    : 9
);

const getLongScore = (longTaskCount, longTaskWorst) => {
  if (longTaskWorst >= 200) return 10;
  if (longTaskWorst >= 120) return 8;
  if (longTaskWorst >= 80) return 6;
  if (longTaskWorst >= 50) return 5;
  if (longTaskWorst >= 20) return 3;
  if (longTaskCount > 0) return 2;
  return 0;
};

const getStallScore = (maxFrameMs) => (
  maxFrameMs >= 250 ? 10
    : maxFrameMs >= 150 ? 8
    : maxFrameMs >= 100 ? 6
    : maxFrameMs >= 60 ? 4
    : maxFrameMs >= 40 ? 2
    : 0
);

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
      stallScore: 0
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
  const metricIndexRef = useRef(0);
  const observerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

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

      const metricIndex = metricIndexRef.current;
      let metricLabel = 'FPS';
      let metricValue = '--';

      setState((prev) => {
        const nextMetrics = {
          ...prev.metrics,
          fps,
          avgFrameMs,
          maxFrameMs,
          longTaskCount,
          longTaskWorst
        };

        if (metricIndex === 0) {
          nextMetrics.fpsScore = getFpsScore(fps);
          metricLabel = 'FPS';
          metricValue = `${Math.round(fps)}`;
        } else if (metricIndex === 1) {
          nextMetrics.longScore = getLongScore(longTaskCount, longTaskWorst);
          metricLabel = 'Long Tasks';
          metricValue = `${longTaskCount} (${Math.round(longTaskWorst)}ms)`;
        } else if (metricIndex === 2) {
          nextMetrics.frameScore = getFrameScore(avgFrameMs);
          metricLabel = 'Frame Time';
          metricValue = `${avgFrameMs.toFixed(1)}ms`;
        } else {
          nextMetrics.stallScore = getStallScore(maxFrameMs);
          metricLabel = 'Worst Frame';
          metricValue = `${Math.round(maxFrameMs)}ms`;
        }

        const grade = computeGrade(nextMetrics);
        metricIndexRef.current = (metricIndex + 1) % 4;

        return {
          grade,
          metricLabel,
          metricValue,
          metrics: nextMetrics
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [enabled]);

  return state;
};
