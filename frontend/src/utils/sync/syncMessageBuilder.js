/**
 * Sync message builder utilities.
 *
 * This file is intentionally pure and transport-agnostic:
 * - no websocket state
 * - no React state
 * - no publishing side effects
 *
 * It only answers one question:
 * "Given a normalized change map, how should it be split into concrete
 * outbound package parts under the current size budget?"
 */
const DEFAULT_SYNC_MESSAGE_MAX_BYTES = 60000;

const isPlainObject = (value) => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
);

const measureJsonSize = (value) => {
  try {
    return JSON.stringify(value).length;
  } catch (error) {
    return Number.MAX_SAFE_INTEGER;
  }
};

const splitChangeValueByApproximateSize = (domain, value, maxBytes = DEFAULT_SYNC_MESSAGE_MAX_BYTES) => {
  const wrappedValue = { [domain]: value };
  if (measureJsonSize(wrappedValue) <= maxBytes) {
    return [wrappedValue];
  }

  if (domain === 'timingByStage' && isPlainObject(value)) {
    const stageChunks = [];

    Object.entries(value).forEach(([stageId, stageValue]) => {
      const stageWrappedValue = { timingByStage: { [stageId]: stageValue } };
      if (measureJsonSize(stageWrappedValue) <= maxBytes) {
        stageChunks.push(stageWrappedValue);
        return;
      }

      if (!isPlainObject(stageValue)) {
        stageChunks.push(stageWrappedValue);
        return;
      }

      let currentStageChunk = {};

      Object.entries(stageValue).forEach(([pilotId, pilotStageValue]) => {
        const tentativeStageChunk = {
          ...currentStageChunk,
          [pilotId]: pilotStageValue
        };

        if (
          Object.keys(currentStageChunk).length > 0
          && measureJsonSize({ timingByStage: { [stageId]: tentativeStageChunk } }) > maxBytes
        ) {
          stageChunks.push({ timingByStage: { [stageId]: currentStageChunk } });
          currentStageChunk = { [pilotId]: pilotStageValue };
          return;
        }

        currentStageChunk = tentativeStageChunk;
      });

      if (Object.keys(currentStageChunk).length > 0) {
        stageChunks.push({ timingByStage: { [stageId]: currentStageChunk } });
      }
    });

    return stageChunks;
  }

  if (Array.isArray(value)) {
    const chunks = [];
    let currentChunk = [];

    value.forEach((item) => {
      const tentativeChunk = [...currentChunk, item];
      if (currentChunk.length > 0 && measureJsonSize({ [domain]: tentativeChunk }) > maxBytes) {
        chunks.push({ [domain]: currentChunk });
        currentChunk = [item];
        return;
      }

      currentChunk = tentativeChunk;
    });

    if (currentChunk.length > 0) {
      chunks.push({ [domain]: currentChunk });
    }

    return chunks;
  }

  if (isPlainObject(value)) {
    const chunks = [];
    let currentChunk = {};

    Object.entries(value).forEach(([key, entryValue]) => {
      const tentativeChunk = {
        ...currentChunk,
        [key]: entryValue
      };

      if (Object.keys(currentChunk).length > 0 && measureJsonSize({ [domain]: tentativeChunk }) > maxBytes) {
        chunks.push({ [domain]: currentChunk });
        currentChunk = { [key]: entryValue };
        return;
      }

      currentChunk = tentativeChunk;
    });

    if (Object.keys(currentChunk).length > 0) {
      chunks.push({ [domain]: currentChunk });
    }

    return chunks;
  }

  return [wrappedValue];
};

export const chunkChangesByApproximateSize = (changes = {}, maxBytes = DEFAULT_SYNC_MESSAGE_MAX_BYTES) => {
  const safeChanges = isPlainObject(changes) ? changes : {};
  const changeDomains = Object.keys(safeChanges);

  if (changeDomains.length === 0) {
    return [];
  }

  if (measureJsonSize(safeChanges) <= maxBytes) {
    return [safeChanges];
  }

  const domainChunks = changeDomains.flatMap((domain) => (
    splitChangeValueByApproximateSize(domain, safeChanges[domain], maxBytes)
  ));

  const chunks = [];
  let currentChunk = {};

  domainChunks.forEach((domainChunk) => {
    const [domain] = Object.keys(domainChunk);
    const currentHasSameDomain = Object.prototype.hasOwnProperty.call(currentChunk, domain);
    const tentativeChunk = currentHasSameDomain
      ? null
      : {
          ...currentChunk,
          ...domainChunk
        };

    if (
      Object.keys(currentChunk).length > 0
      && (
        currentHasSameDomain
        || measureJsonSize(tentativeChunk) > maxBytes
      )
    ) {
      chunks.push(currentChunk);
      currentChunk = { ...domainChunk };
      return;
    }

    currentChunk = tentativeChunk || { ...domainChunk };
  });

  if (Object.keys(currentChunk).length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

export const buildSyncPackageParts = ({
  changes = {},
  packageType = 'delta',
  timestamp,
  packageId,
  highPriority = false,
  extraMeta = {},
  deltaMessageType = 'delta-batch',
  maxBytes = DEFAULT_SYNC_MESSAGE_MAX_BYTES
} = {}) => {
  if (!isPlainObject(changes) || Object.keys(changes).length === 0) {
    return [];
  }

  const normalizedPackageType = packageType === 'snapshot' ? 'snapshot' : 'delta';
  const chunks = highPriority ? [changes] : chunkChangesByApproximateSize(changes, maxBytes);

  if (chunks.length === 0) {
    return [];
  }

  const baseMessage = {
    messageType: deltaMessageType,
    packageType: normalizedPackageType,
    ...(normalizedPackageType === 'snapshot' ? { originalMessageType: 'full-snapshot' } : {}),
    timestamp,
    ...(highPriority ? {
      highPriority: true,
      priority: true,
      channelType: 'priority'
    } : {}),
    ...(isPlainObject(extraMeta) ? extraMeta : {})
  };

  return chunks.map((payload, partIndex) => ({
    ...baseMessage,
    ...(normalizedPackageType === 'snapshot' ? { snapshotId: packageId } : { batchId: packageId }),
    partIndex,
    totalParts: chunks.length,
    payload
  }));
};

export { DEFAULT_SYNC_MESSAGE_MAX_BYTES };
