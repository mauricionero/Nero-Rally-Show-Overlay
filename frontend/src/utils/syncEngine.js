const DEFAULT_FLUSH_INTERVAL_MS = 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5000;
const DEFAULT_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_OWNERSHIP_OBSERVATION_MS = 15000;
const DEFAULT_HEARTBEAT_MISSES_TO_TAKEOVER = 3;

export const SYNC_ROLES = {
  CLIENT: 'client',
  SETUP: 'setup',
  TIMES: 'times',
  OVERLAY: 'overlay',
  MOBILE: 'mobile'
};

export const SYNC_MESSAGE_TYPES = {
  DELTA_BATCH: 'delta-batch',
  OWNERSHIP_HEARTBEAT: 'ownership-heartbeat',
  OWNERSHIP_CLAIM: 'ownership-claim',
  OWNERSHIP_RELEASE: 'ownership-release'
};

export const createSyncInstanceId = () => (
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const isPlainObject = (value) => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
);

const deepMerge = (target = {}, source = {}) => {
  const next = Array.isArray(target) ? [...target] : { ...(target || {}) };

  Object.entries(source || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      next[key] = [...value];
      return;
    }

    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = deepMerge(next[key], value);
      return;
    }

    next[key] = value;
  });

  return next;
};

const normalizeRole = (value) => {
  const role = String(value || '').trim().toLowerCase();
  if (Object.values(SYNC_ROLES).includes(role)) {
    return role;
  }
  return SYNC_ROLES.CLIENT;
};

const normalizeMessageType = (value) => String(value || '').trim();

const normalizeSourceRole = (data = {}) => normalizeRole(
  data?.sourceRole
  || data?.senderRole
  || data?.role
  || data?.source
  || data?.origin
  || data?.clientSource
  || (
    normalizeMessageType(data?.messageType) === 'pilot-telemetry'
      ? SYNC_ROLES.MOBILE
      : SYNC_ROLES.SETUP
  )
);

const TIMING_DOMAINS = new Set([
  'times',
  'arrivalTimes',
  'startTimes',
  'realStartTimes',
  'lapTimes',
  'positions',
  'stagePilots',
  'retiredStages',
  'stageAlerts',
  'stageSos'
]);

const SETUP_DOMAINS = new Set([
  'meta',
  'pilots',
  'categories',
  'stages',
  'mapPlacemarks',
  'cameras',
  'externalMedia',
  'streamConfigs'
]);

const TELEMETRY_DOMAINS = new Set(['pilotTelemetry']);

const getChangeDomains = (changes = {}) => Object.keys(changes || {});

const canReceiveDomain = (recipientRole, sourceRole, domain) => {
  const role = normalizeRole(recipientRole);
  const origin = normalizeRole(sourceRole);
  const normalizedDomain = String(domain || '').trim();

  if (!normalizedDomain) {
    return false;
  }

  if (origin === SYNC_ROLES.SETUP) {
    return true;
  }

  if (origin === SYNC_ROLES.TIMES) {
    return TIMING_DOMAINS.has(normalizedDomain);
  }

  if (origin === SYNC_ROLES.MOBILE) {
    if (role === SYNC_ROLES.SETUP) {
      return TELEMETRY_DOMAINS.has(normalizedDomain) || normalizedDomain === 'stageSos';
    }

    if (role === SYNC_ROLES.TIMES) {
      return normalizedDomain === 'stageSos';
    }

    if (role === SYNC_ROLES.OVERLAY) {
      return TELEMETRY_DOMAINS.has(normalizedDomain);
    }
  }

  return false;
};

const filterChangesForRecipient = (recipientRole, sourceRole, changes = {}) => {
  const accepted = {};

  getChangeDomains(changes).forEach((domain) => {
    if (!canReceiveDomain(recipientRole, sourceRole, domain)) {
      return;
    }

    accepted[domain] = changes[domain];
  });

  return accepted;
};

