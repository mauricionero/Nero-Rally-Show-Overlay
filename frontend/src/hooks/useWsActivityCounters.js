import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Tracks websocket activity in rolling 1-second and 60-second buckets.
 *
 * This keeps the LED/status UI logic out of individual pages so Setup, Times,
 * and Overlay all measure traffic the same way. The hook is intentionally
 * presentation-agnostic: it only exposes counters and a coarse "now" timestamp
 * for age calculations.
 */
export const useWsActivityCounters = ({
  enabled = true,
  wsReceivedPulse,
  wsSentPulse,
  alertThreshold = 100
} = {}) => {
  const [connectionNow, setConnectionNow] = useState(() => Date.now());
  const [messagesLastMinute, setMessagesLastMinute] = useState(0);
  const [messagesThisSecond, setMessagesThisSecond] = useState(0);
  const [receivedMessagesLastMinute, setReceivedMessagesLastMinute] = useState(0);
  const [receivedMessagesThisSecond, setReceivedMessagesThisSecond] = useState(0);
  const [sentMessagesLastMinute, setSentMessagesLastMinute] = useState(0);
  const [sentMessagesThisSecond, setSentMessagesThisSecond] = useState(0);
  const receivedMessageBucketsRef = useRef(new Array(60).fill(0));
  const sentMessageBucketsRef = useRef(new Array(60).fill(0));
  const messageBucketIndexRef = useRef(0);
  const receivedMessageBucketTotalRef = useRef(0);
  const sentMessageBucketTotalRef = useRef(0);
  const messageSecondAlertRef = useRef(false);

  const syncMessageCounters = useCallback(() => {
    const bucketIndex = messageBucketIndexRef.current;
    const receivedThisSecondValue = receivedMessageBucketsRef.current[bucketIndex] || 0;
    const sentThisSecondValue = sentMessageBucketsRef.current[bucketIndex] || 0;
    const totalLastMinuteValue = receivedMessageBucketTotalRef.current + sentMessageBucketTotalRef.current;
    const totalThisSecondValue = receivedThisSecondValue + sentThisSecondValue;

    setReceivedMessagesLastMinute(receivedMessageBucketTotalRef.current);
    setReceivedMessagesThisSecond(receivedThisSecondValue);
    setSentMessagesLastMinute(sentMessageBucketTotalRef.current);
    setSentMessagesThisSecond(sentThisSecondValue);
    setMessagesLastMinute(totalLastMinuteValue);
    setMessagesThisSecond(totalThisSecondValue);

    if (!messageSecondAlertRef.current && totalThisSecondValue >= alertThreshold) {
      messageSecondAlertRef.current = true;
      toast.error(
        <span className="text-white">
          Too many messages in 1 second:{' '}
          <strong className="text-red-400">{totalThisSecondValue}</strong>
        </span>
      );
    }
  }, [alertThreshold]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const interval = window.setInterval(() => setConnectionNow(Date.now()), 3000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const tick = () => {
      const len = receivedMessageBucketsRef.current.length;
      const currentIndex = messageBucketIndexRef.current;
      const nextIndex = (currentIndex + 1) % len;
      const removedReceived = receivedMessageBucketsRef.current[nextIndex];
      const removedSent = sentMessageBucketsRef.current[nextIndex];

      if (removedReceived) {
        receivedMessageBucketTotalRef.current -= removedReceived;
      }

      if (removedSent) {
        sentMessageBucketTotalRef.current -= removedSent;
      }

      receivedMessageBucketsRef.current[nextIndex] = 0;
      sentMessageBucketsRef.current[nextIndex] = 0;
      messageBucketIndexRef.current = nextIndex;
      messageSecondAlertRef.current = false;
      syncMessageCounters();
    };

    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [enabled, syncMessageCounters]);

  useEffect(() => {
    if (!wsReceivedPulse) {
      return;
    }

    const index = messageBucketIndexRef.current;
    receivedMessageBucketsRef.current[index] += 1;
    receivedMessageBucketTotalRef.current += 1;
    syncMessageCounters();
  }, [syncMessageCounters, wsReceivedPulse]);

  useEffect(() => {
    if (!wsSentPulse) {
      return;
    }

    const index = messageBucketIndexRef.current;
    sentMessageBucketsRef.current[index] += 1;
    sentMessageBucketTotalRef.current += 1;
    syncMessageCounters();
  }, [syncMessageCounters, wsSentPulse]);

  return {
    connectionNow,
    messagesLastMinute,
    messagesThisSecond,
    receivedMessagesLastMinute,
    receivedMessagesThisSecond,
    sentMessagesLastMinute,
    sentMessagesThisSecond
  };
};

export default useWsActivityCounters;
