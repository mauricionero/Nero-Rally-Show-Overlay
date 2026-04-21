import { isConnectionDebugEnabled, isSyncDebugEnabled, isTelemetryDebugEnabled } from '../debugFlags.js';

/**
 * SyncInboundService owns inbound message routing decisions.
 *
 * It does not mutate React state directly. Instead, it decides:
 * - whether a message should be treated as snapshot/control/delta/legacy
 * - when snapshot bootstrap state should advance
 * - which callback should receive the normalized message next
 *
 * This keeps the "what kind of inbound message is this?" logic out of
 * RallyContext while still letting RallyContext own the actual state writes.
 */
export class SyncInboundService {
  constructor({
    syncMessageTypes,
    isPlainObject,
    normalizeMessageSource,
    normalizePilotId,
    trustedPilotTelemetrySources
  }) {
    this.syncMessageTypes = syncMessageTypes;
    this.isPlainObject = isPlainObject;
    this.normalizeMessageSource = normalizeMessageSource;
    this.normalizePilotId = normalizePilotId;
    this.trustedPilotTelemetrySources = trustedPilotTelemetrySources;
  }

  handleProviderMessage(data, context = {}) {
    const {
      role,
      setWsSyncState,
      setLatestSnapshotVersion,
      setWsLatestSnapshotAt,
      setWsHasSnapshotBootstrap,
      setWsLastSnapshotReceivedAt,
      setWsDataIsCurrent,
      wsMessageReceiver
    } = context;

    if (
      data?.channelType === 'snapshots'
      && data?.messageType === this.syncMessageTypes.DELTA_BATCH
      && data?.packageType === 'snapshot'
    ) {
      setWsSyncState?.('syncing_snapshot');
      const snapshotTimestamp = Number(data?.timestamp || Date.now());
      const totalParts = Math.max(1, Number(data?.totalParts || 1));
      const partIndex = Math.max(0, Number(data?.partIndex || 0));
      const snapshotVersion = Number(data?.snapshotVersion || 0);

      if (snapshotVersion > 0) {
        setLatestSnapshotVersion?.((prev) => Math.max(Number(prev || 0), snapshotVersion));
      }

      setWsLatestSnapshotAt?.(snapshotTimestamp);

      if (partIndex + 1 >= totalParts) {
        setWsHasSnapshotBootstrap?.(true);
        setWsLastSnapshotReceivedAt?.(snapshotTimestamp);
        setWsSyncState?.('current');
        if (role !== 'setup') {
          setWsDataIsCurrent?.(true);
        }
      }

      if (isConnectionDebugEnabled()) {
        console.log('[SyncInbound][snapshot][provider]', {
          role,
          partIndex,
          totalParts,
          snapshotVersion,
          snapshotTimestamp
        });
      }
    }

    wsMessageReceiver?.handleMessage(data);
  }

  routeNormalizedIncoming(data, context = {}) {
    const {
      applyDeltaBatchControl,
      applyDeltaBatchChanges,
      applyLegacyIncomingData
    } = context;

    if (!data) {
      return;
    }

    const deltaBatchPayload = this.isPlainObject(data?.payload)
      ? data.payload
      : (this.isPlainObject(data?.changes) ? data.changes : null);

    if (data?.messageType === this.syncMessageTypes.DELTA_BATCH && this.isPlainObject(deltaBatchPayload)) {
      if (data?.packageType === 'control' && applyDeltaBatchControl?.(data)) {
        if (isSyncDebugEnabled()) {
          console.log('[SyncInbound][control][handled]', {
            controlType: String(data?.controlType || '').trim() || null
          });
        }
        return;
      }

      if (isSyncDebugEnabled()) {
        console.log('[SyncInbound][delta][apply]', {
          packageType: String(data?.packageType || 'delta').trim(),
          domains: Object.keys(deltaBatchPayload)
        });
      }
      applyDeltaBatchChanges?.(deltaBatchPayload, data);
      return;
    }

    if (isSyncDebugEnabled()) {
      console.log('[SyncInbound][legacy][apply]', {
        messageType: String(data?.messageType || '').trim() || null,
        section: String(data?.section || '').trim() || null
      });
    }
    applyLegacyIncomingData?.(data);
  }

  shouldIgnoreAndroidPayload(data) {
    const payload = data?.payload && typeof data.payload === 'object' ? data.payload : data;
    const messageSource = this.normalizeMessageSource(
      payload?.source
      || payload?.origin
      || payload?.clientSource
      || data?.source
      || data?.origin
      || data?.clientSource
    );
    const hasArrivalTimes = (
      data?.section === 'arrivalTimes'
      || (payload && typeof payload === 'object' && payload.arrivalTimes && typeof payload.arrivalTimes === 'object')
    );

    if (
      (messageSource === 'android-app' || messageSource === 'win-telemetry')
      && payload?.messageType !== 'pilot-telemetry'
      && data?.section !== 'pilotTelemetry'
      && data?.section !== 'stageSos'
      && !hasArrivalTimes
    ) {
      if (isTelemetryDebugEnabled()) {
        console.log('[SyncInbound][telemetry][ignore-android-non-telemetry]', {
          messageType: payload?.messageType || null,
          section: data?.section || null
        });
      }
      return true;
    }

    return false;
  }

  validatePilotTelemetrySource(data) {
    const pilotId = this.normalizePilotId(data?.pilotId || data?.pilotid || null);
    const telemetrySource = this.normalizeMessageSource(
      data?.source
      || data?.origin
      || data?.clientSource
    );

    if (telemetrySource && !this.trustedPilotTelemetrySources.has(telemetrySource)) {
      if (isTelemetryDebugEnabled()) {
        console.log('[SyncInbound][telemetry][ignore-untrusted-source]', {
          pilotId,
          source: telemetrySource
        });
      }
      return {
        accepted: false,
        pilotId,
        source: telemetrySource
      };
    }

    return {
      accepted: true,
      pilotId,
      source: telemetrySource
    };
  }
}

export default SyncInboundService;
