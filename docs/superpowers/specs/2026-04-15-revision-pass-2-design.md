# MoveMatter Revision Pass 2 — Design Spec

**Date:** 2026-04-15
**Status:** Approved

## Overview

Seven bugs and UX gaps found during real testing of the Phase 2 build. Grouped into five implementation areas.

---

## 1. S-Curve Math Fix + Achievable Indicators

### Problem

When `accelJerk < acceleration² / maxVelocity`, the jerk ramp phase alone exceeds vPeak before it completes. The current code computes `t_j1 = acceleration / accelJerk` unconditionally, producing `vAfterAccel` far above `vPeak`. The binary-search triangle fallback can't converge because `d_accel` is enormous regardless of `vPeak`. Result: near-zero motion or position wildly exceeding the input displacement.

### Fix — `motionInterpolator.ts`

In `computeScurvePhases`, cap the effective peak acceleration before computing phase durations:

```
aEffectiveAccel = min(acceleration, sqrt(vPeak × accelJerk))
aEffectiveDecel = min(deceleration, sqrt(vPeak × decelJerk))
t_j1 = aEffectiveAccel / accelJerk
t_j2 = aEffectiveDecel / decelJerk
```

All downstream phase calculations (t_ca, t_cd, d_accel, d_decel) proceed unchanged using the capped values. The binary-search fallback now converges correctly.

### Achievable Indicators — `motionInterpolator.ts` + `MoveRow.tsx`

Add a pure function `computeAchievable(step: MoveStep): { velocity: number; accel: number; decel: number }` that:
1. Runs the S-curve profile builder with the step's inputs
2. Returns the actual vPeak (from phases after fallback), effective aEffectiveAccel, and effective aEffectiveDecel

`MoveRow` calls `computeAchievable` and renders orange indicator text below the affected input only when the achieved value is strictly less than the input:
- Below "Max Velocity": `"Achievable: {n} mm/s"`
- Below "Acceleration": `"Achievable: {n} mm/s²"`
- Below "Deceleration": `"Achievable: {n} mm/s²"`

Indicators only shown for S-curve profile type (trapezoidal has no jerk constraint; constant has no accel).

---

## 2. Post-Run Idle Settling Animation

### Problem

When a run ends (non-loop), the sim freezes on the last frame. Users want to see the fluid settle naturally to rest, then hold.

### Design

**`simLoop.ts` — `startSettlingLoop(store, particles)`:**
- Accepts the final particle state from the replay loop
- Launches a separate `settlingRafId` rAF loop
- Each tick: runs 3 substeps of `pbdStep` at `dt/3` with `containerAccelX=0`
- Computes total KE: `Σ(vx² + vy²)` over all particles after each tick
- Updates `particleStateRef` each tick so viewport stays live
- When mean per-particle KE < threshold (empirically ~0.1 mm²/s², tune as needed), cancels the rAF and holds that frame
- Sets `status: 'idle'` only once KE threshold is reached

**`startReplayLoop` change:** On run-end (non-loop), instead of immediately setting `status: 'idle'`, calls `startSettlingLoop(store, finalParticles)`.

**`stopReplayLoop` / `pauseReplayLoop` changes:** Both also cancel `settlingRafId` if active (stop kills it, pause freezes mid-settle).

**Mount / container-change settle:** The existing `runSettlingPass()` (120-tick static, no animation) is unchanged — it only needs to be fast, not visible.

---

## 3. Static Trendline Traces

### Problem

`appendPlot` fires on every replay frame, so scrubbing back and forth smears garbage data into the charts. Loop mode adds duplicate traces. The 30-second rolling window discards data from longer programs.

### Design

**`types/index.ts`:** Replace `PlotBuffer` with `StaticPlot`:
```ts
export interface StaticPlot {
  times: number[]       // ms, evenly sampled from 0 → totalDurationMs
  positions: number[]   // mm
  velocities: number[]  // mm/s
  accels: number[]      // mm/s²
}
```

**`simSlice.ts`:** Remove `plotBuffer`, `appendPlot`, rolling-window logic. Add:
```ts
staticPlot: StaticPlot | null
setStaticPlot: (plot: StaticPlot) => void
clearStaticPlot: () => void
```

**`simLoop.ts` — `computeFrameBuffer`:** After building the FrameBuffer, downsample to min(300, frameCount) evenly-spaced points from `containerPositions/Velocities/Accels` and call `store.getState().setStaticPlot(...)`. Remove all `appendPlot` calls from `startReplayLoop`.

