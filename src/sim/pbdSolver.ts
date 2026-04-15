import type { ContainerConfig, PBDParams } from '../types'

export const STRIDE = 4  // [x, y, vx, vy] per particle

// ─── SPH Kernel functions ─────────────────────────────────────────────────────
// h = smoothing radius (mm)

/** Poly6 kernel — used for density estimation */
export function poly6(r2: number, h: number): number {
  if (r2 >= h * h) return 0
  const term = h * h - r2
  return (315 / (64 * Math.PI * Math.pow(h, 9))) * term * term * term
}

/** Spiky kernel gradient magnitude — used for pressure forces */
export function spikyGrad(r: number, h: number): number {
  if (r <= 0 || r >= h) return 0
  const term = h - r
  return -(45 / (Math.PI * Math.pow(h, 6))) * term * term
}

/** Viscosity kernel laplacian — used for viscosity forces */
export function viscLaplacian(r: number, h: number): number {
  if (r >= h) return 0
  return (45 / (Math.PI * Math.pow(h, 6))) * (h - r)
}

// ─── Particle initialization ──────────────────────────────────────────────────

export function initParticles(
  container: ContainerConfig,
  params: PBDParams,
): Float32Array {
  const { widthMm, heightMm, fillPercent, wallThicknessMm } = container
  const innerW = widthMm - 2 * wallThicknessMm
  const innerH = heightMm - 2 * wallThicknessMm
  const fillH = innerH * (fillPercent / 100)

  const r = params.particleRadius
  const spacing = r * 2.2  // slight gap between particles
  const cols = Math.max(1, Math.floor(innerW / spacing))
  const rows = Math.max(1, Math.floor(fillH / spacing))
  const count = cols * rows

  const buf = new Float32Array(count * STRIDE)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col
      // Pack in from the bottom of the fill region (y increases downward)
      buf[idx * STRIDE + 0] = wallThicknessMm + r + col * spacing
      buf[idx * STRIDE + 1] = wallThicknessMm + (innerH - fillH) + r + row * spacing
      buf[idx * STRIDE + 2] = 0
      buf[idx * STRIDE + 3] = 0
    }
  }
  return buf
}

// ─── Simulation step ──────────────────────────────────────────────────────────

const GRAVITY_MM_S2 = 9810  // mm/s²
const PARTICLE_MASS = 1.0   // normalized

export interface StepInput {
  particles: Float32Array
  container: ContainerConfig
  params: PBDParams
  dt: number               // seconds
  containerAccelX: number  // mm/s² (positive = container moving right)
}

export function pbdStep(input: StepInput): Float32Array {
  const { particles, container, params, dt, containerAccelX } = input
  const n = particles.length / STRIDE
  const out = new Float32Array(particles.length)

  const { widthMm, heightMm, wallThicknessMm } = container
  const xMin = wallThicknessMm + params.particleRadius
  const xMax = widthMm - wallThicknessMm - params.particleRadius
  const yMin = wallThicknessMm + params.particleRadius
  const yMax = heightMm - wallThicknessMm - params.particleRadius

  const h = params.particleRadius * 4  // smoothing radius

  // ── Density estimation ────────────────────────────────────────────────────
  const density = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const xi = particles[i * STRIDE]
    const yi = particles[i * STRIDE + 1]
    let rho = 0
    for (let j = 0; j < n; j++) {
      const dx = xi - particles[j * STRIDE]
      const dy = yi - particles[j * STRIDE + 1]
      rho += PARTICLE_MASS * poly6(dx * dx + dy * dy, h)
    }
    density[i] = rho
  }

  // ── Force integration ─────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const ix = i * STRIDE
    const x = particles[ix]
    const y = particles[ix + 1]
    const vx = particles[ix + 2]
    const vy = particles[ix + 3]

    const rhoI = Math.max(density[i], 1e-6)
    const pI = Math.max(0, params.pressureStiffness * (rhoI - params.restDensity))

    // Body forces: gravity (down = +y) + inertial (opposite to container accel)
    let fx = -containerAccelX * PARTICLE_MASS
    let fy = GRAVITY_MM_S2 * PARTICLE_MASS

    // Pair forces (SPH pressure + viscosity)
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const jx = j * STRIDE
      const dx = x - particles[jx]
      const dy = y - particles[jx + 1]
      const r2 = dx * dx + dy * dy
      const r = Math.sqrt(r2)
      if (r < 1e-6 || r >= h) continue

      const rhoJ = Math.max(density[j], 1e-6)
      const pJ = Math.max(0, params.pressureStiffness * (rhoJ - params.restDensity))

      // Pressure force (spiky kernel gradient)
      const sg = spikyGrad(r, h)
      const pMag = -PARTICLE_MASS * (pI + pJ) / (2 * rhoJ) * sg
      fx += pMag * (dx / r)
      fy += pMag * (dy / r)

      // Viscosity force (laplacian)
      const dvx = particles[jx + 2] - vx
      const dvy = particles[jx + 3] - vy
      const vl = viscLaplacian(r, h)
      const vCoeff = params.viscosity * PARTICLE_MASS / rhoJ * vl
      fx += vCoeff * dvx
      fy += vCoeff * dvy
    }

    // Semi-implicit Euler integration
    let nvx = vx + (fx / PARTICLE_MASS) * dt
    let nvy = vy + (fy / PARTICLE_MASS) * dt
    let nx = x + nvx * dt
    let ny = y + nvy * dt

    // Boundary collision response
    if (nx < xMin) { nx = xMin; nvx = Math.abs(nvx) * params.restitution; nvx -= Math.abs(nvy) * params.friction * 0.1 }
    if (nx > xMax) { nx = xMax; nvx = -Math.abs(nvx) * params.restitution }
    if (ny < yMin) { ny = yMin; nvy = Math.abs(nvy) * params.restitution; nvx *= (1 - params.friction) }
    if (ny > yMax) { ny = yMax; nvy = -Math.abs(nvy) * params.restitution; nvx *= (1 - params.friction) }

    out[ix] = nx
    out[ix + 1] = ny
    out[ix + 2] = nvx
    out[ix + 3] = nvy
  }

  return out
}
