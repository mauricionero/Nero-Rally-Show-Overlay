const isPlainObject = (value) => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
);

const mergeSnapshotPayload = (target = {}, source = {}) => {
  const next = isPlainObject(target) ? { ...target } : {};

  Object.entries(isPlainObject(source) ? source : {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      next[key] = [...(Array.isArray(next[key]) ? next[key] : []), ...value];
      return;
    }

    if (isPlainObject(value)) {
      next[key] = mergeSnapshotPayload(next[key], value);
      return;
    }

    next[key] = value;
  });

  return next;
};

export default class WsMessageReceiver {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.recentSnapshotParts = new Map();
    this.snapshotPackages = new Map();
  }

  handleMessage(data) {
    if (!data) return;

    let normalizedData = data;

    if (typeof normalizedData === 'string') {
      try {
        normalizedData = JSON.parse(normalizedData);
      } catch (error) {
        console.warn('[WebSocket] Failed to parse string message payload', error);
        return;
      }
    }

    if (normalizedData?.payload && typeof normalizedData.payload === 'string') {
      try {
        normalizedData = {
          ...normalizedData,
          payload: JSON.parse(normalizedData.payload)
        };
      } catch (error) {
        console.warn('[WebSocket] Failed to parse nested string payload', error);
        return;
      }
    }

    if (normalizedData.snapshotId && normalizedData.section !== 'bundle') {
      const key = [
        normalizedData.messageType || 'update',
        normalizedData.snapshotId,
        normalizedData.section || 'unknown',
        Number.isFinite(normalizedData.partIndex) ? normalizedData.partIndex : 0
      ].join(':');
      const now = Date.now();
      const lastSeenAt = this.recentSnapshotParts.get(key) || 0;

      if (now - lastSeenAt < 15000) {
        return;
      }

      this.recentSnapshotParts.set(key, now);

      if (this.recentSnapshotParts.size > 200) {
        for (const [storedKey, storedAt] of this.recentSnapshotParts.entries()) {
          if (now - storedAt > 30000) {
            this.recentSnapshotParts.delete(storedKey);
          }
        }
      }
    }

    if (
      normalizedData?.packageType === 'snapshot'
      && normalizedData?.snapshotId
      && Number(normalizedData?.totalParts || 0) > 1
    ) {
      const packageKey = [
        normalizedData.messageType || 'update',
        normalizedData.snapshotId
      ].join(':');
      const now = Date.now();
      const existingPackage = this.snapshotPackages.get(packageKey) || {
        receivedAt: now,
        totalParts: Number(normalizedData.totalParts || 0),
        parts: new Map()
      };

      existingPackage.receivedAt = now;
      existingPackage.totalParts = Math.max(
        Number(existingPackage.totalParts || 0),
        Number(normalizedData.totalParts || 0)
      );
      existingPackage.parts.set(
        Number.isFinite(normalizedData.partIndex) ? Number(normalizedData.partIndex) : 0,
        normalizedData
      );
      this.snapshotPackages.set(packageKey, existingPackage);

      if (this.snapshotPackages.size > 50) {
        for (const [storedKey, storedPackage] of this.snapshotPackages.entries()) {
          if (now - Number(storedPackage?.receivedAt || 0) > 60000) {
            this.snapshotPackages.delete(storedKey);
          }
        }
      }

      if (existingPackage.parts.size < existingPackage.totalParts) {
        return;
      }

      const orderedParts = Array.from(existingPackage.parts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, part]) => part);
      const mergedPayload = orderedParts.reduce(
        (acc, part) => mergeSnapshotPayload(acc, part?.payload),
        {}
      );
      this.snapshotPackages.delete(packageKey);

      this.onMessage?.({
        ...orderedParts[orderedParts.length - 1],
        payload: mergedPayload,
        partIndex: 0,
        totalParts: 1
      });
      return;
    }

    this.onMessage?.(normalizedData);
  }
}
