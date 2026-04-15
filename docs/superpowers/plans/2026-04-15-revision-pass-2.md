# MoveMatter Revision Pass 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 bugs found in real testing: S-curve math, water physics, trendline smearing, post-run freezing, displacement overflow, and chart flickering.

**Architecture:** Five sequential tasks, each self-contained. Tasks 2–4 all touch `simLoop.ts` in non-conflicting ways (remove, replace, add respectively) — read the current file state before each task. Task 5 touches `MoveRow.tsx` which was also modified in Task 1 — always read current file state first.

**Tech Stack:** Vite + React 18 + TypeScript + Zustand 5 + PixiJS v8 + Recharts + Vitest

**Spec:** `docs/superpowers/specs/2026-04-15-revision-pass-2-design.md`

---

## Task 1: S-Curve Math Fix + Achievable Indicators

**Files:**
- Modify: `src/sim/motionInterpolator.ts`
- Modify: `src/components/MoveRow.tsx`
- Modify: `src/__tests__/motionInterpolator.test.ts`

### Background

The bug: `computeScurvePhases` always computes `t_j1 = acceleration / accelJerk`. When `accelJerk` is small (e.g. 100) and `acceleration` is large (e.g. 1000), `t_j1` = 10 s. The velocity at the end of the jerk ramp is `0.5 * accelJerk * t_j1² = 5000 mm/s`, far above any reasonable `vPeak`. The binary-search fallback can't converge because `d_accel` stays enormous at every `vPeak`. Result: near-zero motion or position wildly exceeding displacement.

Fix: cap effective peak acceleration to `min(accel, √(vPeak × jerk))` so the jerk ramp never overshoots `vPeak`. Same fix applied symmetrically to the decel side.

- [ ] **Step 1: Write failing tests for the S-curve math fix**

Append these tests to the `describe('buildSCurveProfile', ...)` block in `src/__tests__/motionInterpolator.test.ts`:

```ts
  it('does not overshoot displacement when jerk is very low (was broken pre-fix)', () => {
    // accelJerk=100 with accel=1000 and vMax=500 was the broken case
    const p = buildSCurveProfile(100, 500, 1000, 1000, 100, 100)
    const final = p.eval(p.durationS)
    approx(final.pos, 100, 0.5)
    approx(final.vel, 0, 5)
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * p.durationS
      const s = p.eval(t)
      expect(s.pos).toBeLessThanOrEqual(100.5)
      expect(s.pos).toBeGreaterThanOrEqual(-0.5)
    }
  })

  it('ends at displacement with very low jerk and large displacement', () => {
    const p = buildSCurveProfile(500, 300, 800, 800, 50, 50)
    approx(p.eval(p.durationS).pos, 500, 1)
    approx(p.eval(p.durationS).vel, 0, 5)
  })
```

Also add these tests for `computeAchievable` in a new describe block at the bottom of the file (after the `buildProgram` block). You'll need to add `computeAchievable` to the import at the top of the test file:

```ts
import {
  buildTrapezoidalProfile,
  buildConstantProfile,
  buildSCurveProfile,
  buildProgram,
  computeAchievable,
} from '../sim/motionInterpolator'
```

New describe block:

