import type { MotionSample, MotionProgram, MoveStep } from '../types'

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
  aEffAccel: number; aEffDecel: number
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
  // Cap effective peak acceleration so the jerk ramp never overshoots vPeak.
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

  const { t_j1, t_ca, vAfterAccel, t_j2, t_cd, d_accel, d_decel } = phases

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

// ─── Achievable value calculator ─────────────────────────────────────────────

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

// ─── Program evaluator ───────────────────────────────────────────────────────

export interface CompiledSegment {
  stepId: string
  startT: number        // global start time (seconds)
  startPos: number      // absolute container position at start of this step (mm)
  durationS: number
  profile: MoveProfile | null  // null = delay
}

export interface CompiledProgram {
  totalDurationS: number
  segments: CompiledSegment[]
  eval: (t: number) => MotionSample
}

// Internal alias — same shape as CompiledSegment, kept for backward compat
type ProgramSegment = CompiledSegment

export function buildProgram(program: MotionProgram): CompiledProgram {
  const segments: ProgramSegment[] = []
  let cursor = 0   // global time cursor (seconds)
  let pos = 0      // running absolute position (mm)

  for (const step of program.steps) {
    if (step.type === 'delay') {
      const durationS = step.duration / 1000
      segments.push({ stepId: step.id, startT: cursor, startPos: pos, durationS, profile: null })
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
      segments.push({ stepId: step.id, startT: cursor, startPos: pos, durationS: profile.durationS, profile })
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

  return { totalDurationS, segments, eval: eval_ }
}
