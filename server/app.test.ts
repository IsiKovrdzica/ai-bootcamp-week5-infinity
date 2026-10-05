import { describe, expect, it } from 'vitest'
import { createAdviceService } from './ai/advice-service.js'
import { FakeAiAdviceProvider } from './ai/fake-provider.js'
import {
  invalidGameSummaryFixtures,
  validWonSummary,
} from './ai/game-summary-fixtures.js'
import { createApp, type AppResponse } from './app.js'
import { ProviderFailure } from './ai/provider.js'
import type { TrainingPlannerService } from './composition.js'
import { createTrainingPlannerService } from './composition.js'
import { TrainingAgentOrchestrator } from './ai/training-orchestrator.js'
import { ScriptedAgentModelProvider } from './ai/training-fake-provider.js'
import { createTrainingToolRegistry } from './ai/training-tool-registry.js'

const validAdvice = {
  summary: 'You cleared every brick.',
  recommendation: 'Center the paddle before the next return.',
  category: 'efficiency' as const,
}

const invalidEnvelope = {
  error: {
    code: 'INVALID_GAME_SUMMARY',
    message: 'Invalid game summary.',
  },
}

const unavailableEnvelope = {
  error: {
    code: 'AI_ADVICE_UNAVAILABLE',
    message: 'AI advice is temporarily unavailable. Please try again later.',
  },
}

function body(response: AppResponse): unknown {
  return JSON.parse(response.body)
}

function createFakeApp(options: ConstructorParameters<typeof FakeAiAdviceProvider>[0]) {
  const provider = new FakeAiAdviceProvider(options)
  return { provider, app: createApp(createAdviceService(provider)) }
}

describe('POST /api/ai/advice', () => {
  it('returns exact validated advice for valid JSON and fake success', async () => {
    const { provider, app } = createFakeApp({ mode: 'success', advice: validAdvice })

    const response = await app({
      method: 'POST',
      path: '/api/ai/advice',
      body: JSON.stringify(validWonSummary),
    })

    expect(response.status).toBe(200)
    expect(response.headers).toEqual({ 'content-type': 'application/json' })
    expect(body(response)).toEqual(validAdvice)
    expect(provider.providerCallCount).toBe(1)
  })

  it('returns the exact 400 envelope for malformed JSON with zero provider calls', async () => {
    const { provider, app } = createFakeApp({ mode: 'success', advice: validAdvice })

    const response = await app({
      method: 'POST',
      path: '/api/ai/advice',
      body: '{',
    })

    expect(response.status).toBe(400)
    expect(body(response)).toEqual(invalidEnvelope)
    expect(provider.providerCallCount).toBe(0)
  })

  it.each([null, ...invalidGameSummaryFixtures])(
    'returns exact 400 for invalid local input %# without provider invocation',
    async (invalidInput) => {
      const { provider, app } = createFakeApp({ mode: 'success', advice: validAdvice })

      const response = await app({
        method: 'POST',
        path: '/api/ai/advice',
        body: JSON.stringify(invalidInput),
      })

      expect(response.status).toBe(400)
      expect(body(response)).toEqual(invalidEnvelope)
      expect(provider.providerCallCount).toBe(0)
    },
  )

  it('returns exact 503 without diagnostics for provider failure', async () => {
    const { provider, app } = createFakeApp({ mode: 'permanentFailure' })

    const response = await app({
      method: 'POST',
      path: '/api/ai/advice',
      body: JSON.stringify(validWonSummary),
    })

    expect(response.status).toBe(503)
    expect(body(response)).toEqual(unavailableEnvelope)
    expect(provider.providerCallCount).toBe(1)
  })

  it('returns exact 503 without malformed provider fields', async () => {
    const { provider, app } = createFakeApp({
      mode: 'malformed',
      malformedOutput: { ...validAdvice, providerDetail: 'raw detail' },
    })

    const response = await app({
      method: 'POST',
      path: '/api/ai/advice',
      body: JSON.stringify(validWonSummary),
    })

    expect(response.status).toBe(503)
    expect(body(response)).toEqual(unavailableEnvelope)
    expect(JSON.stringify(body(response))).not.toContain('providerDetail')
    expect(provider.providerCallCount).toBe(1)
  })

  it('rejects a body above 16 KiB before provider invocation', async () => {
    const { provider, app } = createFakeApp({ mode: 'success', advice: validAdvice })

    const response = await app({
      method: 'POST',
      path: '/api/ai/advice',
      body: 'x'.repeat(16 * 1024 + 1),
    })

    expect(response.status).toBe(400)
    expect(body(response)).toEqual(invalidEnvelope)
    expect(provider.providerCallCount).toBe(0)
  })

  it('returns local 404 and 405 responses for unmatched path and method', async () => {
    const { app } = createFakeApp({ mode: 'success', advice: validAdvice })

    await expect(
      app({ method: 'POST', path: '/other', body: '' }),
    ).resolves.toEqual({
      status: 404,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { code: 'NOT_FOUND' } }),
    })
    await expect(
      app({ method: 'GET', path: '/api/ai/advice', body: '' }),
    ).resolves.toEqual({
      status: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED' } }),
    })
  })

  it('remains usable after a fake provider failure', async () => {
    const provider = {
      providerCallCount: 0,
      async generateAdvice() {
        this.providerCallCount += 1
        if (this.providerCallCount === 1) throw new ProviderFailure('permanent')
        return validAdvice
      },
    }
    const app = createApp(createAdviceService(provider))

    await expect(
      app({
        method: 'POST',
        path: '/api/ai/advice',
        body: JSON.stringify(validWonSummary),
      }),
    ).resolves.toMatchObject({ status: 503 })

    await expect(
      app({
        method: 'POST',
        path: '/api/ai/advice',
        body: JSON.stringify(validWonSummary),
      }),
    ).resolves.toMatchObject({ status: 200, body: JSON.stringify(validAdvice) })
    expect(provider.providerCallCount).toBe(2)
  })
})