```ts
describe('computeAchievable', () => {
  it('returns null for trapezoidal profile', () => {
    const step = {
      type: 'move' as const, id: '1', displacement: 100,
      maxVelocity: 500, acceleration: 1000, deceleration: 1000,
      accelJerk: 5000, decelJerk: 5000, profileType: 'trapezoidal' as const,
    }
    expect(computeAchievable(step)).toBeNull()
  })

  it('returns null for constant profile', () => {
    const step = {
      type: 'move' as const, id: '1', displacement: 100,
      maxVelocity: 500, acceleration: 1000, deceleration: 1000,
      accelJerk: 5000, decelJerk: 5000, profileType: 'constant' as const,
    }
    expect(computeAchievable(step)).toBeNull()
  })

  it('returns null for zero displacement', () => {
    const step = {
      type: 'move' as const, id: '1', displacement: 0,
      maxVelocity: 500, acceleration: 1000, deceleration: 1000,
      accelJerk: 5000, decelJerk: 5000, profileType: 'scurve' as const,
    }
    expect(computeAchievable(step)).toBeNull()
  })

  it('returns unreduced values when no constraint is active', () => {
    // High jerk — no limitation
    const step = {
      type: 'move' as const, id: '1', displacement: 1000,
      maxVelocity: 300, acceleration: 800, deceleration: 800,
      accelJerk: 10000, decelJerk: 10000, profileType: 'scurve' as const,
    }
    const r = computeAchievable(step)!
    approx(r.velocity, 300, 1)
    approx(r.accel, 800, 1)
    approx(r.decel, 800, 1)
  })

  it('returns limited accel when jerk constrains the accel phase', () => {
    // accelJerk=100, accel=1000, vPeak=500 → aEffAccel = sqrt(500*100) ≈ 223.6
    const step = {
      type: 'move' as const, id: '1', displacement: 1000,
      maxVelocity: 500, acceleration: 1000, deceleration: 1000,
      accelJerk: 100, decelJerk: 100, profileType: 'scurve' as const,
    }
    const r = computeAchievable(step)!
    expect(r.accel).toBeLessThan(1000)
    approx(r.accel, Math.sqrt(500 * 100), 5)
  })

  it('returns limited velocity when displacement too short for full profile', () => {
    const step = {
      type: 'move' as const, id: '1', displacement: 10,
      maxVelocity: 500, acceleration: 1000, deceleration: 1000,
      accelJerk: 5000, decelJerk: 5000, profileType: 'scurve' as const,
    }
    const r = computeAchievable(step)!
    expect(r.velocity).toBeLessThan(500)
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: new `buildSCurveProfile` tests FAIL (overshoot), `computeAchievable` tests FAIL (function not exported).

- [ ] **Step 3: Fix `computeScurvePhases` and add `computeAchievable` in `motionInterpolator.ts`**

**3a — Update the `SCurvePhases` interface** (add `aEffAccel` and `aEffDecel` fields):

Replace the existing `interface SCurvePhases` block with:

```ts
interface SCurvePhases {
  t_j1: number; t_ca: number; vAfterAccel: number
  aEffAccel: number; aEffDecel: number
  t_j2: number; t_cd: number
  d_accel: number; d_decel: number
  // Intermediate values needed for segment construction
  p1: number; p2: number; v2: number
  pD1: number; pD2: number; vJ2: number; v_after_cd: number
}
```

**3b — Replace the entire `computeScurvePhases` function** with:

```ts
function computeScurvePhases(
  vPeak: number,
  acceleration: number,
  deceleration: number,
  accelJerk: number,
  decelJerk: number,
): SCurvePhases {
  // Cap effective peak acceleration so the jerk ramp never overshoots vPeak.
  // When jerk is low, sqrt(vPeak * jerk) < acceleration, so the ramp is cut short.
  const aEffAccel = vPeak > 0 ? Math.min(acceleration, Math.sqrt(vPeak * accelJerk)) : 0
  const t_j1 = aEffAccel > 0 ? aEffAccel / accelJerk : 0
  const t_ca = Math.max(0, aEffAccel > 0 ? vPeak / aEffAccel - t_j1 : 0)
  const vAfterAccel = aEffAccel * (t_j1 + t_ca)  // == vPeak by construction

  const vJ1 = 0.5 * accelJerk * t_j1 * t_j1
  const p1 = accelJerk * Math.pow(t_j1, 3) / 6
  const v2 = vJ1 + aEffAccel * t_ca
  const p2 = p1 + vJ1 * t_ca + 0.5 * aEffAccel * t_ca * t_ca
  const d_accel = p2 + v2 * t_j1 + 0.5 * aEffAccel * t_j1 * t_j1 - accelJerk * Math.pow(t_j1, 3) / 6

  // Same cap on the decel side
  const aEffDecel = vPeak > 0 ? Math.min(deceleration, Math.sqrt(vPeak * decelJerk)) : 0
  const t_j2 = aEffDecel > 0 ? aEffDecel / decelJerk : 0
  const t_cd = Math.max(0, aEffDecel > 0 ? vPeak / aEffDecel - t_j2 : 0)
  const vJ2 = 0.5 * decelJerk * t_j2 * t_j2
  const pD1 = decelJerk * Math.pow(t_j2, 3) / 6
  const v_after_cd = vJ2 + aEffDecel * t_cd
  const pD2 = pD1 + vJ2 * t_cd + 0.5 * aEffDecel * t_cd * t_cd
  const d_decel = pD2 + v_after_cd * t_j2 + 0.5 * aEffDecel * t_j2 * t_j2 - decelJerk * Math.pow(t_j2, 3) / 6

  return {
    t_j1, t_ca, vAfterAccel, aEffAccel, aEffDecel,
    t_j2, t_cd, d_accel, d_decel,
    p1, p2, v2, pD1, pD2, vJ2, v_after_cd,
  }
}
```

**3c — Add `computeAchievable` export** after `buildSCurveProfile` and before the `// ─── Program evaluator` comment:

