import { buildProgram } from './motionInterpolator'
import { initParticles, pbdStep, STRIDE } from './pbdSolver'
import type { AppStore } from '../store'
import type { StoreApi } from 'zustand'
import type { MaterialConfig, ContainerConfig } from '../types'

// ─── Renderer interface (read by SimViewport ticker every frame) ──────────────

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

// ─── Frame buffer (written by computeFrameBuffer, read by startReplayLoop) ───

export interface FrameBuffer {
  /** All frames packed: frame i starts at offset i * particleCount * STRIDE */
  packedParticles: Float32Array
  particleCount: number
  containerPositions: Float32Array   // mm per frame
  containerVelocities: Float32Array  // mm/s per frame
  containerAccels: Float32Array      // mm/s² per frame
  frameCount: number
  totalDurationMs: number
}

export const frameBufferRef: { current: FrameBuffer | null } = { current: null }

// ─── Module state ─────────────────────────────────────────────────────────────

let rafId: number | null = null
let lastTimestamp: number | null = null

// Cached compiled program — set in computeFrameBuffer, used in highlightActiveStep
let cachedCompiledProgram: ReturnType<typeof buildProgram> | null = null

// ─── Settling pass (idle render) ─────────────────────────────────────────────

const SETTLING_TICKS = 120
const SETTLE_DT = 1 / 60

/**
 * Runs 120 PBD ticks (gravity only, no container motion) on freshly-initialized
 * particles. Updates particleStateRef so SimViewport shows a settled rest state.
 * Called on mount and whenever container config changes at idle.
 */
export function runSettlingPass(store: StoreApi<AppStore>): void {
  const { container, material } = store.getState()
  let particles = initParticles(container, material.params)
  for (let i = 0; i < SETTLING_TICKS; i++) {
    particles = pbdStep({ particles, container, params: material.params, dt: SETTLE_DT, containerAccelX: 0 })
  }
  particleStateRef.particles = particles
  particleStateRef.containerPositionMm = 0
  particleStateRef.material = material
  particleStateRef.container = container
}

// ─── Compute phase ────────────────────────────────────────────────────────────

/**
 * Compiles the motion program, runs the full sim synchronously, and stores
 * every frame in frameBufferRef. Sets status='computing' before the run (with
 * a 50ms defer so React can paint the indicator), then status='playing' after.
 * Automatically starts the replay loop when done.
 */
export async function computeFrameBuffer(store: StoreApi<AppStore>): Promise<void> {
  const state = store.getState()

  // Clear any previous buffer and reset plot
  frameBufferRef.current = null
  store.setState((s) => ({
    playback: { ...s.playback, status: 'computing', hasBuffer: false, currentTimeMs: 0 },
  }))
  store.getState().resetSim()

  // Let React paint the "Computing..." state before we block the thread
  await new Promise<void>((resolve) => setTimeout(resolve, 50))

  // Honour a Stop that arrived during the defer window
  if (store.getState().playback.status !== 'computing') return

  const compiled = buildProgram(state.program)
  cachedCompiledProgram = compiled
  const totalDurationMs = compiled.totalDurationS * 1000
  const DT = 1 / 60
  const frameCount = Math.max(1, Math.ceil(totalDurationMs / (DT * 1000)))

  let particles = initParticles(state.container, state.material.params)
  const particleCount = particles.length / STRIDE

  // Allocate packed buffer: all frames × all particle components
  const packedParticles = new Float32Array(frameCount * particleCount * STRIDE)
  const containerPositions = new Float32Array(frameCount)
  const containerVelocities = new Float32Array(frameCount)
  const containerAccels = new Float32Array(frameCount)

  for (let i = 0; i < frameCount; i++) {
    const timeS = i * DT
    const { pos, vel, accel } = compiled.eval(timeS)

    particles = pbdStep({
      particles,
      container: state.container,
      params: state.material.params,
      dt: DT,
      containerAccelX: accel,
    })

    packedParticles.set(particles, i * particleCount * STRIDE)
    containerPositions[i] = pos
    containerVelocities[i] = vel
    containerAccels[i] = accel
  }

  // Derive static plot — downsample to at most 300 points
  const PLOT_POINTS = Math.min(300, frameCount)
  const plotStep = Math.max(1, Math.floor(frameCount / PLOT_POINTS))
  const plotTimes: number[] = []
  const plotPositions: number[] = []
  const plotVelocities: number[] = []
  const plotAccels: number[] = []
  for (let i = 0; i < frameCount; i += plotStep) {
    plotTimes.push(i * DT * 1000)
    plotPositions.push(containerPositions[i])
    plotVelocities.push(containerVelocities[i])
    plotAccels.push(containerAccels[i])
  }
  store.getState().setStaticPlot({
    times: plotTimes,
    positions: plotPositions,
    velocities: plotVelocities,
    accels: plotAccels,
  })

  frameBufferRef.current = {
    packedParticles,
    particleCount,
    containerPositions,
    containerVelocities,
    containerAccels,
    frameCount,
    totalDurationMs,
  }

  store.setState((s) => ({
    playback: {
      ...s.playback,
      status: 'playing',
      hasBuffer: true,
      totalDurationMs,
      currentTimeMs: 0,
    },
  }))

  // Update particleStateRef to frame 0
  particleStateRef.particles = packedParticles.subarray(0, particleCount * STRIDE)
  particleStateRef.containerPositionMm = 0
  particleStateRef.material = state.material
  particleStateRef.container = state.container

  startReplayLoop(store)
}

