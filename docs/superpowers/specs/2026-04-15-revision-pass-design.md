# MoveMatter — Revision Pass Design Spec
**Date:** 2026-04-15
**Status:** Approved
**Scope:** Bug fixes and stabilization only. No stretch features.

---

## Overview

This pass fixes 8 issues discovered during real testing. The changes fall into three layers: input/UX, simulation, and playback architecture. The most significant architectural change is replacing the live real-time sim loop with a pre-compute + replay model, which fixes the Play-from-idle bug and enables true scrubbing.

---

## Fix Inventory

### Input Layer

**1. Nonzero field constraint**
- **Problem:** Number inputs validate on every keystroke, rejecting empty strings and zero intermediate states. Makes typing any value starting with 0 or clearing a field impossible.
- **Fix:** Move validation to `onBlur` only. While the field is focused, allow any string including empty and negative. Commit to the store only on blur.
- **Files:** `components/MoveRow.tsx`

**2. No reverse displacement**
- **Problem:** Displacement field is constrained to positive values. Reverse moves (negative displacement) are not possible.
- **Fix:** Remove `min` constraint on displacement input. Allow negative values. Update `motionInterpolator.ts` to handle negative displacement by sign-flipping the output position/velocity/acceleration curve.
- **Files:** `components/MoveRow.tsx`, `sim/motionInterpolator.ts`

**3. Fill % not wiring through**
- **Problem:** Changing fill % updates the Zustand store but the SimViewport does not re-initialize particle positions while the sim is idle.
- **Fix:** Dispatch a particle re-init action when fill % changes at idle. SimViewport responds to this by re-running the settling pass with the new fill level.
- **Files:** `components/ContainerConfigPanel.tsx`, `store/simSlice.ts`, `components/SimViewport.tsx`

---

### Simulation Layer

**4. S-curve profile goes to infinity**
- **Problem:** The 7-phase S-curve in `motionInterpolator.ts` has an error in the distance integration. The container does not stop at the specified displacement — the profile runs indefinitely.
- **Fix:** Audit and correct the phase duration and distance calculations. Each phase must sum exactly to the target displacement. Add unit tests asserting that `position(totalDuration) === displacement` for a range of S-curve configurations including short moves (triangle fallback) and negative displacement.
- **Files:** `sim/motionInterpolator.ts`, `src/__tests__/motionInterpolator.test.ts`

**5. Granular / dry-powder too bouncy and too coarse**
- **Problem:** Both granular presets have restitution values that are too high (particles bounce visibly) and particle radii that are too large (material looks like marbles, not powder or grain).
- **Fix:** Tune `dry-powder` and `coarse-granular` presets: reduce `restitution` significantly (target ~0.05–0.15 range), reduce `particleRadius`, increase particle count to compensate. Validate visually against expected angle-of-repose and settling behavior.
- **Files:** `sim/materialPresets.ts`

---

### Playback / Rendering Layer

**6. Track only renders when playing**
- **Problem:** `SimViewport` initializes the PixiJS scene only when playback starts. At idle, the canvas is blank.
- **Fix:** Initialize the PixiJS scene on component mount. Run a one-shot settling pass of 120 sim ticks (2 seconds of sim time at 60fps, gravity only, no container motion) to place particles in their resting state. The track and container are always visible. See pre-compute model below for how idle state integrates with the buffer.
- **Files:** `components/SimViewport.tsx`

**7. Chart accumulates across runs**
- **Problem:** `PlotBuffer` in the Zustand store is not cleared when a new Run is triggered. Subsequent runs append data, making the charts unreadable.
- **Fix:** Clear the `PlotBuffer` at the start of each new compute pass in `simLoop.ts`.
- **Files:** `sim/simLoop.ts`, `components/ProfilePlots.tsx`

**8. Play button dead from idle; scrubber chart-only**
- **Problem:** The Play button only works when the sim is already paused mid-run. From idle, it does nothing. The timeline scrubber moves a cursor across the charts but does not move the container or particles.
- **Fix:** Replace the live sim loop with the pre-compute model described below.
- **Files:** `sim/simLoop.ts`, `store/playbackSlice.ts`, `components/PlaybackBar.tsx`, `components/SimViewport.tsx`

---

## Playback Architecture: Pre-Compute Model

### Motivation

