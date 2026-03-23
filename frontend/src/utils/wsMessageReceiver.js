export default class WsMessageReceiver {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.recentSnapshotParts = new Map();
  }

  handleMessage(data) {
    if (!data) return;

    if (data.snapshotId && data.section !== 'bundle') {
      const key = [
        data.messageType || 'update',
        data.snapshotId,
        data.section || 'unknown',
        Number.isFinite(data.partIndex) ? data.partIndex : 0
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

    this.onMessage?.(data);
  }
}