describe('POST /api/ai/training-plan', () => {
  const completedRun = {
    runId: 'run_1', status: 'completed' as const, stopReason: 'completed' as const,
    stepCount: 2, providerAttemptCount: 2, toolCallCount: 1, elapsedMs: 4,
  }
  const completedPlan = {
    summary: 'The completed game supports an efficiency training focus.', focus: 'efficiency' as const,
    recommendation: 'For the next game, use the observed clear rate as a personal baseline.',
    evidence: [{ id: 'game.bricks_per_minute' as const, finding: 'Bricks per minute: 64.00 bricks/min.' }],
    confidence: 'medium' as const, completed: true as const,
  }
  function planner(result: Awaited<ReturnType<TrainingPlannerService['createTrainingPlan']>>) {
    let calls = 0
    const service: TrainingPlannerService = { async createTrainingPlan() { calls += 1; return result } }
    return { service, calls: () => calls }
  }

  it('is initially a 404 while the advice route remains available', async () => {
    const { app } = createFakeApp({ mode: 'success', advice: validAdvice })
    await expect(app({ method: 'POST', path: '/api/ai/training-plan', body: JSON.stringify(validWonSummary) }))
      .resolves.toMatchObject({ status: 404 })
  })

  it('returns the exact completed public envelope through the injected planner service', async () => {
    const fake = planner({ kind: 'completed', run: completedRun, plan: completedPlan })
    const app = createApp(createAdviceService(new FakeAiAdviceProvider({ mode: 'success', advice: validAdvice })), fake.service)
    const response = await app({ method: 'POST', path: '/api/ai/training-plan', body: JSON.stringify(validWonSummary) })
    expect(response.status).toBe(200)
    expect(body(response)).toEqual({ run: completedRun, plan: completedPlan })
    expect(fake.calls()).toBe(1)
  })

  it('uses the real bounded orchestrator through the HTTP composition path', async () => {
    const provider = new ScriptedAgentModelProvider([
      { type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_http' } } } },
      { type: 'resolve', value: { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } } },
    ])
    const plannerService = createTrainingPlannerService(new TrainingAgentOrchestrator({
      provider, registry: createTrainingToolRegistry(), clock: () => 1_000, createId: () => 'run_http', createContextId: () => 'ctx_http',
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {},
    }))
    const app = createApp(createAdviceService(new FakeAiAdviceProvider({ mode: 'success', advice: validAdvice })), plannerService)
    const response = await app({ method: 'POST', path: '/api/ai/training-plan', body: JSON.stringify(validWonSummary) })
    expect(body(response)).toEqual({
      run: { runId: 'run_http', status: 'completed', stopReason: 'completed', stepCount: 2, providerAttemptCount: 2, toolCallCount: 1, elapsedMs: 0 },
      plan: { summary: 'The completed game supports a consistency training focus.', focus: 'consistency', recommendation: 'For the next game, aim to repeat the completed clear.', evidence: [{ id: 'game.outcome', finding: 'Outcome: WON.' }, { id: 'game.completion_rate', finding: 'Completion rate: 100.00%.' }], confidence: 'high', completed: true },
    })
    expect(provider.adapterCallCount).toBe(2)
  })

  it.each(['{', 'x'.repeat(16 * 1024 + 1), JSON.stringify({ ...validWonSummary, outcome: 'PLAYING' })])(
    'returns the exact 400 envelope before planner work for invalid input', async (input) => {
      const fake = planner({ kind: 'completed', run: completedRun, plan: completedPlan })
      const app = createApp(createAdviceService(new FakeAiAdviceProvider({ mode: 'success', advice: validAdvice })), fake.service)
      const response = await app({ method: 'POST', path: '/api/ai/training-plan', body: input })
      expect(response).toEqual({ status: 400, headers: { 'content-type': 'application/json' }, body: JSON.stringify(invalidEnvelope) })
      expect(fake.calls()).toBe(0)
    },
  )

  it.each([
    ['rejected', { kind: 'rejected' as const, run: { ...completedRun, status: 'stopped' as const, stopReason: 'unknown_tool' as const, toolCallCount: 0 } }, 422, 'TRAINING_PLAN_REJECTED'],
    ['unavailable', { kind: 'unavailable' as const, run: { ...completedRun, status: 'failed' as const, stopReason: 'provider_failure' as const } }, 503, 'TRAINING_PLAN_UNAVAILABLE'],
  ])('maps controlled %s results without internal details', async (_name, result, status, code) => {
    const fake = planner(result)
    const app = createApp(createAdviceService(new FakeAiAdviceProvider({ mode: 'success', advice: validAdvice })), fake.service)
    const response = await app({ method: 'POST', path: '/api/ai/training-plan', body: JSON.stringify(validWonSummary) })
    expect(response.status).toBe(status)
    expect(body(response)).toEqual({ run: result.run, error: { code, message: status === 422 ? 'Training plan could not be completed safely.' : 'Training plan is temporarily unavailable. Please try again later.' } })
    expect(JSON.stringify(body(response))).not.toContain('providerDetail')
  })

  it('retains local 405 and never leaks a thrown planner detail', async () => {
    const throwing: TrainingPlannerService = { async createTrainingPlan() { throw new Error('RAW_PROVIDER_STACK_SENTINEL') } }
    const app = createApp(createAdviceService(new FakeAiAdviceProvider({ mode: 'success', advice: validAdvice })), throwing)
    await expect(app({ method: 'GET', path: '/api/ai/training-plan', body: '' })).resolves.toEqual({
      status: 405, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED' } }),
    })
    const response = await app({ method: 'POST', path: '/api/ai/training-plan', body: JSON.stringify(validWonSummary) })
    expect(response.status).toBe(503)
    expect(response.body).not.toContain('RAW_PROVIDER_STACK_SENTINEL')
  })
})
