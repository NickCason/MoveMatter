import { describe, it, expect } from 'vitest'
import { initParticles, STRIDE, pbdStep } from '../sim/pbdSolver'
import type { ContainerConfig } from '../types'
import { MATERIAL_PRESETS } from '../sim/materialPresets'

const container: ContainerConfig = {
  widthMm: 200,
  heightMm: 100,
  fillPercent: 60,
  wallThicknessMm: 5,
}
const params = MATERIAL_PRESETS.water

describe('initParticles', () => {
  it('returns a Float32Array with length divisible by STRIDE', () => {
    const buf = initParticles(container, params)
    expect(buf.length % STRIDE).toBe(0)
  })

  it('returns > 0 particles', () => {
    const buf = initParticles(container, params)
    expect(buf.length).toBeGreaterThan(0)
  })

  it('all particles are within container inner bounds', () => {
    const buf = initParticles(container, params)
    const n = buf.length / STRIDE
    const xMin = container.wallThicknessMm
    const xMax = container.widthMm - container.wallThicknessMm
    const yMin = container.wallThicknessMm
    const yMax = container.heightMm - container.wallThicknessMm
    for (let i = 0; i < n; i++) {
      expect(buf[i * STRIDE + 0]).toBeGreaterThanOrEqual(xMin)
      expect(buf[i * STRIDE + 0]).toBeLessThanOrEqual(xMax)
      expect(buf[i * STRIDE + 1]).toBeGreaterThanOrEqual(yMin)
      expect(buf[i * STRIDE + 1]).toBeLessThanOrEqual(yMax)
    }
  })

  it('all particles start with zero velocity', () => {
    const buf = initParticles(container, params)
    const n = buf.length / STRIDE
    for (let i = 0; i < n; i++) {
      expect(buf[i * STRIDE + 2]).toBe(0)
      expect(buf[i * STRIDE + 3]).toBe(0)
    }
  })

  it('50% fill yields roughly half the particles of 100% fill', () => {
    const half = initParticles({ ...container, fillPercent: 50 }, params)
    const full = initParticles({ ...container, fillPercent: 100 }, params)
    const ratio = half.length / full.length
    expect(ratio).toBeGreaterThan(0.4)
    expect(ratio).toBeLessThan(0.6)
  })
})

describe('pbdStep', () => {
  it('returns a Float32Array of the same length', () => {
    const particles = initParticles(container, params)
    const out = pbdStep({ particles, container, params, dt: 1 / 60, containerAccelX: 0 })
    expect(out.length).toBe(particles.length)
  })

  it('particles stay within container bounds after 60 steps of gravity', () => {
    let particles = initParticles(container, params)
    for (let i = 0; i < 60; i++) {
      particles = pbdStep({ particles, container, params, dt: 1 / 60, containerAccelX: 0 })
    }
    const n = particles.length / STRIDE
    const xMin = container.wallThicknessMm
    const xMax = container.widthMm - container.wallThicknessMm
    const yMin = container.wallThicknessMm
    const yMax = container.heightMm - container.wallThicknessMm
    for (let i = 0; i < n; i++) {
      expect(particles[i * STRIDE + 0]).toBeGreaterThanOrEqual(xMin - 1)
      expect(particles[i * STRIDE + 0]).toBeLessThanOrEqual(xMax + 1)
      expect(particles[i * STRIDE + 1]).toBeGreaterThanOrEqual(yMin - 1)
      expect(particles[i * STRIDE + 1]).toBeLessThanOrEqual(yMax + 1)
    }
  })

  it('lateral acceleration shifts particle distribution toward one side', () => {
    let particles = initParticles(container, params)
    // Large rightward accel: inertial force pushes particles left
    for (let i = 0; i < 120; i++) {
      particles = pbdStep({ particles, container, params, dt: 1 / 60, containerAccelX: 5000 })
    }
    const n = particles.length / STRIDE
    let sumX = 0
    for (let i = 0; i < n; i++) sumX += particles[i * STRIDE + 0]
    const centerX = container.widthMm / 2
    // Particles should be left of center (inertial force opposes acceleration)
    expect(sumX / n).toBeLessThan(centerX)
  })
})
