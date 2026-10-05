import { describe, expect, it } from 'vitest'
import { validWonSummary } from './game-summary-fixtures.js'
import { ProviderFailure } from './provider.js'
import { GeminiTrainingStepProvider, type GeminiTrainingGenerateContent } from './training-gemini-provider.js'
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
    expect(usage).toEqual([{ input: 21, output: 8 }])
    expect(JSON.stringify(calls)).not.toContain('test-key')
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
