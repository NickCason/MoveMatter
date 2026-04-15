import { Graphics } from 'pixi.js'
import type { ContainerConfig, MaterialConfig } from '../types'
import { STRIDE } from './pbdSolver'

export const PADDING_PX = 40

export function mmToPxScale(canvasWidth: number, axisLength: number): number {
  return (canvasWidth - 2 * PADDING_PX) / Math.max(axisLength, 1)
}

export function containerScreenX(
  containerPositionMm: number,
  scale: number,
): number {
  return PADDING_PX + containerPositionMm * scale
}

export function drawTrack(
  g: Graphics,
  axisLength: number,
  scale: number,
  trackY: number,
  trackColor: number,
): void {
  g.clear()
  // Track line
  g.setStrokeStyle({ width: 3, color: trackColor })
  g.moveTo(PADDING_PX, trackY)
  g.lineTo(PADDING_PX + axisLength * scale, trackY)
  g.stroke()
  // End stops
  g.setFillStyle({ color: trackColor })
  g.rect(PADDING_PX - 3, trackY - 10, 6, 20)
  g.fill()
  g.rect(PADDING_PX + axisLength * scale - 3, trackY - 10, 6, 20)
  g.fill()
  // Position tick every 100mm
  for (let mm = 0; mm <= axisLength; mm += 100) {
    const x = PADDING_PX + mm * scale
    g.moveTo(x, trackY - 5)
    g.lineTo(x, trackY + 5)
    g.stroke()
  }
}

export function drawContainer(
  g: Graphics,
  containerPositionMm: number,
  config: ContainerConfig,
  scale: number,
  trackY: number,
  isDark: boolean,
): void {
  g.clear()
  const x = containerScreenX(containerPositionMm, scale)
  const w = config.widthMm * scale
  const h = config.heightMm * scale
  const wallPx = config.wallThicknessMm * scale
  const top = trackY - h / 2

  // Outer walls
  const wallColor = isDark ? 0x94a3b8 : 0x475569
  g.setFillStyle({ color: wallColor })
  g.rect(x, top, wallPx, h)                         // left wall
  g.rect(x + w - wallPx, top, wallPx, h)            // right wall
  g.rect(x, top, w, wallPx)                         // top wall
  g.rect(x, top + h - wallPx, w, wallPx)            // bottom wall
  g.fill()

  // Inner cavity background
  const cavityColor = isDark ? 0x0f172a : 0xf0f4f8
  g.setFillStyle({ color: cavityColor, alpha: 0.8 })
  g.rect(x + wallPx, top + wallPx, w - 2 * wallPx, h - 2 * wallPx)
  g.fill()
}

export function drawParticles(
  g: Graphics,
  particles: Float32Array,
  containerPositionMm: number,
  config: ContainerConfig,
  material: MaterialConfig,
  scale: number,
  trackY: number,
): void {
  g.clear()

  if (particles.length === 0) return

  const n = particles.length / STRIDE
  const cLeft = containerScreenX(containerPositionMm, scale)
  const cTop = trackY - (config.heightMm * scale) / 2

  const isLiquid = material.preset === 'water' || material.preset === 'oil'
  const particleColor = isLiquid
    ? (material.preset === 'water' ? 0x3b82f6 : 0xf59e0b)
    : (material.preset === 'dry-powder' ? 0xd97706 : 0x78716c)

  const rPx = Math.max(1.5, material.params.particleRadius * scale)

  for (let i = 0; i < n; i++) {
    const px = particles[i * STRIDE + 0]
    const py = particles[i * STRIDE + 1]
    const screenX = cLeft + px * scale
    const screenY = cTop + py * scale
    g.setFillStyle({ color: particleColor, alpha: isLiquid ? 0.85 : 0.95 })
    g.circle(screenX, screenY, rPx)
    g.fill()
  }
}
