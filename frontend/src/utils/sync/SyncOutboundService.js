import { isOutboundDebugEnabled } from '../debugFlags.js';
import { buildSyncPackageParts } from './syncMessageBuilder.js';

/**
 * SyncOutboundService owns one responsibility: turn normalized change maps into
 * outbound sync packages and hand them to either the high-priority direct
 * publisher or the normal queued publisher.
 *
 * It does not decide *what* changed. RallyContext still decides that.
 * It only decides *how* those already-normalized changes become concrete
 * outbound packages.
 */
export class SyncOutboundService {
  constructor({
    createPackageId,
    getNextLogicalTimestamp,
    getSourceMetadata,
    deltaMessageType,
    maxBytes,
    normalizePilotId
  }) {
    this.createPackageId = createPackageId;
    this.getNextLogicalTimestamp = getNextLogicalTimestamp;
    this.getSourceMetadata = typeof getSourceMetadata === 'function'
      ? getSourceMetadata
      : (() => ({}));
    this.deltaMessageType = deltaMessageType;
    this.maxBytes = maxBytes;
    this.normalizePilotId = typeof normalizePilotId === 'function'
      ? normalizePilotId
      : ((pilotId) => String(pilotId || '').trim());
    this.provider = null;
    this.syncEngine = null;
  }

  setTransport({ provider, syncEngine }) {
    this.provider = provider || null;
    this.syncEngine = syncEngine || null;
  }

  buildSourceMetadata() {
    const sourceMetadata = this.getSourceMetadata();
    return sourceMetadata && typeof sourceMetadata === 'object'
      ? sourceMetadata
      : {};
  }

  async publishChanges(changes = {}, options = {}) {
    if (!this.provider?.isConnected || !this.syncEngine || !changes || Object.keys(changes).length === 0) {
      return null;
    }

    const packageType = options.packageType === 'snapshot' ? 'snapshot' : 'delta';
    const messageTimestamp = this.getNextLogicalTimestamp();
    const packageId = this.createPackageId(packageType);
    const isHighPriority = options.highPriority === true;
    const packageParts = buildSyncPackageParts({
      changes,
      packageType,
      timestamp: messageTimestamp,
      packageId,
      highPriority: isHighPriority,
      extraMeta: options.extraMeta,
      deltaMessageType: this.deltaMessageType,
      maxBytes: this.maxBytes
    });

    if (packageParts.length === 0) {
      return null;
    }

    if (isOutboundDebugEnabled()) {
      console.log('[SyncOutbound][build][package]', {
        packageType,
        highPriority: isHighPriority,
        parts: packageParts.length,
        domains: Object.keys(changes || {})
      });
    }

    if (isHighPriority) {
      const published = await this.provider.publish({
        ...this.buildSourceMetadata(),
        ...packageParts[0]
      });
      if (!published) {
        return null;
      }

      if (isOutboundDebugEnabled()) {
        console.log('[SyncOutbound][TX][priority][single]', {
          packageType,
          parts: 1,
          domains: Object.keys(changes || {})
        });
      }

      return {
        packageId,
        timestamp: messageTimestamp,
        totalParts: 1,
        packageType,
        highPriority: true
      };
    }

    await Promise.all(packageParts.map((message) => this.syncEngine.enqueue(message)));

    if (isOutboundDebugEnabled()) {
      console.log('[SyncOutbound][queue][deferred]', {
        packageType,
        parts: packageParts.length,
        domains: Object.keys(changes || {})
      });
    }

    return {
      packageId,
      timestamp: messageTimestamp,
      totalParts: packageParts.length,
      packageType,
      highPriority: false
    };
  }

  async publishControl(controlType, changes = {}, extraMeta = {}) {
    const normalizedControlType = String(controlType || '').trim();
    if (!this.provider?.isConnected || !normalizedControlType) {
      return false;
    }

    const message = {
      messageType: this.deltaMessageType,
      packageType: 'control',
      controlType: normalizedControlType,
      timestamp: this.getNextLogicalTimestamp(),
      payload: changes && typeof changes === 'object' && !Array.isArray(changes) ? changes : {},
      ...this.buildSourceMetadata(),
      ...(extraMeta && typeof extraMeta === 'object' && !Array.isArray(extraMeta) ? extraMeta : {})
    };

    if (isOutboundDebugEnabled()) {
      console.log('[SyncOutbound][TX][control]', {
        controlType: normalizedControlType,
        payloadKeys: Object.keys(message.payload || {})
      });
    }

    return this.provider.publish(message);
  }

  async publishPilotTelemetry(pilotId, telemetry = {}) {
    const normalizedPilotId = this.normalizePilotId(pilotId);
    if (!normalizedPilotId || !telemetry || typeof telemetry !== 'object' || Array.isArray(telemetry)) {
      return null;
    }

    return this.publishChanges({
      pilotTelemetry: {
        [normalizedPilotId]: telemetry
      }
    }, {
      packageType: 'delta'
    });
  }
}

export default SyncOutboundService;
