import { describe, expect, it } from 'vitest'
import { validWonSummary } from './game-summary-fixtures.js'
import { ProviderFailure } from './provider.js'
import { GEMINI_FALLBACK_MODEL } from './config.js'
import { GeminiTrainingStepProvider, type GeminiTrainingGenerateContent } from './training-gemini-provider.js'
import { TRAINING_STEP_JSON_SCHEMAS } from './training-prompt.js'
import type { ModelStepRequest } from './training-provider.js'

const request: ModelStepRequest = { schemaVersion: 1, promptVersion: 'brickpulse-training-planner/v1', phase: 'select_tool', goal: 'analyze_completed_game_for_next_game_improvement', gameSummary: validWonSummary, run: { runId: 'run_1', gameContextId: 'ctx_1', contextVersion: 1, stepNumber: 1, remainingSteps: 2, remainingToolCalls: 2, remainingProviderAttempts: 6, deadlineAt: '2026-10-06T12:00:00.000Z' }, availableTools: [{ name: 'analyze_game_performance', description: 'Deterministic completed-game performance analysis.', inputSchema: { type: 'object', additionalProperties: false, required: ['gameContextId'], properties: { gameContextId: { type: 'string', minLength: 1, maxLength: 64 } } } }], evidence: null }

describe('GeminiTrainingStepProvider', () => {
  it('makes one injected structured transport attempt, forwards abort, returns parsed unknown, and safely projects only finite token counts', async () => {
    const calls: unknown[] = []; const usage: unknown[] = []
    const transport: GeminiTrainingGenerateContent = async value => { calls.push(value); return { text: '{"kind":"tool_request","toolRequest":{"name":"analyze_game_performance","arguments":{"gameContextId":"ctx_1"}}}', usageMetadata: { promptTokenCount: 21, candidatesTokenCount: 8, raw: 'DO_NOT_PROJECT' } } }
    const controller = new AbortController()
    const provider = new GeminiTrainingStepProvider({ apiKey: 'test-key', model: 'test-model' }, transport, value => usage.push(value))
    const output: unknown = await provider.generateStep(request, { signal: controller.signal })
    expect(output).toEqual({ kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } })
    expect(calls).toEqual([expect.objectContaining({ model: 'test-model', config: expect.objectContaining({ abortSignal: controller.signal, responseMimeType: 'application/json', responseJsonSchema: expect.any(Object), httpOptions: { retryOptions: { attempts: 1 } } }) })])
    expect((calls[0] as { config: { responseJsonSchema: unknown } }).config.responseJsonSchema).toEqual(TRAINING_STEP_JSON_SCHEMAS.select_tool)
    expect(usage).toEqual([{ input: 21, output: 8 }])
    expect(JSON.stringify(calls)).not.toContain('test-key')
  })

  it('uses the produce-final schema in one injected primary transport attempt and parses the final response as unknown', async () => {
    const calls: unknown[] = []
    const controller = new AbortController()
    const finalRequest: ModelStepRequest = { ...request, phase: 'produce_final', run: { ...request.run, stepNumber: 2, remainingSteps: 1 }, availableTools: [], evidence: { schemaVersion: 1, gameContextId: 'ctx_1', outcome: 'WON', score: 320, bricksDestroyed: 32, totalBricks: 32, completionRate: 1, durationSeconds: 30, bricksPerMinute: 64, livesLost: 0, livesRemaining: 3, evidence: [{ id: 'game.outcome', metric: 'Outcome', value: 'WON' }] } }
    const response = { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } }
    const provider = new GeminiTrainingStepProvider({ apiKey: 'test-key', model: 'primary-model' }, async value => { calls.push(value); return { text: JSON.stringify(response) } })
    await expect(provider.generateStep(finalRequest, { signal: controller.signal })).resolves.toEqual(response)
    expect(calls).toEqual([expect.objectContaining({ model: 'primary-model', config: expect.objectContaining({ abortSignal: controller.signal, responseJsonSchema: TRAINING_STEP_JSON_SCHEMAS.produce_final, httpOptions: { retryOptions: { attempts: 1 } } }) })])
    expect((calls[0] as { config: { responseJsonSchema: unknown } }).config.responseJsonSchema).not.toEqual(TRAINING_STEP_JSON_SCHEMAS.select_tool)
  })

  it.each([
    ['select_tool' as const, request, { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } }, TRAINING_STEP_JSON_SCHEMAS.select_tool],
    ['produce_final' as const, { ...request, phase: 'produce_final' as const, run: { ...request.run, stepNumber: 2 as const, remainingSteps: 1 as const }, availableTools: [], evidence: { schemaVersion: 1 as const, gameContextId: 'ctx_1', outcome: 'WON' as const, score: 320, bricksDestroyed: 32, totalBricks: 32 as const, completionRate: 1, durationSeconds: 30, bricksPerMinute: 64, livesLost: 0, livesRemaining: 3, evidence: [{ id: 'game.outcome' as const, metric: 'Outcome', value: 'WON' }] } } satisfies ModelStepRequest, { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } }, TRAINING_STEP_JSON_SCHEMAS.produce_final],
  ])('uses the fixed fallback model for %s with its exact schema in one injected transport attempt', async (_phase, fallbackRequest, response, schema) => {
    const calls: unknown[] = []
    const provider = new GeminiTrainingStepProvider({ apiKey: 'test-key', model: GEMINI_FALLBACK_MODEL }, async value => { calls.push(value); return { text: JSON.stringify(response) } })
    await expect(provider.generateStep(fallbackRequest, { signal: new AbortController().signal })).resolves.toEqual(response)
    expect(calls).toEqual([expect.objectContaining({ model: GEMINI_FALLBACK_MODEL, config: expect.objectContaining({ responseJsonSchema: schema, httpOptions: { retryOptions: { attempts: 1 } } }) })])
    expect((calls[0] as { model: string }).model).not.toBe('primary-model')
  })

  it.each([[new TypeError('network'), 'transient'], [{ status: 408 }, 'transient'], [{ status: 429 }, 'transient'], [{ status: 404 }, 'provider_unavailable'], [{ status: 500 }, 'provider_unavailable'], [{ status: 502 }, 'provider_unavailable'], [{ status: 503 }, 'provider_unavailable'], [{ status: 401 }, 'auth'], [{ status: 404, message: 'unsupported model' }, 'configuration'], [{ status: 400, message: 'safety blocked' }, 'safety'], [{ status: 400 }, 'permanent'], [{ message: 'unexpected' }, 'programming']] as const)('normalizes raw transport failure without exposing it: %#', async (error, kind) => {
    const provider = new GeminiTrainingStepProvider({ apiKey: 'test-key', model: 'test-model' }, async () => { throw error })
    await expect(provider.generateStep(request, { signal: new AbortController().signal })).rejects.toMatchObject({ kind } satisfies Partial<ProviderFailure>)
  })

  it('maps abort and malformed provider text to closed failures without retrying itself', async () => {
    const aborted = new AbortController(); aborted.abort()
    const cancelled = new GeminiTrainingStepProvider({ apiKey: 'test-key', model: 'test-model' }, async () => ({ text: '{}' }))
    await expect(cancelled.generateStep(request, { signal: aborted.signal })).rejects.toMatchObject({ kind: 'client_cancelled' })
    const malformed = new GeminiTrainingStepProvider({ apiKey: 'test-key', model: 'test-model' }, async () => ({ text: '{bad' }))
    await expect(malformed.generateStep(request, { signal: new AbortController().signal })).rejects.toMatchObject({ kind: 'invalid_output' })
  })

  it('passes a permitted refusal through as unknown and omits invalid usage metadata', async () => {
    const usage: unknown[] = []
    const provider = new GeminiTrainingStepProvider({ apiKey: 'test-key', model: 'test-model' }, async () => ({ text: '{"kind":"refusal"}', usageMetadata: { promptTokenCount: -1, candidatesTokenCount: Number.NaN } }), value => usage.push(value))
    await expect(provider.generateStep(request, { signal: new AbortController().signal })).resolves.toEqual({ kind: 'refusal' })
    expect(usage).toEqual([])
  })

  it('contains a throwing token observer without changing a successful adapter result', async () => {
    const provider = new GeminiTrainingStepProvider({ apiKey: 'test-key', model: 'test-model' }, async () => ({ text: '{"kind":"refusal"}', usageMetadata: { promptTokenCount: 21 } }), () => { throw new Error('observer sentinel') })
    await expect(provider.generateStep(request, { signal: new AbortController().signal, onTokenUsage: () => { throw new Error('attempt observer sentinel') } })).resolves.toEqual({ kind: 'refusal' })
  })
})
