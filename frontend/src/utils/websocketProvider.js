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
    this.isConnected = false;
    this.connectionState = 'disconnected';
  }

  /**
   * Connect to a channel using the full key
   */
  async connect(fullKey, onMessage, onStatus) {
    const { valid, channelId } = parseChannelKey(fullKey);
    
    if (!valid || !channelId) {
      throw new Error('Invalid channel key format');
    }

    this.channelId = channelId;
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;

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
      
      // Subscribe to updates
      await this.channel.subscribe('update', (message) => {
        console.log('[WebSocket] Received update:', message.data);
        this.onMessageCallback?.(message.data);
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
