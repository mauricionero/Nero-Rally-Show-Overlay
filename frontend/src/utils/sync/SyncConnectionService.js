import { isConnectionDebugEnabled, isHeartbeatDebugEnabled, isTransportDebugEnabled } from '../debugFlags.js';

/**
 * SyncConnectionService owns the live connection lifecycle around the provider:
 * bootstrap from history, subscribe in the correct order, and recover after
 * reconnects.
 *
 * The provider still owns raw Ably transport primitives like publish, history,
 * status callbacks, and channel references. This service orchestrates those
 * primitives into one connection flow that is easier to trace.
 */
export class SyncConnectionService {
  constructor({
    provider,
    client,
    channelId,
    channelNames,
    options = {},
    isOwnMessage,
    normalizeIncomingEnvelope,
    buildWebSocketLogPrefix
  }) {
    this.provider = provider;
    this.client = client;
    this.channelId = channelId;
    this.channelNames = channelNames;
    this.options = options;
    this.isOwnMessage = typeof isOwnMessage === 'function' ? isOwnMessage : () => false;
    this.normalizeIncomingEnvelope = normalizeIncomingEnvelope;
    this.buildWebSocketLogPrefix = buildWebSocketLogPrefix;
    this.hasCompletedInitialConnect = false;
    this.recoveryPromise = null;
  }

  buildHistoryOptions(overrides = {}) {
    const marker = overrides.lastReceivedMarker || this.provider.lastProjectMarker || this.options.lastReceivedMarker || null;
    const markerTimestamp = Number(marker?.timestamp || 0);

    return {
      limit: overrides.limit || this.options.historyLimit || 250,
      lastReceivedAt: Number(
        overrides.lastReceivedAt
        || markerTimestamp
        || this.options.lastReceivedAt
        || 0
      ),
      lastReceivedMarker: marker,
      snapshotStalenessMs: overrides.snapshotStalenessMs || this.options.snapshotStalenessMs || (5 * 60 * 1000),
      requireSnapshotBootstrap: overrides.requireSnapshotBootstrap === true
    };
  }

