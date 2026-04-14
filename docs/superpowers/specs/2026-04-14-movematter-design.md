# MoveMatter — Design Spec
**Date:** 2026-04-14
**Status:** Approved

---

## Overview

MoveMatter is a browser-based interactive simulator for visualizing how liquid or particulate material behaves inside a moving container mounted on a configurable track. Users define a motion sequence of ordered moves and delays, then animate the container and observe how the internal material responds — slosh, agitation, lag, settling, and redistribution — caused by different motion programs.

**Target:** Browser web app, deployed as a Vite static build (Vercel / Netlify / S3 — no backend).
**Audience:** Engineers and operators; product-quality UI, presentable in demos.
**Scope:** Single-axis motion for MVP; architecture explicitly supports future two-axis, cam profile, and compound playback.

---

## Recommended Stack

| Layer | Choice | Reason |
|---|---|---|
| Bundler / dev | Vite + TypeScript | Fastest iteration, first-class TS |
| UI framework | React 18 | Component model suits panel-heavy layout |
| State management | Zustand | Small, non-boilerplatey, clean slices |
| Simulation rendering | PixiJS v8 | WebGL 2D, particle sprites, 60fps at 600 particles |
| Simulation engine | Custom PBD (TypeScript) | ~400–600 LOC, full tuning control |
| Sim threading | Main thread initially; Web Worker drop-in path | YAGNI until particle count demands it |
| Profile plots | Recharts | React-native, sufficient for time-series charts |
| Styling | Tailwind CSS v4 + CSS custom properties for theme tokens | Utility-fast; tokens make light/dark trivial |
| Light/dark theme | `prefers-color-scheme` + manual toggle, stored in `localStorage` | Baked in from day one |
| Persistence | Browser File API — JSON import/export | No backend, portable `.movematter.json` files |
| Testing | Vitest (unit: sim math, state logic) + Playwright (E2E) | Vite-native, fast |
| Packaging | Vite static build | Zero infrastructure |

No backend. No auth. No database. Entirely client-side.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        React App Shell                       │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐  │
│  │  Track View  │  │  Material View │  │  Profile Plots  │  │
│  │  (PixiJS)    │  │  (PixiJS)      │  │  (Recharts)     │  │
│  └──────────────┘  └────────────────┘  └─────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               Motion Sequence Editor                    │ │
│  │          (ordered list of moves + delays)               │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │               Zustand Store                              │ │
│  │  motionProgram | simState | playbackState | uiState      │ │
│  └──────────────────────────────────────────────────────────┘ │
│          ▲                        │                           │
│     File API                   Sim Loop                       │
│   (import/export)          (rAF or Worker)                    │
│                                   ▼                           │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │            PBD Simulation Engine                         │ │
│  │  MotionInterpolator → ForceField → PBDSolver →           │ │
│  │  ParticleState → Renderer                               │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Data Flow

1. User defines a motion program (ordered moves + delays) in the editor.
2. On play, `MotionInterpolator` converts the program into a continuous `position(t)`, `velocity(t)`, `accel(t)` curve respecting each move's profile type and jerk limits.
3. Each animation frame, the current acceleration is handed to `PBDSolver` as an inertial force on all particles.
4. The solver runs density estimation, applies constraints, integrates positions, resolves boundary collisions.
5. PixiJS renders the container and particles each frame.
6. Recharts receives a rolling time-series buffer and re-renders the profile plots at ~10fps.

### Extension Seams

- **`MotionInterpolator`** is interface-defined — swapping in a cam profile evaluator or a second axis is a pure implementation change, not an API change.
- **`PBDSolver`** is isolated — upgrading to SPH-lite later means replacing one module.
- **Web Worker drop-in:** the sim loop already lives outside React; moving it to a Worker is a structured handoff.
- **Second axis:** PBD gravity/inertia vector is 2D — adding Y-axis motion is a force-field addition, not a rewrite.

---

## Simulation: Options and Tradeoffs

Three approaches were evaluated. **Approach B (PBD Particles) is selected for MVP.**

### A — Wave / Continuum Model *(not selected)*
1D wave PDE driven by container acceleration. No particles — renders as a smooth bezier-filled surface.
- Fast to build, very smooth
- Cannot show individual particle behavior, agitation, or redistribution
- Appropriate for pure liquid slosh demos only

### B — PBD Particle Sim *(selected)*
200–600 particles with Position-Based Dynamics: density constraint, gravity, boundary collisions, viscosity damping. Same technique used in Unity Fluids and NVIDIA Flex.
- Visually convincing and technically defensible
- Tunable via material presets (water, oil, dry powder, coarse granular)
- Runs on main thread at 60fps up to ~600 particles; Web Worker path available
- 3–4 week MVP build
- Not analytically rigorous (no Navier-Stokes), but correct in feel

