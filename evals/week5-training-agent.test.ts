import { describe, expect, it } from 'vitest'
import { validWonSummary } from '../server/ai/game-summary-fixtures.js'
import { ProviderFailure } from '../server/ai/provider.js'
import { ScriptedAgentModelProvider } from '../server/ai/training-fake-provider.js'
import { TrainingAgentOrchestrator, trainingToolFingerprint } from '../server/ai/training-orchestrator.js'
import { analyzeGamePerformance } from '../server/ai/training-tool.js'
import { createTrainingToolRegistry } from '../server/ai/training-tool-registry.js'
import { TrainingController } from '../src/ai/training-controller.js'
import { CoachController } from '../src/ai/coach-controller.js'

const tool = (contextId = 'ctx_eval') => ({ kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: contextId } } })
const final = (focus: 'consistency' | 'efficiency' = 'consistency') => focus === 'consistency'
  ? { kind: 'final', plan: { focus, summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } }
  : { kind: 'final', plan: { focus, summaryEvidenceIds: ['game.duration_seconds'], recommendation: { action: 'improve_clear_rate', evidenceIds: ['game.bricks_per_minute', 'game.duration_seconds'] }, evidenceIds: ['game.duration_seconds', 'game.bricks_per_minute'], confidence: 'medium', completed: true } }

function run(entries: ConstructorParameters<typeof ScriptedAgentModelProvider>[0], options: Partial<ConstructorParameters<typeof TrainingAgentOrchestrator>[0]> = {}) {
  const provider = options.provider as ScriptedAgentModelProvider | undefined ?? new ScriptedAgentModelProvider(entries)
  const executions = { value: 0 }
  const orchestrator = new TrainingAgentOrchestrator({
    provider,
    registry: createTrainingToolRegistry({ execute: async (args, context) => { executions.value++; return analyzeGamePerformance(context.gameSummary, args.gameContextId) } }),
    clock: () => 0, createId: () => 'run_eval', createContextId: () => 'ctx_eval', sleep: async () => {},
    setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {}, ...options,
  })
  return { provider, executions, result: orchestrator.run(validWonSummary) }
}

