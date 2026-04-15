import { useStore } from '../store'
import { MATERIAL_PRESETS } from '../sim/materialPresets'
import type { MaterialPreset } from '../types'

const PRESETS: MaterialPreset[] = ['water', 'oil', 'dry-powder', 'coarse-granular']

const PRESET_LABELS: Record<MaterialPreset, string> = {
  water: 'Water',
  oil: 'Oil',
  'dry-powder': 'Dry Powder',
  'coarse-granular': 'Granular',
  custom: 'Custom',
}

export function MaterialSelector() {
  const material = useStore((s) => s.material)
  const setMaterial = useStore((s) => s.setMaterial)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', margin: 0 }}>
        MATERIAL
      </p>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setMaterial({ preset, params: MATERIAL_PRESETS[preset] })}
            style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${material.preset === preset ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: material.preset === preset ? 'var(--color-accent)' : 'var(--color-surface)',
              color: material.preset === preset ? '#fff' : 'var(--color-text)',
              fontWeight: material.preset === preset ? 600 : 400,
            }}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>
      {material.preset === 'oil' && (
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2,
        }}>
          Viscosity
          <input
            type="range"
            min={0.05}
            max={0.80}
            step={0.01}
            value={material.params.viscosity}
            onChange={(e) =>
              setMaterial({ preset: 'oil', params: { ...material.params, viscosity: parseFloat(e.target.value) } })
            }
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, minWidth: 32, textAlign: 'right' }}>
            {material.params.viscosity.toFixed(2)}
          </span>
        </label>
      )}
    </div>
  )
}