  async applyHistoryBootstrap(historyBootstrap) {
    if (!historyBootstrap) {
      return;
    }

    this.provider.waitingForSnapshotBootstrap = historyBootstrap.mode === 'await-snapshot';

    if (historyBootstrap.mode === 'snapshot' && historyBootstrap.snapshotMessages.length > 0) {
      this.provider.historyBootstrapLoadedSnapshot = true;
      if (isTransportDebugEnabled()) {
        console.log('[WebSocket][RX][history] Loaded snapshot bootstrap from history', {
          count: historyBootstrap.snapshotMessages.length,
          snapshotTimestamp: historyBootstrap.snapshotTimestamp,
          snapshotVersion: historyBootstrap.snapshotVersion || null
        });
      }

      await this.provider.dispatchMessagesInChunks(
        historyBootstrap.snapshotMessages,
        (message) => this.normalizeIncomingEnvelope(
          message.data,
          'snapshots',
          this.channelNames.snapshots
        ),
        'history'
      );

      const replayMessages = historyBootstrap.messages.filter((message) => (
        Number(message?.data?.timestamp || message?.timestamp || 0) > historyBootstrap.snapshotTimestamp
        && !(message?.data?.messageType === 'delta-batch' && message?.data?.packageType === 'snapshot')
      ));

      if (replayMessages.length > 0) {
        if (isTransportDebugEnabled()) {
          console.log('[WebSocket][RX][history] Replayed incremental updates after snapshot', {
            count: replayMessages.length,
            snapshotTimestamp: historyBootstrap.snapshotTimestamp
          });
        }
        await this.provider.dispatchMessagesInChunks(
          replayMessages,
          (message) => this.normalizeIncomingEnvelope(
            message.data,
            'data',
            this.channelNames.data
          ),
          'history'
        );
      }

      if (historyBootstrap.priorityMessages.length > 0) {
        if (isTransportDebugEnabled()) {
          console.log('[WebSocket][RX][history] Replayed high-priority updates after snapshot', {
            count: historyBootstrap.priorityMessages.length,
            snapshotTimestamp: historyBootstrap.snapshotTimestamp
          });
        }
        await this.provider.dispatchMessagesInChunks(
          historyBootstrap.priorityMessages,
          (message) => this.normalizeIncomingEnvelope(
            message.data,
            'priority',
            this.channelNames.priority
          ),
          'history'
        );
      }

      if (isTransportDebugEnabled()) {
        console.log('[WebSocket][RX][bootstrap] Applied history summary', {
          channelId: this.channelId,
          mode: historyBootstrap.mode,
          snapshotMessagesUsed: historyBootstrap.snapshotMessages.length,
          replayMessagesUsed: historyBootstrap.messages.length,
          priorityMessagesUsed: historyBootstrap.priorityMessages.length,
          totalMessagesRead: historyBootstrap.snapshotMessages.length + historyBootstrap.messages.length + historyBootstrap.priorityMessages.length
        });
      }
      return;
    }

    if (historyBootstrap.messages.length > 0 || historyBootstrap.priorityMessages.length > 0) {
      this.provider.historyBootstrapLoadedSnapshot = false;
      if (isTransportDebugEnabled()) {
        console.log('[WebSocket][RX][history] Replaying history without snapshot bootstrap', {
          count: historyBootstrap.messages.length,
          mode: historyBootstrap.mode,
          historyComplete: !!historyBootstrap.historyComplete
        });
      }

      await this.provider.dispatchMessagesInChunks(
        historyBootstrap.messages,
        (message) => this.normalizeIncomingEnvelope(
          message.data,
          'data',
          this.channelNames.data
        ),
        'history'
      );

      if (historyBootstrap.priorityMessages.length > 0) {
        if (isTransportDebugEnabled()) {
          console.log('[WebSocket][RX][history] Replaying high-priority history', {
            count: historyBootstrap.priorityMessages.length,
            mode: historyBootstrap.mode,
            historyComplete: !!historyBootstrap.historyComplete
          });
        }
        await this.provider.dispatchMessagesInChunks(
          historyBootstrap.priorityMessages,
          (message) => this.normalizeIncomingEnvelope(
            message.data,
            'priority',
            this.channelNames.priority
          ),
          'history'
        );
      }

      if (isTransportDebugEnabled()) {
        console.log('[WebSocket][RX][bootstrap] Applied history summary', {
          channelId: this.channelId,
          mode: historyBootstrap.mode,
          snapshotMessagesUsed: historyBootstrap.snapshotMessages.length,
          replayMessagesUsed: historyBootstrap.messages.length,
          priorityMessagesUsed: historyBootstrap.priorityMessages.length,
          totalMessagesRead: historyBootstrap.snapshotMessages.length + historyBootstrap.messages.length + historyBootstrap.priorityMessages.length
        });
      }
    }
  }

  async runHistoryRecovery(recoveryOverrides = {}) {
    if (this.options.readHistory === false) {
      return null;
    }

    if (isConnectionDebugEnabled()) {
      console.log('[SyncConnection][history][recover][start]', {
        channelId: this.channelId,
        overrides: recoveryOverrides
      });
    }

    const historyBootstrap = await this.provider.loadBootstrapHistory(this.buildHistoryOptions(recoveryOverrides));
    await this.applyHistoryBootstrap(historyBootstrap);

    if (isConnectionDebugEnabled()) {
      console.log('[SyncConnection][history][recover][done]', {
        channelId: this.channelId,
        mode: historyBootstrap?.mode || 'none',
        snapshotTimestamp: Number(historyBootstrap?.snapshotTimestamp || 0),
        replayCount: Number(historyBootstrap?.messages?.length || 0),
        priorityCount: Number(historyBootstrap?.priorityMessages?.length || 0)
      });
    }

    return historyBootstrap;
  }

