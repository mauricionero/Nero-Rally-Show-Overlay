/**
 * WebSocket Provider - Ably Only (Fully Frontend)
 * 
 * Ably allows direct client-side publishing, making it perfect for
 * a fully frontend application.
 * 
 * Key format: 1-{channelId} (keeping prefix for future extensibility)
 * 
 * Channel layout:
 * - rally-{channelId}-data
 * - rally-{channelId}-snapshots
 * - rally-{channelId}-telemetry
 * - rally-{channelId}-priority
 */

import Ably from 'ably';

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

const buildWebSocketLogPrefix = (direction, eventName, channelType, data) => {
  const emoji = direction === 'send'
    ? '⬆️'
    : direction === 'echo'
      ? '🪞'
      : '⬇️';
  return `[WebSocket][${emoji}][${eventName}][${getLogChannelLabel(channelType)}][${getLogMessageLabel(data)}]`;
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
    this.bootstrapState = {
      mode: 'none',
      messages: [],
      snapshotMessages: [],
      priorityMessages: [],
      snapshotTimestamp: 0,
      snapshotVersion: 0,
      historyComplete: false
    };
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
      data: `rally-${channelId}-data`,
      snapshots: `rally-${channelId}-snapshots`,
      telemetry: `rally-${channelId}-telemetry`,
      priority: `rally-${channelId}-priority`
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
    const payloadTimestamp = Number(message?.data?.timestamp || 0);
    const transportTimestamp = Number(message?.timestamp || 0);
    return Math.max(payloadTimestamp, transportTimestamp, 0);
  }

  isUpdateHistoryMessage(message) {
    return message?.name === 'update';
  }

  isSnapshotBatchMessage(message) {
    return (
      this.isUpdateHistoryMessage(message)
      && message?.data?.messageType === 'delta-batch'
      && message?.data?.packageType === 'snapshot'
    );
  }

  getMessageOrderParts(message) {
    return {
      timestamp: this.getMessageTimestamp(message),
      snapshotId: String(message?.data?.snapshotId || '').trim(),
      partIndex: Number.isFinite(message?.data?.partIndex) ? Number(message.data.partIndex) : 0
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
        historyComplete: false
      };
      return {
        messages: [],
        snapshotMessages: [],
        priorityMessages: [],
        snapshotTimestamp: 0,
        snapshotVersion: 0,
        historyComplete: false,
        mode: 'none'
      };
    }

    const pageSize = Number(options.limit || 1000);
    const maxPages = Number.isFinite(Number(options.maxPages))
      ? Number(options.maxPages)
      : Number.POSITIVE_INFINITY;
    const lastReceivedAt = Number(options.lastReceivedAt || 0);
    const lastReceivedMarker = options.lastReceivedMarker && typeof options.lastReceivedMarker === 'object'
      ? options.lastReceivedMarker
      : null;
    const snapshotStalenessMs = Number(options.snapshotStalenessMs || (5 * 60 * 1000));
    const shouldUseSnapshot = !Number.isFinite(lastReceivedAt) || lastReceivedAt <= 0
      ? true
      : (Date.now() - lastReceivedAt) > snapshotStalenessMs;
    const boundaryMarker = lastReceivedMarker || (lastReceivedAt > 0 ? { timestamp: lastReceivedAt, partIndex: 0 } : null);

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
      : 0;

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
    const snapshotVersion = Number(snapshotMessages[0]?.data?.snapshotVersion || 0);
    const selectedSnapshotId = String(snapshotMessages[0]?.data?.snapshotId || '').trim();
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
              return Number(message?.data?.snapshotVersion || 0) !== selectedSnapshotIdentity.value;
            }

            if (selectedSnapshotIdentity.type === 'id') {
              return String(message?.data?.snapshotId || '').trim() !== selectedSnapshotIdentity.value;
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
      historyComplete: true
    };

    console.log('[WebSocket][RX][bootstrap] History applied', {
      mode: this.bootstrapState.mode,
      totalReadCount: dataCollected.length + snapshotCollected.length + priorityCollected.length,
      usedSnapshotCount: snapshotMessages.length,
      usedReplayCount: messages.length,
      usedPriorityCount: priorityMessages.length,
      droppedCount: Math.max(0, (dataCollected.length + snapshotCollected.length + priorityCollected.length) - snapshotMessages.length - messages.length - priorityMessages.length),
      snapshotTimestamp,
      snapshotVersion
    });

    return {
      messages,
      snapshotMessages,
      priorityMessages,
      snapshotTimestamp,
      snapshotVersion,
      historyComplete: true,
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
    this.bootstrapState = {
      mode: 'none',
      messages: [],
      snapshotMessages: [],
      priorityMessages: [],
      snapshotTimestamp: 0,
      snapshotVersion: 0,
      historyComplete: false
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
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 15000);
        
        activeClient.connection.on('connected', () => {
          if (this.client !== activeClient) {
            return;
          }
          clearTimeout(timeout);
          resolve();
        });
        
        activeClient.connection.on('failed', (stateChange) => {
          if (this.client !== activeClient) {
            return;
          }
          clearTimeout(timeout);
          reject(new Error(stateChange.reason?.message || 'Connection failed'));
        });
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

      if (options.readHistory !== false) {
        const historyBootstrap = await this.loadBootstrapHistory({
          limit: options.historyLimit || 1000,
          lastReceivedAt: options.lastReceivedAt || 0,
          lastReceivedMarker: options.lastReceivedMarker || null,
          snapshotStalenessMs: options.snapshotStalenessMs || (5 * 60 * 1000)
        });

        if (historyBootstrap.mode === 'snapshot' && historyBootstrap.snapshotMessages.length > 0) {
          this.historyBootstrapLoadedSnapshot = true;
          console.log('[WebSocket][RX][history] Loaded snapshot bootstrap from history', {
            count: historyBootstrap.snapshotMessages.length,
            snapshotTimestamp: historyBootstrap.snapshotTimestamp,
            snapshotVersion: historyBootstrap.snapshotVersion || null
          });

          historyBootstrap.snapshotMessages.forEach((message) => {
            const routedData = normalizeIncomingEnvelope(
              message.data,
              'snapshots',
              channelNames.snapshots
            );
            this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'history', routedData);
            this.onMessageCallback?.(routedData);
          });

          const replayMessages = historyBootstrap.messages.filter((message) => (
            Number(message?.data?.timestamp || message?.timestamp || 0) > historyBootstrap.snapshotTimestamp
            && !(message?.data?.messageType === 'delta-batch' && message?.data?.packageType === 'snapshot')
          ));

          if (replayMessages.length > 0) {
            console.log('[WebSocket][RX][history] Replayed incremental updates after snapshot', {
              count: replayMessages.length,
              snapshotTimestamp: historyBootstrap.snapshotTimestamp
            });
            replayMessages.forEach((message) => {
              const routedData = normalizeIncomingEnvelope(
                message.data,
                'data',
                channelNames.data
              );
              this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'history', routedData);
              this.onMessageCallback?.(routedData);
            });
          }

          if (historyBootstrap.priorityMessages.length > 0) {
            console.log('[WebSocket][RX][history] Replayed high-priority updates after snapshot', {
              count: historyBootstrap.priorityMessages.length,
              snapshotTimestamp: historyBootstrap.snapshotTimestamp
            });
            historyBootstrap.priorityMessages.forEach((message) => {
              const routedData = normalizeIncomingEnvelope(
                message.data,
                'priority',
                channelNames.priority
              );
              this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'history', routedData);
              this.onMessageCallback?.(routedData);
            });
          }

          console.log('[WebSocket][RX][bootstrap] Applied history summary', {
            channelId,
            mode: historyBootstrap.mode,
            snapshotMessagesUsed: historyBootstrap.snapshotMessages.length,
            replayMessagesUsed: historyBootstrap.messages.length,
            priorityMessagesUsed: historyBootstrap.priorityMessages.length,
            totalMessagesRead: historyBootstrap.snapshotMessages.length + historyBootstrap.messages.length + historyBootstrap.priorityMessages.length
          });
        } else if (historyBootstrap.messages.length > 0 || historyBootstrap.priorityMessages.length > 0) {
          this.historyBootstrapLoadedSnapshot = false;
          console.log('[WebSocket][RX][history] Replaying history without snapshot bootstrap', {
            count: historyBootstrap.messages.length,
            mode: historyBootstrap.mode,
            historyComplete: !!historyBootstrap.historyComplete
          });

          historyBootstrap.messages.forEach((message) => {
            const routedData = normalizeIncomingEnvelope(
              message.data,
              'data',
              channelNames.data
            );
            this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'history', routedData);
            this.onMessageCallback?.(routedData);
          });

          if (historyBootstrap.priorityMessages.length > 0) {
            console.log('[WebSocket][RX][history] Replaying high-priority history', {
              count: historyBootstrap.priorityMessages.length,
              mode: historyBootstrap.mode,
              historyComplete: !!historyBootstrap.historyComplete
            });
            historyBootstrap.priorityMessages.forEach((message) => {
              const routedData = normalizeIncomingEnvelope(
                message.data,
                'priority',
                channelNames.priority
              );
              this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'history', routedData);
              this.onMessageCallback?.(routedData);
            });
          }

          console.log('[WebSocket][RX][bootstrap] Applied history summary', {
            channelId,
            mode: historyBootstrap.mode,
            snapshotMessagesUsed: historyBootstrap.snapshotMessages.length,
            replayMessagesUsed: historyBootstrap.messages.length,
            priorityMessagesUsed: historyBootstrap.priorityMessages.length,
            totalMessagesRead: historyBootstrap.snapshotMessages.length + historyBootstrap.messages.length + historyBootstrap.priorityMessages.length
          });
        }
      }

      const subscribeToChannel = async (channel, channelType, eventName = 'update') => {
        if (!channel) {
          return;
        }

        const handler = (message) => {
          if (isOwnMessage(message)) {
            const routedData = normalizeIncomingEnvelope(
              message.data,
              channelType,
              channel.name
            );
            console.log(buildWebSocketLogPrefix('echo', 'update', channelType, routedData), {
              channelType,
              data: routedData
            });
            this.onEchoMessageCallback?.({
              timestamp: Number(message?.timestamp || Date.now()),
              channelType,
              data: routedData
            });
            this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'echo', routedData);
            return;
          }

          const routedData = normalizeIncomingEnvelope(
            message.data,
            channelType,
            channel.name
          );
          console.log(buildWebSocketLogPrefix('receive', 'update', channelType, routedData), {
            channelType,
            data: routedData
          });
          this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'live', routedData);
          this.onMessageCallback?.(routedData);
        };

        await channel.subscribe(eventName, handler);
        this.channelSubscriptions.push({
          channel,
          eventName,
          handler
        });
      };

      await subscribeToChannel(this.dataChannel, 'data');
      await subscribeToChannel(this.telemetryChannel, 'telemetry');
      await subscribeToChannel(this.priorityChannel, 'priority');

      // Monitor connection state
      activeClient.connection.on('disconnected', () => {
        if (this.client !== activeClient) {
          return;
        }
        this.updateStatus('disconnected');
      });

      activeClient.connection.on('connected', () => {
        if (this.client !== activeClient) {
          return;
        }
        this.updateStatus('connected');
      });

      activeClient.connection.on('suspended', () => {
        if (this.client !== activeClient) {
          return;
        }
        this.updateStatus('suspended');
      });

      activeClient.connection.on('failed', () => {
        if (this.client !== activeClient) {
          return;
        }
        this.updateStatus('failed');
      });

      this.updateStatus('connected');
      console.log('[WebSocket] Connected to channels', channelNames);
      
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
      console.log(buildWebSocketLogPrefix('send', 'update', channelType, data), {
        channelName: targetChannel?.name || null,
        channelType,
        data
      });
      await targetChannel.publish('update', data);
      this.onSendMessageCallback?.({
        ...(data || {}),
        channelType,
        channelName: targetChannel?.name || null,
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
      console.log(buildWebSocketLogPrefix('send', 'update', channelType, payload), {
        channelName: targetChannel?.name || null,
        channelType,
        data: payload
      });
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
    this.bootstrapState = {
      mode: 'none',
      messages: [],
      snapshotMessages: [],
      priorityMessages: [],
      snapshotTimestamp: 0,
      snapshotVersion: 0,
      historyComplete: false
    };
    this.updateStatus('disconnected');
    console.log('[WebSocket] Disconnected');
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
