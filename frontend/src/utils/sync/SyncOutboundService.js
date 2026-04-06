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
    deltaMessageType,
    maxBytes
  }) {
    this.createPackageId = createPackageId;
    this.getNextLogicalTimestamp = getNextLogicalTimestamp;
    this.deltaMessageType = deltaMessageType;
    this.maxBytes = maxBytes;
    this.provider = null;
    this.syncEngine = null;
  }

  setTransport({ provider, syncEngine }) {
    this.provider = provider || null;
    this.syncEngine = syncEngine || null;
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
      console.debug('[SyncOutbound][build][package]', {
        packageType,
        highPriority: isHighPriority,
        parts: packageParts.length,
        domains: Object.keys(changes || {})
      });
    }

    if (isHighPriority) {
      const published = await this.provider.publish(packageParts[0]);
      if (!published) {
        return null;
      }

      if (isOutboundDebugEnabled()) {
        console.debug('[SyncOutbound][TX][priority][single]', {
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
      console.debug('[SyncOutbound][queue][deferred]', {
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
}

export default SyncOutboundService;