  async subscribeToChannel(channel, channelType, eventName = 'update') {
    if (!channel) {
      return;
    }

    if (isConnectionDebugEnabled()) {
      console.log('[SyncConnection][live][subscribe]', {
        channelType,
        channelName: channel.name
      });
    }

    const handler = (message) => {
      const routedData = this.normalizeIncomingEnvelope(
        message.data,
        channelType,
        channel.name
      );
      const isSnapshotMessage = routedData?.messageType === 'delta-batch' && routedData?.packageType === 'snapshot';

      if (channelType === 'snapshots') {
        if (!this.provider.waitingForSnapshotBootstrap || !isSnapshotMessage) {
          return;
        }
      } else if (this.provider.waitingForSnapshotBootstrap) {
        return;
      }

      if (this.isOwnMessage(message)) {
        if (routedData?.messageType === 'ownership-heartbeat') {
          if (isHeartbeatDebugEnabled()) {
            console.log(this.buildWebSocketLogPrefix('echo', 'update', channelType, routedData, 'Heartbeat'), {
              channelType,
              data: routedData
            });
          }
        } else if (isTransportDebugEnabled()) {
          console.log(this.buildWebSocketLogPrefix('echo', 'update', channelType, routedData), {
            channelType,
            data: routedData
          });
        }
        this.provider.onEchoMessageCallback?.({
          timestamp: Number(message?.timestamp || Date.now()),
          channelType,
          data: routedData
        });
        this.provider.notifyReceive('update', Number(message?.timestamp || Date.now()), 'echo', routedData);
        if (
          channelType === 'snapshots'
          && Number(routedData?.partIndex || 0) + 1 >= Number(routedData?.totalParts || 1)
        ) {
          this.provider.waitingForSnapshotBootstrap = false;
          this.provider.historyBootstrapLoadedSnapshot = true;
          this.provider.unsubscribeChannelType('snapshots');
          void this.ensureLiveSubscriptions();
        }
        return;
      }

      if (routedData?.messageType === 'ownership-heartbeat') {
        if (isHeartbeatDebugEnabled()) {
          console.log(this.buildWebSocketLogPrefix('receive', 'update', channelType, routedData, 'Heartbeat'), {
            channelType,
            data: routedData
          });
        }
      } else if (isTransportDebugEnabled()) {
        console.log(this.buildWebSocketLogPrefix('receive', 'update', channelType, routedData), {
          channelType,
          data: routedData
        });
      }
      this.provider.notifyReceive('update', Number(message?.timestamp || Date.now()), 'live', routedData);
      this.provider.onMessageCallback?.(routedData);
      if (
        channelType === 'snapshots'
        && Number(routedData?.partIndex || 0) + 1 >= Number(routedData?.totalParts || 1)
      ) {
        this.provider.waitingForSnapshotBootstrap = false;
        this.provider.historyBootstrapLoadedSnapshot = true;
        this.provider.unsubscribeChannelType('snapshots');
        void this.ensureLiveSubscriptions();
      }
    };

    await channel.subscribe(eventName, handler);
    this.provider.channelSubscriptions.push({
      channel,
      eventName,
      handler
    });
  }

  async ensureLiveSubscriptions() {
    if (!this.provider.hasChannelSubscription('data')) {
      await this.subscribeToChannel(this.provider.dataChannel, 'data');
    }
    if (!this.provider.hasChannelSubscription('priority')) {
      await this.subscribeToChannel(this.provider.priorityChannel, 'priority');
    }
    if (!this.provider.hasChannelSubscription('telemetry')) {
      await this.subscribeToChannel(this.provider.telemetryChannel, 'telemetry');
    }
  }

