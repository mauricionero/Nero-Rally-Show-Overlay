import React, { useMemo } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { StartInformationValue } from './StartInformationValue.jsx';
import { getStageDateTime, getStartInformationFromValues } from '../utils/rallyHelpers.js';
import { useFastClock } from '../hooks/useFastClock.js';
import { useSecondAlignedClock } from '../hooks/useSecondAlignedClock.js';

export function LiveStartInformationValue({
  startTime = '',
  finishTime = '',
  retired = false,
  stageDate,
  startLabel = 'Start',
  retiredLabel = 'Retired',
  className = '',
  style,
  as,
  fallback = '',
  liveStatus = ''
}) {
  const { timeDecimals } = useRally();
  const initialNow = useMemo(() => new Date(), []);
  const secondAlignedNow = useSecondAlignedClock();
  const startAtMs = useMemo(() => {
    const stageDateTime = getStageDateTime(stageDate, startTime);
    return stageDateTime ? stageDateTime.getTime() : null;
  }, [stageDate, startTime]);

  const staticInfo = useMemo(() => (
    getStartInformationFromValues({
      startTime,
      finishTime,
      retired,
      stageDate,
      now: initialNow,
      decimals: timeDecimals,
      startLabel,
      retiredLabel
    })
  ), [finishTime, initialNow, retired, retiredLabel, stageDate, startLabel, startTime, timeDecimals]);

  const shouldAnimate = useMemo(() => {
    if (finishTime || retired || !startAtMs) {
      return false;
    }

    if (liveStatus === 'racing' || liveStatus === 'pre_start') {
      return true;
    }

    const remainingMs = startAtMs - Date.now();
    return remainingMs > 0 && remainingMs <= 10000;
  }, [finishTime, liveStatus, retired, startAtMs]);

  const fastClockNowMs = useFastClock(shouldAnimate && timeDecimals > 0);
  const animatedNow = shouldAnimate
    ? (timeDecimals > 0 ? new Date(fastClockNowMs) : secondAlignedNow)
    : initialNow;

  const info = useMemo(() => {
    if (!shouldAnimate) {
      return staticInfo;
    }

    return getStartInformationFromValues({
      startTime,
      finishTime,
      retired,
      stageDate,
      now: animatedNow,
      decimals: timeDecimals,
      startLabel,
      retiredLabel
    });
  }, [animatedNow, finishTime, retired, retiredLabel, shouldAnimate, stageDate, startLabel, startTime, staticInfo, timeDecimals]);

  return (
    <StartInformationValue
      info={info}
      fallback={fallback}
      className={className}
      style={style}
      as={as}
    />
  );
}
