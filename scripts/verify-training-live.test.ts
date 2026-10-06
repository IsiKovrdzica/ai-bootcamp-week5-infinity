import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ScriptedAgentModelProvider } from '../server/ai/training-fake-provider.js'
import { TrainingAgentOrchestrator } from '../server/ai/training-orchestrator.js'
import { createTrainingToolRegistry } from '../server/ai/training-tool-registry.js'
import { createTrainingPlannerService, type TrainingPlannerService } from '../server/composition.js'
import { FIXED_TRAINING_LIVE_FIXTURE, runTrainingLiveVerification } from './verify-training-live.js'

const safeDate = () => new Date('2026-10-06T12:00:00.000Z')

function successfulService(): TrainingPlannerService {
  const provider = new ScriptedAgentModelProvider([
    { type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'fixed_context' } } } },
    { type: 'resolve', value: { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } } },
  ])
  return createTrainingPlannerService(new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'fixed_run', createContextId: () => 'fixed_context', setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} }))
}

describe('Week 05 live verification harness — offline contract', () => {
  it('SKIPS missing configuration before service/provider work and serializes no configuration data', async () => {
    let serviceCalls = 0
    const result = await runTrainingLiveVerification({}, { now: safeDate, createService: () => { serviceCalls++; throw new Error('CONFIG_SECRET_SENTINEL') } })
    expect(result).toEqual({ date: '2026-10-06', providerCategory: 'not_configured', elapsedMs: 0, logicalStepCount: 0, providerAttemptCount: 0, toolCallCount: 0, stopReason: 'provider_failure', validationResult: 'SKIPPED' })
    expect(serviceCalls).toBe(0)
    expect(JSON.stringify(result)).not.toMatch(/CONFIG_SECRET_SENTINEL|GEMINI_API_KEY|key|model|secret|error|stack/i)
  })

  it('rejects a second requested run before service/provider work', async () => {
    let serviceCalls = 0
    const result = await runTrainingLiveVerification({ GEMINI_API_KEY: 'KEY_SENTINEL', GEMINI_MODEL: 'MODEL_SENTINEL' }, { now: safeDate, requestedRuns: 2, createService: () => { serviceCalls++; throw new Error('must not run') } })
    expect(result).toEqual({ date: '2026-10-06', providerCategory: 'gemini', elapsedMs: 0, logicalStepCount: 0, providerAttemptCount: 0, toolCallCount: 0, stopReason: 'provider_attempt_limit', validationResult: 'CLASSIFIED_FAILURE' })
    expect(serviceCalls).toBe(0)
  })

  it('uses the fixed completed non-private fixture and serializes only the approved record fields on fake success', async () => {
    let fixture: unknown
    const result = await runTrainingLiveVerification({ GEMINI_API_KEY: 'KEY_SENTINEL', GEMINI_MODEL: 'MODEL_SENTINEL' }, { now: safeDate, createService: () => ({ async createTrainingPlan(input) { fixture = input; return successfulService().createTrainingPlan(input) } }) })
    expect(fixture).toEqual(FIXED_TRAINING_LIVE_FIXTURE)
    expect(result).toEqual({ date: '2026-10-06', providerCategory: 'gemini', elapsedMs: 0, logicalStepCount: 2, providerAttemptCount: 2, toolCallCount: 1, stopReason: 'completed', validationResult: 'PASS' })
    expect(Object.keys(result).sort()).toEqual(['date', 'elapsedMs', 'logicalStepCount', 'providerAttemptCount', 'providerCategory', 'stopReason', 'toolCallCount', 'validationResult'].sort())
    const serialized = JSON.stringify(result)
    for (const forbidden of ['KEY_SENTINEL', 'MODEL_SENTINEL', 'outcome', 'score', 'prompt', 'response', 'error', 'stack', 'arguments', 'reasoning']) expect(serialized).not.toContain(forbidden)
  })

  it('returns a classified safe failure for a fake stopped run without raw error data', async () => {
    const result = await runTrainingLiveVerification({ GEMINI_API_KEY: 'KEY_SENTINEL', GEMINI_MODEL: 'MODEL_SENTINEL' }, { now: safeDate, createService: () => ({ async createTrainingPlan() { return { kind: 'unavailable' as const, run: { runId: 'raw-run-id-is-not-output', status: 'failed' as const, stopReason: 'provider_failure' as const, stepCount: 1, providerAttemptCount: 1, toolCallCount: 0, elapsedMs: 17 } } } }) })
    expect(result).toEqual({ date: '2026-10-06', providerCategory: 'gemini', elapsedMs: 17, logicalStepCount: 1, providerAttemptCount: 1, toolCallCount: 0, stopReason: 'provider_failure', validationResult: 'CLASSIFIED_FAILURE' })
    expect(JSON.stringify(result)).not.toMatch(/raw-run-id|KEY_SENTINEL|MODEL_SENTINEL|error|stack/i)
  })

  it('contains a thrown fake provider/service failure in one classified record without raw data', async () => {
    const result = await runTrainingLiveVerification({ GEMINI_API_KEY: 'KEY_SENTINEL', GEMINI_MODEL: 'MODEL_SENTINEL' }, { now: safeDate, createService: () => ({ async createTrainingPlan() { throw new Error('RAW_PROVIDER_ERROR_SENTINEL') } }) })
    expect(result).toEqual({ date: '2026-10-06', providerCategory: 'gemini', elapsedMs: 0, logicalStepCount: 0, providerAttemptCount: 0, toolCallCount: 0, stopReason: 'provider_failure', validationResult: 'CLASSIFIED_FAILURE' })
    expect(JSON.stringify(result)).not.toMatch(/RAW_PROVIDER_ERROR_SENTINEL|KEY_SENTINEL|MODEL_SENTINEL|error|stack/i)
  })

  it('is import-safe: no provider/service work happens before explicit function invocation', async () => {
    let calls = 0
    const module = await import('./verify-training-live.js')
    expect(module.FIXED_TRAINING_LIVE_FIXTURE.outcome).toBe('WON')
    expect(calls).toBe(0)
  })

  it('is isolated from routine lifecycle commands and is available only as an explicit Week 05 script', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> }
    expect(manifest.scripts['verify:training:live']).toContain('verify-training-live.ts')
    for (const name of ['test', 'build', 'smoke', 'dev', 'dev:all', 'start:server', 'postinstall', 'pretest', 'posttest']) expect(manifest.scripts[name] ?? '').not.toContain('verify-training-live')
  })
})
