import type { MotionSample, MotionProgram } from '../types'

export interface MoveProfile {
  durationS: number
  eval: (t: number) => MotionSample
}

// ─── Trapezoidal profile ──────────────────────────────────────────────────────
// Accel ramp → optional constant-velocity plateau → decel ramp.
// Falls back to triangle profile when displacement is too short to reach vmax.

export function buildTrapezoidalProfile(
  displacement: number,
  maxVelocity: number,
  acceleration: number,
  deceleration: number,
): MoveProfile {
  const sign = displacement >= 0 ? 1 : -1
  const dAbs = Math.abs(displacement)

  // Distances needed to ramp to vmax and back down
  const dAccel = (maxVelocity * maxVelocity) / (2 * acceleration)
  const dDecel = (maxVelocity * maxVelocity) / (2 * deceleration)

  let vPeak: number
  let t1: number, t2: number, t3: number
  let d1: number, d2: number

  if (dAccel + dDecel > dAbs) {
    // Triangle profile — never reaches vmax
    vPeak = Math.sqrt((2 * dAbs * acceleration * deceleration) / (acceleration + deceleration))
    t1 = vPeak / acceleration
    t2 = 0
    t3 = vPeak / deceleration
    d1 = vPeak * vPeak / (2 * acceleration)
    d2 = 0
  } else {
    vPeak = maxVelocity
    t1 = vPeak / acceleration
    t3 = vPeak / deceleration
    d1 = dAccel
    d2 = dAbs - dAccel - dDecel
    t2 = d2 / vPeak
  }

  const durationS = t1 + t2 + t3

  function eval_(t: number): MotionSample {
    if (t <= 0) return { pos: 0, vel: 0, accel: 0 }
    if (t >= durationS) return { pos: sign * dAbs, vel: 0, accel: 0 }

    if (t < t1) {
      return {
        pos: sign * 0.5 * acceleration * t * t,
        vel: sign * acceleration * t,
        accel: sign * acceleration,
      }
    }
    if (t < t1 + t2) {
      const dt = t - t1
      return {
        pos: sign * (d1 + vPeak * dt),
        vel: sign * vPeak,
        accel: 0,
      }
    }
    const dt = t - t1 - t2
    return {
      pos: sign * (d1 + d2 + vPeak * dt - 0.5 * deceleration * dt * dt),
      vel: sign * (vPeak - deceleration * dt),
      accel: sign * -deceleration,
    }
  }

  return { durationS, eval: eval_ }
}

// ─── Constant velocity profile ────────────────────────────────────────────────
// No accel/decel — runs at maxVelocity immediately (theoretical).

export function buildConstantProfile(
  displacement: number,
  maxVelocity: number,
): MoveProfile {
  const sign = displacement >= 0 ? 1 : -1
  const dAbs = Math.abs(displacement)
  const durationS = dAbs / maxVelocity

  function eval_(t: number): MotionSample {
    if (t <= 0) return { pos: 0, vel: 0, accel: 0 }
    if (t >= durationS) return { pos: sign * dAbs, vel: 0, accel: 0 }
    return {
      pos: sign * maxVelocity * t,
      vel: sign * maxVelocity,
      accel: 0,
    }
  }

  return { durationS, eval: eval_ }
}

// ─── S-curve profile ──────────────────────────────────────────────────────────
// 7-phase jerk-limited profile.
// Phases: [jerk-up | const-accel | jerk-down] [const-vel] [jerk-up | const-decel | jerk-down]
// The "decel jerk-up" means accel goes from 0 → -D_max (increasing decel magnitude).

interface SCurveSegment {
  startT: number
  startPos: number
  startVel: number
  startAccel: number
  jerk: number           // constant jerk during this phase
  duration: number
}

function evalSegment(seg: SCurveSegment, t: number): MotionSample {
  const dt = t - seg.startT
  const accel = seg.startAccel + seg.jerk * dt
  const vel = seg.startVel + seg.startAccel * dt + 0.5 * seg.jerk * dt * dt
  const pos = seg.startPos + seg.startVel * dt + 0.5 * seg.startAccel * dt * dt + (1 / 6) * seg.jerk * dt * dt * dt
  return { pos, vel, accel }
}

