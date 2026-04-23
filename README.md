# WRC Rally Dashboard Overlay

A broadcast-ready rally overlay system inspired by WRC TV graphics. This is a 100% frontend React app designed to be captured by streaming software (OBS, vMix, etc.) for live timing, leaderboards, and multi-camera layouts.

## What This Project Does

- **Setup page** to configure pilots, stages, timing, streams, branding, and sync.
- **Overlay page** with 4 broadcast scenes (Live Stage, Timing Tower, Leaderboard, Pilot Focus).
- **Times page** for fast, mobile-friendly time entry that syncs with Setup.
- **Lap Race support** with variable laps, real start time, cumulative/best-lap totals, and live leaderboard sorting.
- **Telemetry tooling** with GPS precision, heading, speed, and map coverage visualization.
- **SOS / alert workflow** with priority delivery and acknowledgement handling.
- **KML map import** with support for collapsing point-only exports into a single line map.
- **No backend required**. State persists locally and can sync via Ably WebSocket.
- **Multi-language** with YAML translations.
- **VDO.Ninja** support for live camera feeds and external sources.

## Pages

- `/` **Setup**: Configure everything (pilots, categories, stages, times, streams, config, telemetry debug, KML import).
- `/overlay` **Overlay**: Live broadcast graphics with 4 switchable scenes and optional debug LEDs.
- `/times` **Times**: Mobile-first timing entry with lap-race support, SOS handling, and live sync.

## Key Features

- Multi-camera grid layouts with drag-and-drop ordering.
- Live timing and positions with stage status (racing, finished, not started).
- Category color coding across all views.
- Per-stage alerts and jump start indicators.
- Lap-race timing with planned vs real start time, variable lap counts, cumulative/best-lap totals, and auto-expanded lap columns.
- SOS / alert badges and acknowledgement flow across Times, Setup, and Overlay.
- AVG and deviation calculations per category.
- Local or WebSocket sync between pages.
- Optional debug logging toggles for sync, transport, telemetry, connection, and outbound traffic.

## Tech Stack

- **React 19 + React Router**
- **Tailwind CSS + shadcn/ui**
- **Ably WebSocket** with separated channels for realtime sync
- **localStorage** for persistence
- **VDO.Ninja** for remote camera feeds
- **YAML i18n** for translations

## Quick Start

1. Install dependencies:
   - `cd frontend`
   - `yarn`
2. Run the app:
   - `yarn start`
3. Open:
   - Setup: `http://localhost:3003/`
   - Overlay: `http://localhost:3003/overlay`
   - Times: `http://localhost:3003/times`
   - Pilot Telemetry: `http://localhost:3003/pilot-telemetry`

## Ably WebSocket Setup

The frontend uses Ably directly in the browser. You only need to provide an Ably API key as an environment variable.

1. Create an Ably app and copy the **API key**.
2. In `frontend`, create a `.env` file (or use your shell env):
   - `REACT_APP_ABLY_KEY=your-ably-api-key`
   - Optional for replay chapter import from YouTube descriptions: `REACT_APP_YOUTUBE_API_KEY=your-youtube-data-api-key`
3. Restart `yarn start` if it was already running.

Notes:
- The key is read in `frontend/src/utils/websocketProvider.js`.
- If the key is missing, WebSocket mode will fail to connect.
- The pilot telemetry page is `/pilot-telemetry?ws=...&pilotId=...` and it can export a standalone BAT launcher with a bundled PowerShell reader plus a short-lived Ably token for that pilot.
- The launcher token is generated in the browser from the existing Ably key the app already uses, and only the short-lived token is embedded in the exported BAT.
- The launcher also embeds the race stage catalog and a game/stage registry template so the first useful telemetry packet can resolve the active stage from track length + start position.
- Stage metadata lives on each stage as `game` and `gameStageName`. The generated launcher groups stage ids by `game`, then matches the game stage fingerprint against the telemetry start packet.
- The frontend reads the runtime registry from [frontend/public/pilot-telemetry-stage-registry.json](frontend/public/pilot-telemetry-stage-registry.json). The docs copy at [docs/pilot-telemetry-stage-registry.example.json](docs/pilot-telemetry-stage-registry.example.json) is the reference shape. The stage ids come from the app; the fingerprint string is captured from the first useful start packet (`track length + start position`).
- For the exact websocket package formats, see [WebSocket Package Reference](docs/websocket-packages.md).

### Channel Layout

Each session key (for example `1-ABC12345`) maps to 4 Ably channels:

- `rally-data:{channelId}`
  - Normal synchronized state changes.
  - This is where the centralized `delta-batch` messages go for regular Setup and Times edits.
  - Not persisted in Ably; normal state stays separate from telemetry and snapshots.
- `rally-snapshots:{channelId}`
  - Full state snapshots used for bootstrap and recovery.
  - Fresh clients load snapshots from here and then replay newer `data` / `priority` messages.
  - Persisted in Ably.
- `rally-telemetry:{channelId}`
  - Live pilot telemetry only.
  - Kept separate because telemetry can be frequent and should not pollute normal state history.
  - Ephemeral messages, short-lived history only.
- `rally-priority:{channelId}`
  - Urgent, low-volume messages.
  - Used for high-priority/control-style traffic such as ownership coordination and SOS-related acknowledgements.
  - Persisted in Ably.

The separation is intentional:

