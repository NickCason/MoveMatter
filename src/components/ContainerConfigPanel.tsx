import { useStore } from '../store'

export function ContainerConfigPanel() {
  const container = useStore((s) => s.container)
  const setContainer = useStore((s) => s.setContainer)
  const status = useStore((s) => s.playback.status)
  const reinitParticles = useStore((s) => s.reinitParticles)
  const material = useStore((s) => s.material)

  function handleChange(key: keyof typeof container, raw: string) {
    const value = parseFloat(raw)
    if (isNaN(value)) return
    const next = { ...container, [key]: value }
    setContainer({ [key]: value })
    if (status === 'idle') {
      reinitParticles(next, material.params)
    }
  }

  function field(label: string, key: keyof typeof container, unit: string, min = 1) {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 11 }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{label} ({unit})</span>
        <input
          type="number"
          value={container[key]}
          min={min}
          max={key === 'fillPercent' ? 100 : undefined}
          onChange={(e) => handleChange(key, e.target.value)}
          style={{
            width: '100%', padding: '2px 4px', borderRadius: 3, fontSize: 12,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
      </label>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', margin: 0 }}>
        CONTAINER
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {field('Width', 'widthMm', 'mm')}
        {field('Height', 'heightMm', 'mm')}
        {field('Fill', 'fillPercent', '%', 0)}
        {field('Wall', 'wallThicknessMm', 'mm')}
      </div>
    </div>
  )
}
