import type { PBDParams } from '../types'

export const MATERIAL_PRESETS: Record<string, PBDParams> = {
  water: {
    restDensity: 1.0,
    pressureStiffness: 200,
    viscosity: 0.01,
    restitution: 0.05,
    friction: 0.02,
    particleRadius: 3,
  },
  oil: {
    restDensity: 0.85,
    pressureStiffness: 150,
    viscosity: 0.12,
    restitution: 0.03,
    friction: 0.05,
    particleRadius: 3,
  },
  'dry-powder': {
    restDensity: 0.6,
    pressureStiffness: 80,
    viscosity: 0.3,
    restitution: 0.15,
    friction: 0.45,
    particleRadius: 3.5,
  },
  'coarse-granular': {
    restDensity: 0.7,
    pressureStiffness: 60,
    viscosity: 0.5,
    restitution: 0.3,
    friction: 0.65,
    particleRadius: 5,
  },
}
