import { useStore } from '../store'
import { startSimLoop, stopSimLoop, resumeSimLoop } from '../sim/simLoop'
import { validateProgram } from '../utils/validation'
import { MoveList } from './MoveList'
import { ContainerConfigPanel } from './ContainerConfigPanel'
import { MaterialSelector } from './MaterialSelector'

export function ProgramEditorPanel() {
  const program = useStore((s) => s.program)
  const status = useStore((s) => s.playback.status)

  const validation = validateProgram(program)
  const isPlaying = status === 'playing'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'

  function handleRun() {
    if (isPlaying) {
      stopSimLoop(useStore as any)
    } else if (isPaused) {
      resumeSimLoop(useStore as any)
    } else {
      if (validation.hasBlockingError) return
      startSimLoop(useStore as any)
    }
  }

  const runLabel = isPlaying ? 'Stop' : isPaused ? 'Resume' : 'Run'
  const runDisabled = isIdle && validation.hasBlockingError

  return (
    <div className="flex flex-col h-full overflow-y-auto gap-3">
      {/* Over-travel warning */}
      {validation.overTravelWarning && (
        <div
          className="text-xs px-2 py-1.5 rounded"
          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
        >
          {validation.overTravelWarning}
        </div>
      )}

      {/* Axis length input */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Axis length (mm)</span>
        <input
          type="number"
          value={program.axisLength}
          min={1}
          onChange={(e) => {
            const current = useStore.getState().program
            useStore.getState().setProgram({ ...current, axisLength: parseFloat(e.target.value) || 600 })
          }}
          style={{
            width: 80, padding: '2px 4px', borderRadius: 3, fontSize: 12,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
      </label>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={runDisabled}
        style={{
          background: isPlaying ? '#ef4444' : runDisabled ? 'var(--color-border)' : 'var(--color-accent)',
          color: runDisabled ? 'var(--color-text-muted)' : '#fff',
          borderRadius: 6,
          padding: '6px 16px',
          fontWeight: 600,
          fontSize: 14,
          cursor: runDisabled ? 'not-allowed' : 'pointer',
          border: 'none',
        }}
      >
        {runLabel}
      </button>

      {/* Move list */}
      <MoveList stepErrors={validation.stepErrors} />

      {/* Add buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => useStore.getState().addMove()}
          style={{
            flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 4,
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text)', cursor: 'pointer',
          }}
        >
          + Add Move
        </button>
        <button
          onClick={() => useStore.getState().addDelay()}
          style={{
            flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 4,
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text)', cursor: 'pointer',
          }}
        >
          + Add Delay
        </button>
      </div>

      <hr style={{ borderColor: 'var(--color-border)' }} />
      <ContainerConfigPanel />
      <MaterialSelector />
    </div>
  )
}
