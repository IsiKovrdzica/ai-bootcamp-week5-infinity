import { describe, expect, it } from 'vitest'
import { validWonSummary } from './game-summary-fixtures.js'
import { ScriptedAgentModelProvider } from './training-fake-provider.js'
import { TrainingActionGuard, TrainingAgentOrchestrator, trainingToolFingerprint } from './training-orchestrator.js'
import { analyzeGamePerformance } from './training-tool.js'
import { createTrainingToolRegistry } from './training-tool-registry.js'
import { ProviderFailure } from './provider.js'

describe('T32 minimal successful training run', () => {
  it('runs the exact two-step, one-tool success trace and renders only a safe plan', async () => {
    let executions = 0
    let timersStarted = 0
    let timersCleared = 0
    const events: unknown[] = []
    const provider = new ScriptedAgentModelProvider([
      { type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } },
      { type: 'resolve', value: { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } } },
    ])
    const orchestrator = new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry({ execute: async (args, context) => { executions++; return analyzeGamePerformance(context.gameSummary, args.gameContextId) } }), clock: () => 1_000, createId: () => 'run_1', createContextId: () => 'ctx_1', eventSink: event => events.push(event), setTimer: () => { timersStarted++; return 1 as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => { timersCleared++ } })
    const result = await orchestrator.run(validWonSummary)
    expect(result.state.status).toBe('completed')
    expect(result.state.phase).toBe('terminal')
    expect(result.state.stopReason).toBe('completed')
    expect(result.state.stepCount).toBe(2)
    expect(result.state.providerAttemptCount).toBe(2)
    expect(result.state.toolProposalCount).toBe(1)
    expect(result.state.toolCallCount).toBe(1)
    expect(result.state.validatedToolResultCount).toBe(1)
    expect(result.state.progressVersion).toBe(2)
    expect(Object.isFrozen(result.state)).toBe(true)
    expect(() => { ;(result.state as { status: string }).status = 'running' }).toThrow()
    expect(result.transitions).toEqual(['awaiting_tool', 'executing_tool', 'awaiting_final', 'terminal'])
    expect(result.progressVersions).toEqual([0, 1, 2])
    expect(executions).toBe(1)
    expect(provider.adapterCallCount).toBe(2)
    expect(timersStarted).toBe(3)
    expect(timersCleared).toBe(3)
    expect(events.map(event => (event as { kind: string }).kind)).toEqual(['run_started', 'step_started', 'provider_attempt_settled', 'proposal_validated', 'tool_execution_settled', 'tool_result_validated', 'step_started', 'provider_attempt_settled', 'final_validated', 'run_finished'])
    expect(events.every(event => !Object.hasOwn(event as object, 'gameSummary') && !Object.hasOwn(event as object, 'response'))).toBe(true)
    expect(result.plan).toEqual({ summary: 'The completed game supports a consistency training focus.', focus: 'consistency', recommendation: 'For the next game, aim to repeat the completed clear.', evidence: [{ id: 'game.outcome', finding: 'Outcome: WON.' }, { id: 'game.completion_rate', finding: 'Completion rate: 100.00%.' }], confidence: 'high', completed: true })
  })
})

