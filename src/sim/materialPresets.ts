import type { PBDParams } from '../types'

// restDensity values are calibrated to equilibrium packing density under the
// 2D-normalized poly6 kernel (h = particleRadius * 4, spacing = particleRadius * 2.2).
// pressureStiffness is scaled to balance gravity (100 mm/s²) at ~5% compression.
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
    restDensity: 0.016,
    pressureStiffness: 80000,
    viscosity: 0.3,
    restitution: 0.15,
    friction: 0.45,
    particleRadius: 3.5,
  },
  'coarse-granular': {
    restDensity: 0.008,
    pressureStiffness: 40000,
    viscosity: 0.5,
    restitution: 0.3,
    friction: 0.65,
    particleRadius: 5,
  },
}
