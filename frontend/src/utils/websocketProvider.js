/**
 * WebSocket Provider - Ably Only (Fully Frontend)
 * 
 * Ably allows direct client-side publishing, making it perfect for
 * a fully frontend application.
 * 
 * Key format: 1-{channelId} (keeping prefix for future extensibility)
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
    this.channelId = null;
    this.onMessageCallback = null;
    this.onStatusCallback = null;
    this.onSnapshotRequestCallback = null;
    this.onTimesSyncRequestCallback = null;
    this.onTimesLineRequestCallback = null;
    this.onTimesLineResponseCallback = null;
    this.isConnected = false;
    this.connectionState = 'disconnected';
  }

  async loadChannelHistory(limit = 50) {
    if (!this.channel) {
      return [];
    }

    try {
      const history = await this.channel.history({ limit, direction: 'backwards' });
      return Array.isArray(history?.items) ? history.items : [];
    } catch (error) {
      console.warn('[WebSocket] Failed to load channel history:', error);
      return [];
    }
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

      // Subscribe to channel
      this.channel = this.client.channels.get(`rally-${channelId}`);

      // Load the latest published full snapshot so subscriber clients can
      // start with a coherent state instead of replaying an arbitrary
      // partial section update from history.
      if (options.readHistory !== false) {
        const historyItems = await this.loadChannelHistory(200);
        const sessionManifestMessage = historyItems.find((message) => message?.name === 'session-manifest');
        const latestSnapshotVersion = Number(sessionManifestMessage?.data?.latestSnapshotVersion || 0);

        if (latestSnapshotVersion > 0) {
          const snapshotMessages = historyItems
            .filter((message) => {
              if (message?.name !== 'update') return false;
              const messageVersion = Number(message?.data?.snapshotVersion || 0);
              return message?.data?.messageType === 'full-snapshot' && messageVersion === latestSnapshotVersion;
            })
            .sort((a, b) => {
              const aIndex = Number.isFinite(a?.data?.partIndex) ? a.data.partIndex : 0;
              const bIndex = Number.isFinite(b?.data?.partIndex) ? b.data.partIndex : 0;
              return aIndex - bIndex;
            });

          if (snapshotMessages.length > 0) {
            console.log('[WebSocket] Loaded latest full snapshot from history');
            snapshotMessages.forEach((message) => {
              this.onMessageCallback?.(message.data);
            });
          } else {
            const latestUpdateMessage = historyItems.find((message) => message?.name === 'update');

            if (latestUpdateMessage?.data) {
              console.log('[WebSocket] Loaded latest update from history');
              this.onMessageCallback?.(latestUpdateMessage.data);
            }
          }
        } else {
          const latestUpdateMessage = historyItems.find((message) => message?.name === 'update');

          if (latestUpdateMessage?.data) {
            console.log('[WebSocket] Loaded latest snapshot from history');
            this.onMessageCallback?.(latestUpdateMessage.data);
          }
        }
      }
      
      // Subscribe to updates
      await this.channel.subscribe('update', (message) => {
        console.log('[WebSocket] Received update:', message.data);
        this.onMessageCallback?.(message.data);
      });

      await this.channel.subscribe('snapshot-request', () => {
        this.onSnapshotRequestCallback?.();
      });

      await this.channel.subscribe('times-sync-request', (message) => {
        this.onTimesSyncRequestCallback?.(message?.data);
      });

      await this.channel.subscribe('times-line-request', (message) => {
        this.onTimesLineRequestCallback?.(message?.data);
      });

      await this.channel.subscribe('times-line-response', (message) => {
        this.onTimesLineResponseCallback?.(message?.data);
      });

      await this.channel.subscribe('times-sync-ack', (message) => {
        this.onTimesSyncAckCallback?.(message?.data);
      });

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
      console.log(`[WebSocket] Connected to channel: rally-${channelId}`);
      
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

  /**
   * Publish data to the channel
   */
  async publish(data) {
    if (!this.isConnected || !this.channel) {
      console.warn('[WebSocket] Not connected, cannot publish');
      return false;
    }

    try {
      await this.channel.publish('update', data);
      console.log('[WebSocket] Published update');
      return true;
    } catch (error) {
      console.error('[WebSocket] Publish error:', error);
      return false;
    }
  }

  async requestSnapshot() {
    if (!this.isConnected || !this.channel) {
      console.warn('[WebSocket] Not connected, cannot request snapshot');
      return false;
    }

    try {
      await this.channel.publish('snapshot-request', { timestamp: Date.now() });
      console.log('[WebSocket] Requested snapshot');
      return true;
    } catch (error) {
      console.error('[WebSocket] Snapshot request error:', error);
      return false;
    }
  }

  async publishTimesSyncRequest(data) {
    if (!this.isConnected || !this.channel) {
      console.warn('[WebSocket] Not connected, cannot request times sync');
      return false;
    }

    try {
      await this.channel.publish('times-sync-request', data);
      return true;
    } catch (error) {
      console.error('[WebSocket] Times sync request error:', error);
      return false;
    }
  }

  async publishTimesLineRequest(data) {
    if (!this.isConnected || !this.channel) {
      console.warn('[WebSocket] Not connected, cannot request timing line');
      return false;
    }

    try {
      await this.channel.publish('times-line-request', data);
      return true;
    } catch (error) {
      console.error('[WebSocket] Times line request error:', error);
      return false;
    }
  }

  async publishTimesLineResponse(data) {
    if (!this.isConnected || !this.channel) {
      console.warn('[WebSocket] Not connected, cannot respond with timing line');
      return false;
    }

    try {
      await this.channel.publish('times-line-response', data);
      return true;
    } catch (error) {
      console.error('[WebSocket] Times line response error:', error);
      return false;
    }
  }

  async publishTimesSyncAck(data) {
    if (!this.isConnected || !this.channel) {
      console.warn('[WebSocket] Not connected, cannot ack times sync');
      return false;
    }

    try {
      await this.channel.publish('times-sync-ack', data);
      return true;
    } catch (error) {
      console.error('[WebSocket] Times sync ack error:', error);
      return false;
    }
  }

  async publishBootstrapMarker(data) {
    if (!this.isConnected || !this.channel) {
      console.warn('[WebSocket] Not connected, cannot publish bootstrap marker');
      return false;
    }

    try {
      await this.channel.publish('bootstrap-marker', data);
      return true;
    } catch (error) {
      console.error('[WebSocket] Bootstrap marker error:', error);
      return false;
    }
  }

  async loadBootstrapMarker() {
    const historyItems = await this.loadChannelHistory(100);
    const bootstrapMessage = historyItems.find((message) => message?.name === 'bootstrap-marker');
    return bootstrapMessage?.data || null;
  }

  async publishSessionManifest(data) {
    if (!this.isConnected || !this.channel) {
      console.warn('[WebSocket] Not connected, cannot publish session manifest');
      return false;
    }

    try {
      await this.channel.publish('session-manifest', data);
      return true;
    } catch (error) {
      console.error('[WebSocket] Session manifest error:', error);
      return false;
    }
  }

  async loadSessionManifest() {
    const historyItems = await this.loadChannelHistory(100);
    const manifestMessage = historyItems.find((message) => message?.name === 'session-manifest');
    return manifestMessage?.data || null;
  }

  

  /**
   * Disconnect from the channel
   */
  disconnect() {
    if (this.client) {
      this.client.close();
      this.client = null;
      this.channel = null;
    }
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
