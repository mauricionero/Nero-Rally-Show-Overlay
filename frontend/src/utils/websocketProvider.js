/**
 * WebSocket Provider Abstraction
 * Supports both Ably (prefix: 1-) and Pusher (prefix: 2-)
 * Auto-detects provider from key prefix
 */

import Ably from 'ably';
import Pusher from 'pusher-js';

// Provider identifiers
export const PROVIDERS = {
  ABLY: '1',
  PUSHER: '2'
};

export const PROVIDER_NAMES = {
  [PROVIDERS.ABLY]: 'Ably',
  [PROVIDERS.PUSHER]: 'Pusher'
};

/**
 * Generate a random channel key with provider prefix
 * Format: {provider}-{randomId}
 */
export const generateChannelKey = (provider = PROVIDERS.ABLY) => {
  const randomId = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${provider}-${randomId}`;
};

/**
 * Parse a channel key to extract provider and channel ID
 */
export const parseChannelKey = (fullKey) => {
  if (!fullKey || !fullKey.includes('-')) {
    return { provider: null, channelId: null };
  }
  const [provider, ...rest] = fullKey.split('-');
  const channelId = rest.join('-');
  return { provider, channelId };
};

/**
 * Get provider name from key
 */
export const getProviderFromKey = (fullKey) => {
  const { provider } = parseChannelKey(fullKey);
  return PROVIDER_NAMES[provider] || 'Unknown';
};

/**
 * WebSocket Provider Class - Unified interface for Ably and Pusher
 */
class WebSocketProvider {
  constructor() {
    this.client = null;
    this.channel = null;
    this.provider = null;
    this.channelId = null;
    this.onMessageCallback = null;
    this.onStatusCallback = null;
    this.isConnected = false;
  }

  /**
   * Connect to a channel using the full key (auto-detects provider)
   */
  async connect(fullKey, onMessage, onStatus) {
    const { provider, channelId } = parseChannelKey(fullKey);
    
    if (!provider || !channelId) {
      throw new Error('Invalid channel key format. Expected: {provider}-{channelId}');
    }

    this.provider = provider;
    this.channelId = channelId;
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;

    try {
      if (provider === PROVIDERS.ABLY) {
        await this.connectAbly(channelId);
      } else if (provider === PROVIDERS.PUSHER) {
        await this.connectPusher(channelId);
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      this.isConnected = true;
      this.onStatusCallback?.('connected', PROVIDER_NAMES[provider]);
    } catch (error) {
      this.isConnected = false;
      this.onStatusCallback?.('error', error.message);
      throw error;
    }
  }

  /**
   * Connect using Ably
   */
  async connectAbly(channelId) {
    const apiKey = process.env.REACT_APP_ABLY_KEY;
    if (!apiKey) {
      throw new Error('Ably API key not configured');
    }

    this.client = new Ably.Realtime({ key: apiKey });
    
    // Wait for connection
    await new Promise((resolve, reject) => {
      this.client.connection.on('connected', resolve);
      this.client.connection.on('failed', (err) => reject(new Error('Ably connection failed')));
      setTimeout(() => reject(new Error('Ably connection timeout')), 10000);
    });

    // Subscribe to channel
    this.channel = this.client.channels.get(`rally-${channelId}`);
    
    this.channel.subscribe('update', (message) => {
      this.onMessageCallback?.(message.data);
    });

    // Monitor connection state
    this.client.connection.on('disconnected', () => {
      this.isConnected = false;
      this.onStatusCallback?.('disconnected', 'Ably');
    });

    this.client.connection.on('connected', () => {
      this.isConnected = true;
      this.onStatusCallback?.('connected', 'Ably');
    });
  }

  /**
   * Connect using Pusher
   */
  async connectPusher(channelId) {
    const apiKey = process.env.REACT_APP_PUSHER_KEY;
    const cluster = process.env.REACT_APP_PUSHER_CLUSTER;
    
    if (!apiKey || !cluster) {
      throw new Error('Pusher API key or cluster not configured');
    }

    this.client = new Pusher(apiKey, {
      cluster: cluster,
      forceTLS: true
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      this.client.connection.bind('connected', resolve);
      this.client.connection.bind('error', (err) => reject(new Error('Pusher connection failed')));
      setTimeout(() => reject(new Error('Pusher connection timeout')), 10000);
    });

    // Subscribe to channel
    this.channel = this.client.subscribe(`rally-${channelId}`);
    
    this.channel.bind('update', (data) => {
      this.onMessageCallback?.(data);
    });

    // Monitor connection state
    this.client.connection.bind('disconnected', () => {
      this.isConnected = false;
      this.onStatusCallback?.('disconnected', 'Pusher');
    });

    this.client.connection.bind('connected', () => {
      this.isConnected = true;
      this.onStatusCallback?.('connected', 'Pusher');
    });
  }

  /**
   * Publish data to the channel
   * Note: Pusher requires a backend for publishing, so we use Ably's REST API
   * or we can use Pusher's client events (requires enabling client events)
   */
  async publish(data) {
    if (!this.isConnected || !this.channel) {
      console.warn('WebSocket not connected, cannot publish');
      return false;
    }

    try {
      if (this.provider === PROVIDERS.ABLY) {
        await this.channel.publish('update', data);
        return true;
      } else if (this.provider === PROVIDERS.PUSHER) {
        // Pusher client events - channel must be a private or presence channel
        // For simplicity, we'll use a workaround: send via the channel name
        // In production, you'd use a backend endpoint
        // For now, we trigger a client event (requires Pusher dashboard setting)
        this.channel.trigger('client-update', data);
        return true;
      }
    } catch (error) {
      console.error('Publish error:', error);
      return false;
    }
    
    return false;
  }

  /**
   * Disconnect from the channel
   */
  disconnect() {
    if (this.provider === PROVIDERS.ABLY && this.client) {
      this.client.close();
    } else if (this.provider === PROVIDERS.PUSHER && this.client) {
      this.client.disconnect();
    }
    
    this.client = null;
    this.channel = null;
    this.isConnected = false;
    this.onStatusCallback?.('disconnected', null);
  }

  /**
   * Check if connected
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      provider: this.provider ? PROVIDER_NAMES[this.provider] : null,
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