describe('T48 sanitized event boundaries', () => {
  it('emits closed provider routing categories and per-attempt latency without configuration values', async () => {
    let now = 1_000
    const events: unknown[] = []
    const primary = { async generateStep() { now = 1_011; throw new ProviderFailure('provider_unavailable') } }
    const fallback = { async generateStep() { now = 1_029; return { kind: 'refusal' } } }
    const result = await new TrainingAgentOrchestrator({ provider: primary, fallbackProvider: fallback, registry: createTrainingToolRegistry(), clock: () => now, createId: () => 'run_attempts', createContextId: () => 'ctx_1', eventSink: event => events.push(event), setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {}, sleep: async () => {} }).run(validWonSummary)
    expect(result.state).toMatchObject({ status: 'stopped', stopReason: 'invalid_model_proposal', stepCount: 1, providerAttemptCount: 2, retryAttemptCount: 0, fallbackAttemptCount: 1 })
    expect((events as Array<Record<string, unknown>>).filter(event => event.kind === 'provider_attempt_settled')).toEqual([
      expect.objectContaining({ attemptKind: 'initial', providerCategory: 'primary', attemptLatencyMs: 11, outcome: 'failure' }),
      expect.objectContaining({ attemptKind: 'fallback', providerCategory: 'fixed_fallback', attemptLatencyMs: 18, outcome: 'success' }),
    ])
    expect(JSON.stringify(events)).not.toContain('gemini')
  })

  it('emits complete safe success boundaries and keeps adversarial model content out of every event', async () => {
    const events: unknown[] = []
    const provider = new ScriptedAgentModelProvider([
      { type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } },
      { type: 'resolve', value: { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } } },
    ])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 1_000, createId: () => 'run_observable', createContextId: () => 'ctx_1', eventSink: event => events.push(event), setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} }).run(validWonSummary)
    expect(result.state.status).toBe('completed')
    expect(events.map(event => (event as { kind: string }).kind)).toEqual(['run_started', 'step_started', 'provider_attempt_settled', 'proposal_validated', 'tool_execution_settled', 'tool_result_validated', 'step_started', 'provider_attempt_settled', 'final_validated', 'run_finished'])
    const typed = events as Array<Record<string, unknown>>
    expect(typed.every(event => event.runId === 'run_observable' && typeof event.elapsedMs === 'number' && typeof event.status === 'string')).toBe(true)
    expect(typed.at(-1)).toMatchObject({ phase: 'terminal', status: 'completed', stopReason: 'completed', stepCount: 2, providerAttemptCount: 2, toolProposalCount: 1, toolCallCount: 1, validatedToolResultCount: 1 })
    const serialized = JSON.stringify(events)
    for (const forbidden of ['gameSummary', 'arguments', 'validatedEvidence', 'finalResult', 'prompt', 'response', 'error', 'stack', 'apiKey', 'reasoning']) expect(serialized).not.toContain(forbidden)
  })

  it('emits only safe terminal rejection data and ignores a throwing observer', async () => {
    const events: unknown[] = []
    const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 1_000, createId: () => 'run_rejected', createContextId: () => 'ctx_1', initialActionFingerprints: [trainingToolFingerprint('analyze_game_performance', { gameContextId: 'ctx_1' }, 1)], eventSink: event => { events.push(event); if ((event as { kind: string }).kind === 'proposal_validated') throw new Error('OBSERVER_SENTINEL') }, setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} }).run(validWonSummary)
    expect(result.state).toMatchObject({ status: 'stopped', stopReason: 'repeated_action', toolCallCount: 0, validatedToolResultCount: 0 })
    expect((events.at(-1) as Record<string, unknown>)).toMatchObject({ kind: 'run_finished', status: 'stopped', stopReason: 'repeated_action' })
    const serialized = JSON.stringify(events)
    for (const forbidden of ['OBSERVER_SENTINEL', 'gameSummary', 'arguments', 'rawError', 'stack']) expect(serialized).not.toContain(forbidden)
  })

  it('emits a sanitized terminal failure trace without raw provider error text', async () => {
    const events: unknown[] = []; const failure = new ProviderFailure('programming'); failure.message = 'PROVIDER_ERROR_SENTINEL'
    const provider = new ScriptedAgentModelProvider([{ type: 'reject', failure }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 1_000, createId: () => 'run_failure', createContextId: () => 'ctx_1', eventSink: event => events.push(event), setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} }).run(validWonSummary)
    expect(result.state).toMatchObject({ status: 'failed', stopReason: 'provider_failure', stepCount: 1, providerAttemptCount: 1, toolProposalCount: 0, toolCallCount: 0, validatedToolResultCount: 0 })
    expect(events.map(event => (event as { kind: string }).kind)).toEqual(['run_started', 'step_started', 'provider_attempt_settled', 'run_finished'])
    expect(events.at(-1)).toMatchObject({ status: 'failed', stopReason: 'provider_failure', providerAttemptCount: 1 })
    const serialized = JSON.stringify(events)
    for (const forbidden of ['PROVIDER_ERROR_SENTINEL', 'error', 'stack', 'gameSummary', 'prompt', 'response']) expect(serialized).not.toContain(forbidden)
  })
})

