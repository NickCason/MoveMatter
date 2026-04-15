import { useStore } from '../store'
import type { DelayStep } from '../types'

interface Props {
  step: DelayStep
  error?: string
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}

export function DelayRow({ step, error, dragHandleProps }: Props) {
  const updateStep = useStore((s) => s.updateStep)
  const removeStep = useStore((s) => s.removeStep)

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${error ? '#f87171' : 'var(--color-border)'}`,
        borderRadius: 6, padding: 8, display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <div
        {...dragHandleProps}
        style={{ cursor: 'grab', color: 'var(--color-text-muted)', fontSize: 14, userSelect: 'none' }}
      >
        ⠿
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', flex: 1 }}>
        DELAY
      </span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--color-text-muted)' }}>Duration (ms)</span>
        <input
          type="number"
          value={step.duration}
          min={1}
          onChange={(e) => updateStep(step.id, { duration: parseInt(e.target.value) || 0 })}
          style={{
            width: 80, padding: '2px 4px', borderRadius: 3, fontSize: 12,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
      </label>
      <button
        onClick={() => removeStep(step.id)}
        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
        aria-label="Remove delay"
      >
        ×
      </button>
      {error && <p style={{ fontSize: 11, color: '#ef4444', margin: 0 }}>{error}</p>}
    </div>
  )
}
