import { useRef } from 'react'
import { useStore } from '../store'
import type { MotionStep } from '../types'
import { MoveRow } from './MoveRow'
import { DelayRow } from './DelayRow'
import type { StepError } from '../utils/validation'

interface Props {
  stepErrors: StepError[]
}

export function MoveList({ stepErrors }: Props) {
  const steps = useStore((s) => s.program.steps)
  const reorderSteps = useStore((s) => s.reorderSteps)
  const dragIndexRef = useRef<number | null>(null)

  function errorFor(id: string): string | undefined {
    return stepErrors.find((e) => e.stepId === id)?.message
  }

  function handleDragStart(index: number) {
    dragIndexRef.current = index
  }

  function handleDrop(targetIndex: number) {
    const from = dragIndexRef.current
    if (from === null || from === targetIndex) return
    reorderSteps(from, targetIndex)
    dragIndexRef.current = null
  }

  if (steps.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>
        No steps yet — add a move or delay.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map((step: MotionStep, index: number) => {
        const dragHandleProps = {
          draggable: true as const,
          onDragStart: () => handleDragStart(index),
          onDragOver: (e: React.DragEvent) => { e.preventDefault() },
          onDrop: () => handleDrop(index),
        }

        return step.type === 'move' ? (
          <MoveRow
            key={step.id}
            step={step}
            error={errorFor(step.id)}
            dragHandleProps={dragHandleProps}
          />
        ) : (
          <DelayRow
            key={step.id}
            step={step}
            error={errorFor(step.id)}
            dragHandleProps={dragHandleProps}
          />
        )
      })}
    </div>
  )
}