- `data` stays focused on normal app state changes.
- `snapshots` stays clean for reconnect/bootstrap.
- `telemetry` can be noisy without affecting the rest of the sync system.
- `priority` gives urgent traffic its own lane instead of mixing it into normal deltas.

## Build

- `yarn build`
- `yarn build:docs` builds the static docs output into `/docs`

## Translations

- Primary files live in:
  - `frontend/public/translations/*.yaml`
  - `frontend/src/translations/*.yaml`
  - `docs/translations/*.yaml` (for the docs build output)
- To add a language:
  1. Copy `frontend/public/translations/en.yaml`
  2. Translate all keys
  3. Mirror the file in `frontend/src/translations/` and `docs/translations/`
  4. Register it in `frontend/src/translations/config.js`

## Data & Sync

- **localStorage** is still used for local persistence/debugging, but live sync is organized around the centralized WebSocket sync engine.
- **WebSocket (Ably)** is optional; used to synchronize updates between devices/pages.
- Setup, Overlay, and Times pages can all share the same channel key.
- Normal synchronized state is sent as centralized `delta-batch` packages.
- Snapshots are published separately and used only for bootstrap/recovery.
- Telemetry is kept in its own channel and is treated differently from normal state sync.
- Setup owns snapshot generation for the current session and uses a heartbeat lease for ownership failover.
- Non-Setup pages wait for snapshot bootstrap instead of replaying plain history.
- Lap-race `realStartTime` is persisted and used for scene timing; SS / Liaison / Service Park ideal starts are derived from stage start + pilot offset.
- Pilot telemetry can include `gpsPrecision`, which is used by the map marker aura.
- Manual disconnects are suppressed only for the current session so they do not immediately trigger reconnect loops.

### Sync Flow Summary

- Setup owns snapshot generation for the session.
- Normal edits are batched and published as deltas, typically at most once per second.
- New or reconnecting clients:
  1. Bootstrap from the latest snapshot.
  2. Replay newer `data` and `priority` messages after the snapshot timestamp.
  3. Wait for snapshots if none are currently available.
- Telemetry is isolated to its own channel and is not part of the snapshot recovery path.

## File Structure (frontend)

- `src/pages/Setup.jsx` – Setup UI
- `src/pages/Overlay.jsx` – Broadcast overlay (4 scenes)
- `src/pages/Times.jsx` – Mobile-first timing entry
- `src/components/scenes/*` – Scene 1-4 layouts
- `src/components/setup/*` – Setup tabs and cards
- `src/contexts/*` – Rally + translation contexts
- `src/utils/*` – Shared utilities and global methods
- `public/translations/*` – i18n YAML files

## Global Methods (Shared Utilities)

This is a best-effort list of shared utilities in `frontend/src/utils/`:

- `sceneConfigStorage.js`
  - `loadSceneConfig`, `saveSceneConfig`
- `mediaIcons.js`
  - `EXTERNAL_MEDIA_ICON_OPTIONS`, `getExternalMediaIconComponent`
- `pilotSchedule.js`
  - `getPilotTimeOffsetMinutes`, `addMinutesToClockTime`, `getPilotScheduledStartTime`, `getPilotScheduledEndTime`
- `rallyHelpers.js`
  - `getReferenceNow`, `getStageDateTime`, `hasStageDateTimePassed`
  - `isPilotRetiredForStage`, `isPilotAlertForStage`, `parseClockTimeToSeconds`
  - `isJumpStartForStage`, `getPilotStatus`, `getRunningTime`, `startInformationTime`
  - `parseTime`, `sortPilotsByStatus`
- `feedOptions.js`
  - `getFeedOptionValue`, `buildFeedOptions`, `findFeedByValue`
- `overlayUrls.js`
  - `getLocalOverlayUrl`, `getWebSocketOverlayUrl`, `getLocalTimesUrl`, `getWebSocketTimesUrl`
- `displayOrder.js`
  - `getCategoryDisplayOrder`, `sortCategoriesByDisplayOrder`, `sortPilotsByDisplayOrder`
- `stageSchedule.js`
  - `getStageSortDate`, `getStageSortTime`, `compareStagesBySchedule`, `formatStageScheduleRange`
- `stageTypes.js`
  - `SS_STAGE_TYPE`, `SUPER_PRIME_STAGE_TYPE`, `LAP_RACE_STAGE_TYPE`, `LIAISON_STAGE_TYPE`, `SERVICE_PARK_STAGE_TYPE`
  - `isLapRaceStageType`, `isTransitStageType`, `isSpecialStageType`, `isManualStartStageType`
  - `getStageShortCode`, `getStageNumberLabel`, `getStageTitle`
- `timeConversion.js`
  - `normalizeTimingInput`, `arrivalTimeToTotal`, `totalTimeToArrival`
- `wsMessageReceiver.js`
  - `WsMessageReceiver` (default export)
- `websocketProvider.js`
  - `PROVIDER_ID`, `PROVIDER_NAME`, `generateChannelKey`, `parseChannelKey`
  - `getWebSocketProvider`, `resetWebSocketProvider`, `WebSocketProvider` (default export)
- `timeFormat.js`
  - `formatMsAsShortTime`

## Notes

- Times page is designed for fast entry and mobile use. Only the selected stage is write-enabled.
- AVG/deviation values use `m:ss` formatting for quick reading.
