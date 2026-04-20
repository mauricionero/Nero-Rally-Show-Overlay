# WebSocket Package Reference

This is the quick reference for the websocket formats used by the app. It mirrors the actual code paths in `frontend/src/utils/websocketProvider.js`, `frontend/src/utils/syncEngine.js`, `frontend/src/utils/sync/SyncOutboundService.js`, `frontend/src/utils/sync/SyncInboundService.js`, and `frontend/src/utils/wsMessageReceiver.js`.

## Channels

The app routes messages to four logical channels:

- `data`
  - Normal sync traffic for Setup, Times, and Overlay state changes.
- `snapshots`
  - Full bootstrap/recovery snapshots.
- `telemetry`
  - Live pilot telemetry only.
- `priority`
  - Urgent low-volume traffic such as ownership messages and some control messages.

## Message Families

### `delta-batch`

This is the main sync package format for normal state changes.

Common fields:

```json
{
  "messageType": "delta-batch",
  "packageType": "delta",
  "timestamp": 1710000000000,
  "batchId": "batch-abc123",
  "partIndex": 0,
  "totalParts": 1,
  "payload": {
    "times": {
      "pilot-id": {
        "stage-id": "12:34:56.789"
      }
    }
  }
}
```

Notes:

- `packageType` is usually `delta`.
- Large payloads can be split into multiple parts with the same `batchId`.
- `partIndex` is zero-based and `totalParts` tells you how many parts belong to the package.
- The app merges queued delta batches for normal state changes.

### `delta-batch` snapshot

Snapshot packages use the same outer wrapper, but with `packageType: "snapshot"`.

```json
{
  "messageType": "delta-batch",
  "packageType": "snapshot",
  "originalMessageType": "full-snapshot",
  "timestamp": 1710000000000,
  "snapshotId": "snapshot-abc123",
  "partIndex": 0,
  "totalParts": 3,
  "payload": {
    "meta": {},
    "pilots": {},
    "stages": {}
  }
}
```

Notes:

- Snapshots are used for bootstrap and recovery.
- Multi-part snapshots are reassembled before being applied.
- The app tracks `snapshotId`, `partIndex`, and `totalParts` to merge the pieces.

### `delta-batch` control

Control packages also use the `delta-batch` message type, but with `packageType: "control"`.

```json
{
  "messageType": "delta-batch",
  "packageType": "control",
  "controlType": "times-line-request",
  "source": "setup",
  "sourceRole": "setup",
  "sourceInstanceId": "instance-1",
  "instanceId": "instance-1",
  "timestamp": 1710000000000,
  "payload": {
    "controlType": "times-line-request",
    "pilotId": "pilot-id",
    "stageId": "stage-id"
  }
}
```

Common control types seen in the codebase:

- `times-line-request`
- `times-line-response`
- `sos-ack`

Use control messages when you need a lightweight action that is not normal timing state.

### Ownership messages

Ownership coordination is sent as direct messages, not as `delta-batch` control packages.

```json
{
  "messageType": "ownership-heartbeat",
  "ownerId": "instance-1",
  "ownerEpoch": 12,
  "timestamp": 1710000000000
}
```

Related message types:

- `ownership-heartbeat`
- `ownership-claim`
- `ownership-release`

These are used by the sync engine to manage Setup ownership and failover.

### Pilot telemetry

Pilot telemetry is its own message family and is routed to the telemetry channel when published.

```json
{
  "messageType": "pilot-telemetry",
  "pilotId": "pilot-id",
  "source": "android-app",
  "latLong": "-23.5,-46.6",
  "latlongTimestamp": 1710000000000,
  "lastTelemetryAt": 1710000000100,
  "speed": 74.3,
  "heading": 182,
  "gpsPrecision": 3.1
}
```

Notes:

- `pilotId` is required.
- The app accepts telemetry from trusted sources only, including `android-app`, `setup-relay`, `pilot-script`, and `dirt-rally-2`.
- Telemetry can also be wrapped as `payload.pilotTelemetry` inside a `delta-batch` delta message when it comes through the setup sync path.

### Direct pilot launcher

The pilot telemetry page can export a standalone launcher for one pilot. The downloaded `.bat` file contains a self-extracting PowerShell reader, reads Dirt Rally 2.0 UDP telemetry, and publishes `pilot-telemetry` packets directly to the Ably telemetry channel for the current race key.

The launcher does not embed the Ably master key. The page mints a short-lived, channel-scoped Ably token in the browser at download time and embeds only that token in the exported script.

The launcher uses this shape:

```json
{
  "messageType": "pilot-telemetry",
  "pilotId": "pilot-id",
  "source": "dirt-rally-2",
  "latLong": "",
  "speed": 74.3,
  "heading": 182,
  "gForce": 2.4,
  "longitudinalG": 1.8,
  "lateralG": 1.6,
  "lastTelemetryAt": 1710000000100,
  "latlongTimestamp": 1710000000100
}
```

Notes:

- `source` should be one of the trusted telemetry sources listed above.
- The launcher publishes on `rally-telemetry:{channelId}`.
- The matching UI is `/pilot-telemetry?ws=...&pilotId=...`.
- The page is display-only; the BAT launcher is the sender.
- The launcher is Windows-only and depends on PowerShell, not Python.

## How To Use It

### When sending normal state

Use the sync layer, not raw channel publishing:

- `RallyContext` normalizes state changes.
- `SyncOutboundService` splits large change maps into packages.
- `SyncEngine` queues and publishes the packages.

### When sending snapshots

- Use `packageType: "snapshot"`.
- Let the sync engine and message receiver handle part reassembly.
- Snapshots are for bootstrap/recovery, not incremental editing.

### When sending control messages

- Use `packageType: "control"` with a `controlType`.
- Keep the payload small and explicit.
- Use priority when the message must skip the normal queue.

### When sending telemetry

- Publish `messageType: "pilot-telemetry"` to the telemetry channel.
- Keep the payload to the pilot and telemetry fields only.
- Do not mix telemetry into the normal `times` or `stages` domains.

## Practical Rules

- `data` is for state changes.
- `snapshots` are for bootstrap and recovery.
- `telemetry` is for live pilot telemetry.
- `priority` is for urgent low-volume traffic.
- `delta-batch` is the normal sync envelope.
- `ownership-*` messages are handled specially by the sync engine.
- `pilot-telemetry` is handled specially by telemetry ingestion.

If you need the exact implementation details, check:

- `frontend/src/utils/syncEngine.js`
- `frontend/src/utils/sync/SyncOutboundService.js`
- `frontend/src/utils/sync/SyncInboundService.js`
- `frontend/src/utils/wsMessageReceiver.js`
- `frontend/src/utils/websocketProvider.js`