```ts
// ─── Achievable value calculator ─────────────────────────────────────────────
// Returns the actual peak velocity/accel/decel after all S-curve constraints,
// or null for non-S-curve profiles. Used by MoveRow to show orange indicators.

import type { MoveStep } from '../types'

export function computeAchievable(
  step: MoveStep,
): { velocity: number; accel: number; decel: number } | null {
  if (step.profileType !== 'scurve' || step.displacement === 0) return null

  const dAbs = Math.abs(step.displacement)
  let vPeak = step.maxVelocity
  let phases = computeScurvePhases(vPeak, step.acceleration, step.deceleration, step.accelJerk, step.decelJerk)

  if (phases.d_accel + phases.d_decel > dAbs) {
    let lo = 0
    let hi = step.maxVelocity
    for (let i = 0; i < 64; i++) {
      const mid = (lo + hi) / 2
      const ph = computeScurvePhases(mid, step.acceleration, step.deceleration, step.accelJerk, step.decelJerk)
      if (ph.d_accel + ph.d_decel <= dAbs) lo = mid; else hi = mid
    }
    vPeak = (lo + hi) / 2
    phases = computeScurvePhases(vPeak, step.acceleration, step.deceleration, step.accelJerk, step.decelJerk)
  }

  return {
    velocity: vPeak,
    accel: phases.aEffAccel,
    decel: phases.aEffDecel,
  }
}
```

**Important:** The `import type { MoveStep }` line must go at the top of the file with the other imports, not inline. Move it there. The existing import line is:
```ts
import type { MotionSample, MotionProgram } from '../types'
```
Change it to:
```ts
import type { MotionSample, MotionProgram, MoveStep } from '../types'
```

- [ ] **Step 4: Run tests to verify motion interpolator tests pass**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx vitest run --reporter=verbose src/__tests__/motionInterpolator.test.ts 2>&1 | tail -40
```

Expected: all tests in this file PASS. Fix any failures before continuing.

- [ ] **Step 5: Update `MoveRow.tsx` to show achievable indicators**

**5a — Add import** at the top of `src/components/MoveRow.tsx`:

```ts
import { computeAchievable } from '../sim/motionInterpolator'
```

**5b — Add `achieved` computation** inside `MoveRow` (right after the `isConstant` declaration):

```ts
const achieved = isScurve ? computeAchievable(step) : null
```

**5c — Wrap the Max Velocity field** with an indicator div. Replace:

```tsx
<NumInput label="Max Velocity (mm/s)" value={step.maxVelocity} field="maxVelocity" stepId={step.id} />
```

With:

```tsx
<div>
  <NumInput label="Max Velocity (mm/s)" value={step.maxVelocity} field="maxVelocity" stepId={step.id} />
  {achieved && achieved.velocity < step.maxVelocity - 0.5 && (
    <p style={{ fontSize: 10, color: '#f97316', margin: '2px 0 0 0' }}>
      Achievable: {achieved.velocity.toFixed(0)} mm/s
    </p>
  )}
</div>
```

**5d — Wrap the Acceleration field** (only rendered when `!isConstant`). Replace:

```tsx
<NumInput label="Acceleration (mm/s²)" value={step.acceleration} field="acceleration" stepId={step.id} />
```

With:

```tsx
<div>
  <NumInput label="Acceleration (mm/s²)" value={step.acceleration} field="acceleration" stepId={step.id} />
  {achieved && achieved.accel < step.acceleration - 0.5 && (
    <p style={{ fontSize: 10, color: '#f97316', margin: '2px 0 0 0' }}>
      Achievable: {achieved.accel.toFixed(0)} mm/s²
    </p>
  )}
</div>
```

**5e — Wrap the Deceleration field** similarly. Replace:

```tsx
<NumInput label="Deceleration (mm/s²)" value={step.deceleration} field="deceleration" stepId={step.id} />
```

With:

```tsx
<div>
  <NumInput label="Deceleration (mm/s²)" value={step.deceleration} field="deceleration" stepId={step.id} />
  {achieved && achieved.decel < step.deceleration - 0.5 && (
    <p style={{ fontSize: 10, color: '#f97316', margin: '2px 0 0 0' }}>
      Achievable: {achieved.decel.toFixed(0)} mm/s²
    </p>
  )}
</div>
```

- [ ] **Step 6: Run all tests**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx vitest run 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && git add src/sim/motionInterpolator.ts src/components/MoveRow.tsx src/__tests__/motionInterpolator.test.ts && git commit -m "fix: S-curve math — cap effective accel to sqrt(vPeak*jerk); add achievable indicators in MoveRow"
```

---

## Task 2: Static Trendline Traces + Chart Cursor Fix

**Depends on:** Task 1 complete (no simLoop.ts conflict; this task modifies simLoop independently)

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/simSlice.ts`
- Modify: `src/sim/simLoop.ts`
- Modify: `src/components/ProfilePlots.tsx`

### Background

`appendPlot` fires on every replay frame, causing the rolling buffer to smear data when the user scrubs. The fix: derive a static plot from the FrameBuffer once at compute time; ProfilePlots reads it as a fixed trace. The chart cursor (a Recharts vertical line that tracks mouse X) flickers at the right edge during playback — suppress it while playing.

- [ ] **Step 1: Replace `PlotBuffer` with `StaticPlot` in `src/types/index.ts`**

Find and replace the `PlotBuffer` interface:

```ts
// REMOVE this:
export interface PlotBuffer {
  times: number[]           // ms from program start, rolling 30s window
  positions: number[]       // mm
  velocities: number[]      // mm/s
  accels: number[]          // mm/s²
}

