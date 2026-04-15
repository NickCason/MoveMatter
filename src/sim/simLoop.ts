import { buildProgram, type CompiledProgram } from './motionInterpolator'
import { initParticles, pbdStep } from './pbdSolver'
import type { AppStore } from '../store'
import type { StoreApi } from 'zustand'
import type { MaterialConfig, ContainerConfig } from '../types'

/** Mutable ref written each frame by the sim loop; read by SimViewport's ticker.
 *  Using a plain object avoids React re-renders at 60fps. */
export const particleStateRef: {
  particles: Float32Array
  containerPositionMm: number
  material: MaterialConfig | null
  container: ContainerConfig | null
} = {
  particles: new Float32Array(0),
  containerPositionMm: 0,
  material: null,
  container: null,
}

let rafId: number | null = null
let lastTimestamp: number | null = null
let compiledProgram: CompiledProgram | null = null
let plotFrameCounter = 0

const PLOT_SAMPLE_EVERY = 6  // ~10fps plot updates at 60fps sim

export function startSimLoop(store: StoreApi<AppStore>): void {
  if (rafId !== null) return  // already running

  const state = store.getState()

  // Compile the program once
  compiledProgram = buildProgram(state.program)
  const totalDurationMs = compiledProgram.totalDurationS * 1000

  // Initialize particles if not already done
  const particles =
    state.sim.particles.length > 0
      ? state.sim.particles
      : initParticles(state.container, state.material.params)

  // Update total duration in store
  store.setState((s) => ({
    playback: { ...s.playback, totalDurationMs, status: 'playing' },
    sim: { ...s.sim, particles },
  }))

  particleStateRef.particles = particles
  particleStateRef.material = state.material
  particleStateRef.container = state.container
  particleStateRef.containerPositionMm = 0

  function tick(timestamp: number): void {
    const s = store.getState()

    if (s.playback.status !== 'playing') {
      rafId = null
      lastTimestamp = null
      return
    }

    if (lastTimestamp === null) {
      lastTimestamp = timestamp
      rafId = requestAnimationFrame(tick)
      return
    }

    const wallDtS = Math.min((timestamp - lastTimestamp) / 1000, 0.05)  // cap at 50ms
    lastTimestamp = timestamp

    const simDtS = wallDtS * s.playback.speedMultiplier
    let nextTimeMs = s.playback.currentTimeMs + simDtS * 1000

    const total = s.playback.totalDurationMs

    if (nextTimeMs >= total) {
      if (s.playback.loop) {
        nextTimeMs = nextTimeMs % total
        // Re-init particles on loop
        const freshParticles = initParticles(s.container, s.material.params)
        store.setState((prev) => ({
          playback: { ...prev.playback, currentTimeMs: nextTimeMs },
          sim: { ...prev.sim, particles: freshParticles, containerPositionMm: 0, containerVelocityMms: 0, containerAccelMms2: 0 },
        }))
        particleStateRef.particles = freshParticles
        particleStateRef.containerPositionMm = 0
        rafId = requestAnimationFrame(tick)
        return
      } else {
        store.setState((prev) => ({
          playback: { ...prev.playback, status: 'idle', currentTimeMs: 0 },
        }))
        rafId = null
        lastTimestamp = null
        return
      }
    }

    // Evaluate motion program
    const { pos, vel, accel } = compiledProgram!.eval(nextTimeMs / 1000)

    // Advance physics
    const newParticles = pbdStep({
      particles: s.sim.particles,
      container: s.container,
      params: s.material.params,
      dt: simDtS,
      containerAccelX: accel,
    })

    // Write sim state
    const nextSim = {
      particles: newParticles,
      containerPositionMm: pos,
      containerVelocityMms: vel,
      containerAccelMms2: accel,
    }

    store.setState((prev) => ({
      playback: { ...prev.playback, currentTimeMs: nextTimeMs },
      sim: nextSim,
    }))

    // Keep renderer ref in sync (avoids React re-renders)
    particleStateRef.particles = newParticles
    particleStateRef.containerPositionMm = pos
    particleStateRef.material = s.material
    particleStateRef.container = s.container

    // Plot buffer (sampled at ~10fps)
    plotFrameCounter++
    if (plotFrameCounter >= PLOT_SAMPLE_EVERY) {
      plotFrameCounter = 0
      store.getState().appendPlot(nextTimeMs, pos, vel, accel)
    }

    // Track active step for editor highlight
    highlightActiveStep(store, nextTimeMs)

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
}

export function stopSimLoop(store: StoreApi<AppStore>): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  lastTimestamp = null
  compiledProgram = null
  plotFrameCounter = 0
  store.setState((s) => ({
    playback: { ...s.playback, status: 'idle', currentTimeMs: 0 },
  }))
  store.getState().resetSim()
  store.getState().setActiveStepId(null)
}

export function pauseSimLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  lastTimestamp = null
}

/** Resume after pause — does NOT re-compile program */
export function resumeSimLoop(store: StoreApi<AppStore>): void {
  if (rafId !== null) return
  if (compiledProgram === null) {
    // Fallback: full restart
    startSimLoop(store)
    return
  }
  store.setState((s) => ({
    playback: { ...s.playback, status: 'playing' },
  }))
  function tick(timestamp: number): void {
    const s = store.getState()
    if (s.playback.status !== 'playing') { rafId = null; lastTimestamp = null; return }
    if (lastTimestamp === null) { lastTimestamp = timestamp; rafId = requestAnimationFrame(tick); return }
    const wallDtS = Math.min((timestamp - lastTimestamp) / 1000, 0.05)
    lastTimestamp = timestamp
    const simDtS = wallDtS * s.playback.speedMultiplier
    let nextTimeMs = s.playback.currentTimeMs + simDtS * 1000
    if (nextTimeMs >= s.playback.totalDurationMs) {
      store.setState((p) => ({ playback: { ...p.playback, status: 'idle', currentTimeMs: 0 } }))
      rafId = null; return
    }
    const { pos, vel, accel } = compiledProgram!.eval(nextTimeMs / 1000)
    const newParticles = pbdStep({ particles: s.sim.particles, container: s.container, params: s.material.params, dt: simDtS, containerAccelX: accel })
    store.setState((p) => ({
      playback: { ...p.playback, currentTimeMs: nextTimeMs },
      sim: { particles: newParticles, containerPositionMm: pos, containerVelocityMms: vel, containerAccelMms2: accel },
    }))

    // Keep renderer ref in sync (avoids React re-renders)
    particleStateRef.particles = newParticles
    particleStateRef.containerPositionMm = pos
    particleStateRef.material = s.material
    particleStateRef.container = s.container

    // Plot buffer (sampled at ~10fps)
    plotFrameCounter++
    if (plotFrameCounter >= PLOT_SAMPLE_EVERY) {
      plotFrameCounter = 0
      store.getState().appendPlot(nextTimeMs, pos, vel, accel)
    }

    // Track active step for editor highlight
    highlightActiveStep(store, nextTimeMs)

    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

function highlightActiveStep(store: StoreApi<AppStore>, currentTimeMs: number): void {
  const { program } = store.getState()
  let elapsed = 0
  for (const step of program.steps) {
    const segment = compiledProgram?.segments.find((seg) => seg.stepId === step.id)
    const dur = segment != null ? segment.durationS * 1000 : 0
    if (currentTimeMs <= elapsed + dur) {
      store.getState().setActiveStepId(step.id)
      return
    }
    elapsed += dur
  }
  store.getState().setActiveStepId(null)
}
