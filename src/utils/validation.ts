import type { MotionProgram, MoveStep } from '../types'

export interface StepError {
  stepId: string
  message: string
}

export interface ValidationResult {
  stepErrors: StepError[]
  overTravelWarning: string | null
  hasBlockingError: boolean
}

export function validateProgram(program: MotionProgram): ValidationResult {
  const stepErrors: StepError[] = []
  let totalDisplacement = 0

  for (const step of program.steps) {
    if (step.type === 'delay') {
      if (step.duration <= 0) {
        stepErrors.push({ stepId: step.id, message: 'Duration must be > 0' })
      }
      continue
    }

    const m = step as MoveStep

    if (m.maxVelocity <= 0) {
      stepErrors.push({ stepId: m.id, message: 'Max velocity must be > 0' })
    }

    if (m.profileType !== 'constant') {
      if (m.acceleration <= 0) {
        stepErrors.push({ stepId: m.id, message: 'Acceleration must be > 0' })
      }
      if (m.deceleration <= 0) {
        stepErrors.push({ stepId: m.id, message: 'Deceleration must be > 0' })
      }
    }

    if (m.profileType === 'scurve') {
      if (m.accelJerk <= 0) {
        stepErrors.push({ stepId: m.id, message: 'Accel jerk must be > 0 for S-curve' })
      }
      if (m.decelJerk <= 0) {
        stepErrors.push({ stepId: m.id, message: 'Decel jerk must be > 0 for S-curve' })
      }
    }

    if (m.displacement === 0) {
      stepErrors.push({ stepId: m.id, message: 'Warning: displacement is 0 (no-op move)' })
    }

    totalDisplacement += m.displacement
  }

  const overTravelWarning =
    Math.abs(totalDisplacement) > program.axisLength
      ? `Over-travel: total displacement ${totalDisplacement.toFixed(0)} mm exceeds axis length ${program.axisLength} mm`
      : null

  const hasBlockingError = stepErrors.some(
    (e) => !e.message.startsWith('Warning:')
  )

  return { stepErrors, overTravelWarning, hasBlockingError }
}
