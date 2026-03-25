import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPilotStatusMotionConfig } from '../utils/overlayMotionConfig.js';

const buildStatusMap = (items) => new Map(items.map((item) => [item.key, item.statusKey]));
const getChangedKeys = (fromItems, toItems) => {
  const fromStatuses = buildStatusMap(fromItems);
  return toItems
    .filter((item) => fromStatuses.has(item.key) && fromStatuses.get(item.key) !== item.statusKey)
    .map((item) => item.key);
};

export const usePilotStatusMotion = (items, options = {}) => {
  const motionConfig = useMemo(() => getPilotStatusMotionConfig(options), [options]);
  const statusSignature = useMemo(
    () => items.map((item) => `${item.key}:${item.statusKey}`).join('|'),
    [items]
  );
  const [stagedItems, setStagedItems] = useState(null);
  const [phaseByKey, setPhaseByKey] = useState({});
  const [transitionTick, setTransitionTick] = useState(0);
  const phaseRef = useRef('idle');
  const visibleItemsRef = useRef(items);
  const latestItemsRef = useRef(items);
  const timersRef = useRef({ exit: null, enter: null });

  const clearTimers = useCallback(() => {
    if (timersRef.current.exit) {
      window.clearTimeout(timersRef.current.exit);
      timersRef.current.exit = null;
    }

    if (timersRef.current.enter) {
      window.clearTimeout(timersRef.current.enter);
      timersRef.current.enter = null;
    }
  }, []);

  useEffect(() => {
    latestItemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (phaseRef.current === 'idle') {
      setTransitionTick((value) => value + 1);
    }
  }, [statusSignature]);

  useEffect(() => {
    if (phaseRef.current !== 'idle') {
      return;
    }

    const currentVisibleItems = visibleItemsRef.current ?? items;
    const changedKeys = getChangedKeys(currentVisibleItems, latestItemsRef.current);

    if (changedKeys.length === 0) {
      visibleItemsRef.current = latestItemsRef.current;
      return;
    }

    clearTimers();
    phaseRef.current = 'exit';
    setStagedItems(currentVisibleItems);
    setPhaseByKey(Object.fromEntries(changedKeys.map((key) => [key, 'exit'])));

    timersRef.current.exit = window.setTimeout(() => {
      const nextItems = latestItemsRef.current;
      const nextChangedKeys = getChangedKeys(currentVisibleItems, nextItems);

      phaseRef.current = 'enter';
      visibleItemsRef.current = nextItems;
      setStagedItems(nextItems);
      setPhaseByKey(Object.fromEntries(nextChangedKeys.map((key) => [key, 'enter'])));

      timersRef.current.enter = window.setTimeout(() => {
        phaseRef.current = 'idle';
        setPhaseByKey({});
        setStagedItems(null);
        timersRef.current.enter = null;
        visibleItemsRef.current = latestItemsRef.current;
        setTransitionTick((value) => value + 1);
      }, motionConfig.enterDuration);

      timersRef.current.exit = null;
    }, motionConfig.exitDuration);
  }, [clearTimers, motionConfig.enterDuration, motionConfig.exitDuration, statusSignature, transitionTick]);

  useEffect(() => () => {
    clearTimers();
  }, [clearTimers]);

  const getStatusMotionClassName = useCallback((key) => {
    const phase = phaseByKey[key];

    if (phase === 'exit') {
      return 'pilot-status-exit-motion';
    }

    if (phase === 'enter') {
      return 'pilot-status-enter-motion';
    }

    return '';
  }, [phaseByKey]);

  return {
    displayedItems: stagedItems ?? items,
    getStatusMotionClassName,
    pilotStatusMotionConfig: motionConfig,
    isStatusTransitionActive: stagedItems !== null || Object.keys(phaseByKey).length > 0
  };
};