const isMergeableQueuedDelta = (message = {}) => (
  normalizeMessageType(message?.messageType) === SYNC_MESSAGE_TYPES.DELTA_BATCH
  && String(message?.packageType || 'delta').trim() === 'delta'
  && message?.highPriority !== true
  && message?.priority !== true
  && !String(message?.controlType || '').trim()
  && (!message?.channelType || String(message.channelType).trim() === 'data')
  && isPlainObject(message?.payload)
);

const convertPilotTelemetryMessageToChanges = (message = {}) => {
  const pilotId = String(message?.pilotId || message?.pilotid || '').trim();
  if (!pilotId) {
    return {};
  }

  return {
    pilotTelemetry: {
      [pilotId]: Object.fromEntries(
        Object.entries(message || {}).filter(([key]) => ![
          'messageType',
          'source',
          'sourceRole',
          'sourceInstanceId',
          'instanceId',
          'pilotId',
          'pilotid',
          'timestamp'
        ].includes(key))
      )
    }
  };
};

const convertPayloadMessageToChanges = (message = {}) => {
  const section = String(message?.section || '').trim();
  const payload = isPlainObject(message?.payload) ? message.payload : {};
  const changes = {};

  if (!section) {
    return changes;
  }

  if (section === 'meta') {
    changes.meta = { ...payload };
    return changes;
  }

  if (TIMING_DOMAINS.has(section) || section === 'stageSos') {
    changes[section] = payload[section] ?? payload;
    return changes;
  }

  if (SETUP_DOMAINS.has(section)) {
    if (Array.isArray(payload[section])) {
      changes[section] = {};
      payload[section].forEach((item) => {
        if (item?.id) {
          changes[section][item.id] = item;
        }
      });
      return changes;
    }

    if (isPlainObject(payload[section])) {
      changes[section] = payload[section];
      return changes;
    }

    if (section === 'stages' && isPlainObject(payload.stage)) {
      changes.stages = { [payload.stage.id || message?.stageId || createSyncInstanceId()]: payload.stage };
      return changes;
    }

    if (section === 'mapPlacemarks' && isPlainObject(payload.mapPlacemark)) {
      changes.mapPlacemarks = { [payload.mapPlacemark.id || message?.mapPlacemarkId || createSyncInstanceId()]: payload.mapPlacemark };
      return changes;
    }
  }

  if (section === 'pilotTelemetry') {
    return convertPilotTelemetryMessageToChanges(message);
  }

  if (isPlainObject(payload[section])) {
    changes[section] = payload[section];
    return changes;
  }

  if (Array.isArray(payload[section])) {
    changes[section] = {};
    payload[section].forEach((item) => {
      if (item?.id) {
        changes[section][item.id] = item;
      }
    });
    return changes;
  }

  return changes;
};

const convertMessageToChanges = (message = {}) => {
  const messageType = normalizeMessageType(message?.messageType);

  if (messageType === SYNC_MESSAGE_TYPES.DELTA_BATCH) {
    if (message?.packageType === 'control' && isPlainObject(message?.payload)) {
      return message.payload;
    }

    if (isPlainObject(message?.payload)) {
      return message.payload;
    }

    return isPlainObject(message?.changes) ? message.changes : {};
  }

  if (messageType === 'pilot-telemetry') {
    return convertPilotTelemetryMessageToChanges(message);
  }

  return convertPayloadMessageToChanges(message);
};

