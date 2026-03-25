import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { StartInformationValue } from './StartInformationValue.jsx';
import { getReferenceNow, getStageDateTime, getStartInformationFromValues } from '../utils/rallyHelpers.js';
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
  liveStatus = '',
  debugDate = ''
}) {
  const { timeDecimals } = useRally();
  const initialNowRef = useRef(new Date());
  const initialNow = useMemo(() => (
    getReferenceNow(debugDate, initialNowRef.current)
  ), [debugDate]);
  const startAtMs = useMemo(() => {
    const stageDateTime = getStageDateTime(stageDate, startTime);
    return stageDateTime ? stageDateTime.getTime() : null;
  }, [stageDate, startTime]);

  const [countdownArmed, setCountdownArmed] = useState(false);

  useEffect(() => {
    if (finishTime || retired || !startAtMs) {
      setCountdownArmed(false);
      return undefined;
    }

    const remainingMs = startAtMs - Date.now();
    if (remainingMs <= 60000) {
      setCountdownArmed(true);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCountdownArmed(true);
    }, Math.max(0, remainingMs - 60000));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [finishTime, retired, startAtMs]);

  const shouldAnimate = useMemo(() => {
    if (finishTime || retired || !startAtMs) {
      return false;
    }

    if (liveStatus === 'racing' || liveStatus === 'pre_start') {
      return true;
    }

    return countdownArmed;
  }, [countdownArmed, finishTime, liveStatus, retired, startAtMs]);

  const shouldUseFastClock = shouldAnimate && timeDecimals > 0 && liveStatus === 'racing';
  const secondAlignedNow = useSecondAlignedClock(shouldAnimate && !shouldUseFastClock);

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

  const fastClockNowMs = useFastClock(shouldUseFastClock);
  const animatedSecondNow = useMemo(() => (
    getReferenceNow(debugDate, secondAlignedNow)
  ), [debugDate, secondAlignedNow]);
  const animatedFastNow = useMemo(() => (
    getReferenceNow(debugDate, new Date(fastClockNowMs))
  ), [debugDate, fastClockNowMs]);
  const animatedNow = shouldAnimate
    ? (shouldUseFastClock ? animatedFastNow : animatedSecondNow)
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
