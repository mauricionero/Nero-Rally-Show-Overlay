# WRC Rally Dashboard Overlay

A broadcast-ready rally overlay system inspired by WRC TV graphics. This is a 100% frontend React app designed to be captured by streaming software (OBS, vMix, etc.) for live timing, leaderboards, and multi-camera layouts.

## What This Project Does

- **Setup page** to configure pilots, stages, timing, streams, branding, and sync.
- **Overlay page** with 4 broadcast scenes (Live Stage, Timing Tower, Leaderboard, Pilot Focus).
- **Times page** for fast, mobile-friendly time entry that syncs with Setup.
- **No backend required**. Data persists in localStorage and can sync via Ably WebSocket.
- **Multi-language** with YAML translations.
- **VDO.Ninja** support for live camera feeds and external sources.

## Pages

- `/` **Setup**: Configure everything (pilots, categories, stages, times, streams, config).
- `/overlay` **Overlay**: Live broadcast graphics with 4 switchable scenes.
- `/times` **Times**: Mobile-first timing entry; read-only by default until a stage is selected.

## Key Features

- Multi-camera grid layouts with drag-and-drop ordering.
- Live timing and positions with stage status (racing, finished, not started).
- Category color coding across all views.
- Per-stage alerts and jump start indicators.
- AVG and deviation calculations per category.
- Local or WebSocket sync between pages.

## Tech Stack

- **React 19 + React Router**
- **Tailwind CSS + shadcn/ui**
- **Ably WebSocket** for realtime sync
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

## Ably WebSocket Setup

The frontend uses Ably directly in the browser. You only need to provide an Ably API key as an environment variable.

1. Create an Ably app and copy the **API key**.
2. In `frontend`, create a `.env` file (or use your shell env):
   - `REACT_APP_ABLY_KEY=your-ably-api-key`
3. Restart `yarn start` if it was already running.

Notes:
- The key is read in `frontend/src/utils/websocketProvider.js`.
- If the key is missing, WebSocket mode will fail to connect.

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

- **localStorage** is the source of truth for state.
- **WebSocket (Ably)** is optional; used to broadcast updates between devices/pages.
- Setup, Overlay, and Times pages can all share the same channel key.

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