export function buildSCurveProfile(
  displacement: number,
  maxVelocity: number,
  acceleration: number,  // max accel magnitude mm/s²
  deceleration: number,  // max decel magnitude mm/s²
  accelJerk: number,     // mm/s³
  decelJerk: number,     // mm/s³
): MoveProfile {
  const sign = displacement >= 0 ? 1 : -1
  const dAbs = Math.abs(displacement)

  // ── Accel side (phases 1–3) ──────────────────────────────────────────────
  // Phase 1: jerk up to A over t_j1 = A/j1
  // Phase 3: jerk down from A to 0 over t_j1 (symmetric)
  // Phase 2: constant accel A for t_ca
  const t_j1 = acceleration / accelJerk           // duration of jerk phases on accel side
  const v_j1 = 0.5 * accelJerk * t_j1 * t_j1     // vel gained in phase 1
  // Velocity achieved by phases 1+2+3 = A*(t_ca + t_j1)
  // We want this to equal vPeak (≤ maxVelocity)
  // If maxVelocity > vPeakAccel, we use a const-accel phase
  const t_ca = Math.max(0, maxVelocity / acceleration - t_j1)
  const vAfterAccel = acceleration * (t_j1 + t_ca) // actual velocity after accel side

  // ── Decel side (phases 5–7) ──────────────────────────────────────────────
  const t_j2 = deceleration / decelJerk
  const t_cd = Math.max(0, vAfterAccel / deceleration - t_j2)

  // ── Position consumed by accel side ──────────────────────────────────────
  // Phase 1: pos = j1*t_j1³/6
  const p1 = accelJerk * Math.pow(t_j1, 3) / 6
  // Phase 2: starts at (p1, v_j1, A), const accel A for t_ca
  const p2 = p1 + v_j1 * t_ca + 0.5 * acceleration * t_ca * t_ca
  const v2 = v_j1 + acceleration * t_ca
  // Phase 3: starts at (p2, v2, A), jerk -j1 for t_j1
  const p3 = p2 + v2 * t_j1 + 0.5 * acceleration * t_j1 * t_j1 - accelJerk * Math.pow(t_j1, 3) / 6
  const d_accel_side = p3

  // ── Position consumed by decel side (symmetric logic with decel params) ──
  const v_j2 = 0.5 * decelJerk * t_j2 * t_j2
  const pD1 = decelJerk * Math.pow(t_j2, 3) / 6  // decel phase 1 (jerk up to D_max)
  const pD2 = pD1 + v_j2 * t_cd + 0.5 * deceleration * t_cd * t_cd
  const v_after_cd = v_j2 + deceleration * t_cd   // velocity at end of const-decel phase (used for pD3 geometry)
  const pD3 = pD2 + v_after_cd * t_j2 + 0.5 * deceleration * t_j2 * t_j2 - decelJerk * Math.pow(t_j2, 3) / 6
  const d_decel_side = pD3

  // ── Constant velocity phase ───────────────────────────────────────────────
  const d_const = Math.max(0, dAbs - d_accel_side - d_decel_side)
  const t_cv = d_const / vAfterAccel

  // ── Build segment list (all in unsigned coordinates) ──────────────────────
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

  addSeg(+accelJerk, t_j1)  // Ph1: jerk up
  addSeg(0, t_ca)            // Ph2: const accel
  addSeg(-accelJerk, t_j1)  // Ph3: jerk down
  addSeg(0, t_cv)            // Ph4: const vel
  addSeg(-decelJerk, t_j2)  // Ph5: jerk up (decel starts)
  addSeg(0, t_cd)            // Ph6: const decel
  addSeg(+decelJerk, t_j2)  // Ph7: jerk down (back to 0 accel)

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

// ─── Program evaluator ───────────────────────────────────────────────────────

export interface CompiledProgram {
  totalDurationS: number
  eval: (t: number) => MotionSample
}

interface ProgramSegment {
  startT: number        // global start time (seconds)
  startPos: number      // absolute container position at start of this step (mm)
  profile: MoveProfile | null  // null = delay
}

export function buildProgram(program: MotionProgram): CompiledProgram {
  const segments: ProgramSegment[] = []
  let cursor = 0   // global time cursor (seconds)
  let pos = 0      // running absolute position (mm)

  for (const step of program.steps) {
    if (step.type === 'delay') {
      const durationS = step.duration / 1000
      segments.push({ startT: cursor, startPos: pos, profile: null })
      // Attach duration so eval can determine segment end
      ;(segments[segments.length - 1] as any).durationS = durationS
      cursor += durationS
    } else {
      let profile: MoveProfile
      if (step.profileType === 'trapezoidal') {
        profile = buildTrapezoidalProfile(
          step.displacement, step.maxVelocity, step.acceleration, step.deceleration
        )
      } else if (step.profileType === 'scurve') {
        profile = buildSCurveProfile(
          step.displacement, step.maxVelocity, step.acceleration, step.deceleration,
          step.accelJerk, step.decelJerk
        )
      } else {
        profile = buildConstantProfile(step.displacement, step.maxVelocity)
      }
      segments.push({ startT: cursor, startPos: pos, profile })
      pos += step.displacement
      cursor += profile.durationS
    }
  }

  const totalDurationS = cursor

  function eval_(t: number): MotionSample {
    if (segments.length === 0 || t <= 0) return { pos: 0, vel: 0, accel: 0 }
    if (t >= totalDurationS) return { pos, vel: 0, accel: 0 }

    // Find the active segment
    let active = segments[0]
    for (const seg of segments) {
      if (t >= seg.startT) active = seg
      else break
    }

    const localT = t - active.startT

    if (active.profile === null) {
      // Delay — position is held
      return { pos: active.startPos, vel: 0, accel: 0 }
    }

    const sample = active.profile.eval(localT)
    return {
      pos: active.startPos + sample.pos,
      vel: sample.vel,
      accel: sample.accel,
    }
  }

  return { totalDurationS, eval: eval_ }
}