### C — SPH-lite + Web Worker *(stretch upgrade path)*
True Smoothed Particle Hydrodynamics with kernel functions (poly6/spiky), pressure forces, and viscosity. Requires spatial hash neighbor search and a Web Worker.
- Most physically rigorous; defensible to fluid-dynamics engineers
- SPH is notoriously finicky to tune — unstable or sluggish if parameters are wrong
- Additional rigor over PBD is rarely visible to end users
- Natural upgrade: replace the PBD solver module, keep all other architecture

---

## MVP Feature Set

### Motion Program Editor
- Ordered list of moves and delays; add, remove, reorder via drag handle
- Per-move fields: displacement, max velocity, acceleration, deceleration, accel jerk, decel jerk, profile type (trapezoidal, S-curve, constant velocity)
- Delay step: duration only
- Program-level field: axis length (total track distance)
- Validation: warn on over-travel; error on physically impossible velocity profile (accel/distance mismatch)

### Playback
- Play / pause / stop / scrub (timeline slider)
- Real-time speed control: 0.25× – 4×
- Loop toggle
- Playhead synchronized across all three profile plots

### Simulation Viewport
- Horizontal track with container moving along it (PixiJS canvas)
- Container interior shows PBD particles in liquid mode (metaball render) or particulate mode (individual circles with angle-of-repose damping)
- Container dimensions configurable: width, height, fill level %
- Material type selector: water, oil, dry powder, coarse granular — each maps to a PBDParams preset

### Profile Plots
- Position vs. time
- Velocity vs. time
- Acceleration vs. time
- All three synchronized to playhead; live-updating during playback

### Persistence
- Save / load `.movematter.json` via File API
- File includes motion program, container config, material type
- New / Open / Save / Save As in top toolbar

### Theme and Layout
- Light / dark toggle in header, persisted to `localStorage`
- Default layout: left sidebar (editor) + right stack (viewport + plots) + bottom playback bar
- Presentation Mode toggle: switches to full-width horizontal rows, collapses editor, viewport dominates

---

## Stretch Features

| Feature | Notes |
|---|---|
| Second axis | Y-axis motion, independent sequence; sim sees 2D inertial force |
| Compound playback | Two programs run simultaneously on X + Y |
| Cam profile input | Upload or draw a cam curve; MotionInterpolator replaced by cam evaluator |
| Comparison mode | Two programs side-by-side, same material, synced playhead |
| Material response metrics | Peak slosh height, settling time, agitation energy, CoM displacement |
| Custom material editor | Expose PBDParams directly in UI |
| Export | MP4/GIF animation; SVG/PNG/CSV plots |
| Web Worker sim | Offload PBD to worker thread for high particle counts |
| Shareable URL | Encode program in URL hash for quick sharing |
| SPH upgrade | Swap PBD solver for SPH-lite kernel; same architecture |

---

## Screen / Component Spec

### Layout — Default Mode (Layout A)

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Logo | File Menu          Presentation | Theme       │
├────────────────┬────────────────────────────────────────────┤
│                │  SimViewport (PixiJS)                       │
│ ProgramEditor  │  ─────────────────────────────────────────  │
│ Panel          │  ProfilePlots (Recharts ×3)                 │
│ (left sidebar) │                                             │
└────────────────┴─────────────────────────────────────────────┤
│ PlaybackBar: ▶ ⏸ ⏹  [timeline scrubber]  speed  loop        │
└─────────────────────────────────────────────────────────────┘
```

### Layout — Presentation Mode (Layout B)

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Logo | File Menu          [Exit Presentation] | Theme│
├─────────────────────────────────────────────────────────────┤
│  SimViewport (PixiJS) — full width, tall                     │
├─────────────────────────────────────────────────────────────┤
│  ProfilePlots (Recharts ×3) — full width                     │
├─────────────────────────────────────────────────────────────┤
│ PlaybackBar                                                  │
└─────────────────────────────────────────────────────────────┘
```

### Component Tree

```
App
├── AppShell
│   ├── Header
│   │   ├── Logo / wordmark
│   │   ├── FileMenu (New | Open | Save | Save As)
│   │   ├── PresentationModeToggle
│   │   └── ThemeToggle (light / dark)
│   │
│   ├── [default layout]
│   │   ├── ProgramEditorPanel (left sidebar)
│   │   │   ├── MoveList (draggable ordered list)
│   │   │   │   ├── MoveRow (displacement, vmax, accel, decel, jerk×2, profile type)
│   │   │   │   └── DelayRow (duration only)
│   │   │   ├── AddMoveButton / AddDelayButton
│   │   │   ├── ContainerConfig (width, height, fill %)
│   │   │   ├── MaterialSelector (water | oil | dry powder | coarse granular)
│   │   │   └── RunButton
│   │   └── RightPane
│   │       ├── SimViewport (PixiJS canvas)
│   │       │   ├── TrackLayer
│   │       │   ├── ContainerLayer
│   │       │   └── ParticleLayer
│   │       ├── ProfilePlots
│   │       │   ├── PositionPlot
│   │       │   ├── VelocityPlot
│   │       │   └── AccelerationPlot
│   │       └── PlaybackBar
│   │           ├── PlayPauseStopButtons
│   │           ├── Timeline (scrubber)
│   │           └── SpeedControl
│   │
│   └── [presentation layout — same components, rearranged]
```

