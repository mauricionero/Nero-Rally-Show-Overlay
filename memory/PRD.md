# Rally Dashboard - Product Requirements Document

## Original Problem Statement
Build a dashboard overlay interface similar to WRC (World Rally Championship) transmissions. The application should be entirely frontend, using localStorage for data persistence.

## Core Requirements

### Two Main Pages
1. **Setup Page** - Configure all aspects of the rally
2. **Overlay Page** - Live view for screen capture in video editing software

### Setup Page Features
- **Pilots**: Register pilots with Name, Car Number, Picture, Category, Start Order, and VDO.Ninja stream URL
- **Categories**: Create categories for pilots with name and associated color
- **The Race** (formerly Stages): Register stages with different types:
  - **SS (Special Stage)**: Original rally format with individual start/arrival times per pilot
  - **Lap Race**: Circuit race with single start time, number of laps, and time matrix for laps vs pilots
  - **Liaison**: Simple start/end time per pilot
  - **Service Park**: Simple start/end time per pilot
- **Times**: Dynamic UI that displays all stages at once, rendering different interfaces based on stage type
- **Streams**: Control panel for stream audio/video adjustments
- **Configuration**: Chroma key, Google Maps URL, Logo URL, JSON import/export

### Overlay (Live) Page Features
- **Scene 1 (Live Stage)**: Display current stage name, multi-stream grid, Google Maps integration
- **Scene 2 (Timing Tower)**: Sorted pilot list by position based on stage type
- **Scene 3 (Leaderboard)**: Results display - SS sum or Lap Race individual race results
- **Scene 4 (Pilot Focus)**: Single pilot view with all stage times

## Technical Architecture

### Frontend Stack
- React with Tailwind CSS
- Shadcn/UI components
- localStorage for persistence
- Ably for WebSocket live sync

### Key Files
- `/app/frontend/src/contexts/RallyContext.jsx` - State management with stage-type architecture
- `/app/frontend/src/pages/Setup.jsx` - Configuration UI (container for sub-components)
- `/app/frontend/src/components/setup/` - Tab sub-components
- `/app/frontend/src/pages/Overlay.jsx` - Live display with heartbeat
- `/app/frontend/src/components/scenes/` - Scene components (all 4 support stage types)

### Data Structure (localStorage)
- `rally_event_name` - Event name string
- `rally_pilots` - Array of pilot objects with carNumber field
- `rally_categories` - Array of category objects
- `rally_stages` - Array of stage objects with `type` property (SS, Lap Race, Liaison, Service Park)
- `rally_times` - Object mapping pilotId -> stageId -> time (for SS/Liaison/Service Park)
- `rally_start_times` - Object mapping pilotId -> stageId -> start time
- `rally_arrival_times` - Object mapping pilotId -> stageId -> arrival time
- `rally_lap_times` - Object mapping pilotId -> stageId -> [lap times array] (for Lap Race)
- `rally_stage_pilots` - Object mapping stageId -> [pilotIds] (for Lap Race pilot selection)
- `rally_positions` - Object mapping pilotId -> stageId -> position
- `rally_logo_url` - Channel logo URL for branding
- `rally_map_url` - Google Maps embed URL
- `rally_stream_configs` - Stream configuration per pilot/camera
- `rally_global_audio` - Global audio settings
- `rally_cameras` - Array of camera objects `[{ id, name, streamUrl, isActive }]` (NEW - December 2025)
- `rally_data_version` - Timestamp for heartbeat sync

---

## Implemented Features (December 2025)

### Translation/Internationalization System (NEW - December 2025)
- [x] **Translation infrastructure** - YAML-based translation files for easy editing
- [x] **Language selector** - Dropdown in Config tab with flags and native language names
- [x] **English translation** - Complete translation file (`/public/translations/en.yaml`)
- [x] **Portuguese (Brazil) translation** - Complete translation file (`/public/translations/pt-BR.yaml`)
- [x] **Full UI translation** - All components now use `t()` function:
  - Setup.jsx (header, tabs, chroma key)
  - PilotsTab.jsx (all labels and messages)
  - CategoriesTab.jsx (all labels and messages)
  - TheRaceTab.jsx (all labels, stage types, messages)
  - TimesTab.jsx (all labels, time fields)
  - StreamsTab.jsx (all audio controls)
  - ConfigTab.jsx (all config sections)
  - Overlay.jsx (scenes, buttons)
  - Scene1LiveStage.jsx (layout, items)
  - Scene2TimingTower.jsx (timing labels, status)
  - Scene3Leaderboard.jsx (columns, gaps)
  - Scene4PilotFocus.jsx (labels, sections)
- [x] **Language persistence** - Selected language saved to localStorage
- [x] **Fallback system** - Falls back to English if translation key not found
- [x] **Pre-configured languages** - English, Portuguese (BR), Spanish, French, German, Italian

### Stage-Type-Driven Architecture (NEW - December 2025)
- [x] **Per-stage type selection** - Each stage has its own type (SS, Lap Race, Liaison, Service Park)
- [x] **"The Race" Tab** - Renamed from Stages, dynamic UI based on stage type
- [x] **Times Tab Rewrite** - Displays all stages at once with unique UIs per type
- [x] **SS Card Layout** - Start time, arrival time, total time per pilot
- [x] **Lap Race Matrix** - Laps × pilots matrix with lap durations calculated
- [x] **Liaison/Service Park** - Simple start/end time cards
- [x] **Times Tab Clock Button Fix** - Now triggers total time calculation

