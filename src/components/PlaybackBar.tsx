import { useStore } from '../store'
import { stopSimLoop, pauseSimLoop, resumeSimLoop } from '../sim/simLoop'

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4]

export function PlaybackBar() {
  const { status, currentTimeMs, totalDurationMs, speedMultiplier, loop } = useStore(
    (s) => s.playback
  )
  const pause = useStore((s) => s.pause)
  const seek = useStore((s) => s.seek)
  const setSpeed = useStore((s) => s.setSpeed)
  const toggleLoop = useStore((s) => s.toggleLoop)

  const isPlaying = status === 'playing'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'

  function handlePlayPause() {
    if (isPlaying) {
      pauseSimLoop()
      pause()
    } else if (isPaused) {
      resumeSimLoop(useStore as any)
    }
    // Idle: start is triggered by RunButton in ProgramEditorPanel
  }

  function handleStop() {
    stopSimLoop(useStore as any)
  }

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000)
    const frac = Math.floor((ms % 1000) / 10)
    return `${s}.${frac.toString().padStart(2, '0')}s`
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
        height: '100%', borderTop: '1px solid var(--color-border)',
      }}
    >
      {/* Transport buttons */}
      <button
        onClick={handlePlayPause}
        disabled={isIdle}
        style={{
          background: 'none', border: 'none', cursor: isIdle ? 'default' : 'pointer',
          fontSize: 18, color: isIdle ? 'var(--color-border)' : 'var(--color-accent)',
          padding: '0 4px',
        }}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <button
        onClick={handleStop}
        disabled={isIdle}
        style={{
          background: 'none', border: 'none', cursor: isIdle ? 'default' : 'pointer',
          fontSize: 16, color: isIdle ? 'var(--color-border)' : 'var(--color-text-muted)',
          padding: '0 4px',
        }}
        aria-label="Stop"
      >
        ⏹
      </button>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={Math.max(totalDurationMs, 1)}
        value={currentTimeMs}
        onChange={(e) => seek(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--color-accent)' }}
        aria-label="Timeline scrubber"
      />

      {/* Time display */}
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 70, textAlign: 'right' }}>
        {formatTime(currentTimeMs)} / {formatTime(totalDurationMs)}
      </span>

      {/* Speed selector */}
      <select
        value={speedMultiplier}
        onChange={(e) => setSpeed(parseFloat(e.target.value) as 0.25 | 0.5 | 1 | 2 | 4)}
        style={{
          fontSize: 11, padding: '2px 4px', borderRadius: 4,
          border: '1px solid var(--color-border)', background: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
        aria-label="Playback speed"
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}×</option>
        ))}
      </select>

      {/* Loop toggle */}
      <button
        onClick={toggleLoop}
        style={{
          background: loop ? 'var(--color-accent)' : 'var(--color-surface)',
          color: loop ? '#fff' : 'var(--color-text-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
        }}
        aria-label="Toggle loop"
      >
        ⟳ Loop
      </button>
    </div>
  )
}