// REPLACE with:
export interface StaticPlot {
  times: number[]       // ms, evenly sampled from 0 → totalDurationMs (~300 points)
  positions: number[]   // mm
  velocities: number[]  // mm/s
  accels: number[]      // mm/s²
}
```

- [ ] **Step 2: Rewrite `src/store/simSlice.ts`**

Replace the entire file content with:

```ts
import type { SimState, StaticPlot, ContainerConfig, PBDParams } from '../types'
import { initParticles } from '../sim/pbdSolver'

export interface SimSlice {
  sim: SimState
  staticPlot: StaticPlot | null
  setSim: (sim: SimState) => void
  setStaticPlot: (plot: StaticPlot) => void
  clearStaticPlot: () => void
  resetSim: () => void
  reinitParticles: (container: ContainerConfig, params: PBDParams) => void
}

const emptySimState = (): SimState => ({
  particles: new Float32Array(0),
  containerPositionMm: 0,
  containerVelocityMms: 0,
  containerAccelMms2: 0,
})

export const createSimSlice = (set: any): SimSlice => ({
  sim: emptySimState(),
  staticPlot: null,
  setSim: (sim) => set({ sim }),
  setStaticPlot: (plot) => set({ staticPlot: plot }),
  clearStaticPlot: () => set({ staticPlot: null }),
  resetSim: () => set({ sim: emptySimState(), staticPlot: null }),
  reinitParticles: (container, params) =>
    set({ sim: { ...emptySimState(), particles: initParticles(container, params) } }),
})
```

- [ ] **Step 3: Update `src/sim/simLoop.ts`**

Read the current file first, then apply these changes:

**3a — Remove the plot-related module-level variables:**

```ts
// REMOVE these two lines:
let plotFrameCounter = 0
const PLOT_SAMPLE_EVERY = 6   // ~10fps plot updates at 60fps replay
```

**3b — Update the import at top of file** — the store action `appendPlot` no longer exists, so any store usage via `store.getState().appendPlot(...)` must be removed. (TypeScript will catch this.)

**3c — In `computeFrameBuffer`, after the frame-building loop and BEFORE the `frameBufferRef.current = { ... }` assignment, add the static plot derivation:**

```ts
  // Derive static plot — downsample to at most 300 points
  const PLOT_POINTS = Math.min(300, frameCount)
  const plotStep = Math.max(1, Math.floor(frameCount / PLOT_POINTS))
  const plotTimes: number[] = []
  const plotPositions: number[] = []
  const plotVelocities: number[] = []
  const plotAccels: number[] = []
  for (let i = 0; i < frameCount; i += plotStep) {
    plotTimes.push(i * DT * 1000)
    plotPositions.push(containerPositions[i])
    plotVelocities.push(containerVelocities[i])
    plotAccels.push(containerAccels[i])
  }
  store.getState().setStaticPlot({
    times: plotTimes,
    positions: plotPositions,
    velocities: plotVelocities,
    accels: plotAccels,
  })
```

**3d — In `startReplayLoop`, remove the plot sampling block.** Find and delete these lines (approximately lines 210–219 in the original):

```ts
    // Plot at ~10fps
    plotFrameCounter++
    if (plotFrameCounter >= PLOT_SAMPLE_EVERY) {
      plotFrameCounter = 0
      store.getState().appendPlot(
        nextTimeMs,
        buf.containerPositions[frameIdx],
        buf.containerVelocities[frameIdx],
        buf.containerAccels[frameIdx],
      )
    }
```

**3e — In `stopReplayLoop`, remove the `plotFrameCounter = 0` line** (it no longer exists).

- [ ] **Step 4: Rewrite `src/components/ProfilePlots.tsx`**

Replace the entire file content with:

```tsx
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { useStore } from '../store'

interface PlotProps {
  data: { t: number; v: number }[]
  dataKey: string
  color: string
  unit: string
  currentTimeMs: number
  isPlaying: boolean
}

