import { useSyncExternalStore } from 'react';

let subscriberCount = 0;
let timeoutId = null;
let intervalId = null;
let snapshot = Date.now();
const listeners = new Set();

const emit = () => {
  snapshot = Date.now();
  listeners.forEach((listener) => listener());
};

const stopClock = () => {
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (intervalId) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
};

const startClock = () => {
  if (typeof window === 'undefined' || timeoutId || intervalId) {
    return;
  }

  const startInterval = () => {
    emit();
    intervalId = window.setInterval(emit, 100);
    timeoutId = null;
  };

  const delay = 100 - (Date.now() % 100);
  timeoutId = window.setTimeout(startInterval, delay);
};

const subscribe = (listener) => {
  listeners.add(listener);
  subscriberCount += 1;
  if (subscriberCount === 1) {
    startClock();
  }

  return () => {
    listeners.delete(listener);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0) {
      stopClock();
    }
  };
};

const getSnapshot = () => snapshot;
const getServerSnapshot = () => Date.now();
const subscribeStatic = () => () => {};

export function useFastClock(enabled = true) {
  return useSyncExternalStore(
    enabled ? subscribe : subscribeStatic,
    enabled ? getSnapshot : getServerSnapshot,
    getServerSnapshot
  );
}
