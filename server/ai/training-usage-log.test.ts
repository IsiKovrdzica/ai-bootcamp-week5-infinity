import { describe, expect, it } from 'vitest'
import { createTrainingUsageSink } from './training-usage-log.js'
import type { TrainingEvent } from './training-orchestrator.js'

describe('T48 sanitized training usage events', () => {
  it('projects only the fixed safe event fields', () => {
    const events: unknown[] = []; const sink = createTrainingUsageSink(event => events.push(event))
    sink({ kind: 'run_finished', runId: 'run_1', phase: 'terminal', status: 'failed', stepCount: 2, providerAttemptCount: 2, currentStepAttemptCount: 1, retryAttemptCount: 0, fallbackAttemptCount: 1, toolProposalCount: 1, toolCallCount: 1, validatedToolResultCount: 1, progressVersion: 1, elapsedMs: 42, stopReason: 'provider_failure', tokenUsage: { input: 21, output: 8, raw: 'USAGE_SENTINEL' }, gameSummary: { secret: 'SUMMARY_SENTINEL' }, arguments: { gameContextId: 'ARGUMENT_SENTINEL' }, evidence: { finding: 'EVIDENCE_SENTINEL' }, prompt: 'PROMPT_SENTINEL', response: 'RESPONSE_SENTINEL', rawError: 'ERROR_SENTINEL', stack: 'STACK_SENTINEL', apiKey: 'SECRET_SENTINEL' } as never)
    expect(events).toEqual([{ kind: 'run_finished', runId: 'run_1', phase: 'terminal', status: 'failed', stepCount: 2, providerAttemptCount: 2, currentStepAttemptCount: 1, retryAttemptCount: 0, fallbackAttemptCount: 1, toolProposalCount: 1, toolCallCount: 1, validatedToolResultCount: 1, progressVersion: 1, elapsedMs: 42, stopReason: 'provider_failure', tokenUsage: { input: 21, output: 8 } }])
    const serialized = JSON.stringify(events)
    for (const forbidden of ['USAGE_SENTINEL', 'SUMMARY_SENTINEL', 'ARGUMENT_SENTINEL', 'EVIDENCE_SENTINEL', 'PROMPT_SENTINEL', 'RESPONSE_SENTINEL', 'ERROR_SENTINEL', 'STACK_SENTINEL', 'SECRET_SENTINEL', 'gameSummary', 'arguments', 'evidence', 'prompt', 'response', 'rawError', 'stack', 'apiKey', 'raw']) expect(serialized).not.toContain(forbidden)
  })

  it('preserves documented W05 cumulative counters for a normal successful event sequence', () => {
    const events: unknown[] = []
    const sink = createTrainingUsageSink(event => events.push(event))
    const normalSuccessEvents: readonly TrainingEvent[] = [
      { kind: 'run_started', runId: 'run_success', phase: 'awaiting_tool', status: 'running', stepCount: 0, providerAttemptCount: 0, currentStepAttemptCount: 0, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 0, toolCallCount: 0, validatedToolResultCount: 0, progressVersion: 0, elapsedMs: 0 },
      { kind: 'proposal_validated', runId: 'run_success', phase: 'awaiting_tool', status: 'running', stepCount: 1, providerAttemptCount: 1, currentStepAttemptCount: 1, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 1, toolCallCount: 0, validatedToolResultCount: 0, progressVersion: 0, elapsedMs: 1, outcome: 'validated', toolName: 'analyze_game_performance' },
      { kind: 'run_finished', runId: 'run_success', phase: 'terminal', status: 'completed', stepCount: 2, providerAttemptCount: 2, currentStepAttemptCount: 1, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 1, toolCallCount: 1, validatedToolResultCount: 1, progressVersion: 2, elapsedMs: 2, stopReason: 'completed' },
    ]

    normalSuccessEvents.forEach(sink)

    expect(events.map(event => (event as TrainingEvent).kind)).toEqual(['run_started', 'proposal_validated', 'run_finished'])
    expect(events.at(-1)).toMatchObject({ status: 'completed', stepCount: 2, providerAttemptCount: 2, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 1, toolCallCount: 1, validatedToolResultCount: 1, stopReason: 'completed' })
  })
})