function MiniPlot({ data, dataKey, color, unit, currentTimeMs, isPlaying }: PlotProps) {
  return (
    <ResponsiveContainer width="100%" height={90}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <XAxis dataKey="t" hide />
        <YAxis
          tickCount={3}
          tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }}
          width={36}
          unit={unit}
        />
        <Tooltip
          cursor={!isPlaying}
          contentStyle={{
            fontSize: 10, padding: '2px 6px',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          }}
          formatter={(v: unknown) => [`${(v as number).toFixed(1)} ${unit}`, dataKey] as [string, string]}
        />
        <ReferenceLine x={currentTimeMs} stroke="var(--color-accent)" strokeWidth={1.5} />
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function ProfilePlots() {
  const staticPlot = useStore((s) => s.staticPlot)
  const currentTimeMs = useStore((s) => s.playback.currentTimeMs)
  const isPlaying = useStore((s) => s.playback.status === 'playing')

  if (!staticPlot) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--color-text-muted)', fontSize: 11,
      }}>
        Run a program to see the motion profile.
      </div>
    )
  }

  const posData = staticPlot.times.map((t, i) => ({ t, v: staticPlot.positions[i] }))
  const velData = staticPlot.times.map((t, i) => ({ t, v: staticPlot.velocities[i] }))
  const accelData = staticPlot.times.map((t, i) => ({ t, v: staticPlot.accels[i] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '4px 8px', gap: 2 }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 9, color: 'var(--color-text-muted)', margin: '0 0 1px 36px', fontWeight: 600 }}>
          POSITION (mm)
        </p>
        <MiniPlot data={posData} dataKey="pos" color="#3b82f6" unit="mm"
          currentTimeMs={currentTimeMs} isPlaying={isPlaying} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 9, color: 'var(--color-text-muted)', margin: '0 0 1px 36px', fontWeight: 600 }}>
          VELOCITY (mm/s)
        </p>
        <MiniPlot data={velData} dataKey="vel" color="#10b981" unit="mm/s"
          currentTimeMs={currentTimeMs} isPlaying={isPlaying} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 9, color: 'var(--color-text-muted)', margin: '0 0 1px 36px', fontWeight: 600 }}>
          ACCEL (mm/s²)
        </p>
        <MiniPlot data={accelData} dataKey="accel" color="#f59e0b" unit="mm/s²"
          currentTimeMs={currentTimeMs} isPlaying={isPlaying} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run all tests**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx vitest run 2>&1 | tail -20
```

Expected: all tests PASS. (The store slice changes are runtime-only; no unit tests cover them directly.)

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Fix any type errors (most likely `appendPlot` references that were missed).

- [ ] **Step 7: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && git add src/types/index.ts src/store/simSlice.ts src/sim/simLoop.ts src/components/ProfilePlots.tsx && git commit -m "feat: replace rolling plotBuffer with static FrameBuffer trace; suppress chart cursor during playback"
```

---

## Task 3: Water/Oil Physics Overhaul

**Depends on:** Task 2 complete (simLoop.ts is settled; this task modifies pbdStep calls in it)

**Files:**
- Modify: `src/sim/pbdSolver.ts`
- Modify: `src/sim/materialPresets.ts`
- Modify: `src/sim/simLoop.ts`
- Modify: `src/components/SimViewport.tsx`
- Modify: `src/components/MaterialSelector.tsx`

### Background

Gravity is 100 mm/s² (1% of real). Water and oil have low pressure stiffness so they compress visibly. The metaball blur is too diffuse — particles look like plasma. Oil needs a viscosity slider. Fix: raise gravity to 4000 mm/s², raise pressure stiffness, add substep helper (3 substeps per frame at dt/3 for stability), tighten metaball, add oil slider.

- [ ] **Step 1: Update `src/sim/pbdSolver.ts` — raise gravity and add substep helper**

**1a — Change the gravity constant:**

```ts
// CHANGE:
const GRAVITY_MM_S2 = 100   // mm/s² — reduced for stable SPH simulation

// TO:
const GRAVITY_MM_S2 = 4000  // mm/s² — elevated for visible slosh
```

**1b — Add the `SUBSTEPS` constant and `pbdStepMulti` function** at the end of the file, after `pbdStep`:

```ts
// ─── Substep helper ───────────────────────────────────────────────────────────
// Runs multiple substeps at dt/SUBSTEPS for stability at higher gravity.

export const SUBSTEPS = 3

export function pbdStepMulti(input: StepInput): Float32Array {
  const subDt = input.dt / SUBSTEPS
  let particles = input.particles
  for (let i = 0; i < SUBSTEPS; i++) {
    particles = pbdStep({ ...input, particles, dt: subDt })
  }
  return particles
}
```

- [ ] **Step 2: Update `src/sim/materialPresets.ts`**

Replace the entire file content with:

```ts
import type { PBDParams } from '../types'

export const MATERIAL_PRESETS: Record<string, PBDParams> = {
  water: {
    restDensity: 0.040,
    pressureStiffness: 900_000,
    viscosity: 0.005,
    restitution: 0.10,
    friction: 0.02,
    particleRadius: 3,
  },
  oil: {
    restDensity: 0.040,
    pressureStiffness: 800_000,
    viscosity: 0.25,
    restitution: 0.05,
    friction: 0.04,
    particleRadius: 3,
  },
  'dry-powder': {
    restDensity: 0.028,
    pressureStiffness: 60000,
    viscosity: 0.35,
    restitution: 0.04,
    friction: 0.55,
    particleRadius: 2,
  },
  'coarse-granular': {
    restDensity: 0.014,
    pressureStiffness: 30000,
    viscosity: 0.45,
    restitution: 0.08,
    friction: 0.70,
    particleRadius: 3.5,
  },
}
```

