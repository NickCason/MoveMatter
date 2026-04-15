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
}
