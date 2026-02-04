# Rally Dashboard - Product Requirements Document

## Original Problem Statement
Build a dashboard overlay interface similar to WRC (World Rally Championship) transmissions. The application should be entirely frontend, using localStorage for data persistence.

## Core Requirements

### Two Main Pages
1. **Setup Page** - Configure all aspects of the rally
2. **Overlay Page** - Live view for screen capture in video editing software

### Setup Page Features
- **Pilots**: Register pilots with Name, Picture, and VDO.Ninja stream URL
- **Categories**: Create categories for pilots with name and associated color
- **Stages (SS)**: Register rally stages with name, number, type (SS, Liaison, etc.), and start time
- **Times**: Matrix to register start and finish times for each pilot on each stage
- **Streams**: Control panel for stream audio/video adjustments (volume, solo, mute, saturation, contrast, brightness)
- **Configuration**: Selectable background colors for chroma keying (green, blue, black, custom hex)
- **Google Maps Integration**: Add embed URL to display rally map in Scene 1
- **Data Management**: Import/export configuration as JSON

### Overlay (Live) Page Features
- **Real-time Updates**: Heartbeat system to auto-update when data changes in Setup page
- **Scene Switching**: Top navigation bar with keyboard shortcuts (1-4)
- **Customizable Layouts**: Resizable left-side panel for scene controls
- **Four Scenes**: Live Stage, Timing Tower, Leaderboard, Pilot Focus

## Technical Architecture

### Frontend Stack
- React with Tailwind CSS
- Shadcn/UI components
- localStorage for persistence

### Key Files
- `/app/frontend/src/contexts/RallyContext.jsx` - State management, localStorage sync, mapUrl state
- `/app/frontend/src/pages/Setup.jsx` - Configuration UI (refactored to use sub-components)
- `/app/frontend/src/components/setup/` - Tab sub-components (PilotsTab, CategoriesTab, StagesTab, TimesTab, StreamsTab, ConfigTab)
- `/app/frontend/src/pages/Overlay.jsx` - Live display with heartbeat
- `/app/frontend/src/components/scenes/` - Scene components
- `/app/frontend/src/components/StreamPlayer.jsx` - Centralized stream player with config support

### Data Structure (localStorage)
- `rally_pilots` - Array of pilot objects
- `rally_categories` - Array of category objects
- `rally_stages` - Array of stage objects
- `rally_times` - Object mapping pilotId -> stageId -> time
- `rally_start_times` - Object mapping pilotId -> stageId -> start time
- `rally_stream_configs` - Object mapping pilotId -> stream config (volume, mute, solo, saturation, contrast, brightness)
- `rally_global_audio` - Object with global audio settings { volume, muted }
- `rally_map_url` - Google Maps embed URL for Scene 1 display
- `rally_data_version` - Timestamp for heartbeat sync

---

## Implemented Features (December 2025)

### Core Application
- [x] Setup page with tabs: Pilots, Categories, Stages, Times, Streams, Config
- [x] **Setup.jsx Refactored** - Split into 6 sub-components for maintainability
- [x] Overlay page with 4 scenes and keyboard shortcuts
- [x] Heartbeat sync system between Setup and Overlay pages
- [x] **WebSocket Live Sync** - Real-time sync using Ably (fully frontend)
- [x] JSON import/export functionality
- [x] Chroma key background selection

### Scene 1 - Live Stage
- [x] Multi-layout grid (1, 1x2, 2x1, 2x2, 3x2)
- [x] Pilot selection checkboxes
- [x] **Google Maps Integration** - Selectable in grid alongside pilot streams
- [x] Drag-and-drop reordering (pilots and map)
- [x] Live stream display with StreamPlayer
- [x] Bottom ticker showing all pilots with status

### Scene 2 - Timing Tower
- [x] Vertical leaderboard with status sections (Racing, Finished, Will Start)
- [x] Clickable pilots with row offset selection
- [x] Embedded mini-streams
- [x] Category color bars

### Scene 3 - Leaderboard
- [x] Stage selector dropdown (SS stages only)
- [x] Overall Standings view
- [x] Overall time calculation sums all SS times up to selected stage
- [x] Running time displayed in yellow when pilot is racing
- [x] Stream thumbnails for active pilots
- [x] Gap calculation from leader

### Scene 4 - Pilot Focus
- [x] Single pilot view with large stream
- [x] All stage times display
- [x] Stage selector
- [x] Pilot profile section

### Streams Tab
- [x] Grid display of pilot streams (~150px)
- [x] Volume slider (0-100%)
- [x] Solo button (mutes all others)
- [x] Mute button
- [x] Video adjustments (saturation, contrast, brightness 0-200%)
- [x] Reset to Defaults button
- [x] Persistence to localStorage
- [x] Live sync via heartbeat to Overlay
- [x] **Global Audio Control** - Master volume slider + Mute All button
- [x] **Audio Level Meters** - Stereo VU meters with green/yellow/red zones (simulated)

### Config Tab (Refactored)
- [x] **Google Maps Integration** - URL input for embed maps
- [x] **WebSocket Live Sync** - Key generation, connection status, shareable URLs
- [x] Keyboard shortcuts reference
- [x] Data management (export/import/clear)
- [x] Current summary statistics

### StreamPlayer Component
- [x] Centralized stream player
- [x] Applies CSS filters for video adjustments
- [x] URL params for volume/mute (VDO.Ninja)
- [x] Solo mode support
- [x] Muted indicator overlay
- [x] Global audio integration (master volume multiplier)

### WebSocket Live Sync
- [x] **Ably integration** - Fully frontend, no backend required
- [x] **Key generation** - Format: `1-{randomId}` for easy sharing
- [x] **Setup page** - Generate key, view key, copy to clipboard, disconnect
- [x] **Overlay page** - Paste key input, connect button, status indicator
- [x] **Auto-detection** - Overlay page auto-switches from localStorage polling to WebSocket when connected

---

## Pending/Future Tasks

### P1 - High Priority
- [ ] Optimize stream loading: Keep streams loaded in background when switching scenes
- [ ] Add keyboard shortcuts for global audio controls (M to mute, +/- for volume)

### P2 - Medium Priority
- [ ] Scene 5 - Comparison view (currently hidden per user request)
- [ ] Improve text readability (Scene 1): Add black text-shadow to timing overlays

### P3 - Refactoring (Completed)
- [x] ~~Break down Setup.jsx into sub-components~~ - DONE (February 2025)

---

## Known Issues
- ESLint warnings in RallyContext.jsx about setState in useEffect (functional but not best practice)
- VDO.Ninja streams require valid stream keys to display content
- Audio meters show simulated levels (real audio from cross-origin iframes not accessible)

## Test Data Structure
```javascript
// Example pilot
{
  id: "p1",
  name: "Carlos Sainz",
  streamUrl: "https://vdo.ninja/?view=stream123",
  categoryId: "cat1",
  startOrder: 1,
  isActive: true
}

// Example stream config
{
  "p1": {
    volume: 100,
    muted: false,
    solo: false,
    saturation: 100,
    contrast: 100,
    brightness: 100
  }
}

// Example map URL
"https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2885!2d7.42!3d43.73..."
```