**`ProfilePlots.tsx`:**
- Reads `staticPlot` instead of `plotBuffer`
- Renders empty charts when `staticPlot` is null
- `<Tooltip cursor={playbackStatus !== 'playing'} />` — cursor hidden during playback, visible when idle/paused

Loop mode: correct automatically — the trace is the full program profile; the playhead reference line loops over it.

---

## 4. Water/Oil Physics Overhaul

### Problem

Water looks like glowing plasma and is too floaty. The metaball is over-blurred. Gravity is 100 mm/s² (1% of real). Water and oil behave nearly identically.

### Physics Parameters — `materialPresets.ts` + `pbdSolver.ts`

**Gravity:** Raise `GRAVITY_MM_S2` from 100 → 4000 mm/s². Applied globally.

**Substep loop:** Replace single `pbdStep` call in `computeFrameBuffer`, `startSettlingLoop`, and `runSettlingPass` with a 3-substep loop at `dt/3`. Stability at higher gravity without reducing frame rate.

**Water preset:**
```
restDensity:       0.040
pressureStiffness: 900_000
viscosity:         0.005
restitution:       0.10
friction:          0.02
particleRadius:    3
```

**Oil preset (base, before viscosity slider):**
```
restDensity:       0.040
pressureStiffness: 800_000
viscosity:         0.25   ← overridden by slider at runtime
restitution:       0.05
friction:          0.04
particleRadius:    3
```

Dry-powder and coarse-granular presets unchanged.

### Metaball Rendering — `SimViewport.tsx`

```ts
blurFilter = new BlurFilter({ strength: 3, quality: 3 })   // was: strength 5, quality 2
thresholdFilter.matrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 10, -4,   // was: 6, -2
]
```

Sharper blob edge, no plasma glow.

### Oil Viscosity Slider — `MaterialSelector.tsx`

Rendered only when `material.preset === 'oil'`. Range 0.05–0.80, step 0.01. Calls `setMaterial({ ...material, params: { ...material.params, viscosity: value } })`. Labeled "Viscosity".

---

## 5. Displacement Awareness

### Problem

Move rows have no awareness of cumulative track position or remaining travel. Users can accidentally program moves that exceed the axis bounds without realising.

### Design

**Effective bounds:** `[0, axisLength − containerWidthMm]`. For default 600mm axis + 200mm container = 500mm effective travel.

**`MoveList.tsx`:** Computes `startPositionMm` per step by summing all prior steps' displacements. Passes `startPositionMm` and `axisLength` and `containerWidthMm` as props to each `MoveRow`.

**`MoveRow.tsx`:**
- Computes `endPositionMm = startPositionMm + displacement`
- Computes `maxPos = axisLength − containerWidthMm`
- `inBounds = endPositionMm >= 0 && endPositionMm <= maxPos`
- Below the displacement input, always shows grey info text:
  `"at {startPos}mm → {remaining}mm remaining"`
  where `remaining = maxPos − startPositionMm` (space to the right)
- When `!inBounds`: info text turns orange, displacement input border turns red

---

## 6. Chart Cursor Fix

Covered in Section 3 above (`<Tooltip cursor={playbackStatus !== 'playing'} />`).

---

## Files Changed

| File | Change |
|------|--------|
| `src/sim/motionInterpolator.ts` | S-curve phase math fix; `computeAchievable` function |
| `src/sim/pbdSolver.ts` | Gravity constant raised |
| `src/sim/materialPresets.ts` | Water + oil params retuned |
| `src/sim/simLoop.ts` | `startSettlingLoop`; substep loop; remove `appendPlot`; set `staticPlot` |
| `src/store/simSlice.ts` | Replace `plotBuffer`/`appendPlot` with `staticPlot`/`setStaticPlot`/`clearStaticPlot` |
| `src/types/index.ts` | Replace `PlotBuffer` with `StaticPlot` |
| `src/components/SimViewport.tsx` | Metaball filter params |
| `src/components/ProfilePlots.tsx` | Read `staticPlot`; cursor fix |
| `src/components/MoveRow.tsx` | Achievable indicators; displacement info text + overflow warning |
| `src/components/MoveList.tsx` | Compute + pass `startPositionMm` |
| `src/components/MaterialSelector.tsx` | Oil viscosity slider |
