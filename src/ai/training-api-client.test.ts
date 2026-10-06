import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createTrainingPlanTransport } from './training-api-client.js'
import type { GameSummary } from './contracts.js'
import type { TrainingPlan } from './training-contracts.js'

const summary: GameSummary = {
  outcome: 'WON', score: 320, bricksDestroyed: 32,
  livesRemaining: 2, livesLost: 1, durationSeconds: 42.5,
}

const plan: TrainingPlan = {
  summary: 'Completed-game evidence is available.', focus: 'efficiency',
  recommendation: 'Use the measured pace as a next-game baseline.',
  evidence: [{ id: 'game.bricks_per_minute', finding: 'Measured pace is available.' }],
  confidence: 'medium', completed: true,
}

const completed = {
  run: { runId: 'run_1', status: 'completed', stopReason: 'completed', stepCount: 2, providerAttemptCount: 2, toolCallCount: 1, elapsedMs: 12 },
  plan,
}

describe('browser training-plan transport', () => {
  it('posts only the exact GameSummary to the training-plan route and accepts an exact completed envelope', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const transport = createTrainingPlanTransport(async (input, init) => {
      calls.push({ input, init })
      return jsonResponse(completed, 200)
    })

    await expect(transport(summary)).resolves.toEqual({ ok: true, kind: 'completed', plan })
    expect(calls).toHaveLength(1)
    expect(calls[0].input).toBe('/api/ai/training-plan')
    expect(calls[0].init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(summary) })
  })

  it.each([
    [422, { run: { ...completed.run, status: 'stopped', stopReason: 'invalid_final_output' }, error: { code: 'TRAINING_PLAN_REJECTED', message: 'Training plan could not be completed safely.' } }],
    [503, { run: { ...completed.run, status: 'failed', stopReason: 'provider_failure' }, error: { code: 'TRAINING_PLAN_UNAVAILABLE', message: 'Training plan is temporarily unavailable. Please try again later.' } }],
  ])('accepts exact safe non-success envelope for HTTP %i', async (status, body) => {
    const transport = createTrainingPlanTransport(async () => jsonResponse(body, status))
    await expect(transport(summary)).resolves.toEqual({ ok: false })
  })

  it('rejects malformed and extra server data as one safe failure', async () => {
    const transport = createTrainingPlanTransport(async () => jsonResponse({ ...completed, providerDetail: 'unsafe' }, 200))
    await expect(transport(summary)).resolves.toEqual({ ok: false })
  })

  it('keeps planner browser modules free of backend, SDK, environment, model, and prompt ownership', () => {
    for (const sourceUrl of [new URL('./training-api-client.ts', import.meta.url), new URL('./training-contracts.ts', import.meta.url)]) {
      const source = readFileSync(sourceUrl, 'utf8')
      expect(source).not.toMatch(/server\/|@google\/genai|GEMINI_|import\.meta\.env|prompt|Gemini|tool registry|provider retry|configuration/i)
    }
  })
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
