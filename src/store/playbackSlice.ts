import type { PlaybackState } from '../types'

export interface PlaybackSlice {
  playback: PlaybackState
  play: () => void
  pause: () => void
  stop: () => void
  seek: (ms: number) => void
  setSpeed: (multiplier: 0.25 | 0.5 | 1 | 2 | 4) => void
  toggleLoop: () => void
  setTotalDuration: (ms: number) => void
}

const defaultPlayback = (): PlaybackState => ({
  status: 'idle',
  currentTimeMs: 0,
  totalDurationMs: 0,
  speedMultiplier: 1,
  loop: false,
})

export const createPlaybackSlice = (set: any): PlaybackSlice => ({
  playback: defaultPlayback(),
  play: () =>
    set((s: any) => ({
      playback: {
        ...s.playback,
        status: s.playback.status === 'paused' ? 'playing' : 'playing',
      },
    })),
  pause: () =>
    set((s: any) => ({ playback: { ...s.playback, status: 'paused' } })),
  stop: () =>
    set((s: any) => ({
      playback: { ...s.playback, status: 'idle', currentTimeMs: 0 },
    })),
  seek: (ms) =>
    set((s: any) => ({ playback: { ...s.playback, currentTimeMs: ms } })),
  setSpeed: (multiplier) =>
    set((s: any) => ({ playback: { ...s.playback, speedMultiplier: multiplier } })),
  toggleLoop: () =>
    set((s: any) => ({ playback: { ...s.playback, loop: !s.playback.loop } })),
  setTotalDuration: (ms) =>
    set((s: any) => ({ playback: { ...s.playback, totalDurationMs: ms } })),
})
