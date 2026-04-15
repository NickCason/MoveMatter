import { useStore } from '../store'
import type { MoveStep } from '../types'

interface Props {
  step: MoveStep
  error?: string
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  rowDropProps?: React.HTMLAttributes<HTMLDivElement>
}

function NumInput({
  label, value, field, stepId, disabled,
}: {
  label: string; value: number; field: keyof MoveStep; stepId: string; disabled?: boolean
}) {
  const updateStep = useStore((s) => s.updateStep)
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 11 }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => updateStep(stepId, { [field]: parseFloat(e.target.value) || 0 } as any)}
        style={{
          width: '100%', padding: '2px 4px', borderRadius: 3, fontSize: 12,
          border: '1px solid var(--color-border)', background: 'var(--color-bg)',
          color: disabled ? 'var(--color-text-muted)' : 'var(--color-text)',
        }}
      />
    </label>
  )
}

export function MoveRow({ step, error, dragHandleProps, rowDropProps }: Props) {
  const updateStep = useStore((s) => s.updateStep)
  const removeStep = useStore((s) => s.removeStep)
  const isScurve = step.profileType === 'scurve'
  const isConstant = step.profileType === 'constant'

  return (
    <div
      {...rowDropProps}
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${error && !error.startsWith('Warning') ? '#f87171' : 'var(--color-border)'}`,
        borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          {...dragHandleProps}
          style={{ cursor: 'grab', color: 'var(--color-text-muted)', fontSize: 14, userSelect: 'none' }}
        >
          ⠿
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
          MOVE
        </span>
        <select
          value={step.profileType}
          onChange={(e) =>
            updateStep(step.id, { profileType: e.target.value as MoveStep['profileType'] })
          }
          style={{
            fontSize: 11, padding: '1px 4px', borderRadius: 3,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        >
          <option value="trapezoidal">Trapezoidal</option>
          <option value="scurve">S-Curve</option>
          <option value="constant">Constant</option>
        </select>
        <button
          onClick={() => removeStep(step.id)}
          style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
          aria-label="Remove step"
        >
          ×
        </button>
      </div>

      {/* Field grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <NumInput label="Displacement (mm)" value={step.displacement} field="displacement" stepId={step.id} />
        <NumInput label="Max Velocity (mm/s)" value={step.maxVelocity} field="maxVelocity" stepId={step.id} />
        {!isConstant && (
          <>
            <NumInput label="Acceleration (mm/s²)" value={step.acceleration} field="acceleration" stepId={step.id} />
            <NumInput label="Deceleration (mm/s²)" value={step.deceleration} field="deceleration" stepId={step.id} />
          </>
        )}
        {isScurve && (
          <>
            <NumInput label="Accel Jerk (mm/s³)" value={step.accelJerk} field="accelJerk" stepId={step.id} />
            <NumInput label="Decel Jerk (mm/s³)" value={step.decelJerk} field="decelJerk" stepId={step.id} />
          </>
        )}
        {!isScurve && (
          <>
            <NumInput label="Accel Jerk (mm/s³)" value={0} field="accelJerk" stepId={step.id} disabled />
            <NumInput label="Decel Jerk (mm/s³)" value={0} field="decelJerk" stepId={step.id} disabled />
          </>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 11, color: error.startsWith('Warning') ? '#d97706' : '#ef4444', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  )
}
