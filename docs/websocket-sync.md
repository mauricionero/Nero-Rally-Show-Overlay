# WebSocket Sync Model

This app now uses a batch-based sync model with per-domain permissions and ownership-based snapshot leadership.

## Main Rules

- Setup is the primary source of truth for non-timing data.
- Times publishes only timing domains.
- Mobile publishes telemetry and `stageSos` only.
- Overlay mostly receives data and does not publish state.
- Each browser tab gets its own `instanceId` so self-echoes can be ignored.
- Changes are published as `delta-batch` packages, one domain/package at a time.
- `payload` is the canonical wire body for delta batches and control batches.
- Snapshot leadership belongs to the active setup owner.
- Setup ownership is leased with heartbeats and can fail over to another setup tab.
- The Ably transport is split into four derived channels per key:
  - `rally-data:{key}`
  - `rally-snapshots:{key}`
  - `rally-telemetry:{key}`
  - `rally-priority:{key}`
- Snapshots and telemetry do not share the data channel history.

## Important Files

- [`frontend/src/contexts/RallyContext.jsx`](../frontend/src/contexts/RallyContext.jsx)
  - Owns the app sync wiring.
  - Builds outgoing per-section packages.
  - Applies incoming websocket data to local state.
  - Controls setup ownership state and snapshot scheduling.
- [`frontend/src/utils/syncEngine.js`](../frontend/src/utils/syncEngine.js)
  - Owns the queue, flush, ownership lease, and snapshot timer.
  - Publishes one package at a time from the queue.
  - Filters incoming messages by role and source.
- [`frontend/src/utils/websocketProvider.js`](../frontend/src/utils/websocketProvider.js)
  - Wraps the Ably transport.
  - Loads paged history from the snapshots channel and the data channel separately.
  - Replays the latest snapshot batch from the snapshots channel, then applies newer data messages above that boundary.
  - Keeps telemetry isolated on its own channel so it does not interfere with snapshot/bootstrap history.
  - Exposes the bootstrap state used by setup to decide whether a fresh snapshot is needed.

## Outgoing Message Flow

The main sending path is:

1. `RallyContext.jsx` detects local changes.
2. It builds one package per domain or section.
3. The package is enqueued in `SyncEngine`.
4. `SyncEngine.flush()` sends queued packages one by one.
5. `websocketProvider.publish()` sends the actual Ably message.

Current public helper names:

- `connectSyncChannel()`
- `disconnectSyncChannel()`
- `publishOutgoingSyncBatch()`
- `publishDeltaBatchMessages()`
- `publishSetupSnapshotBatchMessages()`
- `publishDeltaBatchControl()`

## Incoming Message Flow

1. `websocketProvider` receives the raw Ably update.
2. `SyncEngine.normalizeIncoming()` parses it and applies permission filtering.
3. `WsMessageReceiver` routes the normalized payload into `RallyContext`.
4. `RallyContext.applyWebSocketData()` updates the live state.
5. Channel metadata is preserved on the message so the receiver can ignore telemetry when applying reconnect boundaries.

## Permissions

Recipient rules are enforced by role and domain:

- Setup receives everything from Setup.
- Times receives timing domains from Setup and Times.
- Times also receives `stageSos` from mobile.
- Overlay receives Setup data, times data, and telemetry from mobile.
- Mobile telemetry is accepted only for telemetry and SOS domains where allowed.

## Snapshot Policy

- The active setup owner publishes a snapshot every 5 minutes.
- The first snapshot in a session is tagged as `snapshotKind: initial`.
- Later periodic snapshots are tagged as `snapshotKind: periodic`.
- Times snapshot payloads are chunked per stage and split further if a stage is still too large.
- Setup ownership is represented by a heartbeat lease.
- If another setup tab misses 3 heartbeats, it can claim ownership.

## Reconnect Policy

Reconnect bootstrap now pages Ably history backwards until it can prove the boundary on the correct channel:

- If the last received message is older than the 5 minute freshness window, load the latest snapshot batch from the snapshots channel and then replay newer data messages above that snapshot boundary.
- If the last received message is recent, skip snapshot bootstrap and replay data-channel history until it reaches the last received message marker.
- History is processed in ascending order after paging backwards, so batches stay ordered correctly.
- If multiple snapshot representations exist, prefer `snapshotVersion`, then `snapshotId`, then timestamp as a fallback.
- Telemetry reconnect does not participate in the main bootstrap path; it stays isolated on the telemetry channel.

This avoids the old fixed-window heuristic and prevents reconnect from stopping before the required history window has been loaded.
