import { useEffect, useState } from 'react';

export function useSecondAlignedClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
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
  }, []);

  return now;
}