  async recoverAfterReconnect() {
    if (this.recoveryPromise) {
      return this.recoveryPromise;
    }

    if (isConnectionDebugEnabled()) {
      console.log('[SyncConnection][reconnect][recover][start]', {
        channelId: this.channelId
      });
    }

    this.recoveryPromise = (async () => {
      if (this.options.readHistory !== false) {
        const recoveryResult = await this.runHistoryRecovery();
        if (recoveryResult?.mode === 'await-snapshot' && !this.provider.hasChannelSubscription('snapshots')) {
          await this.subscribeToChannel(this.provider.snapshotChannel, 'snapshots');
          this.provider.needsRecoveryAfterReconnect = true;
          return true;
        }
      }

      await this.ensureLiveSubscriptions();
      this.provider.needsRecoveryAfterReconnect = false;
      if (isConnectionDebugEnabled()) {
        console.log('[SyncConnection][reconnect][recover][done]', {
          channelId: this.channelId
        });
      }
      return true;
    })().finally(() => {
      this.recoveryPromise = null;
    });

    return this.recoveryPromise;
  }

  attachConnectionListeners() {
    this.client.connection.on('connecting', () => {
      if (this.provider.client !== this.client) {
        return;
      }
      this.provider.updateStatus('connecting');
    });

    this.client.connection.on('disconnected', () => {
      if (this.provider.client !== this.client) {
        return;
      }
      this.provider.updateStatus('connecting');
    });

    this.client.connection.on('connected', () => {
      if (this.provider.client !== this.client) {
        return;
      }
      if (!this.hasCompletedInitialConnect) {
        return;
      }

      if (!this.provider.needsRecoveryAfterReconnect) {
        this.provider.updateStatus('connected');
        return;
      }

      void this.recoverAfterReconnect()
        .then(() => {
          if (this.provider.client !== this.client) {
            return;
          }
          this.provider.updateStatus('connected');
        })
        .catch((recoveryError) => {
          if (this.provider.client !== this.client) {
            return;
          }
          this.provider.updateStatus('error', recoveryError?.message || 'Reconnect recovery failed');
        });
    });

    this.client.connection.on('suspended', () => {
      if (this.provider.client !== this.client) {
        return;
      }
      this.provider.needsRecoveryAfterReconnect = true;
      this.provider.updateStatus('connecting');
    });

    this.client.connection.on('failed', () => {
      if (this.provider.client !== this.client) {
        return;
      }
      this.provider.needsRecoveryAfterReconnect = true;
      this.provider.updateStatus('failed');
    });
  }

  async start() {
    if (isConnectionDebugEnabled()) {
      console.log('[SyncConnection][start][bootstrap]', {
        channelId: this.channelId,
        readHistory: this.options.readHistory !== false,
        requireSnapshotBootstrap: this.options.requireSnapshotBootstrap === true
      });
    }

    const initialHistoryBootstrap = this.options.readHistory !== false
      ? await this.runHistoryRecovery({
          requireSnapshotBootstrap: this.options.requireSnapshotBootstrap === true
        })
      : null;

    const waitingForLiveSnapshotBootstrap = (this.options.requireSnapshotBootstrap === true || initialHistoryBootstrap?.mode === 'await-snapshot')
      && !this.provider.historyBootstrapLoadedSnapshot;

    if (waitingForLiveSnapshotBootstrap) {
      await this.subscribeToChannel(this.provider.snapshotChannel, 'snapshots');
    }

    if (!waitingForLiveSnapshotBootstrap) {
      await this.ensureLiveSubscriptions();
    }

    this.attachConnectionListeners();

    this.provider.updateStatus('connected');
    this.hasCompletedInitialConnect = true;

    if (isConnectionDebugEnabled()) {
      console.log('[SyncConnection][start][ready]', {
        channelId: this.channelId,
        waitingForSnapshotBootstrap: waitingForLiveSnapshotBootstrap,
        historyBootstrapMode: initialHistoryBootstrap?.mode || 'none'
      });
    }

    if (isTransportDebugEnabled()) {
      console.log('[WebSocket] Connected to channels', this.channelNames);
    }
  }
}

export default SyncConnectionService;
