import { useEffect, useState } from 'react';

export function useSecondAlignedClock(enabled = true) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    setNow(new Date());

    let timeoutId = null;
    let intervalId = null;

    const tick = () => setNow(new Date());

    const startInterval = () => {
      tick();
      intervalId = window.setInterval(tick, 1000);
    };

    const delayUntilNextSecond = 1000 - (Date.now() % 1000);
    timeoutId = window.setTimeout(startInterval, delayUntilNextSecond);

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [enabled]);

  return now;
}
