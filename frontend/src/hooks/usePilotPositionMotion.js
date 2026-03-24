import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { getPilotMotionConfig } from '../utils/overlayMotionConfig.js';

const MIN_MOTION_DISTANCE = 1;

const measureElementLayout = (element) => ({
  left: element.offsetLeft,
  top: element.offsetTop
});

export const usePilotPositionMotion = (items, options = {}) => {
  const elementRefs = useRef(new Map());
  const previousLayoutsRef = useRef(new Map());
  const previousStatusesRef = useRef(new Map());
  const cleanupTimersRef = useRef(new Map());
  const animationFramesRef = useRef(new Map());
  const motionSignature = useMemo(
    () => items.map((item) => `${item.key}:${item.statusKey}`).join('|'),
    [items]
  );
  const motionConfig = useMemo(() => getPilotMotionConfig(options), [options]);
  const isDisabled = options.disabled === true;

  const setMotionRef = useCallback((key, node) => {
    if (node) {
      elementRefs.current.set(key, node);
      return;
    }

    elementRefs.current.delete(key);
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    items.forEach(({ key }) => {
      const element = elementRefs.current.get(key);
      const frameId = animationFramesRef.current.get(key);
      const timeoutId = cleanupTimersRef.current.get(key);

      if (frameId) {
        window.cancelAnimationFrame(frameId);
        animationFramesRef.current.delete(key);
      }

      if (timeoutId) {
        window.clearTimeout(timeoutId);
        cleanupTimersRef.current.delete(key);
      }

      if (element) {
        element.style.transition = '';
        element.style.transform = '';
      }
    });

    const nextLayouts = new Map();
    const nextStatuses = new Map();

    items.forEach(({ key, statusKey }) => {
      const element = elementRefs.current.get(key);
      if (!element) {
        return;
      }

      nextLayouts.set(key, measureElementLayout(element));
      nextStatuses.set(key, statusKey);
    });

    if (isDisabled) {
      previousLayoutsRef.current = nextLayouts;
      previousStatusesRef.current = nextStatuses;
      return undefined;
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      previousLayoutsRef.current = nextLayouts;
      previousStatusesRef.current = nextStatuses;
      return undefined;
    }

    nextLayouts.forEach((nextLayout, key) => {
      const previousLayout = previousLayoutsRef.current.get(key);
      const previousStatus = previousStatusesRef.current.get(key);
      const nextStatus = nextStatuses.get(key);
      const element = elementRefs.current.get(key);

      if (!previousLayout || !element) {
        return;
      }

      if (previousStatus !== nextStatus) {
        return;
      }

      const deltaX = previousLayout.left - nextLayout.left;
      const deltaY = previousLayout.top - nextLayout.top;

      if (Math.abs(deltaX) < MIN_MOTION_DISTANCE && Math.abs(deltaY) < MIN_MOTION_DISTANCE) {
        return;
      }

      element.style.transition = 'none';
      element.style.transformOrigin = 'center center';
      element.style.zIndex = '20';
      element.style.boxShadow = '0 20px 40px rgba(0,0,0,0.35)';
      element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${motionConfig.scale})`;
      element.getBoundingClientRect();

      const frameId = window.requestAnimationFrame(() => {
        element.style.transition = `transform ${motionConfig.duration}ms ${motionConfig.easing}, box-shadow ${motionConfig.duration}ms ${motionConfig.easing}`;
        element.style.transform = 'translate(0px, 0px) scale(1)';
        element.style.boxShadow = '0 0 0 rgba(0,0,0,0)';

        const timeoutId = window.setTimeout(() => {
          element.style.transition = '';
          element.style.transform = '';
          element.style.transformOrigin = '';
          element.style.zIndex = '';
          element.style.boxShadow = '';
          cleanupTimersRef.current.delete(key);
        }, motionConfig.duration + 60);

        cleanupTimersRef.current.set(key, timeoutId);
        animationFramesRef.current.delete(key);
      });

      animationFramesRef.current.set(key, frameId);
    });

    previousLayoutsRef.current = nextLayouts;
    previousStatusesRef.current = nextStatuses;

    return () => {
      animationFramesRef.current.forEach((frameId) => window.cancelAnimationFrame(frameId));
      animationFramesRef.current.clear();
    };
  }, [isDisabled, motionConfig.duration, motionConfig.easing, motionConfig.scale, motionSignature]);

  return { setMotionRef, pilotMotionConfig: motionConfig };
};
