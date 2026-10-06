import { describe, expect, it } from 'vitest'
import { TrainingController, type TrainingState } from './training-controller.js'
import { CoachController } from './coach-controller.js'
import type { TrainingPlanTransport, TrainingPlanTransportResult } from './training-api-client.js'
import type { GameSummary } from './contracts.js'

const summary: GameSummary = { outcome: 'GAME_OVER', score: 40, bricksDestroyed: 4, livesRemaining: 0, livesLost: 3, durationSeconds: 18 }

describe('TrainingController', () => {
  it('requires a terminal summary and explicit request, enters pending synchronously, prevents duplicate work, settles safely, and permits retry', async () => {
    const states: TrainingState[] = []
    const first = deferred<TrainingPlanTransportResult>()
    const second = deferred<TrainingPlanTransportResult>()
    let calls = 0
    let controller: TrainingController
    const transport: TrainingPlanTransport = () => {
      expect(controller.state.kind).toBe('pending')
      calls += 1
      return calls === 1 ? first.promise : second.promise
    }
    controller = new TrainingController({ transport, onStateChange: (state) => states.push(state) })

    controller.requestPlan()
    expect(calls).toBe(0)
    controller.showTerminal(summary)
    expect(controller.state).toEqual({ kind: 'idle' })
    controller.requestPlan()
    controller.requestPlan()
    expect(calls).toBe(1)
    expect(controller.state).toEqual({ kind: 'pending' })
    first.resolve({ ok: false })
    await settle()
    expect(controller.state).toEqual({ kind: 'failure' })
    controller.requestPlan()
    expect(calls).toBe(2)
    second.resolve({ ok: true, kind: 'completed', plan: plan() })
    await settle()
    expect(controller.state).toEqual({ kind: 'success', plan: plan() })
    expect(states.map((state) => state.kind)).toEqual(['hidden', 'idle', 'pending', 'failure', 'pending', 'success'])
  })

  it('aborts, clears, advances the session, and ignores an older completion after restart', async () => {
    const pending = deferred<TrainingPlanTransportResult>()
    let signal: AbortSignal | undefined
    const controller = new TrainingController({
      transport: (_summary, options) => { signal = options?.signal; return pending.promise },
      onStateChange: () => {},
    })
    controller.showTerminal(summary)
    const oldSession = controller.sessionId
    controller.requestPlan()
    controller.restart()
    expect(signal?.aborted).toBe(true)
    expect(controller.sessionId).toBe(oldSession + 1)
    expect(controller.state).toEqual({ kind: 'hidden' })
    pending.resolve({ ok: true, kind: 'completed', plan: plan() })
    await settle()
    expect(controller.state).toEqual({ kind: 'hidden' })
  })

  it('keeps the existing Coach controller independent', async () => {
    const plannerPending = deferred<TrainingPlanTransportResult>()
    const coachPending = deferred<{ ok: true; advice: { summary: string; recommendation: string; category: 'survival' } }>()
    const planner = new TrainingController({ transport: () => plannerPending.promise, onStateChange: () => {} })
    const coach = new CoachController({ transport: () => coachPending.promise, onStateChange: () => {} })
    planner.showTerminal(summary); coach.showTerminal(summary)
    planner.requestPlan()
    expect(planner.state.kind).toBe('pending')
    expect(coach.state.kind).toBe('idle')
    coach.requestAdvice()
    expect(coach.state.kind).toBe('pending')
    plannerPending.resolve({ ok: false }); coachPending.resolve({ ok: true, advice: { summary: 'Safe advice.', recommendation: 'Keep practicing.', category: 'survival' } })
    await settle()
    expect(planner.state.kind).toBe('failure')
    expect(coach.state.kind).toBe('success')
  })
})

function plan() {
  return { summary: 'Evidence is available.', focus: 'survival' as const, recommendation: 'Protect the remaining lives.', evidence: [{ id: 'game.lives' as const, finding: 'Lives were lost.' }], confidence: 'medium' as const, completed: true as const }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((next) => { resolve = next }); return { promise, resolve } }
async function settle() { await Promise.resolve(); await Promise.resolve() }
