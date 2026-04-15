# MoveMatter Revision Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 bugs discovered in real testing — input UX, S-curve overshoot, granular presets, fill% wiring, idle rendering, chart accumulation, play-from-idle, and scrubber replay.

**Architecture:** Replace the live real-time PBD sim loop with a two-phase pre-compute + replay model. `computeFrameBuffer()` runs the full program synchronously (deferred 50ms to let React paint "Computing...") and packs every frame into a single `Float32Array`. A lightweight rAF replay loop reads from that buffer by frame index. All other fixes are surgical changes to their respective files.

**Tech Stack:** Vite + React 18 + TypeScript + Zustand 5 + PixiJS v8 + Vitest + Playwright

---

## File Map

| File | Change |
|---|---|
| `src/components/MoveRow.tsx` | Local string state for inputs; blur-only commit; no min on displacement |
| `src/components/ContainerConfigPanel.tsx` | Call `reinitParticles()` on fill% change while idle |
| `src/store/simSlice.ts` | Add `reinitParticles` action |
| `src/types/index.ts` | Add `'computing'` to `PlaybackStatus`; add `hasBuffer` to `PlaybackState` |
| `src/store/playbackSlice.ts` | Wire `hasBuffer` into state/actions |
| `src/sim/materialPresets.ts` | Lower restitution + radius for dry-powder and coarse-granular |
| `src/sim/motionInterpolator.ts` | S-curve triangle fallback via binary search |
| `src/__tests__/motionInterpolator.test.ts` | Tests: S-curve no-overshoot + negative displacement |
| `src/sim/simLoop.ts` | Full rewrite: `FrameBuffer`, `computeFrameBuffer`, `startReplayLoop`, `runSettlingPass` |
| `src/components/SimViewport.tsx` | Init on mount; read `frameBufferRef` during replay |
| `src/components/PlaybackBar.tsx` | Disable during computing; play from idle when buffer exists |
| `src/components/ProgramEditorPanel.tsx` | Call `computeFrameBuffer`; handle `computing` state |
| `e2e/basic-flow.spec.ts` | Update flow 1 for computing → playing state transition |

---

## Task 1: Fix MoveRow Input UX

**Files:**
- Modify: `src/components/MoveRow.tsx`

The current `NumInput` calls `updateStep` on every keystroke via `onChange`, using `parseFloat(e.target.value) || 0`. This rejects empty strings and negative intermediate states (e.g., typing "-" commits 0). Fix: local string state, commit only on blur.

- [ ] **Step 1: Replace `NumInput` with a locally-controlled version**

Replace the entire `NumInput` component and the `MoveRow` export in `src/components/MoveRow.tsx`:

