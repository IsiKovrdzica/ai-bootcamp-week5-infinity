import { describe, expect, it } from 'vitest'
import { validWonSummary } from './game-summary-fixtures.js'
import { ScriptedAgentModelProvider } from './training-fake-provider.js'
import { TrainingAgentOrchestrator } from './training-orchestrator.js'
import { analyzeGamePerformance } from './training-tool.js'
import { createTrainingToolRegistry } from './training-tool-registry.js'

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
    expect(timersStarted).toBe(1)
    expect(timersCleared).toBe(1)
    expect(events.map(event => (event as { kind: string }).kind)).toEqual(['run_started', 'step_started', 'provider_attempt_settled', 'proposal_validated', 'tool_execution_settled', 'tool_result_validated', 'step_started', 'provider_attempt_settled', 'final_validated', 'run_finished'])
    expect(events.every(event => !Object.hasOwn(event as object, 'gameSummary') && !Object.hasOwn(event as object, 'response'))).toBe(true)
    expect(result.plan).toEqual({ summary: 'The completed game supports a consistency training focus.', focus: 'consistency', recommendation: 'For the next game, aim to repeat the completed clear.', evidence: [{ id: 'game.outcome', finding: 'Outcome: WON.' }, { id: 'game.completion_rate', finding: 'Completion rate: 100.00%.' }], confidence: 'high', completed: true })
  })
})
