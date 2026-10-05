import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { createGeminiTrainingPlannerService, createProductionAdviceService, createProductionTrainingPlannerService } from './composition.js'
import { validWonSummary } from './ai/game-summary-fixtures.js'

describe('production advice composition', () => {
  it('maps missing backend Gemini configuration through the existing safe 503 response', async () => {
    const app = createApp(createProductionAdviceService({}))
    const response = await app({
      method: 'POST',
      path: '/api/ai/advice',
      body: JSON.stringify(validWonSummary),
    })

    expect(response).toEqual({
      status: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 'AI_ADVICE_UNAVAILABLE',
          message: 'AI advice is temporarily unavailable. Please try again later.',
        },
      }),
    })
  })
})

describe('production training planner composition', () => {
  it('keeps invalid server configuration unavailable without constructing a planner', async () => {
    let constructions = 0
    const service = createProductionTrainingPlannerService({}, () => {
      constructions += 1
      throw new Error('must not construct')
    })
    expect(await service.createTrainingPlan(validWonSummary)).toMatchObject({ kind: 'unavailable' })
    expect(constructions).toBe(0)
  })

  it('injects only the fixed fallback identity into a configured planner factory', async () => {
    let fallbackModel = ''
    const service = createProductionTrainingPlannerService(
      { GEMINI_API_KEY: 'configured', GEMINI_MODEL: 'configured' },
      (_configuration, fallback) => {
        fallbackModel = fallback
        return {
          async createTrainingPlan() {
            return { kind: 'unavailable' as const, run: { runId: 'unavailable', status: 'failed' as const, stopReason: 'provider_failure' as const, stepCount: 0, providerAttemptCount: 0, toolCallCount: 0, elapsedMs: 0 } }
          },
        }
      },
    )
    await service.createTrainingPlan(validWonSummary)
    expect(fallbackModel).toBe('gemini-3.5-flash-lite')
  })

  it('constructs the actual Gemini training composition with configured primary and exactly fixed fallback providers', async () => {
    const models: string[] = []; let constructions = 0
    const service = createGeminiTrainingPlannerService({ apiKey: 'test-key', model: 'primary-model' }, 'gemini-3.5-flash-lite', configuration => {
      models.push(configuration.model); constructions++
      return constructions === 1
        ? { async generateStep(request) { return request.phase === 'select_tool' ? { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: request.run.gameContextId } } } : { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } } } }
        : { async generateStep() { throw new Error('fixed fallback must not be selected for successful primary calls') } }
    })
    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'completed' })
    expect(models).toEqual(['primary-model', 'gemini-3.5-flash-lite'])
  })

  it('projects missing planner configuration as the exact safe 503 public envelope', async () => {
    const app = createApp(
      createProductionAdviceService({}),
      createProductionTrainingPlannerService({}),
    )
    await expect(app({ method: 'POST', path: '/api/ai/training-plan', body: JSON.stringify(validWonSummary) })).resolves.toEqual({
      status: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        run: { runId: 'unavailable', status: 'failed', stopReason: 'provider_failure', stepCount: 0, providerAttemptCount: 0, toolCallCount: 0, elapsedMs: 0 },
        error: { code: 'TRAINING_PLAN_UNAVAILABLE', message: 'Training plan is temporarily unavailable. Please try again later.' },
      }),
    })
  })
})