### Component Responsibilities

- **`SimViewport`** owns the PixiJS canvas lifecycle only — reads particle state from a ref updated by the sim loop, never from Zustand directly (avoids React re-render on every frame)
- **`ProfilePlots`** reads a rolling time-series buffer from Zustand; updates at ~10fps (not 60fps) to keep Recharts renders cheap
- **`ProgramEditorPanel`** is pure controlled UI — reads/writes `motionProgram` slice in Zustand
- **`PlaybackBar`** reads/writes `playbackState` slice only

---

## Data Model Spec

### Persisted (`.movematter.json`)

```typescript
interface MoveMatterFile {
  version: 1;
  program: MotionProgram;
  container: ContainerConfig;
  material: MaterialConfig;
}

interface MotionProgram {
  id: string;
  name: string;
  axisLength: number;        // total track length in mm
  steps: MotionStep[];
}

type MotionStep = MoveStep | DelayStep;

interface MoveStep {
  type: 'move';
  id: string;
  displacement: number;      // mm, signed (+ forward / - reverse)
  maxVelocity: number;       // mm/s
  acceleration: number;      // mm/s²
  deceleration: number;      // mm/s²
  accelJerk: number;         // mm/s³ (0 = trapezoidal)
  decelJerk: number;         // mm/s³
  profileType: 'trapezoidal' | 'scurve' | 'constant';
}

interface DelayStep {
  type: 'delay';
  id: string;
  duration: number;          // ms
}

interface ContainerConfig {
  widthMm: number;
  heightMm: number;
  fillPercent: number;       // 0–100
  wallThicknessMm: number;
}

interface MaterialConfig {
  preset: 'water' | 'oil' | 'dry-powder' | 'coarse-granular' | 'custom';
  params: PBDParams;
}

interface PBDParams {
  restDensity: number;
  pressureStiffness: number;
  viscosity: number;
  restitution: number;       // wall bounce 0–1
  friction: number;          // wall friction 0–1
  particleRadius: number;    // render + collision radius in mm
}
```

### Runtime-only (Zustand, never persisted)

```typescript
interface PlaybackState {
  status: 'idle' | 'playing' | 'paused';
  currentTimeMs: number;
  totalDurationMs: number;
  speedMultiplier: number;   // 0.25 | 0.5 | 1 | 2 | 4
  loop: boolean;
}

interface SimState {
  particles: Float32Array;   // interleaved [x, y, vx, vy, ...] per particle
  containerPositionMm: number;
  containerVelocityMms: number;
  containerAccelMms2: number;
}

interface PlotBuffer {
  times: number[];           // rolling 30s window
  positions: number[];
  velocities: number[];
  accels: number[];
}

interface UIState {
  theme: 'light' | 'dark';
  presentationMode: boolean;
  activeStepId: string | null;  // highlighted in editor during playback
}
```

**Design decisions:**
- `Float32Array` for particle state — avoids GC pressure at 60fps, directly transferable to a Web Worker later
- `PBDParams` always present even for presets — presets populate it with known-good values; `custom` exposes fields in UI (stretch)
- `version: 1` at root — future-proofs file format for migrations
- `accelJerk = 0` encodes trapezoidal naturally; `profileType` is a UI hint

---

## User Flow Spec

### Flow 1 — First use / new program
```
Open app
  → blank program, default container (200×100mm, 60% fill), water preset
  → user adds moves via "+ Add Move"
  → fills in fields per move
  → adds delays between moves as needed
  → adjusts container config and material selector
  → hits Run
  → playback starts, container moves, particles respond
  → user scrubs timeline or adjusts speed
  → hits Stop, tweaks a move, hits Run again
  → File → Save As → .movematter.json downloaded
```

### Flow 2 — Load and iterate
```
Open app → File → Open → picks .movematter.json
  → program, container, material restored
  → user modifies steps (reorder, change values)
  → runs, observes behavioral diff
  → File → Save (overwrites)
```

### Flow 3 — Presentation / demo
```
Load or build program
  → click Presentation Mode toggle in header
  → layout shifts to full-width rows
  → program editor collapses
  → hit Play → full-width viewport + plots fill the screen
  → toggle back to default when done
```

### Playback State Machine
```
IDLE ──[Run]──▶ PLAYING ──[Pause]──▶ PAUSED
  ▲                │                    │
  └──[Stop]────────┘◀────[Resume]───────┘
                   │
              [Scrub] → seeks to t, stays PLAYING or PAUSED
              [End of program] → IDLE (or loops back if loop=true)
```

### Validation Gates
- Move with `displacement = 0` → warning (not blocked)
- Move where velocity profile cannot complete in displacement (accel/distance mismatch) → inline error, Run disabled
- Over-travel (sum of signed displacements > `axisLength`) → warning banner
