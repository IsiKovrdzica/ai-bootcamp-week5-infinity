import { describe, expect, it } from 'vitest'
import {
  TRAINING_FOCUSES,
  TRAINING_PLAN_STOP_REASONS,
  type TrainingPlan,
} from './training-contracts.js'

describe('Week 05 browser-safe contracts', () => {
  it('exports only the approved closed public domains', () => {
    expect(TRAINING_FOCUSES).toEqual(['survival', 'efficiency', 'consistency'])
    expect(TRAINING_PLAN_STOP_REASONS).toContain('invalid_final_output')
    const plan: TrainingPlan = {
      summary: 'A completed-game baseline is available.',
      focus: 'efficiency',
      recommendation: 'Use the measured pace as your next-game baseline.',
      evidence: [{ id: 'game.bricks_per_minute', finding: 'Measured pace is available.' }],
      confidence: 'medium',
      completed: true,
    }
    expect(plan.completed).toBe(true)
  })
})
