/**
 * WebSocket Provider - Ably Only (Fully Frontend)
 * 
 * Ably allows direct client-side publishing, making it perfect for
 * a fully frontend application.
 * 
 * Key format: 1-{channelId} (keeping prefix for future extensibility)
 * 
 * Channel layout:
 * - rally-data:{channelId}
 * - rally-snapshots:{channelId}
 * - rally-telemetry:{channelId}
 * - rally-priority:{channelId}
 */

import Ably from 'ably';
import { isHeartbeatDebugEnabled, isTransportDebugEnabled } from './debugFlags.js';
import SyncConnectionService from './sync/SyncConnectionService.js';

// Provider identifier (keeping for future extensibility)
export const PROVIDER_ID = '1';
export const PROVIDER_NAME = 'Ably';

/**
 * Generate a random channel key
 * Format: 1-{randomId}
 */
export const generateChannelKey = () => {
  const randomId = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${PROVIDER_ID}-${randomId}`;
};

/**
 * Parse a channel key to extract channel ID
 */
export const parseChannelKey = (fullKey) => {
  if (!fullKey || !fullKey.includes('-')) {
    return { valid: false, channelId: null };
  }
  const [prefix, ...rest] = fullKey.split('-');
  const channelId = rest.join('-');
  
  // Validate prefix
  if (prefix !== PROVIDER_ID) {
    return { valid: false, channelId: null };
  }
  
  return { valid: true, channelId };
};

const normalizeIncomingEnvelope = (data, channelType, channelName) => {
  let normalizedData = data;

  if (typeof normalizedData === 'string') {
    try {
      normalizedData = JSON.parse(normalizedData);
    } catch (error) {
      return {
        raw: data,
        channelType,
        channelName
      };
    }
  }

  if (normalizedData && typeof normalizedData === 'object' && !Array.isArray(normalizedData)) {
    return {
      ...normalizedData,
      channelType,
      channelName
    };
  }

  return {
    value: normalizedData,
    channelType,
    channelName
  };
};

const getHistoryMessageData = (message) => {
  const data = message?.data;

  if (!data || typeof data !== 'string') {
    return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
  }

  try {
    const parsed = JSON.parse(data);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (error) {
    return {};
  }
};

const getLogChannelLabel = (channelType) => {
  switch (String(channelType || '').trim()) {
    case 'snapshots':
      return 'snapshots';
    case 'telemetry':
      return 'telemetry';
    case 'priority':
      return 'priority';
    default:
      return 'data';
  }
};

const getLogMessageLabel = (data = {}) => {
  const messageType = String(data?.messageType || '').trim();
  const packageType = String(data?.packageType || '').trim();
  const controlType = String(data?.controlType || '').trim();
  const originalMessageType = String(data?.originalMessageType || '').trim();
  const snapshotKind = String(data?.snapshotKind || '').trim();
  const payload = data?.payload && typeof data.payload === 'object' ? data.payload : null;
  const payloadKeys = payload ? Object.keys(payload) : [];

  if (messageType === 'ownership-heartbeat') {
    return 'heartbeat';
  }

  if (messageType === 'ownership-claim') {
    return 'ownership-claim';
  }

  if (messageType === 'ownership-release') {
    return 'ownership-release';
  }

  if (messageType === 'pilot-telemetry' || payloadKeys.includes('pilotTelemetry')) {
    return 'telemetry';
  }

  if (packageType === 'control' && controlType) {
    return controlType;
  }

  if (packageType === 'snapshot' || originalMessageType === 'full-snapshot') {
    return snapshotKind || 'snapshot';
  }

  if (payloadKeys.includes('stageSos')) {
    return 'sos';
  }

  if (payloadKeys.length === 1) {
    return String(payloadKeys[0] || 'data');
  }

  if (messageType === 'delta-batch') {
    return 'data';
  }

  return messageType || 'data';
};

const buildWebSocketLogPrefix = (direction, eventName, channelType, data, namespace = 'WebSocket') => {
  const emoji = direction === 'send'
    ? '⬆️'
    : direction === 'echo'
      ? '🪞'
      : '⬇️';
  return `[${namespace}][${emoji}][${eventName}][${getLogChannelLabel(channelType)}][${getLogMessageLabel(data)}]`;
};

/**
 * WebSocket Provider Class - Ably Implementation
 */
class WebSocketProvider {
  constructor() {
    this.client = null;
    this.channel = null;
    this.dataChannel = null;
    this.snapshotChannel = null;
    this.telemetryChannel = null;
    this.priorityChannel = null;
    this.channelId = null;
    this.channelNames = {
      data: null,
      snapshots: null,
      telemetry: null,
      priority: null
    };
    this.onMessageCallback = null;
    this.onStatusCallback = null;
    this.onReceiveActivityCallback = null;
    this.onSendActivityCallback = null;
    this.onSendMessageCallback = null;
    this.onEchoMessageCallback = null;
    this.channelSubscriptions = [];
    this.isConnected = false;
    this.connectionState = 'disconnected';
    this.historyBootstrapLoadedSnapshot = false;
    this.waitingForSnapshotBootstrap = false;
    this.bootstrapState = {
      mode: 'none',
      messages: [],
      snapshotMessages: [],
      priorityMessages: [],
      snapshotTimestamp: 0,
      snapshotVersion: 0,
      historyComplete: false,
      hasSnapshotBootstrap: false
    };
    this.lastProjectMarker = null;
    this.needsRecoveryAfterReconnect = false;
    this.connectionService = null;
  }

  getChannelNames(channelId = this.channelId) {
    if (!channelId) {
      return {
        data: null,
        snapshots: null,
        telemetry: null,
        priority: null
      };
    }

    return {
      data: `rally-data:${channelId}`,
      snapshots: `rally-snapshots:${channelId}`,
      telemetry: `rally-telemetry:${channelId}`,
      priority: `rally-priority:${channelId}`
    };
  }

  async loadChannelHistory(limit = 50, channel = this.channel) {
    if (!channel) {
      return [];
    }

    try {
      const history = await channel.history({ limit, direction: 'backwards' });
      return Array.isArray(history?.items) ? history.items : [];
    } catch (error) {
      console.warn('[WebSocket] Failed to load channel history:', error);
      return [];
    }
  }

  getMessageTimestamp(message) {
    const messageData = getHistoryMessageData(message);
    const payloadTimestamp = Number(messageData?.timestamp || 0);
    const transportTimestamp = Number(message?.timestamp || 0);
    return Math.max(payloadTimestamp, transportTimestamp, 0);
  }

  isUpdateHistoryMessage(message) {
    return message?.name === 'update';
  }

  isSnapshotBatchMessage(message) {
    const messageData = getHistoryMessageData(message);
    return (
      this.isUpdateHistoryMessage(message)
      && messageData?.messageType === 'delta-batch'
      && messageData?.packageType === 'snapshot'
    );
  }

  getMessageOrderParts(message) {
    const messageData = getHistoryMessageData(message);
    return {
      timestamp: this.getMessageTimestamp(message),
      snapshotId: String(messageData?.snapshotId || '').trim(),
      partIndex: Number.isFinite(messageData?.partIndex) ? Number(messageData.partIndex) : 0
    };
  }

  isMessageAfterMarker(message, marker = null) {
    if (!marker) {
      return true;
    }

    const messageParts = this.getMessageOrderParts(message);
    const markerTimestamp = Number(marker?.timestamp || 0);
    const markerSnapshotId = String(marker?.snapshotId || '').trim();
    const markerPartIndex = Number.isFinite(marker?.partIndex) ? Number(marker.partIndex) : 0;

    if (messageParts.timestamp > markerTimestamp) {
      return true;
    }

    if (messageParts.timestamp < markerTimestamp) {
      return false;
    }

    if (markerSnapshotId) {
      if (messageParts.snapshotId !== markerSnapshotId) {
        return messageParts.snapshotId > markerSnapshotId;
      }
      return messageParts.partIndex > markerPartIndex;
    }

    return messageParts.partIndex > markerPartIndex;
  }

  getBootstrapState() {
    return {
      ...this.bootstrapState,
      messages: Array.isArray(this.bootstrapState?.messages) ? [...this.bootstrapState.messages] : [],
      snapshotMessages: Array.isArray(this.bootstrapState?.snapshotMessages) ? [...this.bootstrapState.snapshotMessages] : [],
      priorityMessages: Array.isArray(this.bootstrapState?.priorityMessages) ? [...this.bootstrapState.priorityMessages] : []
    };
  }

  shouldTrackProjectMarker(details = {}) {
    const channelType = String(details?.channelType || '').trim();
    if (!details || channelType === 'telemetry') {
      return false;
    }

    const packageType = String(details?.packageType || '').trim();
    const messageType = String(details?.messageType || '').trim();
    if (
      messageType === 'ownership-heartbeat'
      || messageType === 'ownership-claim'
      || messageType === 'ownership-release'
    ) {
      return false;
    }
    return (
      packageType === 'snapshot'
      || packageType === 'delta'
      || packageType === 'control'
      || channelType === 'data'
      || channelType === 'snapshots'
      || channelType === 'priority'
    );
  }

  updateProjectMarker(details = {}) {
    if (!this.shouldTrackProjectMarker(details)) {
      return;
    }

    const timestamp = Number(details?.timestamp || Date.now());
    const partIndex = Number.isFinite(details?.partIndex) ? Number(details.partIndex) : 0;
    this.lastProjectMarker = {
      timestamp,
      snapshotId: String(details?.snapshotId || '').trim(),
      partIndex,
      channelType: String(details?.channelType || '').trim() || null,
      channelName: String(details?.channelName || '').trim() || null,
      messageType: String(details?.messageType || '').trim() || null,
      packageType: String(details?.packageType || '').trim() || null,
      controlType: String(details?.controlType || '').trim() || null,
      section: String(details?.section || '').trim() || null
    };
  }

  hasChannelSubscription(channelType) {
    return this.channelSubscriptions.some((subscription) => (
      (channelType === 'data' && subscription.channel === this.dataChannel)
      || (channelType === 'snapshots' && subscription.channel === this.snapshotChannel)
      || (channelType === 'telemetry' && subscription.channel === this.telemetryChannel)
      || (channelType === 'priority' && subscription.channel === this.priorityChannel)
    ));
  }

  async dispatchMessagesInChunks(messages = [], mapper = (message) => message, source = 'history', batchSize = 25) {
    const safeMessages = Array.isArray(messages) ? messages : [];

    for (let index = 0; index < safeMessages.length; index += batchSize) {
      const chunk = safeMessages.slice(index, index + batchSize);

      chunk.forEach((message) => {
        const routedData = mapper(message);
        this.notifyReceive('update', Number(message?.timestamp || Date.now()), source, routedData);
        this.onMessageCallback?.(routedData);
      });

      if (index + batchSize < safeMessages.length) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }
  }

  async loadBootstrapHistory(options = {}) {
    const dataChannel = this.dataChannel || this.channel;
    const snapshotChannel = this.snapshotChannel || this.channel;
    const priorityChannel = this.priorityChannel || null;

    if (!dataChannel && !snapshotChannel && !priorityChannel) {
      this.bootstrapState = {
        mode: 'none',
        messages: [],
        snapshotMessages: [],
        priorityMessages: [],
        snapshotTimestamp: 0,
        snapshotVersion: 0,
        historyComplete: false,
        hasSnapshotBootstrap: false
      };
      return {
        messages: [],
        snapshotMessages: [],
        priorityMessages: [],
        snapshotTimestamp: 0,
        snapshotVersion: 0,
        historyComplete: false,
        hasSnapshotBootstrap: false,
        mode: 'none'
      };
    }

    const pageSize = Number(options.limit || 250);
    const maxPages = Number.isFinite(Number(options.maxPages))
      ? Number(options.maxPages)
      : Number.POSITIVE_INFINITY;
    const requireSnapshotBootstrap = options.requireSnapshotBootstrap === true;
    const lastReceivedAt = Number(options.lastReceivedAt || 0);
    const lastReceivedMarker = options.lastReceivedMarker && typeof options.lastReceivedMarker === 'object'
      ? options.lastReceivedMarker
      : null;
    const snapshotStalenessMs = Number(options.snapshotStalenessMs || (5 * 60 * 1000));
    const shouldUseSnapshot = requireSnapshotBootstrap || !Number.isFinite(lastReceivedAt) || lastReceivedAt <= 0
      ? true
      : (Date.now() - lastReceivedAt) > snapshotStalenessMs;
    const boundaryMarker = lastReceivedMarker || (lastReceivedAt > 0 ? { timestamp: lastReceivedAt, partIndex: 0 } : null);

    const latestSnapshotMeta = snapshotChannel
      ? await snapshotChannel.history({ limit: 50, direction: 'backwards' })
      : null;
    const latestSnapshotItems = Array.isArray(latestSnapshotMeta?.items) ? latestSnapshotMeta.items : [];
    const latestSnapshotMessage = latestSnapshotItems.find((message) => this.isSnapshotBatchMessage(message)) || null;
    const latestSnapshotData = latestSnapshotMessage ? getHistoryMessageData(latestSnapshotMessage) : {};
    const latestAvailableSnapshotTimestamp = latestSnapshotMessage ? this.getMessageTimestamp(latestSnapshotMessage) : 0;
    const latestAvailableSnapshotVersion = Number(latestSnapshotData?.snapshotVersion || 0);

    const loadPagedHistory = async (channel, stopWhen) => {
      const collected = [];
      let page = await channel.history({ limit: pageSize, direction: 'backwards' });
      let pageCount = 0;

      while (page) {
        const items = Array.isArray(page?.items) ? page.items : [];
        collected.push(...items);
        pageCount += 1;

        if (stopWhen?.(collected, items, page, pageCount) === true) {
          break;
        }

        if (!page.hasNext() || pageCount >= maxPages) {
          break;
        }

        page = await page.next();
      }

      return collected;
    };

    const snapshotCollected = shouldUseSnapshot && snapshotChannel
      ? await loadPagedHistory(snapshotChannel, (collected) => {
          const snapshotItems = collected.filter((message) => this.isSnapshotBatchMessage(message));
          if (snapshotItems.length === 0) {
            return false;
          }

          const latestSnapshotTimestamp = Math.max(...snapshotItems.map((message) => this.getMessageTimestamp(message)));
          const oldestLoadedTimestamp = Math.min(
            ...collected.map((message) => this.getMessageTimestamp(message)).filter((value) => Number.isFinite(value) && value > 0)
          );

          return Number.isFinite(oldestLoadedTimestamp) && oldestLoadedTimestamp > 0 && oldestLoadedTimestamp < latestSnapshotTimestamp;
        })
      : [];

    const snapshotMessages = shouldUseSnapshot
      ? snapshotCollected
        .filter((message) => this.isSnapshotBatchMessage(message))
        .sort((a, b) => {
          const aTimestamp = this.getMessageTimestamp(a);
          const bTimestamp = this.getMessageTimestamp(b);
          if (aTimestamp !== bTimestamp) return aTimestamp - bTimestamp;
          const aIndex = Number.isFinite(a?.data?.partIndex) ? a.data.partIndex : 0;
          const bIndex = Number.isFinite(b?.data?.partIndex) ? b.data.partIndex : 0;
          if (aIndex !== bIndex) return aIndex - bIndex;
          return String(a?.id || '').localeCompare(String(b?.id || ''));
        })
      : [];

    const snapshotTimestamp = snapshotMessages.length > 0
      ? Math.max(...snapshotMessages.map((message) => this.getMessageTimestamp(message)))
      : latestAvailableSnapshotTimestamp;

    if (requireSnapshotBootstrap && snapshotMessages.length === 0) {
      this.bootstrapState = {
        mode: 'await-snapshot',
        messages: [],
        snapshotMessages: [],
        priorityMessages: [],
        snapshotTimestamp: 0,
        snapshotVersion: 0,
        historyComplete: false,
        hasSnapshotBootstrap: false
      };

      if (isTransportDebugEnabled()) {
        console.log('[WebSocket][RX][bootstrap] Waiting for snapshot bootstrap', {
          shouldUseSnapshot,
          requireSnapshotBootstrap,
          totalReadCount: snapshotCollected.length,
          snapshotHistoryReadCount: snapshotCollected.length
        });
      }

      return {
        messages: [],
        snapshotMessages: [],
        priorityMessages: [],
        snapshotTimestamp: 0,
        snapshotVersion: 0,
        historyComplete: false,
        hasSnapshotBootstrap: false,
        mode: 'await-snapshot'
      };
    }

    const dataCollected = dataChannel
      ? await loadPagedHistory(dataChannel, (collected) => {
          const oldestLoadedTimestamp = Math.min(
            ...collected.map((message) => this.getMessageTimestamp(message)).filter((value) => Number.isFinite(value) && value > 0)
          );

          if (shouldUseSnapshot) {
            return snapshotTimestamp > 0 && Number.isFinite(oldestLoadedTimestamp) && oldestLoadedTimestamp > 0 && oldestLoadedTimestamp < snapshotTimestamp;
          }

          return boundaryMarker
            && Number.isFinite(oldestLoadedTimestamp)
            && oldestLoadedTimestamp > 0
            && oldestLoadedTimestamp <= Number(boundaryMarker.timestamp || 0);
        })
      : [];

    const priorityCollected = priorityChannel
      ? await loadPagedHistory(priorityChannel, (collected) => {
          const oldestLoadedTimestamp = Math.min(
            ...collected.map((message) => this.getMessageTimestamp(message)).filter((value) => Number.isFinite(value) && value > 0)
          );

          if (shouldUseSnapshot) {
            return snapshotTimestamp > 0 && Number.isFinite(oldestLoadedTimestamp) && oldestLoadedTimestamp > 0 && oldestLoadedTimestamp < snapshotTimestamp;
          }

          return boundaryMarker
            && Number.isFinite(oldestLoadedTimestamp)
            && oldestLoadedTimestamp > 0
            && oldestLoadedTimestamp <= Number(boundaryMarker.timestamp || 0);
        })
      : [];

    const updateMessages = dataCollected.filter((message) => this.isUpdateHistoryMessage(message));
    const selectedSnapshotData = snapshotMessages.length > 0
      ? getHistoryMessageData(snapshotMessages[0])
      : latestSnapshotData;
    const snapshotVersion = Number(selectedSnapshotData?.snapshotVersion || latestAvailableSnapshotVersion || 0);
    const selectedSnapshotId = String(selectedSnapshotData?.snapshotId || '').trim();
    const selectedSnapshotIdentity = snapshotVersion > 0
      ? { type: 'version', value: snapshotVersion }
      : selectedSnapshotId
        ? { type: 'id', value: selectedSnapshotId }
        : snapshotTimestamp > 0
          ? { type: 'timestamp', value: snapshotTimestamp }
          : { type: 'none', value: null };

    const messages = updateMessages
      .filter((message) => {
        if (shouldUseSnapshot) {
          if (this.isSnapshotBatchMessage(message)) {
            if (snapshotMessages.length === 0) {
              return false;
            }

            if (selectedSnapshotIdentity.type === 'version') {
              return Number(getHistoryMessageData(message)?.snapshotVersion || 0) !== selectedSnapshotIdentity.value;
            }

            if (selectedSnapshotIdentity.type === 'id') {
              return String(getHistoryMessageData(message)?.snapshotId || '').trim() !== selectedSnapshotIdentity.value;
            }

            return this.getMessageTimestamp(message) !== selectedSnapshotIdentity.value;
          }

          if (snapshotTimestamp > 0) {
            return this.getMessageTimestamp(message) > snapshotTimestamp;
          }

          return true;
        }

        return this.isMessageAfterMarker(message, boundaryMarker);
      })
      .sort((a, b) => {
        const aTimestamp = this.getMessageTimestamp(a);
        const bTimestamp = this.getMessageTimestamp(b);
        if (aTimestamp !== bTimestamp) return aTimestamp - bTimestamp;
        const aIndex = Number.isFinite(a?.data?.partIndex) ? a.data.partIndex : 0;
        const bIndex = Number.isFinite(b?.data?.partIndex) ? b.data.partIndex : 0;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });

    const priorityMessages = priorityCollected
      .filter((message) => this.isUpdateHistoryMessage(message))
      .filter((message) => (
        shouldUseSnapshot
          ? this.getMessageTimestamp(message) > snapshotTimestamp
          : this.isMessageAfterMarker(message, boundaryMarker)
      ))
      .sort((a, b) => {
        const aTimestamp = this.getMessageTimestamp(a);
        const bTimestamp = this.getMessageTimestamp(b);
        if (aTimestamp !== bTimestamp) return aTimestamp - bTimestamp;
        const aIndex = Number.isFinite(a?.data?.partIndex) ? a.data.partIndex : 0;
        const bIndex = Number.isFinite(b?.data?.partIndex) ? b.data.partIndex : 0;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });

    this.bootstrapState = {
      mode: shouldUseSnapshot && snapshotMessages.length > 0 ? 'snapshot' : 'replay',
      messages,
      snapshotMessages,
      priorityMessages,
      snapshotTimestamp,
      snapshotVersion,
      historyComplete: true,
      hasSnapshotBootstrap: snapshotMessages.length > 0
    };

    if (isTransportDebugEnabled()) {
      console.log('[WebSocket][RX][bootstrap] History applied', {
        mode: this.bootstrapState.mode,
        shouldUseSnapshot,
        totalReadCount: dataCollected.length + snapshotCollected.length + priorityCollected.length,
        snapshotHistoryReadCount: snapshotCollected.length,
        usedSnapshotCount: snapshotMessages.length,
        usedReplayCount: messages.length,
        usedPriorityCount: priorityMessages.length,
        droppedCount: Math.max(0, (dataCollected.length + snapshotCollected.length + priorityCollected.length) - snapshotMessages.length - messages.length - priorityMessages.length),
        snapshotTimestamp,
        snapshotVersion
      });
    }

    return {
      messages,
      snapshotMessages,
      priorityMessages,
      snapshotTimestamp,
      snapshotVersion,
      historyComplete: true,
      hasSnapshotBootstrap: snapshotMessages.length > 0,
      mode: shouldUseSnapshot && snapshotMessages.length > 0 ? 'snapshot' : 'replay'
    };
  }

  /**
   * Connect to a channel using the full key
   */
  async connect(fullKey, onMessage, onStatus, options = {}) {
    const { valid, channelId } = parseChannelKey(fullKey);
    
    if (!valid || !channelId) {
      throw new Error('Invalid channel key format');
    }

    this.channelId = channelId;
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;
    this.onReceiveActivityCallback = options.onReceiveActivity || null;
    this.onSendActivityCallback = options.onSendActivity || null;
    this.onSendMessageCallback = options.onSendMessage || null;
    this.onEchoMessageCallback = options.onEchoMessage || null;
    if (this.client) {
      this.disconnect();
    }
    this.historyBootstrapLoadedSnapshot = false;
    this.waitingForSnapshotBootstrap = false;
    this.lastProjectMarker = options.lastReceivedMarker && typeof options.lastReceivedMarker === 'object'
      ? {
          ...options.lastReceivedMarker,
          timestamp: Number(options.lastReceivedMarker?.timestamp || options.lastReceivedAt || 0)
        }
      : (Number(options.lastReceivedAt || 0) > 0
        ? { timestamp: Number(options.lastReceivedAt || 0), partIndex: 0 }
        : null);
    this.needsRecoveryAfterReconnect = false;
    this.bootstrapState = {
      mode: 'none',
      messages: [],
      snapshotMessages: [],
      priorityMessages: [],
      snapshotTimestamp: 0,
      snapshotVersion: 0,
      historyComplete: false,
      hasSnapshotBootstrap: false
    };

    const apiKey = process.env.REACT_APP_ABLY_KEY;
    if (!apiKey) {
      throw new Error('Ably API key not configured');
    }

    try {
      this.updateStatus('connecting');
      
      this.client = new Ably.Realtime({ 
        key: apiKey,
        // Recover connection on page reload
        recover: (lastConnectionDetails, cb) => {
          cb(true);
        }
      });
      const activeClient = this.client;
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        const settle = (fn, value) => {
          clearTimeout(timeout);
          activeClient.connection.off?.('connected', handleConnected);
          activeClient.connection.off?.('failed', handleFailed);
          fn(value);
        };

        const handleConnected = () => {
          if (this.client !== activeClient) {
            return;
          }
          settle(resolve);
        };

        const handleFailed = (stateChange) => {
          if (this.client !== activeClient) {
            return;
          }
          settle(reject, new Error(stateChange.reason?.message || 'Connection failed'));
        };

        const timeout = setTimeout(() => {
          activeClient.connection.off?.('connected', handleConnected);
          activeClient.connection.off?.('failed', handleFailed);
          reject(new Error('Connection timeout'));
        }, 15000);

        if (activeClient.connection.state === 'connected') {
          settle(resolve);
          return;
        }

        if (activeClient.connection.state === 'failed') {
          settle(reject, new Error(activeClient.connection.errorReason?.message || 'Connection failed'));
          return;
        }

        activeClient.connection.on('connected', handleConnected);
        activeClient.connection.on('failed', handleFailed);
      });

      const channelNames = this.getChannelNames(channelId);
      this.channelNames = channelNames;
      this.dataChannel = activeClient.channels.get(channelNames.data);
      this.snapshotChannel = activeClient.channels.get(channelNames.snapshots);
      this.telemetryChannel = activeClient.channels.get(channelNames.telemetry);
      this.priorityChannel = activeClient.channels.get(channelNames.priority);
      this.channel = this.dataChannel;

      const activeConnectionId = String(activeClient?.connection?.id || '').trim();
      const isOwnMessage = (message) => {
        const messageConnectionId = String(message?.connectionId || '').trim();
        return !!messageConnectionId && !!activeConnectionId && messageConnectionId === activeConnectionId;
      };
      this.connectionService = new SyncConnectionService({
        provider: this,
        client: activeClient,
        channelId,
        channelNames,
        options,
        isOwnMessage,
        normalizeIncomingEnvelope,
        buildWebSocketLogPrefix
      });

      await this.connectionService.start();
      
    } catch (error) {
      this.updateStatus('error', error.message);
      throw error;
    }
  }

  /**
   * Update connection status
   */
  updateStatus(state, error = null) {
    this.connectionState = state;
    this.isConnected = state === 'connected';
    this.onStatusCallback?.(state, PROVIDER_NAME, error);
  }

  notifyReceive(name = 'update', timestamp = Date.now(), source = 'live', details = null) {
    if (source !== 'echo' && details) {
      this.updateProjectMarker(details);
    }
    this.onReceiveActivityCallback?.({
      name,
      timestamp,
      source,
      details
    });
  }

  notifySend(name = 'update', timestamp = Date.now()) {
    this.onSendActivityCallback?.({
      name,
      timestamp
    });
  }

  resolvePublishTarget(data = {}) {
    const explicitChannelType = String(data?.channelType || '').trim();
    if (explicitChannelType === 'priority') {
      return this.priorityChannel || this.dataChannel || this.channel;
    }

    if (explicitChannelType === 'snapshots' || explicitChannelType === 'snapshot') {
      return this.snapshotChannel || this.channel;
    }

    if (explicitChannelType === 'telemetry') {
      return this.telemetryChannel || this.channel;
    }

    if (
      data?.highPriority === true
      || data?.priority === true
      || data?.controlType === 'sos-ack'
    ) {
      return this.priorityChannel || this.dataChannel || this.channel;
    }

    if (
      data?.packageType === 'snapshot'
      || data?.originalMessageType === 'full-snapshot'
      || data?.snapshotKind === 'initial'
      || data?.snapshotKind === 'periodic'
    ) {
      return this.snapshotChannel || this.channel;
    }

    if (
      data?.messageType === 'pilot-telemetry'
      || data?.section === 'pilotTelemetry'
      || (data?.payload && typeof data.payload === 'object' && data.payload.pilotTelemetry)
    ) {
      return this.telemetryChannel || this.channel;
    }

    return this.dataChannel || this.channel;
  }

  /**
   * Publish data to the channel
   */
  async publish(data) {
    const targetChannel = this.resolvePublishTarget(data);

    if (!this.isConnected || !targetChannel) {
      console.warn('[WebSocket] Not connected, cannot publish');
      return false;
    }

    try {
      const channelType = targetChannel === this.snapshotChannel
        ? 'snapshots'
        : targetChannel === this.telemetryChannel
          ? 'telemetry'
          : targetChannel === this.priorityChannel
            ? 'priority'
            : 'data';
      const isEphemeralMessage = channelType === 'telemetry'
        || data?.messageType === 'ownership-heartbeat';
      const publishEnvelope = isEphemeralMessage
        ? {
            name: 'update',
            data,
            extras: {
              ephemeral: true
            }
          }
        : {
            name: 'update',
            data
          };
      const isHeartbeatMessage = data?.messageType === 'ownership-heartbeat';
      if (isHeartbeatMessage) {
        if (isHeartbeatDebugEnabled()) {
          console.log(buildWebSocketLogPrefix('send', 'update', channelType, data, 'Heartbeat'), {
            channelName: targetChannel?.name || null,
            channelType,
            ephemeral: isEphemeralMessage,
            data
          });
        }
      } else if (isTransportDebugEnabled()) {
        console.log(buildWebSocketLogPrefix('send', 'update', channelType, data), {
          channelName: targetChannel?.name || null,
          channelType,
          ephemeral: isEphemeralMessage,
          data
        });
      }
      await targetChannel.publish(publishEnvelope);
      this.onSendMessageCallback?.({
        ...(data || {}),
        channelType,
        channelName: targetChannel?.name || null,
        ephemeral: isEphemeralMessage,
        timestamp: Number(data?.timestamp || Date.now())
      });
      this.notifySend('update');
      return true;
    } catch (error) {
      console.error('[WebSocket] Publish error:', error);
      return false;
    }
  }

  async publishControl(controlType, data = {}) {
    const targetChannel = data?.highPriority === true
      ? (this.priorityChannel || this.dataChannel || this.channel)
      : (this.dataChannel || this.channel);

    if (!this.isConnected || !targetChannel) {
      console.warn('[WebSocket] Not connected, cannot publish control package');
      return false;
    }

    try {
      const payload = {
        messageType: 'delta-batch',
        packageType: 'control',
        controlType,
        source: data?.source || 'client',
        sourceRole: data?.sourceRole || data?.source || 'client',
        sourceInstanceId: data?.sourceInstanceId || data?.instanceId || null,
        instanceId: data?.instanceId || data?.sourceInstanceId || null,
        timestamp: Number(data?.timestamp || Date.now()),
        payload: data
      };

      const channelType = targetChannel === this.priorityChannel ? 'priority' : 'data';
      const isHeartbeatControlMessage = payload?.messageType === 'ownership-heartbeat';
      if (isHeartbeatControlMessage) {
        if (isHeartbeatDebugEnabled()) {
          console.log(buildWebSocketLogPrefix('send', 'update', channelType, payload, 'Heartbeat'), {
            channelName: targetChannel?.name || null,
            channelType,
            data: payload
          });
        }
      } else if (isTransportDebugEnabled()) {
        console.log(buildWebSocketLogPrefix('send', 'update', channelType, payload), {
          channelName: targetChannel?.name || null,
          channelType,
          data: payload
        });
      }
      await targetChannel.publish('update', payload);
      this.onSendMessageCallback?.({
        ...payload,
        channelType,
        channelName: targetChannel?.name || null,
        timestamp: Number(payload?.timestamp || Date.now())
      });
      this.notifySend('update');
      return true;
    } catch (error) {
      console.error('[WebSocket] Control publish error:', error);
      return false;
    }
  }

  unsubscribeChannelType(channelType) {
    const nextSubscriptions = [];

    this.channelSubscriptions.forEach((subscription) => {
      const matches = (
        (channelType === 'data' && subscription.channel === this.dataChannel)
        || (channelType === 'snapshots' && subscription.channel === this.snapshotChannel)
        || (channelType === 'telemetry' && subscription.channel === this.telemetryChannel)
        || (channelType === 'priority' && subscription.channel === this.priorityChannel)
      );

      if (!matches) {
        nextSubscriptions.push(subscription);
        return;
      }

      try {
        subscription.channel?.unsubscribe?.(subscription.eventName, subscription.handler);
      } catch (error) {
        console.warn('[WebSocket] Failed to unsubscribe channel handler', error);
        nextSubscriptions.push(subscription);
      }
    });

    this.channelSubscriptions = nextSubscriptions;
  }

  /**
   * Disconnect from the channel
   */
  disconnect() {
    this.channelSubscriptions.forEach(({ channel, eventName, handler }) => {
      try {
        channel?.unsubscribe?.(eventName, handler);
      } catch (error) {
        console.warn('[WebSocket] Failed to unsubscribe channel handler', error);
      }
    });
    this.channelSubscriptions = [];

    if (this.client) {
      this.client.close();
      this.client = null;
      this.channel = null;
      this.dataChannel = null;
      this.snapshotChannel = null;
      this.telemetryChannel = null;
      this.priorityChannel = null;
      this.onSendMessageCallback = null;
      this.onEchoMessageCallback = null;
    }
    this.connectionService = null;
    this.bootstrapState = {
      mode: 'none',
      messages: [],
      snapshotMessages: [],
      priorityMessages: [],
      snapshotTimestamp: 0,
      snapshotVersion: 0,
      historyComplete: false,
      hasSnapshotBootstrap: false
    };
    this.waitingForSnapshotBootstrap = false;
    this.updateStatus('disconnected');
    if (isTransportDebugEnabled()) {
      console.log('[WebSocket] Disconnected');
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      connectionState: this.connectionState,
      provider: PROVIDER_NAME,
      channelId: this.channelId
    };
  }
}

// Singleton instance
let providerInstance = null;

export const getWebSocketProvider = () => {
  if (!providerInstance) {
    providerInstance = new WebSocketProvider();
  }
  return providerInstance;
};

export const resetWebSocketProvider = () => {
  if (providerInstance) {
    providerInstance.disconnect();
    providerInstance = null;
  }
};

export default WebSocketProvider;
