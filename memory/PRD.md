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
- `/app/frontend/src/contexts/RallyContext.jsx` - State management, localStorage sync
- `/app/frontend/src/pages/Setup.jsx` - Configuration UI
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
- `rally_data_version` - Timestamp for heartbeat sync

---

## Implemented Features (December 2025)

### Core Application
- [x] Setup page with tabs: Pilots, Categories, Stages, Times, Streams, Config
- [x] Overlay page with 4 scenes and keyboard shortcuts
- [x] Heartbeat sync system between Setup and Overlay pages
- [x] JSON import/export functionality
- [x] Chroma key background selection

### Scene 1 - Live Stage
- [x] Multi-layout grid (1, 1x2, 2x1, 2x2, 3x2)
- [x] Pilot selection checkboxes
- [x] Drag-and-drop reordering
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
- [x] **Fixed**: Overall time calculation sums all SS times up to selected stage
- [x] **Fixed**: Running time displayed in yellow when pilot is racing
- [x] Stream thumbnails for active pilots
- [x] Gap calculation from leader

### Scene 4 - Pilot Focus
- [x] Single pilot view with large stream
- [x] All stage times display
- [x] Stage selector
- [x] Pilot profile section

### Streams Tab (NEW - December 2025)
- [x] Grid display of pilot streams (~150px)
- [x] Volume slider (0-100%)
- [x] Solo button (mutes all others)
- [x] Mute button
- [x] Video adjustments (saturation, contrast, brightness 0-200%)
- [x] Reset to Defaults button
- [x] Persistence to localStorage
- [x] Live sync via heartbeat to Overlay
- [x] **Global Audio Control** - Master volume slider + Mute All button
- [x] **Audio Level Meters** - Stereo VU meters with green/yellow/red zones (simulated, based on volume settings)
- [x] **Global Audio Meter** - Combined output level indicator

### StreamPlayer Component
- [x] Centralized stream player
- [x] Applies CSS filters for video adjustments
- [x] URL params for volume/mute (VDO.Ninja)
- [x] Solo mode support
- [x] Muted indicator overlay

---

## Pending/Future Tasks

### P1 - High Priority
- [ ] Improve text readability (Scene 1): Add black text-shadow to timing overlays
- [ ] Refine Timing Tower selection (Scene 2): Offset entire row on selection

### P2 - Medium Priority
- [ ] Optimize stream loading: Keep streams loaded in background when switching scenes
- [ ] Scene 5 - Comparison view (currently hidden per user request)

### P3 - Refactoring
- [ ] Break down Setup.jsx (1000+ lines) into sub-components
- [ ] Centralize time calculation logic in rallyHelpers.js

---

## Known Issues
- ESLint warnings in RallyContext.jsx about setState in useEffect (functional but not best practice)
- VDO.Ninja streams require valid stream keys to display content

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
```