- [ ] **Step 3: Update `src/sim/simLoop.ts` to use `pbdStepMulti`**

Read the current file state, then apply:

**3a — Update the import** at the top of the file. Change:

```ts
import { initParticles, pbdStep, STRIDE } from './pbdSolver'
```

To:

```ts
import { initParticles, pbdStep, pbdStepMulti, STRIDE } from './pbdSolver'
```

**3b — In `runSettlingPass`**, replace `pbdStep(...)` with `pbdStepMulti(...)`:

```ts
// CHANGE:
    particles = pbdStep({ particles, container, params: material.params, dt: SETTLE_DT, containerAccelX: 0 })

// TO:
    particles = pbdStepMulti({ particles, container, params: material.params, dt: SETTLE_DT, containerAccelX: 0 })
```

**3c — In `computeFrameBuffer`, inside the frame-building loop**, replace `pbdStep(...)` with `pbdStepMulti(...)`:

```ts
// CHANGE:
    particles = pbdStep({
      particles,
      container: state.container,
      params: state.material.params,
      dt: DT,
      containerAccelX: accel,
    })

// TO:
    particles = pbdStepMulti({
      particles,
      container: state.container,
      params: state.material.params,
      dt: DT,
      containerAccelX: accel,
    })
```

- [ ] **Step 4: Update metaball filter params in `src/components/SimViewport.tsx`**

Find the filter initialisation block (inside the `init()` function):

```ts
      blurFilter = new BlurFilter({ strength: 5, quality: 2 })
      thresholdFilter = new ColorMatrixFilter()
      thresholdFilter.matrix = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 6, -2,
      ]
```

Replace with:

```ts
      blurFilter = new BlurFilter({ strength: 3, quality: 3 })
      thresholdFilter = new ColorMatrixFilter()
      thresholdFilter.matrix = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 10, -4,
      ]
```

- [ ] **Step 5: Add oil viscosity slider to `src/components/MaterialSelector.tsx`**

Replace the entire file content with:

```tsx
import { useStore } from '../store'
import { MATERIAL_PRESETS } from '../sim/materialPresets'
import type { MaterialPreset } from '../types'

const PRESETS: MaterialPreset[] = ['water', 'oil', 'dry-powder', 'coarse-granular']

const PRESET_LABELS: Record<MaterialPreset, string> = {
  water: 'Water',
  oil: 'Oil',
  'dry-powder': 'Dry Powder',
  'coarse-granular': 'Granular',
  custom: 'Custom',
}

export function MaterialSelector() {
  const material = useStore((s) => s.material)
  const setMaterial = useStore((s) => s.setMaterial)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', margin: 0 }}>
        MATERIAL
      </p>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setMaterial({ preset, params: MATERIAL_PRESETS[preset] })}
            style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${material.preset === preset ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: material.preset === preset ? 'var(--color-accent)' : 'var(--color-surface)',
              color: material.preset === preset ? '#fff' : 'var(--color-text)',
              fontWeight: material.preset === preset ? 600 : 400,
            }}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>
      {material.preset === 'oil' && (
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2,
        }}>
          Viscosity
          <input
            type="range"
            min={0.05}
            max={0.80}
            step={0.01}
            value={material.params.viscosity}
            onChange={(e) =>
              setMaterial({ preset: 'oil', params: { ...material.params, viscosity: parseFloat(e.target.value) } })
            }
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, minWidth: 32, textAlign: 'right' }}>
            {material.params.viscosity.toFixed(2)}
          </span>
        </label>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run all tests and TypeScript check**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx vitest run 2>&1 | tail -20 && npx tsc --noEmit 2>&1 | head -20
```

Expected: all tests PASS, no TypeScript errors. The `pbdSolver.test.ts` tests should still pass since gravity is a module constant not tested directly.

- [ ] **Step 7: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && git add src/sim/pbdSolver.ts src/sim/materialPresets.ts src/sim/simLoop.ts src/components/SimViewport.tsx src/components/MaterialSelector.tsx && git commit -m "feat: water/oil physics overhaul — gravity 4000, substeps, retuned presets, tighter metaball, oil viscosity slider"
```

---

## Task 4: Post-Run Idle Settling Animation

**Depends on:** Task 3 complete (`pbdStepMulti` already imported in `simLoop.ts` — do not re-add its import)

**Files:**
- Modify: `src/sim/simLoop.ts`

### Background

When a run ends, the sim freezes on the last frame. The user wants to see the fluid settle naturally to rest, then hold. Fix: after replay ends, launch a settling rAF loop that runs pbdStepMulti with no container motion until mean per-particle KE drops below a threshold, then freeze and set status `'idle'`.

- [ ] **Step 1: Add `startSettlingLoop` and `stopSettlingLoop` to `src/sim/simLoop.ts`**

Read the current file state. Add the following block immediately after the `pauseReplayLoop` function and before the `stopReplayLoop` function:

```ts
// ─── Idle settling loop ───────────────────────────────────────────────────────
// After a run ends, animates the fluid settling under gravity until near-rest,
// then freezes and sets status='idle'.

