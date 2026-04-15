import { describe, it, expect } from 'vitest'
import {
  buildTrapezoidalProfile,
  buildConstantProfile,
  buildSCurveProfile,
  buildProgram,
  computeAchievable,
} from '../sim/motionInterpolator'
import type { MotionProgram } from '../types'

function approx(a: number, b: number, tol = 0.01) {
  expect(Math.abs(a - b)).toBeLessThan(tol)
}

describe('buildTrapezoidalProfile', () => {
  it('returns duration > 0 for a valid move', () => {
    const p = buildTrapezoidalProfile(100, 500, 1000, 1000)
    expect(p.durationS).toBeGreaterThan(0)
  })

  it('starts at pos=0, vel=0', () => {
    const p = buildTrapezoidalProfile(100, 500, 1000, 1000)
    const s = p.eval(0)
    approx(s.pos, 0)
    approx(s.vel, 0)
  })

  it('ends at displacement, vel~0', () => {
    const p = buildTrapezoidalProfile(100, 500, 1000, 1000)
    const s = p.eval(p.durationS)
    approx(s.pos, 100, 0.1)
    approx(s.vel, 0, 1)
  })

  it('works for negative displacement', () => {
    const p = buildTrapezoidalProfile(-100, 500, 1000, 1000)
    const s = p.eval(p.durationS)
    approx(s.pos, -100, 0.1)
  })

  it('triangle profile when displacement is small (never reaches vmax)', () => {
    // displacement so small it cannot accelerate to 500 mm/s
    const p = buildTrapezoidalProfile(10, 500, 1000, 1000)
    // peak velocity should be well below 500
    const mid = p.eval(p.durationS / 2)
    expect(mid.vel).toBeLessThan(500)
  })

  it('acceleration in accel phase is +accel', () => {
    const p = buildTrapezoidalProfile(200, 500, 1000, 1000)
    const s = p.eval(0.1)   // deep in accel phase (vmax/accel = 0.5s)
    approx(s.accel, 1000, 10)
  })

  it('acceleration in decel phase is -decel', () => {
    const p = buildTrapezoidalProfile(200, 500, 1000, 1000)
    const s = p.eval(p.durationS - 0.1)   // deep in decel phase
    approx(s.accel, -1000, 10)
  })
})

describe('buildConstantProfile', () => {
  it('runs at maxVelocity immediately', () => {
    const p = buildConstantProfile(100, 500)
    const s = p.eval(0.01)
    approx(s.accel, 0, 1)
    approx(s.vel, 500, 1)
  })

  it('ends at displacement', () => {
    const p = buildConstantProfile(100, 500)
    const s = p.eval(p.durationS)
    approx(s.pos, 100, 0.1)
  })
})

describe('buildSCurveProfile', () => {
  it('returns positive duration', () => {
    const p = buildSCurveProfile(100, 500, 1000, 1000, 5000, 5000)
    expect(p.durationS).toBeGreaterThan(0)
  })

  it('starts at pos=0, vel=0, accel=0', () => {
    const p = buildSCurveProfile(100, 500, 1000, 1000, 5000, 5000)
    const s = p.eval(0)
    approx(s.pos, 0)
    approx(s.vel, 0)
    approx(s.accel, 0)
  })

  it('ends at displacement, vel~0', () => {
    const p = buildSCurveProfile(200, 500, 1000, 1000, 5000, 5000)
    const s = p.eval(p.durationS)
    approx(s.pos, 200, 0.5)
    approx(s.vel, 0, 5)
  })

  it('has longer duration than trapezoidal for same move (jerk smoothing costs time)', () => {
    const sc = buildSCurveProfile(200, 500, 1000, 1000, 2000, 2000)
    const tr = buildTrapezoidalProfile(200, 500, 1000, 1000)
    expect(sc.durationS).toBeGreaterThan(tr.durationS)
  })

  it('accel is near zero at t=0 and t=durationS', () => {
    const p = buildSCurveProfile(200, 500, 1000, 1000, 5000, 5000)
    approx(p.eval(0).accel, 0, 5)
    approx(p.eval(p.durationS).accel, 0, 5)
  })

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
})

function makeProgram(steps: any[]): MotionProgram {
  return { id: 'test', name: 'Test', axisLength: 600, steps }
}

describe('buildProgram', () => {
  it('computes totalDurationS for a single move', () => {
    const prog = makeProgram([
      { type: 'move', id: '1', displacement: 100, maxVelocity: 500,
        acceleration: 1000, deceleration: 1000, accelJerk: 0, decelJerk: 0,
        profileType: 'trapezoidal' },
    ])
    const cp = buildProgram(prog)
    expect(cp.totalDurationS).toBeGreaterThan(0)
  })

  it('position at t=0 is 0', () => {
    const prog = makeProgram([
      { type: 'move', id: '1', displacement: 100, maxVelocity: 500,
        acceleration: 1000, deceleration: 1000, accelJerk: 0, decelJerk: 0,
        profileType: 'trapezoidal' },
    ])
    const cp = buildProgram(prog)
    approx(cp.eval(0).pos, 0)
  })

  it('position after first move equals displacement', () => {
    const prog = makeProgram([
      { type: 'move', id: '1', displacement: 100, maxVelocity: 500,
        acceleration: 1000, deceleration: 1000, accelJerk: 0, decelJerk: 0,
        profileType: 'trapezoidal' },
      { type: 'delay', id: '2', duration: 500 },
    ])
    const cp = buildProgram(prog)
    // During delay, position stays at 100
    const trapDuration = buildTrapezoidalProfile(100, 500, 1000, 1000).durationS
    approx(cp.eval(trapDuration + 0.25).pos, 100, 1)  // mid-delay
  })

  it('two moves sum their displacements at end', () => {
    const prog = makeProgram([
      { type: 'move', id: '1', displacement: 100, maxVelocity: 500,
        acceleration: 1000, deceleration: 1000, accelJerk: 0, decelJerk: 0,
        profileType: 'trapezoidal' },
      { type: 'move', id: '2', displacement: -50, maxVelocity: 300,
        acceleration: 800, deceleration: 800, accelJerk: 0, decelJerk: 0,
        profileType: 'trapezoidal' },
    ])
    const cp = buildProgram(prog)
    approx(cp.eval(cp.totalDurationS).pos, 50, 1)
  })
})

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
    // accelJerk=100, accel=1000 → aEffAccel = sqrt(achievedVelocity*100) < 1000
    const step = {
      type: 'move' as const, id: '1', displacement: 1000,
      maxVelocity: 500, acceleration: 1000, deceleration: 1000,
      accelJerk: 100, decelJerk: 100, profileType: 'scurve' as const,
    }
    const r = computeAchievable(step)!
    expect(r.accel).toBeLessThan(1000)
    approx(r.accel, Math.sqrt(r.velocity * 100), 5)
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