```typescript
import { useState } from 'react'
import { useStore } from '../store'
import type { MoveStep } from '../types'

interface Props {
  step: MoveStep
  error?: string
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  rowDropProps?: React.HTMLAttributes<HTMLDivElement>
}

function NumInput({
  label, value, field, stepId, disabled,
}: {
  label: string; value: number; field: keyof MoveStep; stepId: string; disabled?: boolean
}) {
  const updateStep = useStore((s) => s.updateStep)
  const [localVal, setLocalVal] = useState<string>(String(value))

  // Sync local display when store value changes externally (e.g. file load)
  const displayVal = document.activeElement?.id === `${stepId}-${field}` ? localVal : String(value)

  function handleBlur() {
    const parsed = parseFloat(localVal)
    const committed = isNaN(parsed) ? 0 : parsed
    setLocalVal(String(committed))
    updateStep(stepId, { [field]: committed } as any)
  }

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 11 }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <input
        id={`${stepId}-${field}`}
        type="number"
        value={displayVal}
        disabled={disabled}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        style={{
          width: '100%', padding: '2px 4px', borderRadius: 3, fontSize: 12,
          border: '1px solid var(--color-border)', background: 'var(--color-bg)',
          color: disabled ? 'var(--color-text-muted)' : 'var(--color-text)',
        }}
      />
    </label>
  )
}

export function MoveRow({ step, error, dragHandleProps, rowDropProps }: Props) {
  const updateStep = useStore((s) => s.updateStep)
  const removeStep = useStore((s) => s.removeStep)
  const isScurve = step.profileType === 'scurve'
  const isConstant = step.profileType === 'constant'

  return (
    <div
      {...rowDropProps}
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${error && !error.startsWith('Warning') ? '#f87171' : 'var(--color-border)'}`,
        borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          {...dragHandleProps}
          style={{ cursor: 'grab', color: 'var(--color-text-muted)', fontSize: 14, userSelect: 'none' }}
        >
          ⠿
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
          MOVE
        </span>
        <select
          value={step.profileType}
          onChange={(e) =>
            updateStep(step.id, { profileType: e.target.value as MoveStep['profileType'] })
          }
          style={{
            fontSize: 11, padding: '1px 4px', borderRadius: 3,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        >
          <option value="trapezoidal">Trapezoidal</option>
          <option value="scurve">S-Curve</option>
          <option value="constant">Constant</option>
        </select>
        <button
          onClick={() => removeStep(step.id)}
          style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
          aria-label="Remove step"
        >
          ×
        </button>
      </div>

      {/* Field grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {/* Displacement: no min — allows negative for reverse moves */}
        <NumInput label="Displacement (mm)" value={step.displacement} field="displacement" stepId={step.id} />
        <NumInput label="Max Velocity (mm/s)" value={step.maxVelocity} field="maxVelocity" stepId={step.id} />
        {!isConstant && (
          <>
            <NumInput label="Acceleration (mm/s²)" value={step.acceleration} field="acceleration" stepId={step.id} />
            <NumInput label="Deceleration (mm/s²)" value={step.deceleration} field="deceleration" stepId={step.id} />
          </>
        )}
        {isScurve && (
          <>
            <NumInput label="Accel Jerk (mm/s³)" value={step.accelJerk} field="accelJerk" stepId={step.id} />
            <NumInput label="Decel Jerk (mm/s³)" value={step.decelJerk} field="decelJerk" stepId={step.id} />
          </>
        )}
        {!isScurve && (
          <>
            <NumInput label="Accel Jerk (mm/s³)" value={0} field="accelJerk" stepId={step.id} disabled />
            <NumInput label="Decel Jerk (mm/s³)" value={0} field="decelJerk" stepId={step.id} disabled />
          </>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 11, color: error.startsWith('Warning') ? '#d97706' : '#ef4444', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run unit tests to confirm no regressions**

```bash
cd /Users/nickcason/DevSpace/Work/MoveMatter && npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/MoveRow.tsx
git commit -m "fix: blur-only input validation in MoveRow; allow negative displacement"
```

---

## Task 2: Fix Fill% Wiring

**Files:**
- Modify: `src/store/simSlice.ts`
- Modify: `src/components/ContainerConfigPanel.tsx`

When fill% changes while sim is idle, particles must reinitialize. `SimViewport` already reads `particleStateRef` every tick — so after reinit, the running settling pass (added in Task 7) will pick up the new particle positions. For now (Tasks 1–6 are pre-Task 7), we just wire the reinit action; Task 7 will complete the visual update.

- [ ] **Step 1: Add `reinitParticles` to simSlice**

In `src/store/simSlice.ts`, add the action to the interface and implementation:

```typescript
import type { SimState, PlotBuffer, ContainerConfig, PBDParams } from '../types'
import { initParticles } from '../sim/pbdSolver'

const PLOT_WINDOW_MS = 30_000

export interface SimSlice {
  sim: SimState
  plotBuffer: PlotBuffer
  setSim: (sim: SimState) => void
  appendPlot: (timeMs: number, pos: number, vel: number, accel: number) => void
  resetSim: () => void
  reinitParticles: (container: ContainerConfig, params: PBDParams) => void
}

const emptySimState = (): SimState => ({
  particles: new Float32Array(0),
  containerPositionMm: 0,
  containerVelocityMms: 0,
  containerAccelMms2: 0,
})

const emptyPlotBuffer = (): PlotBuffer => ({
  times: [],
  positions: [],
  velocities: [],
  accels: [],
})

export const createSimSlice = (set: any): SimSlice => ({
  sim: emptySimState(),
  plotBuffer: emptyPlotBuffer(),
  setSim: (sim) => set({ sim }),
  appendPlot: (timeMs, pos, vel, accel) =>
    set((s: any) => {
      const cutoff = timeMs - PLOT_WINDOW_MS
      const buf = s.plotBuffer
      let start = 0
      while (start < buf.times.length && buf.times[start] < cutoff) start++
      return {
        plotBuffer: {
          times: [...buf.times.slice(start), timeMs],
          positions: [...buf.positions.slice(start), pos],
          velocities: [...buf.velocities.slice(start), vel],
          accels: [...buf.accels.slice(start), accel],
        },
      }
    }),
  resetSim: () => set({ sim: emptySimState(), plotBuffer: emptyPlotBuffer() }),
  reinitParticles: (container, params) =>
    set({ sim: { ...emptySimState(), particles: initParticles(container, params) } }),
})
```

- [ ] **Step 2: Call `reinitParticles` from ContainerConfigPanel when idle**

Replace `src/components/ContainerConfigPanel.tsx`:

```typescript
import { useStore } from '../store'

export function ContainerConfigPanel() {
  const container = useStore((s) => s.container)
  const setContainer = useStore((s) => s.setContainer)
  const status = useStore((s) => s.playback.status)
  const reinitParticles = useStore((s) => s.reinitParticles)
  const material = useStore((s) => s.material)

  function handleChange(key: keyof typeof container, raw: string) {
    const value = parseFloat(raw)
    if (isNaN(value)) return
    const next = { ...container, [key]: value }
    setContainer({ [key]: value })
    if (status === 'idle') {
      reinitParticles(next, material.params)
    }
  }

  function field(label: string, key: keyof typeof container, unit: string, min = 1) {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 11 }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{label} ({unit})</span>
        <input
          type="number"
          value={container[key]}
          min={min}
          max={key === 'fillPercent' ? 100 : undefined}
          onChange={(e) => handleChange(key, e.target.value)}
          style={{
            width: '100%', padding: '2px 4px', borderRadius: 3, fontSize: 12,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
      </label>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', margin: 0 }}>
        CONTAINER
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {field('Width', 'widthMm', 'mm')}
        {field('Height', 'heightMm', 'mm')}
        {field('Fill', 'fillPercent', '%', 0)}
        {field('Wall', 'wallThicknessMm', 'mm')}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/store/simSlice.ts src/components/ContainerConfigPanel.tsx
git commit -m "fix: reinit particles when fill% or container dims change at idle"
```

---

## Task 3: Write Failing S-Curve Tests

**Files:**
- Modify: `src/__tests__/motionInterpolator.test.ts`

The S-curve overshoots when `d_accel_side + d_decel_side > displacement` (e.g. a short 200mm move with parameters that need 350mm). Write tests that currently fail; Task 4 makes them pass.

- [ ] **Step 1: Add failing tests to the `buildSCurveProfile` describe block**

Append these tests inside `describe('buildSCurveProfile', ...)` in `src/__tests__/motionInterpolator.test.ts`:

```typescript
  it('does not overshoot displacement for a short move (triangle fallback)', () => {
    // 200mm move, but accel+decel sides each need 175mm → total 350mm > 200mm
    const p = buildSCurveProfile(200, 500, 1000, 1000, 5000, 5000)
    // Sample 200 points — no intermediate position should exceed displacement
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * p.durationS
      const s = p.eval(t)
      expect(s.pos).toBeLessThanOrEqual(200 + 0.5)
      expect(s.pos).toBeGreaterThanOrEqual(-0.5)
    }
  })

  it('ends at displacement for a short move (triangle fallback)', () => {
    const p = buildSCurveProfile(50, 500, 1000, 1000, 5000, 5000)
    approx(p.eval(p.durationS).pos, 50, 0.5)
    approx(p.eval(p.durationS).vel, 0, 5)
  })

  it('ends at displacement for a long move (const-vel phase present)', () => {
    // 1000mm — long enough for a const-vel plateau
    const p = buildSCurveProfile(1000, 500, 1000, 1000, 5000, 5000)
    approx(p.eval(p.durationS).pos, 1000, 0.5)
  })

  it('handles negative displacement without overshoot', () => {
    const p = buildSCurveProfile(-200, 500, 1000, 1000, 5000, 5000)
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * p.durationS
      const s = p.eval(t)
      expect(s.pos).toBeGreaterThanOrEqual(-200 - 0.5)
      expect(s.pos).toBeLessThanOrEqual(0.5)
    }
    approx(p.eval(p.durationS).pos, -200, 0.5)
  })
```

- [ ] **Step 2: Run tests and confirm the new ones fail**

```bash
npm test -- --run src/__tests__/motionInterpolator.test.ts
```

Expected: 3–4 new tests FAIL (overshoot detected or position assertion fails). Existing tests still pass.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/__tests__/motionInterpolator.test.ts
git commit -m "test: add failing S-curve overshoot and triangle fallback tests"
```

---

## Task 4: Fix S-Curve Triangle Fallback

**Files:**
- Modify: `src/sim/motionInterpolator.ts`

The fix: extract a helper `computeScurvePhases` that computes all phase durations and distances for a given peak velocity. If the phases overshoot `dAbs`, binary-search for a reduced `vPeak`.

- [ ] **Step 1: Replace `buildSCurveProfile` in `src/sim/motionInterpolator.ts`**

Replace everything from `// ─── S-curve profile ──` through the end of `buildSCurveProfile`:

```typescript
// ─── S-curve profile ──────────────────────────────────────────────────────────
// 7-phase jerk-limited profile.
// Phases: [jerk-up | const-accel | jerk-down] [const-vel] [jerk-up | const-decel | jerk-down]
// Falls back to a reduced peak velocity (triangle fallback) when the full accel+decel
// sides would overshoot the target displacement — analogous to trapezoidal's triangle fallback.

interface SCurveSegment {
  startT: number
  startPos: number
  startVel: number
  startAccel: number
  jerk: number
  duration: number
}

function evalSegment(seg: SCurveSegment, t: number): MotionSample {
  const dt = t - seg.startT
  const accel = seg.startAccel + seg.jerk * dt
  const vel = seg.startVel + seg.startAccel * dt + 0.5 * seg.jerk * dt * dt
  const pos = seg.startPos + seg.startVel * dt + 0.5 * seg.startAccel * dt * dt + (1 / 6) * seg.jerk * dt * dt * dt
  return { pos, vel, accel }
}

interface SCurvePhases {
  t_j1: number; t_ca: number; vAfterAccel: number
  t_j2: number; t_cd: number
  d_accel: number; d_decel: number
  // Intermediate values needed for segment construction
  p1: number; p2: number; v2: number
  pD1: number; pD2: number; vJ2: number; v_after_cd: number
}

/** Compute S-curve phase variables for a given peak velocity target. */
function computeScurvePhases(
  vPeak: number,
  acceleration: number,
  deceleration: number,
  accelJerk: number,
  decelJerk: number,
): SCurvePhases {
  // Accel side
  const t_j1 = acceleration / accelJerk
  const t_ca = Math.max(0, vPeak / acceleration - t_j1)
  const vAfterAccel = acceleration * (t_j1 + t_ca)

  const vJ1 = 0.5 * accelJerk * t_j1 * t_j1
  const p1 = accelJerk * Math.pow(t_j1, 3) / 6
  const v2 = vJ1 + acceleration * t_ca
  const p2 = p1 + vJ1 * t_ca + 0.5 * acceleration * t_ca * t_ca
  const d_accel = p2 + v2 * t_j1 + 0.5 * acceleration * t_j1 * t_j1 - accelJerk * Math.pow(t_j1, 3) / 6

  // Decel side (distance computed as mirror of accel — same math as existing code)
  const t_j2 = deceleration / decelJerk
  const t_cd = Math.max(0, vAfterAccel / deceleration - t_j2)
  const vJ2 = 0.5 * decelJerk * t_j2 * t_j2
  const pD1 = decelJerk * Math.pow(t_j2, 3) / 6
  const v_after_cd = vJ2 + deceleration * t_cd
  const pD2 = pD1 + vJ2 * t_cd + 0.5 * deceleration * t_cd * t_cd
  const d_decel = pD2 + v_after_cd * t_j2 + 0.5 * deceleration * t_j2 * t_j2 - decelJerk * Math.pow(t_j2, 3) / 6

  return { t_j1, t_ca, vAfterAccel, t_j2, t_cd, d_accel, d_decel, p1, p2, v2, pD1, pD2, vJ2, v_after_cd }
}

export function buildSCurveProfile(
  displacement: number,
  maxVelocity: number,
  acceleration: number,
  deceleration: number,
  accelJerk: number,
  decelJerk: number,
): MoveProfile {
  const sign = displacement >= 0 ? 1 : -1
  const dAbs = Math.abs(displacement)

  let phases = computeScurvePhases(maxVelocity, acceleration, deceleration, accelJerk, decelJerk)

  // Triangle fallback: if accel+decel sides exceed displacement, binary-search for vPeak
  if (phases.d_accel + phases.d_decel > dAbs) {
    let lo = 0
    let hi = maxVelocity
    for (let i = 0; i < 64; i++) {
      const mid = (lo + hi) / 2
      const ph = computeScurvePhases(mid, acceleration, deceleration, accelJerk, decelJerk)
      if (ph.d_accel + ph.d_decel <= dAbs) lo = mid; else hi = mid
    }
    phases = computeScurvePhases((lo + hi) / 2, acceleration, deceleration, accelJerk, decelJerk)
  }

  const { t_j1, t_ca, vAfterAccel, t_j2, t_cd, d_accel, d_decel, p1, p2, v2, pD1, pD2, vJ2, v_after_cd } = phases

  const d_const = Math.max(0, dAbs - d_accel - d_decel)
  const t_cv = d_const > 0 ? d_const / vAfterAccel : 0

  // Build segment list (all in unsigned coordinates)
  const segs: SCurveSegment[] = []
  let tCursor = 0
  let pCursor = 0
  let vCursor = 0
  let aCursor = 0

  function addSeg(jerk: number, dur: number) {
    if (dur <= 0) return
    segs.push({ startT: tCursor, startPos: pCursor, startVel: vCursor, startAccel: aCursor, jerk, duration: dur })
    const end = evalSegment(segs[segs.length - 1], tCursor + dur)
    tCursor += dur
    pCursor = end.pos
    vCursor = end.vel
    aCursor = end.accel
  }

  addSeg(+accelJerk, t_j1)   // Ph1: jerk up
  addSeg(0, t_ca)             // Ph2: const accel
  addSeg(-accelJerk, t_j1)   // Ph3: jerk down
  addSeg(0, t_cv)             // Ph4: const vel
  addSeg(-decelJerk, t_j2)   // Ph5: jerk up (decel starts)
  addSeg(0, t_cd)             // Ph6: const decel
  addSeg(+decelJerk, t_j2)   // Ph7: jerk down (back to 0 accel)

  const durationS = tCursor

  function eval_(t: number): MotionSample {
    if (t <= 0) return { pos: 0, vel: 0, accel: 0 }
    if (t >= durationS) return { pos: sign * dAbs, vel: 0, accel: 0 }

    let seg = segs[0]
    for (const s of segs) {
      if (t >= s.startT) seg = s
      else break
    }
    const raw = evalSegment(seg, t)
    return { pos: sign * raw.pos, vel: sign * raw.vel, accel: sign * raw.accel }
  }

  return { durationS, eval: eval_ }
}
```

- [ ] **Step 2: Run the S-curve tests**

```bash
npm test -- --run src/__tests__/motionInterpolator.test.ts
```

Expected: ALL tests pass including the 4 new ones.

- [ ] **Step 3: Run full test suite**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/sim/motionInterpolator.ts src/__tests__/motionInterpolator.test.ts
git commit -m "fix: S-curve triangle fallback — binary-search for vPeak when displacement too short"
```

---

## Task 5: Tune Granular Material Presets

**Files:**
- Modify: `src/sim/materialPresets.ts`

Both granular presets have `restitution` too high (bouncy) and `particleRadius` too large (coarse). Target: lower restitution to ~0.05, reduce radius and adjust density to compensate.

- [ ] **Step 1: Update `dry-powder` and `coarse-granular` in `src/sim/materialPresets.ts`**

```typescript
import type { PBDParams } from '../types'

export const MATERIAL_PRESETS: Record<string, PBDParams> = {
  water: {
    restDensity: 0.022,
    pressureStiffness: 200000,
    viscosity: 0.01,
    restitution: 0.05,
    friction: 0.02,
    particleRadius: 3,
  },
  oil: {
    restDensity: 0.022,
    pressureStiffness: 150000,
    viscosity: 0.12,
    restitution: 0.03,
    friction: 0.05,
    particleRadius: 3,
  },
  'dry-powder': {
    restDensity: 0.028,        // higher density — smaller particles pack tighter
    pressureStiffness: 60000,
    viscosity: 0.35,
    restitution: 0.04,         // was 0.15 — nearly inelastic
    friction: 0.55,
    particleRadius: 2,         // was 3.5 — finer grain
  },
  'coarse-granular': {
    restDensity: 0.014,
    pressureStiffness: 30000,
    viscosity: 0.45,
    restitution: 0.08,         // was 0.3 — much less bouncy
    friction: 0.70,
    particleRadius: 3.5,       // was 5 — smaller, more particles
  },
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --run
```

Expected: all tests pass (material preset tests verify structure, not visual behavior).

- [ ] **Step 3: Commit**

```bash
git add src/sim/materialPresets.ts
git commit -m "fix: tune dry-powder and coarse-granular presets — lower restitution, smaller radius"
```

---

## Task 6: Extend Types and PlaybackSlice

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/playbackSlice.ts`

Add `'computing'` to `PlaybackStatus` and `hasBuffer: boolean` to `PlaybackState`. These are read by `PlaybackBar` and `SimViewport` in later tasks.

- [ ] **Step 1: Update `src/types/index.ts`**

Replace the runtime-only section (lines 62–95) with:

```typescript
// ─── Runtime-only (Zustand, never persisted) ─────────────────────────────────

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'computing'

export interface PlaybackState {
  status: PlaybackStatus
  currentTimeMs: number
  totalDurationMs: number
  speedMultiplier: 0.25 | 0.5 | 1 | 2 | 4
  loop: boolean
  hasBuffer: boolean    // true when a FrameBuffer exists and replay is available
}

export interface SimState {
  particles: Float32Array
  containerPositionMm: number
  containerVelocityMms: number
  containerAccelMms2: number
}

export interface PlotBuffer {
  times: number[]
  positions: number[]
  velocities: number[]
  accels: number[]
}

export type Theme = 'light' | 'dark'

export interface UIState {
  theme: Theme
  presentationMode: boolean
  activeStepId: string | null
}

export interface MotionSample {
  pos: number
  vel: number
  accel: number
}
```

- [ ] **Step 2: Update `src/store/playbackSlice.ts`**

```typescript
import type { PlaybackState } from '../types'

export interface PlaybackSlice {
  playback: PlaybackState
  play: () => void
  pause: () => void
  stop: () => void
  seek: (ms: number) => void
  setSpeed: (multiplier: 0.25 | 0.5 | 1 | 2 | 4) => void
  toggleLoop: () => void
  setTotalDuration: (ms: number) => void
}

const defaultPlayback = (): PlaybackState => ({
  status: 'idle',
  currentTimeMs: 0,
  totalDurationMs: 0,
  speedMultiplier: 1,
  loop: false,
  hasBuffer: false,
})

export const createPlaybackSlice = (set: any): PlaybackSlice => ({
  playback: defaultPlayback(),
  play: () =>
    set((s: any) => ({
      playback: { ...s.playback, status: 'playing' },
    })),
  pause: () =>
    set((s: any) => ({ playback: { ...s.playback, status: 'paused' } })),
  stop: () =>
    set((s: any) => ({
      playback: { ...s.playback, status: 'idle', currentTimeMs: 0 },
    })),
  seek: (ms) =>
    set((s: any) => ({ playback: { ...s.playback, currentTimeMs: ms } })),
  setSpeed: (multiplier) =>
    set((s: any) => ({ playback: { ...s.playback, speedMultiplier: multiplier } })),
  toggleLoop: () =>
    set((s: any) => ({ playback: { ...s.playback, loop: !s.playback.loop } })),
  setTotalDuration: (ms) =>
    set((s: any) => ({ playback: { ...s.playback, totalDurationMs: ms } })),
})
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run
```

Expected: all tests pass (TypeScript may show errors in components that read `playback.status` — those are fixed in Tasks 8–9).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/store/playbackSlice.ts
git commit -m "feat: add computing status and hasBuffer to PlaybackState"
```

---

## Task 7: Rewrite simLoop

**Files:**
- Modify: `src/sim/simLoop.ts`

Full rewrite. Exports:
- `particleStateRef` — unchanged, still the renderer's read interface
- `FrameBuffer` interface — packed Float32Array for all particle snapshots
- `frameBufferRef` — module-level ref readable by SimViewport
- `computeFrameBuffer(store)` — async, sets computing, runs uncapped loop, sets hasBuffer, starts replay
- `startReplayLoop(store)` — rAF loop reading from frameBufferRef
- `pauseReplayLoop()` — cancels rAF
- `stopReplayLoop(store)` — cancels rAF, resets to idle
- `runSettlingPass(store)` — 120 ticks gravity-only, updates particleStateRef for idle render

Remove: `startSimLoop`, `resumeSimLoop` (replaced by compute+replay).

- [ ] **Step 1: Replace `src/sim/simLoop.ts` entirely**

```typescript
import { buildProgram } from './motionInterpolator'
import { initParticles, pbdStep, STRIDE } from './pbdSolver'
import type { AppStore } from '../store'
import type { StoreApi } from 'zustand'
import type { MaterialConfig, ContainerConfig } from '../types'

// ─── Renderer interface (read by SimViewport ticker every frame) ──────────────

export const particleStateRef: {
  particles: Float32Array
  containerPositionMm: number
  material: MaterialConfig | null
  container: ContainerConfig | null
} = {
  particles: new Float32Array(0),
  containerPositionMm: 0,
  material: null,
  container: null,
}

// ─── Frame buffer (written by computeFrameBuffer, read by startReplayLoop) ───

export interface FrameBuffer {
  /** All frames packed: frame i starts at offset i * particleCount * STRIDE */
  packedParticles: Float32Array
  particleCount: number
  containerPositions: Float32Array   // mm per frame
  containerVelocities: Float32Array  // mm/s per frame
  containerAccels: Float32Array      // mm/s² per frame
  frameCount: number
  totalDurationMs: number
}

export const frameBufferRef: { current: FrameBuffer | null } = { current: null }

// ─── Module state ─────────────────────────────────────────────────────────────

let rafId: number | null = null
let lastTimestamp: number | null = null
let plotFrameCounter = 0
const PLOT_SAMPLE_EVERY = 6   // ~10fps plot updates at 60fps replay

// Cached compiled program — set in computeFrameBuffer, used in highlightActiveStep
let cachedCompiledProgram: ReturnType<typeof buildProgram> | null = null

// ─── Settling pass (idle render) ─────────────────────────────────────────────

const SETTLING_TICKS = 120
const SETTLE_DT = 1 / 60

/**
 * Runs 120 PBD ticks (gravity only, no container motion) on freshly-initialized
 * particles. Updates particleStateRef so SimViewport shows a settled rest state.
 * Called on mount and whenever container config changes at idle.
 */
export function runSettlingPass(store: StoreApi<AppStore>): void {
  const { container, material } = store.getState()
  let particles = initParticles(container, material.params)
  for (let i = 0; i < SETTLING_TICKS; i++) {
    particles = pbdStep({ particles, container, params: material.params, dt: SETTLE_DT, containerAccelX: 0 })
  }
  particleStateRef.particles = particles
  particleStateRef.containerPositionMm = 0
  particleStateRef.material = material
  particleStateRef.container = container
}

// ─── Compute phase ────────────────────────────────────────────────────────────

/**
 * Compiles the motion program, runs the full sim synchronously, and stores
 * every frame in frameBufferRef. Sets status='computing' before the run (with
 * a 50ms defer so React can paint the indicator), then status='playing' after.
 * Automatically starts the replay loop when done.
 */
export async function computeFrameBuffer(store: StoreApi<AppStore>): Promise<void> {
  const state = store.getState()

  // Clear any previous buffer and reset plot
  frameBufferRef.current = null
  store.setState((s) => ({
    playback: { ...s.playback, status: 'computing', hasBuffer: false, currentTimeMs: 0 },
  }))
  store.getState().resetSim()

  // Let React paint the "Computing..." state before we block the thread
  await new Promise<void>((resolve) => setTimeout(resolve, 50))

  const compiled = buildProgram(state.program)
  cachedCompiledProgram = compiled
  const totalDurationMs = compiled.totalDurationS * 1000
  const DT = 1 / 60
  const frameCount = Math.max(1, Math.ceil(totalDurationMs / (DT * 1000)))

  let particles = initParticles(state.container, state.material.params)
  const particleCount = particles.length / STRIDE

  // Allocate packed buffer: all frames × all particle components
  const packedParticles = new Float32Array(frameCount * particleCount * STRIDE)
  const containerPositions = new Float32Array(frameCount)
  const containerVelocities = new Float32Array(frameCount)
  const containerAccels = new Float32Array(frameCount)

  for (let i = 0; i < frameCount; i++) {
    const timeS = i * DT
    const { pos, vel, accel } = compiled.eval(timeS)

    particles = pbdStep({
      particles,
      container: state.container,
      params: state.material.params,
      dt: DT,
      containerAccelX: accel,
    })

    packedParticles.set(particles, i * particleCount * STRIDE)
    containerPositions[i] = pos
    containerVelocities[i] = vel
    containerAccels[i] = accel
  }

  frameBufferRef.current = {
    packedParticles,
    particleCount,
    containerPositions,
    containerVelocities,
    containerAccels,
    frameCount,
    totalDurationMs,
  }

  store.setState((s) => ({
    playback: {
      ...s.playback,
      status: 'playing',
      hasBuffer: true,
      totalDurationMs,
      currentTimeMs: 0,
    },
  }))

  // Update particleStateRef to frame 0
  particleStateRef.particles = packedParticles.subarray(0, particleCount * STRIDE)
  particleStateRef.containerPositionMm = 0
  particleStateRef.material = state.material
  particleStateRef.container = state.container

  startReplayLoop(store)
}

// ─── Replay loop ──────────────────────────────────────────────────────────────

export function startReplayLoop(store: StoreApi<AppStore>): void {
  if (rafId !== null) return
  lastTimestamp = null
  plotFrameCounter = 0

  function tick(timestamp: number): void {
    const s = store.getState()
    if (s.playback.status !== 'playing') {
      rafId = null
      lastTimestamp = null
      return
    }
    if (lastTimestamp === null) {
      lastTimestamp = timestamp
      rafId = requestAnimationFrame(tick)
      return
    }

    const buf = frameBufferRef.current
    if (!buf) { rafId = null; return }

    const wallDtMs = Math.min(timestamp - lastTimestamp, 50)
    lastTimestamp = timestamp

    let nextTimeMs = s.playback.currentTimeMs + wallDtMs * s.playback.speedMultiplier

    if (nextTimeMs >= buf.totalDurationMs) {
      if (s.playback.loop) {
        nextTimeMs = 0
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
    }

    const frameIdx = Math.min(
      Math.floor(nextTimeMs / (buf.totalDurationMs / buf.frameCount)),
      buf.frameCount - 1,
    )

    _writeFrame(buf, frameIdx, store)

    store.setState((p) => ({
      playback: { ...p.playback, currentTimeMs: nextTimeMs },
    }))

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

    highlightActiveStep(store, nextTimeMs)
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
}

export function pauseReplayLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  lastTimestamp = null
}

export function stopReplayLoop(store: StoreApi<AppStore>): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  lastTimestamp = null
  plotFrameCounter = 0
  store.setState((s) => ({
    playback: { ...s.playback, status: 'idle', currentTimeMs: 0 },
  }))
  store.getState().setActiveStepId(null)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _writeFrame(buf: FrameBuffer, frameIdx: number, store: StoreApi<AppStore>): void {
  const offset = frameIdx * buf.particleCount * STRIDE
  particleStateRef.particles = buf.packedParticles.subarray(offset, offset + buf.particleCount * STRIDE)
  particleStateRef.containerPositionMm = buf.containerPositions[frameIdx]
  const s = store.getState()
  particleStateRef.material = s.material
  particleStateRef.container = s.container
}

function highlightActiveStep(store: StoreApi<AppStore>, currentTimeMs: number): void {
  if (!cachedCompiledProgram) return
  const { program } = store.getState()
  let elapsed = 0
  for (const step of program.steps) {
    const segment = cachedCompiledProgram.segments.find((seg) => seg.stepId === step.id)
    const dur = segment != null ? segment.durationS * 1000 : 0
    if (currentTimeMs <= elapsed + dur) {
      store.getState().setActiveStepId(step.id)
      return
    }
    elapsed += dur
  }
  store.getState().setActiveStepId(null)
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --run
```

Expected: all tests pass. (SimViewport and PlaybackBar will have TypeScript import errors until Tasks 8–9 remove the old imports.)

- [ ] **Step 3: Commit**

```bash
git add src/sim/simLoop.ts
git commit -m "feat: replace live sim loop with pre-compute FrameBuffer + replay model"
```

---

## Task 8: Update SimViewport

**Files:**
- Modify: `src/components/SimViewport.tsx`

Two changes:
1. Remove the dependency on `startSimLoop` being called before init — the PixiJS scene initializes on mount.
2. On mount, call `runSettlingPass` to show settled particles at idle.
3. `particleStateRef` is still the ticker's read interface — no change there (the replay loop now writes to it).

- [ ] **Step 1: Replace `src/components/SimViewport.tsx`**

```typescript
import { useEffect, useRef } from 'react'
import { Application, Graphics, BlurFilter, ColorMatrixFilter } from 'pixi.js'
import { useStore } from '../store'
import { particleStateRef, runSettlingPass } from '../sim/simLoop'
import { drawTrack, drawContainer, drawParticles, mmToPxScale } from '../sim/renderer'

export function SimViewport() {
  const mountRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)

  const theme = useStore((s) => s.ui.theme)

  useEffect(() => {
    if (!mountRef.current) return
    let mounted = true
    let app: Application | null = null
    let blurFilter: BlurFilter | null = null
    let thresholdFilter: ColorMatrixFilter | null = null

    async function init() {
      const state = useStore.getState()
      app = new Application()
      await app.init({
        resizeTo: mountRef.current!,
        background: state.ui.theme === 'dark' ? 0x0f172a : 0xf8fafc,
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
      })
      if (!mounted) {
        try { app.destroy(true) } catch { /* ignore */ }
        return
      }

      mountRef.current!.appendChild(app.canvas)

      const trackG = new Graphics()
      const containerG = new Graphics()
      const particleG = new Graphics()
      app.stage.addChild(trackG, containerG, particleG)

      blurFilter = new BlurFilter({ strength: 5, quality: 2 })
      thresholdFilter = new ColorMatrixFilter()
      thresholdFilter.matrix = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 6, -2,
      ]

      let prevMaterialPreset: string | null = null

      app.ticker.add(() => {
        if (!app) return
        const { width, height } = app.screen
        const { containerPositionMm, particles, material, container } = particleStateRef

        if (!container || !material) return

        const state = useStore.getState()
        const axisLength = state.program.axisLength
        const scale = mmToPxScale(width, axisLength)
        const trackY = height * 0.45
        const isDark = state.ui.theme === 'dark'
        const trackColor = isDark ? 0x475569 : 0xcbd5e1

        drawTrack(trackG, axisLength, scale, trackY, trackColor)
        drawContainer(containerG, containerPositionMm, container, scale, trackY, isDark)

        const isLiquid = material.preset === 'water' || material.preset === 'oil'
        if (material.preset !== prevMaterialPreset) {
          particleG.filters = isLiquid ? [blurFilter!, thresholdFilter!] : []
          prevMaterialPreset = material.preset
        }

        drawParticles(particleG, particles, containerPositionMm, container, material, scale, trackY)
      })

      appRef.current = app

      // Show settled rest state immediately on mount
      runSettlingPass(useStore as any)
    }

    init()

    return () => {
      mounted = false
      if (appRef.current) {
        try { blurFilter?.destroy() } catch { /* ignore */ }
        try { thresholdFilter?.destroy() } catch { /* ignore */ }
        try { appRef.current.destroy(true) } catch { /* ignore */ }
        appRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — intentional: init once

  useEffect(() => {
    const app = appRef.current
    if (!app) return
    app.renderer.background.color = theme === 'dark' ? 0x0f172a : 0xf8fafc
  }, [theme])

  return (
    <div
      ref={mountRef}
      className="w-full h-full"
      style={{ background: theme === 'dark' ? '#0f172a' : '#f8fafc' }}
    />
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/SimViewport.tsx
git commit -m "fix: init SimViewport on mount with settling pass — track visible at idle"
```

---

## Task 9: Update PlaybackBar and ProgramEditorPanel

**Files:**
- Modify: `src/components/PlaybackBar.tsx`
- Modify: `src/components/ProgramEditorPanel.tsx`

`PlaybackBar`: disable all controls during `computing`; enable Play when `hasBuffer=true` and not computing.
`ProgramEditorPanel`: call `computeFrameBuffer` (not `startSimLoop`); handle `computing` status; re-run settling pass when container/material config changes at idle (via `reinitParticles` + `runSettlingPass`).

- [ ] **Step 1: Replace `src/components/PlaybackBar.tsx`**

```typescript
import { useStore } from '../store'
import { stopReplayLoop, pauseReplayLoop, startReplayLoop } from '../sim/simLoop'

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4]

export function PlaybackBar() {
  const { status, currentTimeMs, totalDurationMs, speedMultiplier, loop, hasBuffer } = useStore(
    (s) => s.playback
  )
  const pause = useStore((s) => s.pause)
  const seek = useStore((s) => s.seek)
  const setSpeed = useStore((s) => s.setSpeed)
  const toggleLoop = useStore((s) => s.toggleLoop)

  const isPlaying = status === 'playing'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'
  const isComputing = status === 'computing'

  // Controls disabled during computing
  const disabled = isComputing

  function handlePlayPause() {
    if (disabled) return
    if (isPlaying) {
      pauseReplayLoop()
      pause()
    } else if (isPaused) {
      // Resume from current position
      useStore.setState((s) => ({ playback: { ...s.playback, status: 'playing' } }))
      startReplayLoop(useStore as any)
    } else if (isIdle && hasBuffer) {
      // Replay from current scrub position (defaults to 0 after stop)
      useStore.setState((s) => ({ playback: { ...s.playback, status: 'playing' } }))
      startReplayLoop(useStore as any)
    }
  }

  function handleStop() {
    if (disabled) return
    stopReplayLoop(useStore as any)
  }

  function handleSeek(ms: number) {
    if (disabled) return
    seek(ms)
  }

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000)
    const frac = Math.floor((ms % 1000) / 10)
    return `${s}.${frac.toString().padStart(2, '0')}s`
  }

  const playEnabled = !disabled && (isPlaying || isPaused || (isIdle && hasBuffer))

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
        height: '100%', borderTop: '1px solid var(--color-border)',
      }}
    >
      {/* Computing indicator */}
      {isComputing && (
        <span style={{ fontSize: 11, color: 'var(--color-accent)', fontStyle: 'italic' }}>
          Computing…
        </span>
      )}

      {/* Transport buttons */}
      <button
        onClick={handlePlayPause}
        disabled={!playEnabled}
        style={{
          background: 'none', border: 'none',
          cursor: playEnabled ? 'pointer' : 'default',
          fontSize: 18,
          color: playEnabled ? 'var(--color-accent)' : 'var(--color-border)',
          padding: '0 4px',
        }}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <button
        onClick={handleStop}
        disabled={disabled || isIdle}
        style={{
          background: 'none', border: 'none',
          cursor: (!disabled && !isIdle) ? 'pointer' : 'default',
          fontSize: 16,
          color: (!disabled && !isIdle) ? 'var(--color-text-muted)' : 'var(--color-border)',
          padding: '0 4px',
        }}
        aria-label="Stop"
      >
        ⏹
      </button>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={Math.max(totalDurationMs, 1)}
        value={currentTimeMs}
        disabled={disabled}
        onChange={(e) => handleSeek(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--color-accent)' }}
        aria-label="Timeline scrubber"
      />

      {/* Time display */}
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 70, textAlign: 'right' }}>
        {formatTime(currentTimeMs)} / {formatTime(totalDurationMs)}
      </span>

      {/* Speed selector */}
      <select
        value={speedMultiplier}
        disabled={disabled}
        onChange={(e) => setSpeed(parseFloat(e.target.value) as 0.25 | 0.5 | 1 | 2 | 4)}
        style={{
          fontSize: 11, padding: '2px 4px', borderRadius: 4,
          border: '1px solid var(--color-border)', background: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
        aria-label="Playback speed"
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}×</option>
        ))}
      </select>

      {/* Loop toggle */}
      <button
        onClick={toggleLoop}
        disabled={disabled}
        style={{
          background: loop ? 'var(--color-accent)' : 'var(--color-surface)',
          color: loop ? '#fff' : 'var(--color-text-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 4, padding: '2px 8px', fontSize: 11,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        aria-label="Toggle loop"
      >
        ⟳ Loop
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Replace `src/components/ProgramEditorPanel.tsx`**

```typescript
import { useStore } from '../store'
import { computeFrameBuffer, stopReplayLoop, runSettlingPass } from '../sim/simLoop'
import { validateProgram } from '../utils/validation'
import { MoveList } from './MoveList'
import { ContainerConfigPanel } from './ContainerConfigPanel'
import { MaterialSelector } from './MaterialSelector'

export function ProgramEditorPanel() {
  const program = useStore((s) => s.program)
  const status = useStore((s) => s.playback.status)

  const validation = validateProgram(program)
  const isPlaying = status === 'playing'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'
  const isComputing = status === 'computing'

  async function handleRun() {
    if (isComputing) return
    if (isPlaying || isPaused) {
      stopReplayLoop(useStore as any)
      // Re-run settling pass to show rest state after stop
      runSettlingPass(useStore as any)
    } else {
      if (validation.hasBlockingError) return
      await computeFrameBuffer(useStore as any)
    }
  }

  const runLabel = (isPlaying || isPaused) ? 'Stop' : isComputing ? 'Computing…' : 'Run'
  const runDisabled = isComputing || (isIdle && validation.hasBlockingError)

  return (
    <div className="flex flex-col h-full overflow-y-auto gap-3">
      {/* Over-travel warning */}
      {validation.overTravelWarning && (
        <div
          className="text-xs px-2 py-1.5 rounded"
          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
        >
          {validation.overTravelWarning}
        </div>
      )}

      {/* Axis length input */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Axis length (mm)</span>
        <input
          type="number"
          value={program.axisLength}
          min={1}
          onChange={(e) => {
            const current = useStore.getState().program
            useStore.getState().setProgram({ ...current, axisLength: parseFloat(e.target.value) || 600 })
          }}
          style={{
            width: 80, padding: '2px 4px', borderRadius: 3, fontSize: 12,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
      </label>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={runDisabled}
        style={{
          background: (isPlaying || isPaused) ? '#ef4444' : runDisabled ? 'var(--color-border)' : 'var(--color-accent)',
          color: runDisabled ? 'var(--color-text-muted)' : '#fff',
          borderRadius: 6,
          padding: '6px 16px',
          fontWeight: 600,
          fontSize: 14,
          cursor: runDisabled ? 'not-allowed' : 'pointer',
          border: 'none',
        }}
      >
        {runLabel}
      </button>

      {/* Move list */}
      <MoveList stepErrors={validation.stepErrors} />

      {/* Add buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => useStore.getState().addMove()}
          style={{
            flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 4,
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text)', cursor: 'pointer',
          }}
        >
          + Add Move
        </button>
        <button
          onClick={() => useStore.getState().addDelay()}
          style={{
            flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 4,
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text)', cursor: 'pointer',
          }}
        >
          + Add Delay
        </button>
      </div>

      <hr style={{ borderColor: 'var(--color-border)' }} />
      <ContainerConfigPanel />
      <MaterialSelector />
    </div>
  )
}
```

- [ ] **Step 3: Run full test suite**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Build to catch any remaining TypeScript errors**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/PlaybackBar.tsx src/components/ProgramEditorPanel.tsx
git commit -m "fix: wire PlaybackBar and ProgramEditorPanel to pre-compute model"
```

---

## Task 10: Update E2E Tests

**Files:**
- Modify: `e2e/basic-flow.spec.ts`

Two changes needed after reading the current tests:

1. **"Run button starts playback" test** (line 31–40): clicks Run and waits up to 3000ms for "Stop" text. After the rewrite, Run goes through a COMPUTING phase (~50ms delay + sync compute). For a default single-move program this is well under 3000ms — the timeout is fine. BUT the test must also tolerate the intermediate "Computing…" state. The `page.getByText('Stop', { exact: true })` assertion already polls — no change needed.

2. **Validation test "Run is disabled when maxVelocity is 0"** (line 85–95): uses `page.getByLabel('Max Velocity (mm/s)')` then blurs. Task 1's new `NumInput` adds an `id` attribute (`${stepId}-${field}`) so the input is accessible by label. The label element wraps the input, so `getByLabel` still works. No change needed.

The existing tests pass without modification if the compute phase for a default program (1 move, default params) completes in under 3000ms, which it will.

- [ ] **Step 1: Run the E2E suite against the updated app**

```bash
npm run test:e2e
```

Expected: all 11 tests pass.

- [ ] **Step 2: If the "Run button starts playback" test times out, increase its timeout**

Only if the test fails with a timeout — replace the assertion in `e2e/basic-flow.spec.ts`:

```typescript
// Before:
await expect(page.getByText('Stop', { exact: true })).toBeVisible({ timeout: 3000 })

// After (only if needed):
await expect(page.getByText('Stop', { exact: true })).toBeVisible({ timeout: 8000 })
```

- [ ] **Step 3: Commit (only if Step 2 was needed)**

```bash
git add e2e/basic-flow.spec.ts
git commit -m "test: increase Run → Stop timeout to account for compute phase"
```

---

## Completion Checklist

After all tasks, verify:

- [ ] `npm test -- --run` → all unit tests pass
- [ ] `npm run build` → clean build
- [ ] `npm run test:e2e` → all E2E tests pass
- [ ] Manual smoke: open `npm run dev`, add a move, hit Run → "Computing…" briefly, then particles animate
- [ ] Manual smoke: scrub timeline → particles and container seek to correct position
- [ ] Manual smoke: stop → particles return to rest state; Play from idle replays
- [ ] Manual smoke: S-curve short move → container stops at target, does not overshoot
- [ ] Manual smoke: negative displacement → container moves left
- [ ] Manual smoke: change fill % → particles reinit visually in viewport
- [ ] Manual smoke: dry-powder + coarse-granular → look fine-grained and low-bounce
