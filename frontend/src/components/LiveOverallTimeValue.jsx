import React, { useMemo } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { useFastClock } from '../hooks/useFastClock.js';
import { useSecondAlignedClock } from '../hooks/useSecondAlignedClock.js';
import {
  getReferenceNow,
  getRunningTime,
  getPilotStatus,
  isPilotRetiredForStage,
  parseTime
} from '../utils/rallyHelpers.js';
import { formatDurationSeconds } from '../utils/timeFormat.js';

const shallowEqual = (left = {}, right = {}) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
};

function LiveOverallTimeValueBase({
  pilotId,
  stages = [],
  startTimes = {},
  times = {},
  retiredStages = {},
  timeDecimals = 3,
  debugDate = '',
  fallback = '-',
  className = '',
  style,
  as: Component = 'span'
}) {
  const { eventIsOver } = useRally();
  const useFastDecimals = timeDecimals > 0;
  const fastClockNowMs = useFastClock(useFastDecimals);
  const secondAlignedNow = useSecondAlignedClock(!useFastDecimals);

  const now = useMemo(() => (
    getReferenceNow(debugDate, new Date(useFastDecimals ? fastClockNowMs : secondAlignedNow))
  ), [debugDate, fastClockNowMs, secondAlignedNow, useFastDecimals]);

  const info = useMemo(() => {
    if (!pilotId || !Array.isArray(stages) || stages.length === 0) {
      return {
        hasValue: false,
        text: fallback
      };
    }

    let totalTime = 0;
    let completedStages = 0;
    let hasRunningStage = false;

    stages.forEach((stage) => {
      const finishTime = times[pilotId]?.[stage.id];

      if (finishTime) {
        totalTime += parseTime(finishTime);
        completedStages += 1;
        return;
      }

      if (hasRunningStage || eventIsOver) {
        return;
      }

      const startTime = startTimes[pilotId]?.[stage.id];
      if (!startTime) {
        return;
      }

      const status = getPilotStatus(pilotId, stage.id, startTimes, times, retiredStages, stage.date, now);
      if (status !== 'racing') {
        return;
      }

      totalTime += parseTime(getRunningTime(startTime, stage.date, now, timeDecimals));
      hasRunningStage = true;
    });

    if (completedStages === 0 && !hasRunningStage) {
      return {
        hasValue: false,
        text: fallback
      };
    }

    return {
      hasValue: true,
      text: formatDurationSeconds(totalTime, timeDecimals, {
        showHoursIfNeeded: true,
        padMinutes: true,
        fallback
      })
    };
  }, [eventIsOver, fallback, now, pilotId, retiredStages, stages, startTimes, timeDecimals, times]);

  if (!info.hasValue) {
    return null;
  }

  return (
    <Component className={className} style={style}>
      {info.text}
    </Component>
  );
}

const areLiveOverallTimePropsEqual = (prevProps, nextProps) => (
  prevProps.pilotId === nextProps.pilotId &&
  prevProps.timeDecimals === nextProps.timeDecimals &&
  prevProps.debugDate === nextProps.debugDate &&
  prevProps.fallback === nextProps.fallback &&
  prevProps.className === nextProps.className &&
  prevProps.as === nextProps.as &&
  shallowEqual(prevProps.style, nextProps.style) &&
  prevProps.stages === nextProps.stages &&
  prevProps.startTimes === nextProps.startTimes &&
  prevProps.times === nextProps.times &&
  prevProps.retiredStages === nextProps.retiredStages
);

export const LiveOverallTimeValue = React.memo(LiveOverallTimeValueBase, areLiveOverallTimePropsEqual);
