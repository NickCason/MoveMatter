import { useStore } from '../store'
import { stopReplayLoop, pauseReplayLoop, startReplayLoop } from '../sim/simLoop'

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4]

export function PlaybackBar() {
  const { status, currentTimeMs, totalDurationMs, speedMultiplier, loop, hasBuffer } = useStore(
    (s) => s.playback
  )
  const pause = useStore((s) => s.pause)
  const seek = useStore((s) => s.seek)
  const setSpeed = useStore((s) => s.setSpeed)
  const toggleLoop = useStore((s) => s.toggleLoop)

  const isPlaying = status === 'playing'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'
  const isComputing = status === 'computing'

  // Controls disabled during computing
  const disabled = isComputing

  function handlePlayPause() {
    if (disabled) return
    if (isPlaying) {
      pauseReplayLoop()
      pause()
    } else if (isPaused) {
      // Resume from current position
      useStore.setState((s) => ({ playback: { ...s.playback, status: 'playing' } }))
      startReplayLoop(useStore as any)
    } else if (isIdle && hasBuffer) {
      // Replay from current scrub position (defaults to 0 after stop)
      useStore.setState((s) => ({ playback: { ...s.playback, status: 'playing' } }))
      startReplayLoop(useStore as any)
    }
  }

  function handleStop() {
    if (disabled) return
    stopReplayLoop(useStore as any)
  }

  function handleSeek(ms: number) {
    if (disabled) return
    seek(ms)
  }

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000)
    const frac = Math.floor((ms % 1000) / 10)
    return `${s}.${frac.toString().padStart(2, '0')}s`
  }

  const playEnabled = !disabled && (isPlaying || isPaused || (isIdle && hasBuffer))

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
        height: '100%', borderTop: '1px solid var(--color-border)',
      }}
    >
      {/* Computing indicator */}
      {isComputing && (
        <span style={{ fontSize: 11, color: 'var(--color-accent)', fontStyle: 'italic' }}>
          Computing…
        </span>
      )}

      {/* Transport buttons */}
      <button
        onClick={handlePlayPause}
        disabled={!playEnabled}
        style={{
          background: 'none', border: 'none',
          cursor: playEnabled ? 'pointer' : 'default',
          fontSize: 18,
          color: playEnabled ? 'var(--color-accent)' : 'var(--color-border)',
          padding: '0 4px',
        }}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <button
        onClick={handleStop}
        disabled={disabled || isIdle}
        style={{
          background: 'none', border: 'none',
          cursor: (!disabled && !isIdle) ? 'pointer' : 'default',
          fontSize: 16,
          color: (!disabled && !isIdle) ? 'var(--color-text-muted)' : 'var(--color-border)',
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
        disabled={disabled}
        onChange={(e) => handleSeek(parseFloat(e.target.value))}
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
        disabled={disabled}
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
        disabled={disabled}
        style={{
          background: loop ? 'var(--color-accent)' : 'var(--color-surface)',
          color: loop ? '#fff' : 'var(--color-text-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 4, padding: '2px 8px', fontSize: 11,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        aria-label="Toggle loop"
      >
        ⟳ Loop
      </button>
    </div>
  )
}
