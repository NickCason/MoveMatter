import { describe, it, expect } from 'vitest'
import { MATERIAL_PRESETS } from '../sim/materialPresets'

describe('MATERIAL_PRESETS', () => {
  it('exports all four presets', () => {
    expect(MATERIAL_PRESETS.water).toBeDefined()
    expect(MATERIAL_PRESETS.oil).toBeDefined()
    expect(MATERIAL_PRESETS['dry-powder']).toBeDefined()
    expect(MATERIAL_PRESETS['coarse-granular']).toBeDefined()
  })

  it('water has lower viscosity than oil', () => {
    expect(MATERIAL_PRESETS.water.viscosity).toBeLessThan(MATERIAL_PRESETS.oil.viscosity)
  })

  it('dry-powder has higher friction than water', () => {
    expect(MATERIAL_PRESETS['dry-powder'].friction).toBeGreaterThan(MATERIAL_PRESETS.water.friction)
  })

  it('all presets have positive particleRadius', () => {
    for (const preset of Object.values(MATERIAL_PRESETS)) {
      expect(preset.particleRadius).toBeGreaterThan(0)
    }
  })
})
