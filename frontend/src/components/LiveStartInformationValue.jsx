import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { StartInformationValue } from './StartInformationValue.jsx';
import { getReferenceNow, getStageDateTime, getStartInformationFromValues } from '../utils/rallyHelpers.js';
import { useFastClock } from '../hooks/useFastClock.js';
import { useSecondAlignedClock } from '../hooks/useSecondAlignedClock.js';

const shallowEqual = (left = {}, right = {}) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
};

const areLiveStartInformationPropsEqual = (prevProps, nextProps) => (
  prevProps.startTime === nextProps.startTime &&
  prevProps.finishTime === nextProps.finishTime &&
  prevProps.retired === nextProps.retired &&
  prevProps.stageDate === nextProps.stageDate &&
  prevProps.startLabel === nextProps.startLabel &&
  prevProps.retiredLabel === nextProps.retiredLabel &&
  prevProps.className === nextProps.className &&
  prevProps.fallback === nextProps.fallback &&
  prevProps.liveStatus === nextProps.liveStatus &&
  prevProps.debugDate === nextProps.debugDate &&
  prevProps.as === nextProps.as &&
  shallowEqual(prevProps.style, nextProps.style)
);

function LiveStartInformationValueBase({
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
  const { timeDecimals, eventIsOver } = useRally();
  const initialNowRef = useRef(new Date());
  const initialNow = useMemo(() => (
    getReferenceNow(debugDate, initialNowRef.current)
  ), [debugDate]);
  const startAtMs = useMemo(() => {
    const stageDateTime = getStageDateTime(stageDate, startTime);
    return stageDateTime ? stageDateTime.getTime() : null;
  }, [stageDate, startTime]);
  const resolvedLiveStatus = useMemo(() => {
    if (liveStatus) {
      return liveStatus;
    }

    if (finishTime) {
      return 'finished';
    }

    if (retired) {
      return 'retired';
    }

    if (startAtMs) {
      return 'pre_start';
    }

    return 'not_started';
  }, [finishTime, liveStatus, retired, startAtMs]);

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

    if (resolvedLiveStatus === 'racing' || resolvedLiveStatus === 'pre_start') {
      return true;
    }

    return countdownArmed;
  }, [countdownArmed, finishTime, resolvedLiveStatus, retired, startAtMs]);

  const shouldUseFastClock = shouldAnimate && timeDecimals > 0 && resolvedLiveStatus === 'racing';
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

  if (eventIsOver && !finishTime && !retired) {
    return null;
  }

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

export const LiveStartInformationValue = React.memo(LiveStartInformationValueBase, areLiveStartInformationPropsEqual);
