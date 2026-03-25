import { useEffect, useMemo, useRef, useState } from 'react';

const compareValues = (a, b) => {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a ?? '').localeCompare(String(b ?? ''));
};

const resolveStatus = (item, nowMs) => {
  if (item.fixedStatus === 'finished' || item.fixedStatus === 'retired') {
    return item.fixedStatus;
  }

  if (item.endAtMs && nowMs >= item.endAtMs) {
    return 'finished';
  }

  if (item.startAtMs && nowMs >= item.startAtMs) {
    return 'racing';
  }

  if (item.preStartAtMs && nowMs >= item.preStartAtMs) {
    return 'pre_start';
  }

  return item.fixedStatus || 'not_started';
};

const getSortValue = (item, status) => (
  item.sortValues?.[status]
  ?? item.sortValues?.default
  ?? item.sortValue
  ?? Number.MAX_SAFE_INTEGER
);

const buildComparator = (bucketOrder) => (a, b) => {
  const bucketDiff = (bucketOrder[a.currentStatus] ?? Number.MAX_SAFE_INTEGER)
    - (bucketOrder[b.currentStatus] ?? Number.MAX_SAFE_INTEGER);

  if (bucketDiff !== 0) {
    return bucketDiff;
  }

  const sortDiff = compareValues(getSortValue(a, a.currentStatus), getSortValue(b, b.currentStatus));
  if (sortDiff !== 0) {
    return sortDiff;
  }

  return compareValues(a.id, b.id);
};

const findNextBoundaryMs = (item, nowMs) => {
  if (item.fixedStatus === 'finished' || item.fixedStatus === 'retired') {
    return null;
  }

  const candidates = [item.preStartAtMs, item.startAtMs, item.endAtMs]
    .filter((value) => Number.isFinite(value) && value > nowMs)
    .sort((a, b) => a - b);

  return candidates[0] ?? null;
};

export function useScheduledPilotBuckets(items, bucketOrderConfig) {
  const bucketOrderSignature = useMemo(() => (
    JSON.stringify(
      Object.entries(bucketOrderConfig || {}).sort(([a], [b]) => String(a).localeCompare(String(b)))
    )
  ), [bucketOrderConfig]);
  const bucketOrder = useMemo(() => (
    Object.fromEntries(JSON.parse(bucketOrderSignature))
  ), [bucketOrderSignature]);
  const comparator = useMemo(() => buildComparator(bucketOrder), [bucketOrderSignature]);
  const [orderedItems, setOrderedItems] = useState([]);
  const itemsRef = useRef(new Map());
  const timeoutRef = useRef(null);

  useEffect(() => {
    const nowMs = Date.now();
    const nextItems = new Map(
      items.map((item) => [
        item.id,
        {
          ...item,
          currentStatus: resolveStatus(item, nowMs)
        }
      ])
    );

    itemsRef.current = nextItems;
    const nextOrderedItems = [...nextItems.values()].sort(comparator);
    setOrderedItems(nextOrderedItems);
  }, [items, comparator]);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const currentItems = [...itemsRef.current.values()];
    if (currentItems.length === 0) {
      return undefined;
    }

    const nowMs = Date.now();
    const nextBoundaryMs = currentItems.reduce((earliest, item) => {
      const boundaryMs = findNextBoundaryMs(item, nowMs);
      if (!Number.isFinite(boundaryMs)) {
        return earliest;
      }

      if (!Number.isFinite(earliest) || boundaryMs < earliest) {
        return boundaryMs;
      }

      return earliest;
    }, null);

    if (!Number.isFinite(nextBoundaryMs)) {
      return undefined;
    }

    timeoutRef.current = window.setTimeout(() => {
      const boundaryNowMs = Date.now();
      const nextItems = new Map(itemsRef.current);
      let hasStatusChanges = false;

      nextItems.forEach((item, id) => {
        const nextStatus = resolveStatus(item, boundaryNowMs);
        if (nextStatus !== item.currentStatus) {
          nextItems.set(id, {
            ...item,
            currentStatus: nextStatus
          });
          hasStatusChanges = true;
        }
      });

      if (hasStatusChanges) {
        itemsRef.current = nextItems;
        setOrderedItems([...nextItems.values()].sort(comparator));
      } else {
        setOrderedItems((prev) => prev);
      }
    }, Math.max(0, nextBoundaryMs - nowMs));

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [orderedItems, comparator]);

  return orderedItems;
}