describe('T41-T45 safety routing', () => {
  it('uses a canonical tool-name, normalized-argument, and state-version fingerprint', () => {
    expect(trainingToolFingerprint('analyze_game_performance', { gameContextId: 'ctx_1' }, 1)).toBe('analyze_game_performance\n{"gameContextId":"ctx_1"}\ncontextVersion=1')
    expect(trainingToolFingerprint('analyze_game_performance', { gameContextId: 'ctx_1' }, 1)).toBe(trainingToolFingerprint('analyze_game_performance', JSON.parse('{"gameContextId":"ctx_1"}'), 1))
    expect(trainingToolFingerprint('analyze_game_performance', { gameContextId: 'ctx_1' }, 1)).not.toBe(trainingToolFingerprint('analyze_game_performance', { gameContextId: 'ctx_1' }, 2))
  })
  it('records the first action and rejects the same canonical action before a second invocation', () => {
    const guard = new TrainingActionGuard(); let invocations = 0
    if (guard.authorize('analyze_game_performance', { gameContextId: 'ctx_1' }, 1)) invocations++
    if (guard.authorize('analyze_game_performance', JSON.parse('{"gameContextId":"ctx_1"}'), 1)) invocations++
    expect(invocations).toBe(1)
  })
  it('rejects a seeded canonical action through the real pre-invocation path', async () => {
    let executions = 0; const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry({ execute: async () => { executions++; return {} } }), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', initialActionFingerprints: [trainingToolFingerprint('analyze_game_performance', { gameContextId: 'ctx_1' }, 1)] }).run(validWonSummary)
    expect(result.state.status).toBe('stopped'); expect(result.state.stopReason).toBe('repeated_action'); expect(result.state.stepCount).toBe(1); expect(result.state.providerAttemptCount).toBe(1); expect(result.state.toolProposalCount).toBe(1); expect(result.state.toolCallCount).toBe(0); expect(result.state.validatedToolResultCount).toBe(0); expect(result.state.retryAttemptCount).toBe(0); expect(result.state.fallbackAttemptCount).toBe(0); expect(executions).toBe(0); expect(provider.adapterCallCount).toBe(1)
  })
  const make = (entries: ConstructorParameters<typeof ScriptedAgentModelProvider>[0], executions: { value: number }) => new TrainingAgentOrchestrator({
    provider: new ScriptedAgentModelProvider(entries), registry: createTrainingToolRegistry({ execute: async (args, context) => { executions.value++; return analyzeGamePerformance(context.gameSummary, args.gameContextId) } }), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {}, sleep: async () => {},
  })
  it('preflights invalid input before provider or tool execution', async () => {
    const executions = { value: 0 }; const provider = new ScriptedAgentModelProvider([])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry({ execute: async () => { executions.value++; return {} } }), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1' }).run({})
    expect(result.state.stopReason).toBe('invalid_model_proposal'); expect(provider.adapterCallCount).toBe(0); expect(executions.value).toBe(0)
  })
  it.each([
    [{ kind: 'tool_request', toolRequest: { name: 'unknown', arguments: { gameContextId: 'ctx_1' } } }, 'unknown_tool'],
    [{ kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'wrong' } } }, 'invalid_tool_arguments'],
  ] as const)('rejects unsafe tool proposal before execution', async (proposal, reason) => {
    const executions = { value: 0 }; const result = await make([{ type: 'resolve', value: proposal }], executions).run(validWonSummary)
    expect(result.state.stopReason).toBe(reason); expect(result.state.toolCallCount).toBe(0); expect(executions.value).toBe(0)
  })
  it('retries a transient provider failure exactly once without a new step', async () => {
    const provider = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('transient') }, { type: 'resolve', value: { kind: 'refusal' } }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', sleep: async () => {}, setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} }).run(validWonSummary)
    expect(result.state.stepCount).toBe(1); expect(result.state.providerAttemptCount).toBe(2); expect(result.state.retryAttemptCount).toBe(1); expect(result.state.fallbackAttemptCount).toBe(0); expect(provider.adapterCallCount).toBe(2)
  })
  it.each(['network/connection', 'HTTP 408', 'HTTP 429'] as const)('routes normalized transient %s to one same-primary retry with the same logical request', async () => {
    const provider = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('transient') }, { type: 'resolve', value: { kind: 'refusal' } }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', sleep: async () => {} }).run(validWonSummary)
    expect(result.state.stepCount).toBe(1); expect(result.state.providerAttemptCount).toBe(2); expect(result.state.retryAttemptCount).toBe(1); expect(result.state.fallbackAttemptCount).toBe(0); expect(provider.adapterCallCount).toBe(2); expect(provider.requests.map(({ callIndex: _callIndex, ...request }) => request)).toEqual([{ phase: 'select_tool', stepNumber: 1, signalAborted: false }, { phase: 'select_tool', stepNumber: 1, signalAborted: false }])
  })
  it('uses the fixed fallback once for provider_unavailable without retrying primary', async () => {
    const primary = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('provider_unavailable') }])
    const fallback = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'refusal' } }])
    const result = await new TrainingAgentOrchestrator({ provider: primary, fallbackProvider: fallback, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', sleep: async () => {}, setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} }).run(validWonSummary)
    expect(result.state.stepCount).toBe(1); expect(result.state.providerAttemptCount).toBe(2); expect(result.state.retryAttemptCount).toBe(0); expect(result.state.fallbackAttemptCount).toBe(1); expect(primary.adapterCallCount).toBe(1); expect(fallback.adapterCallCount).toBe(1)
  })
  it.each(['plain HTTP 404', 'HTTP 500', 'HTTP 502', 'HTTP 503'] as const)('routes normalized unavailable %s to exactly one fixed fallback', async () => {
    const primary = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('provider_unavailable') }]); const fallback = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'refusal' } }])
    const result = await new TrainingAgentOrchestrator({ provider: primary, fallbackProvider: fallback, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', sleep: async () => {} }).run(validWonSummary)
    expect(result.state.stepCount).toBe(1); expect(result.state.providerAttemptCount).toBe(2); expect(result.state.retryAttemptCount).toBe(0); expect(result.state.fallbackAttemptCount).toBe(1); expect(primary.adapterCallCount).toBe(1); expect(fallback.adapterCallCount).toBe(1)
  })
  it('never cascades a retry failure into fallback or a fallback failure into retry', async () => {
    const retryPrimary = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('transient') }, { type: 'reject', failure: new ProviderFailure('provider_unavailable') }]); const retryFallback = new ScriptedAgentModelProvider([])
    const retryResult = await new TrainingAgentOrchestrator({ provider: retryPrimary, fallbackProvider: retryFallback, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', sleep: async () => {} }).run(validWonSummary)
    expect(retryResult.state.providerAttemptCount).toBe(2); expect(retryResult.state.retryAttemptCount).toBe(1); expect(retryResult.state.fallbackAttemptCount).toBe(0); expect(retryFallback.adapterCallCount).toBe(0)
    const fallbackPrimary = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('provider_unavailable') }]); const fallback = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('transient') }])
    const fallbackResult = await new TrainingAgentOrchestrator({ provider: fallbackPrimary, fallbackProvider: fallback, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_2', createContextId: () => 'ctx_2', sleep: async () => {} }).run(validWonSummary)
    expect(fallbackResult.state.providerAttemptCount).toBe(2); expect(fallbackResult.state.retryAttemptCount).toBe(0); expect(fallbackResult.state.fallbackAttemptCount).toBe(1); expect(fallbackPrimary.adapterCallCount + fallback.adapterCallCount).toBe(2)
  })
  it.each(['auth', 'configuration', 'safety', 'permanent', 'programming', 'invalid_output'] as const)('does not retry terminal provider failure %s', async kind => {
    const provider = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure(kind) }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', sleep: async () => {} }).run(validWonSummary)
    expect(result.state.stopReason).toBe('provider_failure'); expect(result.state.providerAttemptCount).toBe(1); expect(provider.adapterCallCount).toBe(1)
  })
  it('maps cancellation to stopped without retry', async () => {
    const controller = new AbortController(); const provider = new ScriptedAgentModelProvider([{ type: 'deferred', key: 'pending' }]); const run = new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', signal: controller.signal }).run(validWonSummary)
    controller.abort(); const result = await run
    expect(result.state.status).toBe('stopped'); expect(result.state.stopReason).toBe('cancelled'); expect(result.state.providerAttemptCount).toBe(1); expect(result.state.retryAttemptCount).toBe(0); expect(result.state.fallbackAttemptCount).toBe(0)
  })
  it('does not trust an invoked malformed tool result or start a final provider step', async () => {
    let calls = 0; const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } }])
    const registry = createTrainingToolRegistry({ execute: async () => { calls++; return { schemaVersion: 1, gameContextId: 'ctx_1', malformed: true } } })
    const result = await new TrainingAgentOrchestrator({ provider, registry, clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1' }).run(validWonSummary)
    expect(result.state.status).toBe('failed'); expect(result.state.stopReason).toBe('invalid_tool_result'); expect(result.state.toolCallCount).toBe(1); expect(result.state.validatedToolResultCount).toBe(0); expect(provider.adapterCallCount).toBe(1); expect(calls).toBe(1)
  })
  it('stops invalid final output without transport retry or public plan', async () => {
    const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } }, { type: 'resolve', value: { kind: 'final', plan: { focus: 'survival' } } }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1' }).run(validWonSummary)
    expect(result.state.status).toBe('stopped'); expect(result.state.stopReason).toBe('invalid_final_output'); expect(result.plan).toBeUndefined(); expect(result.state.providerAttemptCount).toBe(2); expect(provider.adapterCallCount).toBe(2)
  })
  it('rejects duplicate final evidence references without committing a partial plan', async () => {
    const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } }, { type: 'resolve', value: { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome', 'game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } } }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1' }).run(validWonSummary)
    expect(result.state.status).toBe('stopped'); expect(result.state.stopReason).toBe('invalid_final_output'); expect(result.plan).toBeUndefined(); expect(result.state.finalResult).toBeUndefined(); expect(result.state.validatedToolResultCount).toBe(1); expect(result.state.progressVersion).toBe(1); expect(result.state.providerAttemptCount).toBe(2)
  })
  it.each([
    ['efficiency', 'improve_clear_rate', ['game.bricks_per_minute', 'game.duration_seconds'], ['game.bricks_per_minute', 'game.duration_seconds']],
    ['consistency', 'repeat_completed_clear', ['game.outcome', 'game.completion_rate'], ['game.outcome', 'game.completion_rate']],
  ] as const)('accepts model-selected supported %s focus without application preference', async (focus, action, recommendationEvidenceIds, evidenceIds) => {
    const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } }, { type: 'resolve', value: { kind: 'final', plan: { focus, summaryEvidenceIds: [evidenceIds[0]], recommendation: { action, evidenceIds: recommendationEvidenceIds }, evidenceIds, confidence: 'high', completed: true } } }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1' }).run(validWonSummary)
    expect(result.state.status).toBe('completed'); expect(result.state.stepCount).toBe(2); expect(result.state.providerAttemptCount).toBe(2); expect(result.state.toolProposalCount).toBe(1); expect(result.state.toolCallCount).toBe(1); expect(result.state.validatedToolResultCount).toBe(1); expect(result.plan?.focus).toBe(focus); expect(result.plan).toBeDefined()
  })
  it('renders each independent run from its own validated evidence values despite stable field IDs', async () => {
    const tool = { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } }
    const a = new ScriptedAgentModelProvider([{ type: 'resolve', value: tool }, { type: 'resolve', value: { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } } }])
    const b = new ScriptedAgentModelProvider([{ type: 'resolve', value: tool }, { type: 'resolve', value: { kind: 'final', plan: { focus: 'efficiency', summaryEvidenceIds: ['game.bricks_per_minute'], recommendation: { action: 'improve_clear_rate', evidenceIds: ['game.bricks_per_minute', 'game.duration_seconds'] }, evidenceIds: ['game.bricks_per_minute', 'game.duration_seconds'], confidence: 'high', completed: true } } }])
    const run = (provider: ScriptedAgentModelProvider, summary: typeof validWonSummary) => new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1' }).run(summary)
    const first = await run(a, validWonSummary); const second = await run(b, { outcome: 'GAME_OVER', score: 100, bricksDestroyed: 10, livesRemaining: 0, livesLost: 3, durationSeconds: 30 })
    expect(first.plan?.evidence).toContainEqual({ id: 'game.outcome', finding: 'Outcome: WON.' }); expect(second.plan?.evidence).toContainEqual({ id: 'game.bricks_per_minute', finding: 'Bricks per minute: 20.00 bricks/min.' }); expect(second.plan?.evidence).not.toContainEqual({ id: 'game.outcome', finding: 'Outcome: WON.' })
  })
  it('maps an injected total-deadline abort to failed total_deadline and discards pending provider work', async () => {
    const timers: (() => void)[] = []; const provider = new ScriptedAgentModelProvider([{ type: 'deferred', key: 'late' }])
    const run = new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', setTimer: callback => { timers.push(callback); return timers.length as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} }).run(validWonSummary)
    timers[0]?.(); const result = await run
    expect(result.state.status).toBe('failed'); expect(result.state.stopReason).toBe('total_deadline'); expect(result.state.providerAttemptCount).toBe(1); expect(provider.adapterCallCount).toBe(1)
  })
  it('never starts provider work once the absolute deadline is already exhausted', async () => {
    const provider = new ScriptedAgentModelProvider([])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', setTimer: callback => { callback(); return 1 as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} }).run(validWonSummary)
    expect(result.state.status).toBe('failed'); expect(result.state.stopReason).toBe('total_deadline'); expect(result.state.stepCount).toBe(0); expect(result.state.providerAttemptCount).toBe(0); expect(provider.adapterCallCount).toBe(0)
  })
  it('bounds each provider attempt by the smaller 15-second attempt timeout', async () => {
    const timers: number[] = []; const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'refusal' } }])
    await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', setTimer: (_callback, milliseconds) => { timers.push(milliseconds); return timers.length as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} }).run(validWonSummary)
    expect(timers).toEqual([30_000, 15_000])
  })
  it('does not start a retry when the required 250ms delay cannot fit before the run deadline', async () => {
    let now = 0; const provider = { calls: 0, async generateStep() { this.calls++; now = 29_800; throw new ProviderFailure('transient') } }
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => now, createId: () => 'run_1', createContextId: () => 'ctx_1', sleep: async () => { throw new Error('must not sleep') } }).run(validWonSummary)
    expect(result.state.stopReason).toBe('provider_failure'); expect(result.state.stepCount).toBe(1); expect(result.state.providerAttemptCount).toBe(1); expect(result.state.retryAttemptCount).toBe(0); expect(provider.calls).toBe(1)
  })
  it('stops before a fourth logical step without a provider or tool call', async () => {
    const provider = new ScriptedAgentModelProvider([]); let executions = 0
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry({ execute: async () => { executions++; return {} } }), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', initialCounters: { stepCount: 3, providerAttemptCount: 0, currentStepAttemptCount: 0, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 0, toolCallCount: 0, validatedToolResultCount: 0 } }).run(validWonSummary)
    expect(result.state.status).toBe('stopped'); expect(result.state.stopReason).toBe('step_limit'); expect(result.state.stepCount).toBe(3); expect(result.state.providerAttemptCount).toBe(0); expect(result.state.toolCallCount).toBe(0); expect(executions).toBe(0); expect(provider.adapterCallCount).toBe(0)
  })
  it('stops before a seventh provider attempt without starting an adapter call', async () => {
    const provider = new ScriptedAgentModelProvider([])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', initialCounters: { stepCount: 0, providerAttemptCount: 6, currentStepAttemptCount: 0, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 0, toolCallCount: 0, validatedToolResultCount: 0 } }).run(validWonSummary)
    expect(result.state.status).toBe('stopped'); expect(result.state.stopReason).toBe('provider_attempt_limit'); expect(result.state.stepCount).toBe(1); expect(result.state.providerAttemptCount).toBe(6); expect(provider.adapterCallCount).toBe(0)
  })
  it('stops before a third actual tool call without invoking the registry', async () => {
    let executions = 0; const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry({ execute: async () => { executions++; return {} } }), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', initialCounters: { stepCount: 0, providerAttemptCount: 0, currentStepAttemptCount: 0, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 0, toolCallCount: 2, validatedToolResultCount: 0 } }).run(validWonSummary)
    expect(result.state.status).toBe('stopped'); expect(result.state.stopReason).toBe('tool_call_limit'); expect(result.state.stepCount).toBe(1); expect(result.state.providerAttemptCount).toBe(1); expect(result.state.toolProposalCount).toBe(1); expect(result.state.toolCallCount).toBe(2); expect(result.state.validatedToolResultCount).toBe(0); expect(executions).toBe(0); expect(provider.adapterCallCount).toBe(1)
  })
  it('never starts a third provider attempt for one logical step', async () => {
    const provider = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('transient') }, { type: 'reject', failure: new ProviderFailure('transient') }, { type: 'resolve', value: { kind: 'refusal' } }])
    const result = await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', sleep: async () => {} }).run(validWonSummary)
    expect(result.state.status).toBe('failed'); expect(result.state.stopReason).toBe('provider_failure'); expect(result.state.stepCount).toBe(1); expect(result.state.providerAttemptCount).toBe(2); expect(result.state.currentStepAttemptCount).toBe(2); expect(result.state.retryAttemptCount).toBe(1); expect(result.state.fallbackAttemptCount).toBe(0); expect(provider.adapterCallCount).toBe(2)
  })
  it('caps an allowed provider attempt by the positive remaining run time', async () => {
    let clockCalls = 0; const timers: number[] = []; const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'refusal' } }])
    await new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry(), clock: () => ++clockCalls === 1 ? 0 : 20_000, createId: () => 'run_1', createContextId: () => 'ctx_1', setTimer: (_callback, milliseconds) => { timers.push(milliseconds); return timers.length as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} }).run(validWonSummary)
    expect(timers).toEqual([30_000, 10_000]); expect(provider.adapterCallCount).toBe(1)
  })
  it('discards a late provider completion after deadline terminalization', async () => {
    const timers: (() => void)[] = []; let executions = 0; const provider = new ScriptedAgentModelProvider([{ type: 'deferred', key: 'late' }])
    const pending = new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry({ execute: async () => { executions++; return {} } }), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', setTimer: callback => { timers.push(callback); return timers.length as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} }).run(validWonSummary)
    timers[0]?.(); const result = await pending; const snapshot = result.state
    provider.resolveDeferred('late', { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } })
    await Promise.resolve()
    expect(result.state).toBe(snapshot); expect(result.state.stopReason).toBe('total_deadline'); expect(result.state.providerAttemptCount).toBe(1); expect(result.state.toolCallCount).toBe(0); expect(result.state.validatedToolResultCount).toBe(0); expect(executions).toBe(0)
  })
  it('cancels pending tool work and discards its late completion', async () => {
    const controller = new AbortController(); const toolTimers: number[] = []; let resolveTool: ((value: unknown) => void) | undefined; let started = 0
    const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } } }])
    const pending = new TrainingAgentOrchestrator({ provider, registry: createTrainingToolRegistry({ execute: async () => { started++; return new Promise(resolve => { resolveTool = resolve }) } }, { setTimer: (_callback, milliseconds) => { toolTimers.push(milliseconds); return toolTimers.length as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} }), clock: () => 0, createId: () => 'run_1', createContextId: () => 'ctx_1', signal: controller.signal }).run(validWonSummary)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); controller.abort(); const result = await pending; const snapshot = result.state
    resolveTool?.({}); await Promise.resolve()
    expect(started).toBe(1); expect(toolTimers).toEqual([100]); expect(result.state).toBe(snapshot); expect(result.state.status).toBe('stopped'); expect(result.state.stopReason).toBe('cancelled'); expect(result.state.toolCallCount).toBe(1); expect(result.state.validatedToolResultCount).toBe(0); expect(result.plan).toBeUndefined(); expect(provider.adapterCallCount).toBe(1)
  })
})
