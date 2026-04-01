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
    this.channelId = null;
    this.channelNames = {
      data: null,
      snapshots: null,
      telemetry: null
    };
    this.onMessageCallback = null;
    this.onStatusCallback = null;
    this.onSnapshotRequestCallback = null;
    this.onTimesSyncRequestCallback = null;
    this.onTimesLineRequestCallback = null;
    this.onTimesLineResponseCallback = null;
    this.onReceiveActivityCallback = null;
    this.onSendActivityCallback = null;
    this.onSendMessageCallback = null;
    this.isConnected = false;
    this.connectionState = 'disconnected';
    this.historyBootstrapLoadedSnapshot = false;
    this.historyBootstrapNeedsSnapshot = false;
    this.bootstrapState = {
      mode: 'none',
      messages: [],
      snapshotMessages: [],
      snapshotTimestamp: 0,
      snapshotVersion: 0,
      sessionManifest: null,
      historyComplete: false
    };
  }

  getChannelNames(channelId = this.channelId) {
    if (!channelId) {
      return {
        data: null,
        snapshots: null,
        telemetry: null
      };
    }

    return {
      data: `rally-${channelId}-data`,
      snapshots: `rally-${channelId}-snapshots`,
      telemetry: `rally-${channelId}-telemetry`
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

  isSessionManifestMessage(message) {
    return (
      this.isUpdateHistoryMessage(message)
      && message?.data?.messageType === 'delta-batch'
      && message?.data?.packageType === 'control'
      && message?.data?.controlType === 'session-manifest'
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
      sessionManifest: this.bootstrapState?.sessionManifest ? { ...this.bootstrapState.sessionManifest } : null
    };
  }

  async loadBootstrapHistory(options = {}) {
    const dataChannel = this.dataChannel || this.channel;
    const snapshotChannel = this.snapshotChannel || this.channel;

    if (!dataChannel && !snapshotChannel) {
      this.bootstrapState = {
        mode: 'none',
        messages: [],
        snapshotMessages: [],
        snapshotTimestamp: 0,
        snapshotVersion: 0,
        sessionManifest: null,
        historyComplete: false
      };
      return {
        messages: [],
        snapshotMessages: [],
        snapshotTimestamp: 0,
        snapshotVersion: 0,
        sessionManifest: null,
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

    const updateMessages = dataCollected.filter((message) => this.isUpdateHistoryMessage(message));
    const latestManifestMessage = updateMessages.find((message) => this.isSessionManifestMessage(message)) || null;
    const sessionManifest = latestManifestMessage?.data || null;
    const manifestSnapshotVersion = Number(sessionManifest?.latestSnapshotVersion || 0);
    const manifestSnapshotTimestamp = Number(sessionManifest?.lastSnapshotAt || 0);
    const manifestSnapshotId = String(sessionManifest?.snapshotId || '').trim();
    const snapshotVersion = manifestSnapshotVersion || Number(sessionManifest?.snapshotVersion || 0) || Number(snapshotMessages[0]?.data?.snapshotVersion || 0);
    const selectedSnapshotId = manifestSnapshotId || String(snapshotMessages[0]?.data?.snapshotId || '').trim();
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

    this.bootstrapState = {
      mode: shouldUseSnapshot && snapshotMessages.length > 0 ? 'snapshot' : 'replay',
      messages,
      snapshotMessages,
      snapshotTimestamp,
      snapshotVersion,
      sessionManifest,
      historyComplete: true
    };

    console.log('[WebSocket][RX][bootstrap] History applied', {
      mode: this.bootstrapState.mode,
      totalReadCount: dataCollected.length + snapshotCollected.length,
      usedSnapshotCount: snapshotMessages.length,
      usedReplayCount: messages.length,
      droppedCount: Math.max(0, (dataCollected.length + snapshotCollected.length) - snapshotMessages.length - messages.length),
      snapshotTimestamp,
      snapshotVersion
    });

    return {
      messages,
      snapshotMessages,
      snapshotTimestamp,
      snapshotVersion,
      sessionManifest,
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
    this.onSnapshotRequestCallback = options.onSnapshotRequest || null;
    this.onTimesSyncRequestCallback = options.onTimesSyncRequest || null;
    this.onTimesLineRequestCallback = options.onTimesLineRequest || null;
    this.onTimesLineResponseCallback = options.onTimesLineResponse || null;
    this.onTimesSyncAckCallback = options.onTimesSyncAck || null;
    this.onTimesSyncRequestCallback = options.onTimesSyncRequest || null;
    this.onReceiveActivityCallback = options.onReceiveActivity || null;
    this.onSendActivityCallback = options.onSendActivity || null;
    this.onSendMessageCallback = options.onSendMessage || null;
    this.historyBootstrapLoadedSnapshot = false;
    this.historyBootstrapNeedsSnapshot = false;
    this.bootstrapState = {
      mode: 'none',
      messages: [],
      snapshotMessages: [],
      snapshotTimestamp: 0,
      snapshotVersion: 0,
      sessionManifest: null,
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
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 15000);
        
        this.client.connection.on('connected', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        this.client.connection.on('failed', (stateChange) => {
          clearTimeout(timeout);
          reject(new Error(stateChange.reason?.message || 'Connection failed'));
        });
      });

      const channelNames = this.getChannelNames(channelId);
      this.channelNames = channelNames;
      this.dataChannel = this.client.channels.get(channelNames.data);
      this.snapshotChannel = this.client.channels.get(channelNames.snapshots);
      this.telemetryChannel = this.client.channels.get(channelNames.telemetry);
      this.channel = this.dataChannel;

      const isOwnMessage = (message) => {
        const messageConnectionId = String(message?.connectionId || '').trim();
        const localConnectionId = String(this.client?.connection?.id || '').trim();
        return !!messageConnectionId && !!localConnectionId && messageConnectionId === localConnectionId;
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
          this.historyBootstrapNeedsSnapshot = false;
          console.log('[WebSocket][RX][history] Loaded snapshot bootstrap from history', {
            count: historyBootstrap.snapshotMessages.length,
            snapshotTimestamp: historyBootstrap.snapshotTimestamp,
            snapshotVersion: historyBootstrap.snapshotVersion || null
          });

          historyBootstrap.snapshotMessages.forEach((message) => {
            const routedData = {
              ...message.data,
              channelType: 'snapshots',
              channelName: channelNames.snapshots
            };
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
              const routedData = {
                ...message.data,
                channelType: 'data',
                channelName: channelNames.data
              };
              this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'history', routedData);
              this.onMessageCallback?.(routedData);
            });
          }

          console.log('[WebSocket][RX][bootstrap] Applied history summary', {
            channelId,
            mode: historyBootstrap.mode,
            snapshotMessagesUsed: historyBootstrap.snapshotMessages.length,
            replayMessagesUsed: historyBootstrap.messages.length,
            totalMessagesRead: historyBootstrap.snapshotMessages.length + historyBootstrap.messages.length
          });
        } else if (historyBootstrap.messages.length > 0) {
          this.historyBootstrapLoadedSnapshot = false;
          this.historyBootstrapNeedsSnapshot = historyBootstrap.mode !== 'replay' && !historyBootstrap.historyComplete;
          console.log('[WebSocket][RX][history] Replaying history without snapshot bootstrap', {
            count: historyBootstrap.messages.length,
            mode: historyBootstrap.mode,
            historyComplete: !!historyBootstrap.historyComplete
          });

          historyBootstrap.messages.forEach((message) => {
            const routedData = {
              ...message.data,
              channelType: 'data',
              channelName: channelNames.data
            };
            this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'history', routedData);
            this.onMessageCallback?.(routedData);
          });

          console.log('[WebSocket][RX][bootstrap] Applied history summary', {
            channelId,
            mode: historyBootstrap.mode,
            snapshotMessagesUsed: historyBootstrap.snapshotMessages.length,
            replayMessagesUsed: historyBootstrap.messages.length,
            totalMessagesRead: historyBootstrap.snapshotMessages.length + historyBootstrap.messages.length
          });
        }
      }

      const subscribeToChannel = async (channel, channelType, eventName = 'update') => {
        if (!channel) {
          return;
        }

        await channel.subscribe(eventName, (message) => {
          if (isOwnMessage(message)) {
            console.log('[WebSocket][ECHO][update]', {
              channelType,
              data: message.data
            });
            return;
          }

          const routedData = {
            ...(message.data || {}),
            channelType,
            channelName: channel.name
          };
          console.log('[WebSocket][RX][update]', {
            channelType,
            data: routedData
          });
          this.notifyReceive('update', Number(message?.timestamp || Date.now()), 'live', routedData);
          this.onMessageCallback?.(routedData);
        });
      };

      await subscribeToChannel(this.dataChannel, 'data');
      await subscribeToChannel(this.snapshotChannel, 'snapshots');
      await subscribeToChannel(this.telemetryChannel, 'telemetry');

      // Monitor connection state
      this.client.connection.on('disconnected', () => {
        this.updateStatus('disconnected');
      });

      this.client.connection.on('connected', () => {
        this.updateStatus('connected');
      });

      this.client.connection.on('suspended', () => {
        this.updateStatus('suspended');
      });

      this.client.connection.on('failed', () => {
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
    if (explicitChannelType === 'snapshots' || explicitChannelType === 'snapshot') {
      return this.snapshotChannel || this.channel;
    }

    if (explicitChannelType === 'telemetry') {
      return this.telemetryChannel || this.channel;
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
      await targetChannel.publish('update', data);
      console.log('[WebSocket][TX][update]', {
        channelName: targetChannel?.name || null,
        channelType: targetChannel === this.snapshotChannel ? 'snapshots' : targetChannel === this.telemetryChannel ? 'telemetry' : 'data',
        data
      });
      this.onSendMessageCallback?.({
        ...(data || {}),
        channelType: targetChannel === this.snapshotChannel ? 'snapshots' : targetChannel === this.telemetryChannel ? 'telemetry' : 'data',
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
    const targetChannel = this.dataChannel || this.channel;

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

      await targetChannel.publish('update', payload);
      console.log('[WebSocket][TX][update]', {
        channelName: targetChannel?.name || null,
        channelType: 'data',
        data: payload
      });
      this.onSendMessageCallback?.({
        ...payload,
        channelType: 'data',
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
    if (this.client) {
      this.client.close();
      this.client = null;
      this.channel = null;
      this.dataChannel = null;
      this.snapshotChannel = null;
      this.telemetryChannel = null;
      this.onSendMessageCallback = null;
    }
    this.bootstrapState = {
      mode: 'none',
      messages: [],
      snapshotMessages: [],
      snapshotTimestamp: 0,
      snapshotVersion: 0,
      sessionManifest: null,
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
