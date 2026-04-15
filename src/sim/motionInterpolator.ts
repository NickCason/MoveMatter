import type { MotionSample } from '../types'

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
