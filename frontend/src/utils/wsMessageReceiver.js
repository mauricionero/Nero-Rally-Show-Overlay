export default class WsMessageReceiver {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.recentSnapshotParts = new Map();
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

    this.onMessage?.(normalizedData);
  }
}