### Overlay Scenes (All Updated - December 2025)
- [x] **Scene 1 (Live Stage)** - Supports SS and Lap Race with position display
- [x] **Scene 2 (Timing Tower)** - Sorting by position for current stage type
- [x] **Scene 3 (Leaderboard)** - SS overall standings OR Lap Race individual race results
- [x] **Scene 4 (Pilot Focus)** - Shows all stage times with stage type icons

### Branding Features (December 2025)
- [x] **Pilot Car Numbers** - New field in pilot data model
- [x] **Channel Logo** - Logo URL in Config tab, displayed on all overlay scenes
- [x] **Stage Name Display** - Scene 1 always shows stage name (not event name)

### Core Application
- [x] Setup page with tabs: Pilots, Categories, The Race, Times, Streams, Config
- [x] Setup.jsx refactored into 6 sub-components
- [x] Overlay page with 4 scenes and keyboard shortcuts (1-4)
- [x] Heartbeat sync system between Setup and Overlay pages
- [x] WebSocket Live Sync using Ably (fully frontend)
- [x] JSON import/export functionality
- [x] Chroma key background selection

### Scene 1 - Live Stage
- [x] Multi-layout grid (1, 1x2, 2x1, 2x2, 3x2)
- [x] Pilot selection checkboxes with position indicators for Lap Race
- [x] Google Maps integration as selectable grid item
- [x] Drag-and-drop reordering
- [x] Bottom ticker showing pilots sorted by position
- [x] Stage name display (always stage name, not event name)
- [x] **Camera Integration** (NEW - December 2025)
  - [x] Cameras appear first in "Select Items" list (before Google Maps and pilots)
  - [x] Cameras display in grid with Video icon overlay and name label
  - [x] Camera streams can be drag-and-drop reordered

### Scene 2 - Timing Tower
- [x] Vertical leaderboard with status sections (Racing, Finished, Not Started)
- [x] Supports both SS and Lap Race stage types
- [x] Lap progress display for Lap Race stages
- [x] Category color bars
- [x] **Camera Feed Selector** (NEW - December 2025)
  - [x] Dropdown in header to select main display feed
  - [x] Shows "Additional Cameras" and "Pilots" sections
  - [x] Selected camera shows with Video icon label

### Scene 3 - Leaderboard
- [x] Stage selector with sections: "Overall Rally Standings", "Special Stages", "Lap Races"
- [x] SS: Overall time sums all SS times
- [x] Lap Race: Shows laps completed and total time
- [x] Gap calculation from leader
- [x] Stage type icons in dropdown (Flag for SS, Rotate for Lap Race)

### Scene 4 - Pilot Focus
- [x] Single pilot view with stream
- [x] All stage times with stage type icons
- [x] Lap Race detail view showing individual lap times
- [x] Pilot car number badge
- [x] **Camera as Main Feed with Pilot PiP** (NEW - December 2025)
  - [x] "Main Camera" dropdown selector in left panel
  - [x] Option to use "None (Use Pilot Stream)" as default
  - [x] When camera selected: camera is main, pilot stream is Picture-in-Picture
  - [x] PiP: small, rounded corners, bottom-right, not touching sides (like race sports broadcasts)

### Streams Tab
- [x] Grid display of pilot streams
- [x] Volume, Solo, Mute controls
- [x] Video adjustments (saturation, contrast, brightness)
- [x] Global Audio Control with master volume
- [x] Audio Level Meters (simulated)
- [x] **Additional Cameras Section** (NEW - December 2025)
  - [x] Add external camera feeds (drone, helicopter, finish line, etc.)
  - [x] Camera name and stream URL input form
  - [x] Camera cards with Active toggle, Edit/Delete buttons
  - [x] Video preview and audio/video controls per camera

### Config Tab
- [x] Google Maps URL input
- [x] Logo URL input (branding)
- [x] WebSocket Live Sync configuration
- [x] Keyboard shortcuts reference
- [x] Data management (export/import/clear)

---

## Pending/Future Tasks

### P1 - High Priority
- [ ] **Independent Language Selection** (P2 Issue) - Setup and Overlay pages should have independent language selectors using separate localStorage keys (`setup_language`, `overlay_language`) instead of sharing one key
- [ ] **Countdown Timer Feature** - When pilot start time is <1min away, show countdown in seconds; <10sec show with decimals
- [ ] **Lap Race Start Time Display** - Show stage start time on overlay; new "actual start time" field for elapsed time calculation

### P2 - Medium Priority
- [ ] **RallyX Point System** - Points calculation for RallyX events
- [ ] Optimize stream loading: Keep streams loaded in background when switching scenes
- [ ] Add keyboard shortcuts for global audio controls (M to mute, +/- for volume)

### P3 - Low Priority
- [ ] Animated position changes for Lap Race stages (smooth transitions when positions change)
- [ ] Improve text readability in Scene 1 with text shadows

---

## Known Issues
- Audio meters show simulated levels (real audio from cross-origin iframes not accessible)
- VDO.Ninja streams require valid stream keys to display content

## Test Reports
- `/app/test_reports/iteration_5.json` - All stage-type features verified (100% pass rate)
- `/app/test_reports/iteration_6.json` - Additional Cameras feature verified (100% pass rate)