export default class SyncEngine {
  constructor(options = {}) {
    this.role = normalizeRole(options.role);
    this.instanceId = String(options.instanceId || createSyncInstanceId());
    this.publish = typeof options.publish === 'function' ? options.publish : null;
    this.onReceive = typeof options.onReceive === 'function' ? options.onReceive : null;
    this.onOwnershipChange = typeof options.onOwnershipChange === 'function' ? options.onOwnershipChange : null;
    this.onSnapshotDue = typeof options.onSnapshotDue === 'function' ? options.onSnapshotDue : null;
    this.onLeaseClaimed = typeof options.onLeaseClaimed === 'function' ? options.onLeaseClaimed : null;
    this.onLeaseReleased = typeof options.onLeaseReleased === 'function' ? options.onLeaseReleased : null;
    this.onQueueFlush = typeof options.onQueueFlush === 'function' ? options.onQueueFlush : null;
    this.flushIntervalMs = Number(options.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS);
    this.heartbeatIntervalMs = Number(options.heartbeatIntervalMs || DEFAULT_HEARTBEAT_INTERVAL_MS);
    this.snapshotIntervalMs = Number(options.snapshotIntervalMs || DEFAULT_SNAPSHOT_INTERVAL_MS);
    this.ownershipObservationMs = Number(options.ownershipObservationMs || DEFAULT_OWNERSHIP_OBSERVATION_MS);
    this.heartbeatMissesToTakeover = Number(options.heartbeatMissesToTakeover || DEFAULT_HEARTBEAT_MISSES_TO_TAKEOVER);

    this.isConnected = false;
    this.queue = [];
    this.flushTimer = null;
    this.flushInProgress = false;
    this.heartbeatTimer = null;
    this.snapshotTimer = null;
    this.ownershipMonitorTimer = null;
    this.ownershipClaimTimer = null;
    this.ownerId = null;
    this.ownerEpoch = 0;
    this.lastOwnerHeartbeatAt = 0;
    this.lastSeenOwnershipAt = 0;
    this.isOwner = false;
  }

  setPublish(publish) {
    this.publish = typeof publish === 'function' ? publish : null;
  }

  setRole(role) {
    this.role = normalizeRole(role);
  }

  setInstanceId(instanceId) {
    this.instanceId = String(instanceId || this.instanceId || createSyncInstanceId());
  }

  setCallbacks(options = {}) {
    this.onReceive = typeof options.onReceive === 'function' ? options.onReceive : this.onReceive;
    this.onOwnershipChange = typeof options.onOwnershipChange === 'function' ? options.onOwnershipChange : this.onOwnershipChange;
    this.onSnapshotDue = typeof options.onSnapshotDue === 'function' ? options.onSnapshotDue : this.onSnapshotDue;
    this.onLeaseClaimed = typeof options.onLeaseClaimed === 'function' ? options.onLeaseClaimed : this.onLeaseClaimed;
    this.onLeaseReleased = typeof options.onLeaseReleased === 'function' ? options.onLeaseReleased : this.onLeaseReleased;
    this.onQueueFlush = typeof options.onQueueFlush === 'function' ? options.onQueueFlush : this.onQueueFlush;
  }

  setConnected(isConnected) {
    this.isConnected = !!isConnected;
    if (!this.isConnected) {
      this.clearTimers();
    }
  }

  clearTimers() {
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.snapshotTimer) {
      window.clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    if (this.ownershipMonitorTimer) {
      window.clearInterval(this.ownershipMonitorTimer);
      this.ownershipMonitorTimer = null;
    }
    if (this.ownershipClaimTimer) {
      window.clearTimeout(this.ownershipClaimTimer);
      this.ownershipClaimTimer = null;
    }
  }

  disconnect() {
    this.setConnected(false);
    this.queue.forEach((item) => {
      item.resolve?.(false);
    });
    this.queue = [];
    this.isOwner = false;
    this.ownerId = null;
    this.ownerEpoch = 0;
    this.lastOwnerHeartbeatAt = 0;
    this.lastSeenOwnershipAt = 0;
    this.onLeaseReleased?.({
      instanceId: this.instanceId,
      timestamp: Date.now()
    });
  }

  connect(options = {}) {
    if (options.role) {
      this.setRole(options.role);
    }

    if (options.instanceId) {
      this.setInstanceId(options.instanceId);
    }

    if (options.publish) {
      this.setPublish(options.publish);
    }

    this.setCallbacks(options);
    this.stopOwnershipMonitoring();
    this.isOwner = false;
    this.ownerId = null;
    this.ownerEpoch = 0;
    this.lastOwnerHeartbeatAt = 0;
    this.lastSeenOwnershipAt = 0;
    this.setConnected(true);
    this.startOwnershipMonitoring();
  }

