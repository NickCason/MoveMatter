// ─── Persisted (saved to .movematter.json) ───────────────────────────────────

export type ProfileType = 'trapezoidal' | 'scurve' | 'constant'

export interface MoveStep {
  type: 'move'
  id: string
  displacement: number    // mm, signed (+ forward / - reverse)
  maxVelocity: number     // mm/s
  acceleration: number    // mm/s²
  deceleration: number    // mm/s²
  accelJerk: number       // mm/s³ (0 = trapezoidal)
  decelJerk: number       // mm/s³
  profileType: ProfileType
}

export interface DelayStep {
  type: 'delay'
  id: string
  duration: number        // ms
}

export type MotionStep = MoveStep | DelayStep

export interface MotionProgram {
  id: string
  name: string
  axisLength: number      // total track length in mm
  steps: MotionStep[]
}

export interface ContainerConfig {
  widthMm: number
  heightMm: number
  fillPercent: number     // 0–100
  wallThicknessMm: number
}

export type MaterialPreset = 'water' | 'oil' | 'dry-powder' | 'coarse-granular' | 'custom'

export interface PBDParams {
  restDensity: number
  pressureStiffness: number
  viscosity: number
  restitution: number     // wall bounce 0–1
  friction: number        // wall friction 0–1
  particleRadius: number  // mm
}

export interface MaterialConfig {
  preset: MaterialPreset
  params: PBDParams
}

export interface MoveMatterFile {
  version: 1
  program: MotionProgram
  container: ContainerConfig
  material: MaterialConfig
}

// ─── Runtime-only (Zustand, never persisted) ─────────────────────────────────

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'computing'

export interface PlaybackState {
  status: PlaybackStatus
  currentTimeMs: number
  totalDurationMs: number
  speedMultiplier: 0.25 | 0.5 | 1 | 2 | 4
  loop: boolean
  hasBuffer: boolean    // true when a FrameBuffer exists and replay is available
}

export interface SimState {
  particles: Float32Array   // interleaved [x, y, vx, vy] per particle (STRIDE=4)
  containerPositionMm: number
  containerVelocityMms: number
  containerAccelMms2: number
}

export interface StaticPlot {
  times: number[]       // ms, evenly sampled from 0 → totalDurationMs (~300 points)
  positions: number[]   // mm
  velocities: number[]  // mm/s
  accels: number[]      // mm/s²
}

export type Theme = 'light' | 'dark'

export interface UIState {
  theme: Theme
  presentationMode: boolean
  activeStepId: string | null
}

// ─── Sim loop output ──────────────────────────────────────────────────────────

export interface MotionSample {
  pos: number     // mm
  vel: number     // mm/s
  accel: number   // mm/s²
}