let settlingRafId: number | null = null
const KE_THRESHOLD = 0.1  // mean per-particle KE (mm²/s²) to stop settling

export function startSettlingLoop(
  store: StoreApi<AppStore>,
  initialParticles: Float32Array,
): void {
  if (settlingRafId !== null) {
    cancelAnimationFrame(settlingRafId)
    settlingRafId = null
  }

  const state = store.getState()
  const { container, material } = state
  let currentParticles = initialParticles

  function tick() {
    currentParticles = pbdStepMulti({
      particles: currentParticles,
      container,
      params: material.params,
      dt: 1 / 60,
      containerAccelX: 0,
    })

    particleStateRef.particles = currentParticles

    // Compute mean per-particle KE
    const n = currentParticles.length / STRIDE
    let ke = 0
    for (let i = 0; i < n; i++) {
      const vx = currentParticles[i * STRIDE + 2]
      const vy = currentParticles[i * STRIDE + 3]
      ke += vx * vx + vy * vy
    }
    const meanKE = n > 0 ? ke / n : 0

    if (meanKE < KE_THRESHOLD) {
      settlingRafId = null
      store.setState((s) => ({ playback: { ...s.playback, status: 'idle' } }))
      return
    }

    settlingRafId = requestAnimationFrame(tick)
  }

  settlingRafId = requestAnimationFrame(tick)
}

export function stopSettlingLoop(): void {
  if (settlingRafId !== null) {
    cancelAnimationFrame(settlingRafId)
    settlingRafId = null
  }
}
```

- [ ] **Step 2: Modify the end-of-run path in `startReplayLoop`**

Find the block inside `startReplayLoop` that handles when `nextTimeMs >= buf.totalDurationMs` and the loop is NOT set to loop mode. It currently looks like:

```ts
      } else {
        nextTimeMs = buf.totalDurationMs
        const fi = buf.frameCount - 1
        _writeFrame(buf, fi, store)
        store.setState((p) => ({
          playback: { ...p.playback, status: 'idle', currentTimeMs: nextTimeMs },
        }))
        rafId = null
        lastTimestamp = null
        return
      }
```

Replace it with:

```ts
      } else {
        nextTimeMs = buf.totalDurationMs
        const fi = buf.frameCount - 1
        _writeFrame(buf, fi, store)
        // Update time but don't set status yet — settling loop sets 'idle' when done
        store.setState((p) => ({
          playback: { ...p.playback, currentTimeMs: nextTimeMs },
        }))
        rafId = null
        lastTimestamp = null
        // Start settling animation from final particle state
        const offset = fi * buf.particleCount * STRIDE
        const finalParticles = buf.packedParticles.slice(offset, offset + buf.particleCount * STRIDE)
        startSettlingLoop(store, finalParticles)
        return
      }
```

- [ ] **Step 3: Update `pauseReplayLoop` to stop settling mid-animation**

The current `pauseReplayLoop`:

```ts
export function pauseReplayLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  lastTimestamp = null
}
```

Replace with:

```ts
export function pauseReplayLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  stopSettlingLoop()
  lastTimestamp = null
}
```

- [ ] **Step 4: Update `stopReplayLoop` to cancel settling**

Find the `stopReplayLoop` function and add `stopSettlingLoop()` after the rAF cancel:

```ts
export function stopReplayLoop(store: StoreApi<AppStore>): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  stopSettlingLoop()   // ADD THIS LINE
  lastTimestamp = null
  store.setState((s) => ({
    playback: { ...s.playback, status: 'idle', currentTimeMs: 0 },
  }))
  store.getState().setActiveStepId(null)
}
```

- [ ] **Step 5: Run all tests and TypeScript check**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx vitest run 2>&1 | tail -20 && npx tsc --noEmit 2>&1 | head -20
```

Expected: all tests PASS, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && git add src/sim/simLoop.ts && git commit -m "feat: post-run idle settling animation — fluid animates to rest then freezes"
```

---

## Task 5: Displacement Awareness in Move Rows

**Depends on:** Task 1 complete (MoveRow.tsx was modified there; read current state before editing)

**Files:**
- Modify: `src/components/MoveList.tsx`
- Modify: `src/components/MoveRow.tsx`

### Background

Move rows have no awareness of cumulative track position. Users can program a container off the end of the axis. Fix: compute `startPositionMm` per step in `MoveList` (sum of all prior displacements), pass it down to `MoveRow`, which shows grey info text and red/orange when out of bounds. Effective travel range is `[0, axisLength − containerWidthMm]`.

- [ ] **Step 1: Update `src/components/MoveList.tsx`**

Read the current file. Apply these changes:

**1a — Add store reads for axis and container dimensions** inside `MoveList` (right after the existing `const steps` and `const reorderSteps` lines):

```ts
  const axisLength = useStore((s) => s.program.axisLength)
  const containerWidthMm = useStore((s) => s.container.widthMm)
