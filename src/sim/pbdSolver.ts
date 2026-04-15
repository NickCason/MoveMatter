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