// ─── Replay loop ──────────────────────────────────────────────────────────────

export function startReplayLoop(store: StoreApi<AppStore>): void {
  if (rafId !== null) return
  lastTimestamp = null

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

    const buf = frameBufferRef.current
    if (!buf) { rafId = null; return }

    const wallDtMs = Math.min(timestamp - lastTimestamp, 50)
    lastTimestamp = timestamp

    let nextTimeMs = s.playback.currentTimeMs + wallDtMs * s.playback.speedMultiplier

    if (nextTimeMs >= buf.totalDurationMs) {
      if (s.playback.loop) {
        nextTimeMs = 0
      } else {
        nextTimeMs = buf.totalDurationMs
        const fi = buf.frameCount - 1
        _writeFrame(buf, fi, store)
        store.setState((p) => ({
          playback: { ...p.playback, status: 'idle', currentTimeMs: nextTimeMs },
        }))
        rafId = null
        lastTimestamp = null
        return
      }
    }

    const frameIdx = Math.min(
      Math.floor(nextTimeMs / (buf.totalDurationMs / buf.frameCount)),
      buf.frameCount - 1,
    )

    _writeFrame(buf, frameIdx, store)

    store.setState((p) => ({
      playback: { ...p.playback, currentTimeMs: nextTimeMs },
    }))

    highlightActiveStep(store, nextTimeMs)
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
}

export function pauseReplayLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  lastTimestamp = null
}

export function stopReplayLoop(store: StoreApi<AppStore>): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  lastTimestamp = null
  store.setState((s) => ({
    playback: { ...s.playback, status: 'idle', currentTimeMs: 0 },
  }))
  store.getState().setActiveStepId(null)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _writeFrame(buf: FrameBuffer, frameIdx: number, store: StoreApi<AppStore>): void {
  const offset = frameIdx * buf.particleCount * STRIDE
  particleStateRef.particles = buf.packedParticles.subarray(offset, offset + buf.particleCount * STRIDE)
  particleStateRef.containerPositionMm = buf.containerPositions[frameIdx]
  const s = store.getState()
  particleStateRef.material = s.material
  particleStateRef.container = s.container
}

function highlightActiveStep(store: StoreApi<AppStore>, currentTimeMs: number): void {
  if (!cachedCompiledProgram) return
  const { program } = store.getState()
  let elapsed = 0
  for (const step of program.steps) {
    const segment = cachedCompiledProgram.segments.find((seg) => seg.stepId === step.id)
    const dur = segment != null ? segment.durationS * 1000 : 0
    if (currentTimeMs <= elapsed + dur) {
      store.getState().setActiveStepId(step.id)
      return
    }
    elapsed += dur
  }
  store.getState().setActiveStepId(null)
}
