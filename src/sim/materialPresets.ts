import type { PBDParams } from '../types'

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
    restDensity: 0.028,
    pressureStiffness: 60000,
    viscosity: 0.35,
    restitution: 0.04,
    friction: 0.55,
    particleRadius: 2,
  },
  'coarse-granular': {
    restDensity: 0.014,
    pressureStiffness: 30000,
    viscosity: 0.45,
    restitution: 0.08,
    friction: 0.70,
    particleRadius: 3.5,
  },
}