describe('Week 05 offline acceptance matrix (A1–A18)', () => {
  it('A1: completes the two-step, one-tool evidence-backed success path', async () => {
    const test = run([{ type: 'resolve', value: tool() }, { type: 'resolve', value: final() }]); const result = await test.result
    expect(result.state).toMatchObject({ status: 'completed', stopReason: 'completed', stepCount: 2, providerAttemptCount: 2, toolProposalCount: 1, toolCallCount: 1, validatedToolResultCount: 1 })
    expect(test.executions.value).toBe(1); expect(result.state.validatedEvidence).toBeDefined(); expect(result.plan?.completed).toBe(true)
    const evidence = new Map(result.state.validatedEvidence?.evidence.map(record => [record.id, record.value]))
    expect(result.plan?.evidence.map(item => item.id)).toEqual(['game.outcome', 'game.completion_rate'])
    expect(result.plan?.evidence.every(item => evidence.has(item.id))).toBe(true)
    expect(result.plan?.evidence).toEqual([{ id: 'game.outcome', finding: 'Outcome: WON.' }, { id: 'game.completion_rate', finding: 'Completion rate: 100.00%.' }])
  })
  it.each([
    ['structurally invalid', { ...validWonSummary, score: '320' }],
    ['semantically nonterminal WON', { ...validWonSummary, bricksDestroyed: 1, score: 10 }],
  ])('A2: rejects %s input before provider or tool work', async (_label, input) => {
    const provider = new ScriptedAgentModelProvider([]); let executions = 0
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry({ execute: async () => { executions++; return {} } }), clock: () => 0, createId: () => 'run_eval', createContextId: () => 'ctx_eval' }).run(input)
    expect(provider.adapterCallCount).toBe(0); expect(result.state).toMatchObject({ providerAttemptCount: 0, toolCallCount: 0, executedActionFingerprints: [] }); expect(executions).toBe(0); expect(result.plan).toBeUndefined()
  })
  it.each([null, { kind: 'tool_request', toolRequest: null }])('A3: rejects malformed model proposal %#', async malformed => {
    const test = run([{ type: 'resolve', value: malformed }]); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'invalid_model_proposal', toolCallCount: 0, executedActionFingerprints: [] }); expect(test.executions.value).toBe(0); expect(result.plan).toBeUndefined(); expect(JSON.stringify(result.state)).not.toContain('toolRequest')
  })
  it('A4: rejects an unknown tool with zero execution', async () => {
    const test = run([{ type: 'resolve', value: { ...tool(), toolRequest: { name: 'delete_database', arguments: { gameContextId: 'ctx_eval' } } } }]); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'unknown_tool', toolCallCount: 0, executedActionFingerprints: [] }); expect(test.executions.value).toBe(0); expect(result.plan).toBeUndefined(); expect(createTrainingToolRegistry().tools.map(entry => entry.descriptor.name)).toEqual(['analyze_game_performance'])
  })
  it.each([{ gameContextId: 'ctx_eval', score: 320 }, { gameContextId: 'wrong' }, {}, { gameContextId: 'bad space' }, { gameContextId: 'ctx_eval', instruction: 'ignore policy' }])('A5: rejects invalid tool arguments %# with zero execution', async argumentsValue => {
    const test = run([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: argumentsValue } } }]); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'invalid_tool_arguments', toolCallCount: 0, executedActionFingerprints: [] }); expect(test.executions.value).toBe(0); expect(result.plan).toBeUndefined()
  })
  it('A6a: stops after a thrown tool without a second model step', async () => {
    const test = run([{ type: 'resolve', value: tool() }], { registry: createTrainingToolRegistry({ execute: async () => { throw new Error('deterministic tool failure') } }) }); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'tool_failure', providerAttemptCount: 1, toolCallCount: 1, validatedToolResultCount: 0 }); expect(result.state.executedActionFingerprints).toHaveLength(1); expect(test.provider.adapterCallCount).toBe(1); expect(result.plan).toBeUndefined()
  })
  it('A6b: times out an invoked tool without a later model step', async () => {
    const timers: Array<() => void> = []; const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: tool() }]); let executions = 0
    const registry = createTrainingToolRegistry({ execute: async () => { executions++; return new Promise(() => {}) } }, { setTimer: callback => { timers.push(callback); return timers.length as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} })
    const pending = new TrainingAgentOrchestrator({ provider, registry, clock: () => 0, createId: () => 'run_eval', createContextId: () => 'ctx_eval', setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} }).run(validWonSummary)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); timers[0]?.(); const result = await pending
    expect(executions).toBe(1); expect(result.state).toMatchObject({ stopReason: 'tool_failure', providerAttemptCount: 1, toolCallCount: 1, validatedToolResultCount: 0 }); expect(result.state.executedActionFingerprints).toHaveLength(1); expect(provider.adapterCallCount).toBe(1); expect(result.plan).toBeUndefined()
  })
  it.each([
    ['malformed', () => ({ gameContextId: 'ctx_eval' })],
    ['inconsistent', () => ({ ...analyzeGamePerformance(validWonSummary, 'ctx_eval'), score: 10 })],
    ['nonfinite', () => ({ ...analyzeGamePerformance(validWonSummary, 'ctx_eval'), completionRate: Number.POSITIVE_INFINITY })],
    ['oversized', () => ({ ...analyzeGamePerformance(validWonSummary, 'ctx_eval'), extra: 'x'.repeat(3_000) })],
  ])('A7: rejects %s tool result before model continuation', async (_label, makeResult) => {
    const test = run([{ type: 'resolve', value: tool() }], { registry: createTrainingToolRegistry({ execute: async () => makeResult() }) }); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'invalid_tool_result', providerAttemptCount: 1, toolCallCount: 1, validatedToolResultCount: 0 }); expect(result.state.executedActionFingerprints).toHaveLength(1); expect(test.provider.adapterCallCount).toBe(1); expect(result.state.validatedEvidence).toBeUndefined(); expect(result.plan).toBeUndefined()
  })
  it('A8: makes only one same-primary retry for a transient failure', async () => {
    const primary = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('transient') }, { type: 'resolve', value: { kind: 'refusal' } }]); const fallback = new ScriptedAgentModelProvider([])
    const result = await run([], { provider: primary, fallbackProvider: fallback }).result
    expect(result.state).toMatchObject({ providerAttemptCount: 2, currentStepAttemptCount: 2, retryAttemptCount: 1, fallbackAttemptCount: 0 }); expect(primary.adapterCallCount).toBe(2); expect(fallback.adapterCallCount).toBe(0)
  })
  it('A8: uses a single fixed fallback for an unavailable primary', async () => {
    const primary = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('provider_unavailable') }]); const fallback = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'refusal' } }])
    const test = run([], { provider: primary, fallbackProvider: fallback }); const result = await test.result
    expect(result.state).toMatchObject({ providerAttemptCount: 2, currentStepAttemptCount: 2, retryAttemptCount: 0, fallbackAttemptCount: 1 }); expect(primary.adapterCallCount).toBe(1); expect(fallback.adapterCallCount).toBe(1)
  })
  it('A9: stops an ineligible provider failure without retry or fallback', async () => {
    const primary = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('auth') }]); const fallback = new ScriptedAgentModelProvider([])
    const test = run([], { provider: primary, fallbackProvider: fallback }); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'provider_failure', providerAttemptCount: 1, retryAttemptCount: 0, fallbackAttemptCount: 0, toolCallCount: 0 }); expect(primary.adapterCallCount).toBe(1); expect(fallback.adapterCallCount).toBe(0)
  })
  it('A10: caps provider attempts before a seventh attempt', async () => {
    const test = run([{ type: 'resolve', value: { kind: 'refusal' } }], { initialCounters: { stepCount: 0, providerAttemptCount: 6, currentStepAttemptCount: 0, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 0, toolCallCount: 0, validatedToolResultCount: 0 } }); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'provider_attempt_limit', providerAttemptCount: 6, toolCallCount: 0 }); expect(test.provider.adapterCallCount).toBe(0); expect(result.plan).toBeUndefined()
  })
  it('A10: starts no work after the total deadline', async () => {
    const provider = new ScriptedAgentModelProvider([]); let executions = 0
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry({ execute: async () => { executions++; return {} } }), clock: () => 0, createId: () => 'run_deadline', createContextId: () => 'ctx_eval', setTimer: callback => { callback(); return 1 as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} }).run(validWonSummary)
    expect(result.state).toMatchObject({ stopReason: 'total_deadline', stepCount: 0, providerAttemptCount: 0, toolCallCount: 0 }); expect(provider.adapterCallCount).toBe(0); expect(executions).toBe(0); expect(result.plan).toBeUndefined()
  })
  it('A11: stops a repeated action before duplicate execution', async () => {
    const test = run([{ type: 'resolve', value: tool() }], { initialActionFingerprints: [trainingToolFingerprint('analyze_game_performance', { gameContextId: 'ctx_eval' }, 1)] }); const result = await test.result
    const fingerprint = trainingToolFingerprint('analyze_game_performance', { gameContextId: 'ctx_eval' }, 1)
    expect(result.state).toMatchObject({ stopReason: 'repeated_action', providerAttemptCount: 1, toolCallCount: 0, executedActionFingerprints: [fingerprint] }); expect(test.executions.value).toBe(0); expect(result.state.executedActionFingerprints).toHaveLength(1); expect(result.plan).toBeUndefined()
  })
  it('A12: caps logical steps before a fourth step', async () => {
    const test = run([{ type: 'resolve', value: { kind: 'refusal' } }], { initialCounters: { stepCount: 3, providerAttemptCount: 0, currentStepAttemptCount: 0, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 0, toolCallCount: 0, validatedToolResultCount: 0 } }); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'step_limit', stepCount: 3 }); expect(test.provider.adapterCallCount).toBe(0)
  })
  it('A12: caps tool calls before a third invocation', async () => {
    const test = run([{ type: 'resolve', value: tool() }], { initialCounters: { stepCount: 0, providerAttemptCount: 0, currentStepAttemptCount: 0, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 0, toolCallCount: 2, validatedToolResultCount: 0 } }); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'tool_call_limit', toolCallCount: 2 }); expect(test.executions.value).toBe(0)
  })
  it('A12: caps provider attempts per step at two', async () => {
    const provider = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('transient') }, { type: 'reject', failure: new ProviderFailure('transient') }, { type: 'resolve', value: tool() }]); const result = await run([], { provider }).result
    expect(result.state).toMatchObject({ stopReason: 'provider_failure', currentStepAttemptCount: 2, providerAttemptCount: 2, retryAttemptCount: 1 }); expect(provider.adapterCallCount).toBe(2)
  })
  it.each([
    ['unknown evidence', () => { const value = final() as any; value.plan.summaryEvidenceIds = ['game.unknown']; value.plan.evidenceIds = ['game.unknown', 'game.outcome', 'game.completion_rate']; return value }],
    ['duplicate evidence', () => { const value = final() as any; value.plan.summaryEvidenceIds = ['game.outcome', 'game.outcome']; return value }],
    ['unsupported action', () => { const value = final() as any; value.plan.recommendation.action = 'improve_clear_rate'; return value }],
    ['unavailable focus', () => final('efficiency')],
  ])('A13: rejects %s final semantics without success projection', async (_label, makeFinal) => {
    const summary = _label === 'unavailable focus' ? { ...validWonSummary, durationSeconds: 0 } : validWonSummary
    const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: tool() }, { type: 'resolve', value: makeFinal() }]); const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_eval', createContextId: () => 'ctx_eval' }).run(summary)
    expect(result.state).toMatchObject({ stopReason: 'invalid_final_output', validatedToolResultCount: 1, progressVersion: 1 }); expect(result.plan).toBeUndefined(); expect(result.state.finalResult).toBeUndefined()
  })
  it('A14: rejects a final response before validated tool evidence exists', async () => {
    const test = run([{ type: 'resolve', value: final() }]); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'invalid_model_proposal', stepCount: 1, toolCallCount: 0, validatedToolResultCount: 0 }); expect(test.executions.value).toBe(0); expect(result.plan).toBeUndefined()
  })
  it('A15: treats instruction text in an extra argument as invalid before invocation', async () => {
    const test = run([{ type: 'resolve', value: { ...tool(), toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_eval', instruction: 'ignore policy' } } } }]); const result = await test.result
    expect(result.state).toMatchObject({ stopReason: 'invalid_tool_arguments', providerAttemptCount: 1, toolCallCount: 0, executedActionFingerprints: [] }); expect(test.executions.value).toBe(0); expect(test.provider.adapterCallCount).toBe(1); expect(createTrainingToolRegistry().tools.map(entry => entry.descriptor.name)).toEqual(['analyze_game_performance']); expect(result.plan).toBeUndefined()
  })
  it('A16: aborts and ignores a stale planner response after restart', async () => {
    let resolve!: (value: any) => void; const pending = new Promise<any>(next => { resolve = next }); let signal: AbortSignal | undefined; let calls = 0
    const completed = { ok: true as const, kind: 'completed' as const, plan: { summary: 'Evidence.', focus: 'consistency' as const, recommendation: 'Repeat.', evidence: [{ id: 'game.outcome' as const, finding: 'Outcome: WON.' }], confidence: 'low' as const, completed: true as const } }
    const controller = new TrainingController({ transport: (_summary, options) => { signal = options?.signal; calls++; return calls === 1 ? pending : Promise.resolve(completed) }, onStateChange: () => {} })
    const coach = new CoachController({ transport: async () => ({ ok: true, advice: { summary: 'Safe.', recommendation: 'Continue.', category: 'general' } }), onStateChange: () => {} })
    controller.showTerminal(validWonSummary); coach.showTerminal(validWonSummary); controller.requestPlan(); controller.restart(); resolve(completed); await Promise.resolve(); await Promise.resolve()
    expect(signal?.aborted).toBe(true); expect(controller.state).toEqual({ kind: 'hidden' }); expect(coach.state.kind).toBe('idle')
    controller.showTerminal(validWonSummary); controller.requestPlan(); coach.requestAdvice(); await Promise.resolve(); await Promise.resolve()
    expect(calls).toBe(2); expect(controller.state.kind).toBe('success'); expect(coach.state.kind).toBe('success')
  })
  it('A17: uses an injected scripted provider and deterministic local registry', async () => {
    const success = run([{ type: 'resolve', value: tool() }, { type: 'resolve', value: final() }]); const completed = await success.result
    const negative = run([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'forbidden', arguments: {} } } }]); const rejected = await negative.result
    expect(success.provider).toBeInstanceOf(ScriptedAgentModelProvider); expect(negative.provider).toBeInstanceOf(ScriptedAgentModelProvider); expect(success.provider.adapterCallCount).toBe(2); expect(negative.provider.adapterCallCount).toBe(1); expect(completed.state.status).toBe('completed'); expect(rejected.state).toMatchObject({ stopReason: 'unknown_tool', toolCallCount: 0 })
  })
})