  enqueue(message = {}, options = {}) {
    const normalizedMessage = message && typeof message === 'object' ? { ...message } : null;
    if (!normalizedMessage) {
      console.error('[SyncEngine] Refused to enqueue invalid message');
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const queueEntry = {
        message: normalizedMessage,
        resolve,
        onSuccess: typeof options.onSuccess === 'function' ? options.onSuccess : null,
        queuedAt: Date.now()
      };

      if (options.priority === true) {
        this.queue.unshift(queueEntry);
      } else {
        this.queue.push(queueEntry);
      }

      if (options.immediate === true) {
        if (this.flushTimer) {
          window.clearTimeout(this.flushTimer);
          this.flushTimer = null;
        }
        void this.flush();
        return;
      }

      this.scheduleFlush();
    });
  }

  scheduleFlush() {
    if (this.flushTimer || !this.isConnected) {
      return;
    }

    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  async flush() {
    if (this.flushInProgress || !this.isConnected || !this.publish || this.queue.length === 0) {
      return false;
    }

    this.flushInProgress = true;
    const pending = this.queue.splice(0, this.queue.length);

    try {
      for (let index = 0; index < pending.length; index += 1) {
        const { message, resolve, onSuccess } = pending[index];
        const messageType = normalizeMessageType(message?.messageType);

        if (
          messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_HEARTBEAT
          || messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_CLAIM
          || messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_RELEASE
        ) {
          onSuccess?.();
          resolve(true);
          continue;
        }

        let mergedEntries = [pending[index]];
        let mergedMessage = message;

        if (isMergeableQueuedDelta(message)) {
          let mergedPayload = deepMerge({}, message.payload);
          let latestTimestamp = Number(message?.timestamp || 0);
          let scanIndex = index + 1;

          while (scanIndex < pending.length) {
            const nextMessage = pending[scanIndex]?.message;
            if (!isMergeableQueuedDelta(nextMessage)) {
              break;
            }

            mergedPayload = deepMerge(mergedPayload, nextMessage.payload);
            latestTimestamp = Math.max(latestTimestamp, Number(nextMessage?.timestamp || 0));
            mergedEntries.push(pending[scanIndex]);
            scanIndex += 1;
          }

          mergedMessage = {
            ...message,
            timestamp: latestTimestamp || Date.now(),
            partIndex: 0,
            totalParts: 1,
            payload: mergedPayload
          };
          index = scanIndex - 1;
        }

        const batch = {
          source: this.role,
          sourceRole: this.role,
          sourceInstanceId: this.instanceId,
          instanceId: this.instanceId,
          timestamp: Date.now(),
          ...mergedMessage
        };

        const published = await this.publish(batch);
        if (!published) {
          console.error('[SyncEngine] Failed to publish batch', {
            role: this.role,
            instanceId: this.instanceId,
            queuedCount: pending.length,
            message: batch
          });
          const remaining = pending.slice(index - mergedEntries.length + 1);
          this.queue = remaining.concat(this.queue);
          return false;
        }

        console.log('[SyncEngine] Published batch', {
          role: this.role,
          instanceId: this.instanceId,
          queuedCount: mergedEntries.length,
          packageType: batch.packageType || 'delta',
          originalMessageType: batch.originalMessageType || batch.messageType,
          section: batch.section || null,
          payloadKeys: Object.keys(batch.payload || batch.changes || {})
        });

        this.onQueueFlush?.({
          batch,
          queuedCount: mergedEntries.length
        });

        mergedEntries.forEach(({ onSuccess: mergedSuccess, resolve: mergedResolve }) => {
          mergedSuccess?.();
          mergedResolve(true);
        });
      }

      return true;
    } catch (error) {
      console.error('[SyncEngine] Flush error', error);
      this.queue = pending.concat(this.queue);
      throw error;
    } finally {
      this.flushInProgress = false;
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  startOwnershipMonitoring() {
    if (this.role !== SYNC_ROLES.SETUP || !this.isConnected) {
      return;
    }

    if (!this.ownershipMonitorTimer) {
      this.ownershipMonitorTimer = window.setInterval(() => {
        if (!this.isConnected || this.role !== SYNC_ROLES.SETUP) {
          return;
        }

        const now = Date.now();
        const heartbeatAge = now - Number(this.lastOwnerHeartbeatAt || 0);
        const takeoverThreshold = this.heartbeatIntervalMs * this.heartbeatMissesToTakeover;

        if (!this.isOwner && this.lastOwnerHeartbeatAt > 0 && heartbeatAge >= takeoverThreshold) {
          void this.claimOwnership('heartbeat-timeout');
        }
      }, Math.max(1000, this.heartbeatIntervalMs));
    }

    if (!this.ownershipClaimTimer) {
      this.ownershipClaimTimer = window.setTimeout(() => {
        this.ownershipClaimTimer = null;
        if (!this.isConnected || this.role !== SYNC_ROLES.SETUP || this.isOwner) {
          return;
        }

        const now = Date.now();
        if (this.lastOwnerHeartbeatAt === 0 || (now - this.lastOwnerHeartbeatAt) >= this.ownershipObservationMs) {
          void this.claimOwnership('observation-timeout');
        }
      }, this.ownershipObservationMs);
    }
  }

  stopOwnershipMonitoring() {
    if (this.ownershipMonitorTimer) {
      window.clearInterval(this.ownershipMonitorTimer);
      this.ownershipMonitorTimer = null;
    }

    if (this.ownershipClaimTimer) {
      window.clearTimeout(this.ownershipClaimTimer);
      this.ownershipClaimTimer = null;
    }

    this.stopHeartbeat();
    this.stopSnapshotTimer();
  }

  startHeartbeat() {
    if (this.heartbeatTimer || !this.isConnected || !this.isOwner) {
      return;
    }

    this.heartbeatTimer = window.setInterval(() => {
      void this.publishOwnershipHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  startSnapshotTimer() {
    if (this.snapshotTimer || !this.isConnected || !this.isOwner || typeof this.onSnapshotDue !== 'function') {
      return;
    }

    console.log('[SyncEngine][snapshot] timer started', {
      instanceId: this.instanceId,
      ownerId: this.ownerId,
      ownerEpoch: this.ownerEpoch,
      intervalMs: this.snapshotIntervalMs
    });

    this.snapshotTimer = window.setInterval(() => {
      if (!this.isConnected || !this.isOwner) {
        return;
      }

      console.log('[SyncEngine][snapshot] due', {
        instanceId: this.instanceId,
        ownerId: this.ownerId,
        ownerEpoch: this.ownerEpoch,
        timestamp: Date.now()
      });

      this.onSnapshotDue?.({
        instanceId: this.instanceId,
        ownerId: this.ownerId,
        ownerEpoch: this.ownerEpoch,
        timestamp: Date.now()
      });
    }, this.snapshotIntervalMs);
  }

  stopSnapshotTimer() {
    if (this.snapshotTimer) {
      window.clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  async claimOwnership(reason = 'manual') {
    if (!this.isConnected || this.role !== SYNC_ROLES.SETUP || !this.publish) {
      return false;
    }

    const now = Date.now();
    this.ownerId = this.instanceId;
    this.ownerEpoch = Math.max(0, Number(this.ownerEpoch || 0)) + 1;
    this.lastOwnerHeartbeatAt = now;
    this.lastSeenOwnershipAt = now;
    this.isOwner = true;
    this.onOwnershipChange?.({
      ownerId: this.ownerId,
      ownerEpoch: this.ownerEpoch,
      hasOwnership: true,
      reason
    });
    this.onLeaseClaimed?.({
      ownerId: this.ownerId,
      ownerEpoch: this.ownerEpoch,
      reason,
      timestamp: now
    });

    this.stopHeartbeat();
    this.stopSnapshotTimer();
    this.startHeartbeat();
    this.startSnapshotTimer();
    return this.publishOwnershipHeartbeat();
  }

  async publishOwnershipHeartbeat() {
    if (!this.isConnected || !this.isOwner || !this.publish) {
      return false;
    }

    const timestamp = Date.now();
    const published = await this.publish({
      messageType: SYNC_MESSAGE_TYPES.OWNERSHIP_HEARTBEAT,
      source: this.role,
      sourceRole: this.role,
      sourceInstanceId: this.instanceId,
      instanceId: this.instanceId,
      ownerId: this.ownerId || this.instanceId,
      ownerEpoch: this.ownerEpoch,
      timestamp
    });

    if (published) {
      this.lastOwnerHeartbeatAt = timestamp;
      this.lastSeenOwnershipAt = timestamp;
      return published;
    }

    this.isOwner = false;
    this.stopHeartbeat();
    this.stopSnapshotTimer();
    return false;
  }

  releaseOwnership(reason = 'disconnect') {
    if (!this.isConnected || !this.isOwner) {
      this.isOwner = false;
      this.stopHeartbeat();
      this.stopSnapshotTimer();
      return false;
    }

    const timestamp = Date.now();
    this.isOwner = false;
    this.stopHeartbeat();
    this.stopSnapshotTimer();
    this.onOwnershipChange?.({
      ownerId: null,
      ownerEpoch: this.ownerEpoch,
      hasOwnership: false,
      reason
    });
    this.onLeaseReleased?.({
      ownerId: this.ownerId,
      ownerEpoch: this.ownerEpoch,
      reason,
      timestamp
    });

    return true;
  }

  observeOwnership(message = {}) {
    const ownerId = String(message?.ownerId || message?.instanceId || message?.sourceInstanceId || '').trim();
    const ownerEpoch = Number(message?.ownerEpoch || 0);
    const timestamp = Number(message?.timestamp || Date.now());

    if (!ownerId) {
      return;
    }

    if (ownerEpoch < this.ownerEpoch) {
      return;
    }

    this.ownerId = ownerId;
    this.ownerEpoch = Math.max(this.ownerEpoch, ownerEpoch);
    this.lastOwnerHeartbeatAt = timestamp;
    this.lastSeenOwnershipAt = timestamp;
    this.isOwner = ownerId === this.instanceId;

    this.onOwnershipChange?.({
      ownerId: this.ownerId,
      ownerEpoch: this.ownerEpoch,
      hasOwnership: this.isOwner,
      reason: message?.messageType || 'ownership-observed'
    });

    if (this.isOwner) {
      this.startHeartbeat();
      this.startSnapshotTimer();
    } else {
      this.stopHeartbeat();
      this.stopSnapshotTimer();
    }
  }

  normalizeIncoming(data = {}) {
    let normalized = data;

    if (typeof normalized === 'string') {
      try {
        normalized = JSON.parse(normalized);
      } catch (error) {
        return null;
      }
    }

    if (!normalized || typeof normalized !== 'object') {
      return null;
    }

    console.log('[SyncEngine] Incoming message', normalized);

    if (normalized?.payload && typeof normalized.payload === 'string') {
      try {
        normalized = {
          ...normalized,
          payload: JSON.parse(normalized.payload)
        };
      } catch (error) {
        return null;
      }
    }

    const messageType = normalizeMessageType(normalized.messageType);
    const sourceRole = normalizeSourceRole(normalized);
    const sourceInstanceId = String(
      normalized.sourceInstanceId
      || normalized.instanceId
      || normalized.clientInstanceId
      || ''
    ).trim();

    if (sourceInstanceId && sourceInstanceId === this.instanceId) {
      return null;
    }

    if (messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_HEARTBEAT || messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_CLAIM) {
      this.observeOwnership(normalized);
      return null;
    }

    if (messageType === SYNC_MESSAGE_TYPES.OWNERSHIP_RELEASE) {
      if (String(normalized.ownerId || '') === this.ownerId) {
        this.lastOwnerHeartbeatAt = 0;
      }
      if (String(normalized.ownerId || '') === this.instanceId) {
        this.isOwner = false;
        this.stopHeartbeat();
        this.stopSnapshotTimer();
      }
      return null;
    }

    if (messageType === SYNC_MESSAGE_TYPES.DELTA_BATCH && normalized.packageType === 'control') {
      return {
        messageType: SYNC_MESSAGE_TYPES.DELTA_BATCH,
        source: sourceRole,
        sourceRole,
        sourceInstanceId,
        instanceId: normalized.instanceId || sourceInstanceId || null,
        channelType: normalized.channelType || null,
        channelName: normalized.channelName || null,
        ownerId: normalized.ownerId || null,
        ownerEpoch: Number(normalized.ownerEpoch || 0),
        packageType: 'control',
        originalMessageType: normalized.originalMessageType || messageType || SYNC_MESSAGE_TYPES.DELTA_BATCH,
        controlType: normalized.controlType || null,
        notificationId: normalized.notificationId || null,
        batchId: normalized.batchId || null,
        snapshotId: normalized.snapshotId || null,
        partIndex: Number.isFinite(normalized.partIndex) ? Number(normalized.partIndex) : 0,
        totalParts: Number.isFinite(normalized.totalParts) ? Number(normalized.totalParts) : 1,
        highPriority: normalized.highPriority === true,
        priority: normalized.priority === true,
        timestamp: Number(normalized.timestamp || Date.now()),
        payload: isPlainObject(normalized.payload) ? normalized.payload : {},
        changes: isPlainObject(normalized.payload) ? normalized.payload : {}
      };
    }

    let changes = convertMessageToChanges(normalized);
    if (Object.keys(changes).length === 0) {
      console.log('[SyncEngine] Incoming message ignored after normalization', {
        messageType,
        sourceRole,
        sourceInstanceId
      });
      return {
        ...normalized,
        sourceRole,
        sourceInstanceId,
        packageType: normalized.packageType || null,
        originalMessageType: normalized.originalMessageType || null,
        payload: normalized.payload || null
      };
    }

    changes = filterChangesForRecipient(this.role, sourceRole, changes);
    if (Object.keys(changes).length === 0) {
      console.log('[SyncEngine] Incoming message filtered out by permissions', {
        messageType,
        recipientRole: this.role,
        sourceRole,
        sourceInstanceId
      });
      return null;
    }

    console.log('[SyncEngine] Incoming message accepted', {
      messageType,
      recipientRole: this.role,
      sourceRole,
      sourceInstanceId,
      changeDomains: Object.keys(changes)
    });

    return {
      messageType: SYNC_MESSAGE_TYPES.DELTA_BATCH,
      source: sourceRole,
      sourceRole,
      sourceInstanceId,
      instanceId: normalized.instanceId || sourceInstanceId || null,
      channelType: normalized.channelType || null,
      channelName: normalized.channelName || null,
      ownerId: normalized.ownerId || null,
      ownerEpoch: Number(normalized.ownerEpoch || 0),
      packageType: normalized.packageType || 'delta',
      originalMessageType: normalized.originalMessageType || messageType || SYNC_MESSAGE_TYPES.DELTA_BATCH,
      controlType: normalized.controlType || null,
      notificationId: normalized.notificationId || null,
      batchId: normalized.batchId || null,
      snapshotId: normalized.snapshotId || null,
      partIndex: Number.isFinite(normalized.partIndex) ? Number(normalized.partIndex) : 0,
      totalParts: Number.isFinite(normalized.totalParts) ? Number(normalized.totalParts) : 1,
      highPriority: normalized.highPriority === true,
      priority: normalized.priority === true,
      timestamp: Number(normalized.timestamp || Date.now()),
      payload: normalized.payload || changes,
      changes
    };
  }
}
