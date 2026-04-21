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
  "latLong": "-12.3456789,45.6789123",
  "latlongTimestamp": 1710000000000,
  "lastTelemetryAt": 1710000000100,
  "speed": 74.3,
  "heading": 182,
  "gpsPrecision": 3.1,
  "gForce": 2.4,
  "rpmReal": 7421.5,
  "rpmPercentage": 88.3,
  "gear": 4,
  "distance": 1823.412
}
```

Notes:

- `pilotId` is required.
- The app accepts telemetry from trusted sources only, including `android-app`, `setup-relay`, `pilot-script`, and `dirt-rally-2`.
- Telemetry can also be wrapped as `payload.pilotTelemetry` inside a `delta-batch` delta message when it comes through the setup sync path.
- `latLong` is a normalized local-map coordinate string in the form `"<lat>,<lon>"`, not real GPS. The launcher currently emits 7 decimal places.
- `rpmReal` takes priority over `rpmPercentage` when both are present.
- `gear` is a signed integer, where `-1` means reverse.
- `distance` is the distance driven in the current stage/lap context and is combined with the stage metadata distance to derive track progress.
- `gForce` is the primary G-force value shown on the overlays.
- `Max RPM` and `Idle RPM` are pilot configuration values, not live telemetry fields.
- `maxGears` is not used.
- Timing fields such as `arrivalTime`, `runTime`, and `lapTime` are not part of the live telemetry packet. They are handled by the timing side of the system.

### Direct pilot launcher

The pilot telemetry page can export a standalone launcher for one pilot. The downloaded `.bat` file contains a self-extracting PowerShell reader, reads Dirt Rally 2.0 UDP telemetry, and publishes `pilot-telemetry` packets directly to the Ably telemetry channel for the current race key.

The launcher does not embed the Ably master key. The page mints a short-lived, channel-scoped Ably token in the browser at download time and embeds only that token in the exported script.

The launcher uses this shape:

```json
{
  "messageType": "pilot-telemetry",
  "pilotId": "pilot-id",
  "source": "dirt-rally-2",
  "latLong": "-12.3456789,45.6789123",
  "distance": 1823.412,
  "distanceDrivenLap": 1823.412,
  "distanceDrivenOverall": 1823.412,
  "speed": 74.3,
  "heading": 182,
  "gForce": 2.4,
  "longitudinalG": 1.8,
  "lateralG": 1.6,
  "rpmReal": 7421.5,
  "rpmPercentage": 88.3,
  "gear": 4,
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
- The launcher keeps timing values separate from the live telemetry payload. `arrivalTime`, `runTime`, and `lapTime` belong to the timing package flow, not the live telemetry HUD.

### Stage registry for launcher identification

The exported BAT also bundles the current stage catalog and a game-scoped stage registry template so the launcher can resolve which stage is running from the first useful telemetry packet.

The registry shape is:

```json
{
  "dirtRally2": {
    "stage-id": ["7077.21, 1397.82", "US, Pikes Peak (Gravel) - Sector 3"]
  }
}
```

Notes:

- The outer key is the game id, for example `dirtRally2`.
- The inner key is the stage id from the app.
- The first array item is the stage fingerprint string built from track length + starting position. In practice, this is captured from the first useful telemetry packet at stage start.
- The second array item is the in-game stage name that the launcher can show or store alongside the resolved id.
- The frontend stage editor reads the live runtime copy from [frontend/public/pilot-telemetry-stage-registry.json](../frontend/public/pilot-telemetry-stage-registry.json).
- A copy of this structure lives in [docs/pilot-telemetry-stage-registry.example.json](docs/pilot-telemetry-stage-registry.example.json).

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
