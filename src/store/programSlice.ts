import { nanoid } from 'nanoid'
import type { MotionProgram, MotionStep, MoveStep, DelayStep } from '../types'

export interface ProgramSlice {
  program: MotionProgram
  addMove: () => void
  addDelay: () => void
  updateStep: (id: string, patch: Partial<MoveStep> | Partial<DelayStep>) => void
  removeStep: (id: string) => void
  reorderSteps: (fromIndex: number, toIndex: number) => void
  setProgram: (program: MotionProgram) => void
}

export const defaultMove = (): MoveStep => ({
  type: 'move',
  id: nanoid(),
  displacement: 100,
  maxVelocity: 500,
  acceleration: 1000,
  deceleration: 1000,
  accelJerk: 0,
  decelJerk: 0,
  profileType: 'trapezoidal',
})

export const defaultDelay = (): DelayStep => ({
  type: 'delay',
  id: nanoid(),
  duration: 500,
})

export const defaultProgram = (): MotionProgram => ({
  id: nanoid(),
  name: 'Untitled Program',
  axisLength: 600,
  steps: [],
})

export const createProgramSlice = (set: any): ProgramSlice => ({
  program: defaultProgram(),
  addMove: () =>
    set((s: any) => ({
      program: { ...s.program, steps: [...s.program.steps, defaultMove()] },
    })),
  addDelay: () =>
    set((s: any) => ({
      program: { ...s.program, steps: [...s.program.steps, defaultDelay()] },
    })),
  updateStep: (id, patch) =>
    set((s: any) => ({
      program: {
        ...s.program,
        steps: s.program.steps.map((step: MotionStep) =>
          step.id === id ? { ...step, ...patch } : step
        ),
      },
    })),
  removeStep: (id) =>
    set((s: any) => ({
      program: {
        ...s.program,
        steps: s.program.steps.filter((step: MotionStep) => step.id !== id),
      },
    })),
  reorderSteps: (fromIndex, toIndex) =>
    set((s: any) => {
      const steps = [...s.program.steps]
      const [moved] = steps.splice(fromIndex, 1)
      steps.splice(toIndex, 0, moved)
      return { program: { ...s.program, steps } }
    }),
  setProgram: (program) => set({ program }),
})