The current live rAF loop produces particle state only for the current moment in time. There is no history, so scrubbing backward is impossible and scrubbing forward requires advancing the live sim. Play-from-idle is also broken because there is no "resume from t=0" path in the current state machine.

The fix is to separate computation from playback entirely.

### Two-Phase Flow

**Phase 1 — Compute** (triggered by Run):
- The sim runs in an uncapped synchronous loop (no `requestAnimationFrame` timing).
- Every tick writes a frame snapshot into a `FrameBuffer`.
- For a 30-second program at 60fps with 600 particles, this produces ~1800 frames and completes in under 200ms on a modern browser.
- During computation, all playback controls are disabled. A "Computing…" indicator appears in `PlaybackBar`.
- On completion, Phase 2 begins automatically.

**Phase 2 — Replay**:
- A lightweight `rAF` loop reads from the `FrameBuffer` at the frame index corresponding to `currentTimeMs`.
- No physics runs during replay — it is pure buffer readback.
- Scrubbing: update `currentTimeMs` in the store; the replay loop picks up the new index on the next tick. Instant seek anywhere on the timeline.

### FrameBuffer

```typescript
interface FrameBuffer {
  particleSnapshots: Float32Array[];   // [x, y, vx, vy] per particle, one entry per frame
  containerPositions: Float32Array;    // mm, one value per frame
  containerVelocities: Float32Array;   // mm/s, one value per frame
  containerAccels: Float32Array;       // mm/s², one value per frame
  frameCount: number;
  totalDurationMs: number;
}
```

The `FrameBuffer` is stored as a module-level ref in `simLoop.ts` — not in Zustand. It is large (~17MB for 600 particles × 60fps × 30s) and must not trigger React re-renders. Zustand only stores a `hasBuffer: boolean` flag so the UI knows replay is available.

### Updated Playback State Machine

```
IDLE ──[Run]──▶ COMPUTING ──[done]──▶ PLAYING
                                           │
                                      [Pause]
                                           ▼
IDLE ◀──[Stop]────────────────────── PAUSED
                                           │
                                      [Play]
                                           ▼
                                        PLAYING

IDLE + hasBuffer ──[Play]──▶ PLAYING (from currentTimeMs, default t=0)
PLAYING/PAUSED ──[Scrub]──▶ update currentTimeMs, state unchanged
PLAYING ──[end of buffer]──▶ IDLE (or PLAYING from t=0 if loop=true)
COMPUTING ──[all controls disabled]
```

### Idle Rendering

`SimViewport` initializes the PixiJS scene on mount and runs a 120-tick settling pass (gravity only, no container motion) to display particles in their resting state. When `hasBuffer=true` and playback is IDLE or PAUSED, the viewport shows the frame at `currentTimeMs`. When `hasBuffer=false`, it shows the settling-pass rest state. The track and container are always rendered.

---

## Files Changed

| File | Change type | Summary |
|---|---|---|
| `sim/motionInterpolator.ts` | Bug fix | S-curve phase distance calculation; negative displacement support |
| `sim/materialPresets.ts` | Tuning | Lower restitution and radius for dry-powder and coarse-granular |
| `sim/simLoop.ts` | Major rewrite | Add `computeFrameBuffer()`, replace live rAF loop with `startReplayLoop()` |
| `store/playbackSlice.ts` | Additive | Add `'computing'` to status union; add `hasBuffer: boolean` |
| `store/simSlice.ts` | Additive | Add particle re-init action for fill% changes at idle |
| `components/SimViewport.tsx` | Revision | Init on mount; idle settle pass; read from FrameBuffer during replay |
| `components/PlaybackBar.tsx` | Revision | Enable Play when `hasBuffer=true`; disable controls during COMPUTING; show indicator |
| `components/ProfilePlots.tsx` | Bug fix | Clear PlotBuffer at start of each compute pass |
| `components/MoveRow.tsx` | Bug fix | Blur-only validation; allow empty/negative displacement while typing |
| `components/ContainerConfigPanel.tsx` | Bug fix | Dispatch particle re-init on fill% change at idle |

No new files. No new dependencies.

---

## Tests

- `motionInterpolator.test.ts`: Add assertions that `position(totalDuration) === displacement` for S-curve profiles across short, medium, and long moves; and for negative displacement values.
- `pbdSolver.test.ts`: No changes needed — solver behavior is unchanged.
- Playwright E2E: Update flow 1 to expect a COMPUTING state transition between Run and playback start. No new E2E flows.
