import React, { useMemo } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { StartInformationValue } from './StartInformationValue.jsx';
import { getReferenceNow, getResolvedStageFinishDateTime, getResolvedStageStartDateTime, getStartInformationFromValues } from '../utils/rallyHelpers.js';
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
  prevProps.arrivalTime === nextProps.arrivalTime &&
  prevProps.retired === nextProps.retired &&
  prevProps.stageDate === nextProps.stageDate &&
  prevProps.stageId === nextProps.stageId &&
  prevProps.startLabel === nextProps.startLabel &&
  prevProps.retiredLabel === nextProps.retiredLabel &&
  prevProps.className === nextProps.className &&
  prevProps.fallback === nextProps.fallback &&
  prevProps.liveStatus === nextProps.liveStatus &&
  prevProps.debugDate === nextProps.debugDate &&
  prevProps.as === nextProps.as &&
  prevProps.replayStageScheduleById === nextProps.replayStageScheduleById &&
  shallowEqual(prevProps.style, nextProps.style)
);

function LiveStartInformationValueBase({
  startTime = '',
  finishTime = '',
  arrivalTime = '',
  retired = false,
  stageDate,
  stageId = '',
  replayStageScheduleById = null,
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
  const resolvedStageStartDateTime = useMemo(() => (
    getResolvedStageStartDateTime({
      stageId,
      stageDate,
      startTime,
      useReplayStageSchedule: eventIsOver,
      replayStageScheduleById
    })
  ), [eventIsOver, replayStageScheduleById, stageDate, stageId, startTime]);
  const resolvedStageFinishDateTime = useMemo(() => (
    getResolvedStageFinishDateTime({
      stageId,
      stageDate,
      startTime,
      finishTime,
      useReplayStageSchedule: eventIsOver,
      replayStageScheduleById
    })
  ), [eventIsOver, finishTime, replayStageScheduleById, stageDate, stageId, startTime]);
  const tickingNow = useSecondAlignedClock(true);
  const currentNow = useMemo(() => getReferenceNow(debugDate, tickingNow), [debugDate, tickingNow]);

  const info = useMemo(() => (
    getStartInformationFromValues({
      startTime,
      finishTime,
      arrivalTime,
      retired,
      stageDate,
      stageStartDateTime: resolvedStageStartDateTime,
      stageFinishDateTime: resolvedStageFinishDateTime,
      now: currentNow,
      decimals: timeDecimals,
      startLabel,
      retiredLabel
    })
  ), [arrivalTime, currentNow, finishTime, retired, retiredLabel, resolvedStageFinishDateTime, resolvedStageStartDateTime, stageDate, startLabel, startTime, timeDecimals]);

  if (eventIsOver && !(finishTime || arrivalTime) && !retired) {
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