```

**1b — Pre-compute start positions** before the `if (steps.length === 0)` early return:

```ts
  // Compute cumulative start position for each step
  const startPositions: number[] = []
  let cumPos = 0
  for (const step of steps) {
    startPositions.push(cumPos)
    if (step.type === 'move') cumPos += step.displacement
  }
```

**1c — Pass the new props to `MoveRow`**. In the return JSX, find the `<MoveRow ... />` element and add three props:

```tsx
          <MoveRow
            key={step.id}
            step={step}
            error={errorFor(step.id)}
            dragHandleProps={dragHandleProps}
            rowDropProps={rowDropProps}
            startPositionMm={startPositions[index]}
            axisLength={axisLength}
            containerWidthMm={containerWidthMm}
          />
```

- [ ] **Step 2: Update `src/components/MoveRow.tsx` to accept and render displacement info**

Read the current file state (it was modified in Task 1).

**2a — Update the `Props` interface** to add the three new props:

```ts
interface Props {
  step: MoveStep
  error?: string
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  rowDropProps?: React.HTMLAttributes<HTMLDivElement>
  startPositionMm: number
  axisLength: number
  containerWidthMm: number
}
```

**2b — Update the `MoveRow` function signature** to destructure the new props:

```ts
export function MoveRow({ step, error, dragHandleProps, rowDropProps, startPositionMm, axisLength, containerWidthMm }: Props) {
```

**2c — Add displacement bounds computation** inside `MoveRow`, right after the `const achieved` line (or after `const isConstant` if Task 1 hasn't added `achieved` yet — but Task 1 should be done):

```ts
  const maxPos = axisLength - containerWidthMm
  const endPositionMm = startPositionMm + step.displacement
  const inBounds = endPositionMm >= 0 && endPositionMm <= maxPos
  const remainingMm = maxPos - startPositionMm
```

**2d — Add displacement info line** right after the closing `</div>` of the displacement `NumInput` wrapper. Find where the displacement field is rendered:

```tsx
        {/* Displacement: no min — allows negative for reverse moves */}
        <NumInput label="Displacement (mm)" value={step.displacement} field="displacement" stepId={step.id} />
```

Wrap it with an info block:

```tsx
        {/* Displacement with bounds info */}
        <div>
          <NumInput
            label="Displacement (mm)"
            value={step.displacement}
            field="displacement"
            stepId={step.id}
            style={!inBounds ? { border: '1px solid #ef4444' } : undefined}
          />
          <p style={{ fontSize: 10, color: inBounds ? 'var(--color-text-muted)' : '#f97316', margin: '2px 0 0 0' }}>
            at {startPositionMm.toFixed(0)}mm → {remainingMm.toFixed(0)}mm remaining
            {!inBounds && ' ⚠ overflow'}
          </p>
        </div>
```

**Note:** The `NumInput` component's current `input` element applies its own border style inline. To make the red border work, you'll need to pass an `errorStyle` prop OR just rely on the parent `div`'s border (add a wrapping `div` with a red outline). Simplest approach — add a red outline to the wrapper `div` when `!inBounds`:

```tsx
        <div style={!inBounds ? { outline: '1px solid #ef4444', borderRadius: 3 } : undefined}>
          <NumInput label="Displacement (mm)" value={step.displacement} field="displacement" stepId={step.id} />
          <p style={{ fontSize: 10, color: inBounds ? 'var(--color-text-muted)' : '#f97316', margin: '2px 0 0 0' }}>
            at {startPositionMm.toFixed(0)}mm → {remainingMm.toFixed(0)}mm remaining
            {!inBounds && ' ⚠ overflow'}
          </p>
        </div>
```

- [ ] **Step 3: Run all tests and TypeScript check**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx vitest run 2>&1 | tail -20 && npx tsc --noEmit 2>&1 | head -20
```

Expected: all tests PASS, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && git add src/components/MoveList.tsx src/components/MoveRow.tsx && git commit -m "feat: displacement awareness — show track position and overflow warning per move row"
```

---

## Final Check

- [ ] **Run full test suite**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx vitest run 2>&1
```

Expected: all tests PASS.

- [ ] **TypeScript clean build**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Dev server smoke test**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npm run dev
```

Open in browser. Verify:
1. Add a move with S-Curve profile, set accelJerk=100 and accel=1000, vMax=500 → achievable orange indicators appear
2. Run the program → fluid animates, trendlines show full static trace immediately
3. Run completes → fluid settles and holds (not frozen on last frame)
4. Scrub the playhead back and forth → trendline trace stays static, only reference line moves
5. Water looks like water, not plasma
6. Oil selected → viscosity slider appears
7. Move row shows "at Xmm → Ymm remaining"; set displacement past axis end → red outline + orange overflow text
