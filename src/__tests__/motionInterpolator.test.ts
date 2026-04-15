import { describe, it, expect } from 'vitest'
import {
  buildTrapezoidalProfile,
  buildConstantProfile,
  buildSCurveProfile,
  type MoveProfile,
} from '../sim/motionInterpolator'

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
})
