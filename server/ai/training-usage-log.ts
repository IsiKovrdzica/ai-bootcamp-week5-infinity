import type { TrainingEvent } from './training-orchestrator.js'

export type TrainingUsageEvent = TrainingEvent
export type TrainingUsageSink = (event: TrainingUsageEvent) => void

function projectSafeTokenUsage(value: unknown): { input?: number; output?: number } | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = value as { input?: unknown; output?: unknown }
  const input = typeof candidate.input === 'number' && Number.isFinite(candidate.input) && candidate.input >= 0 ? candidate.input : undefined
  const output = typeof candidate.output === 'number' && Number.isFinite(candidate.output) && candidate.output >= 0 ? candidate.output : undefined
  return input === undefined && output === undefined ? undefined : Object.freeze({ ...(input === undefined ? {} : { input }), ...(output === undefined ? {} : { output }) })
}

export function createTrainingUsageSink(write: TrainingUsageSink): TrainingUsageSink {
  return event => { const tokenUsage = projectSafeTokenUsage(event.tokenUsage); write(Object.freeze({
    kind: event.kind,
    runId: event.runId,
    phase: event.phase,
    status: event.status,
    stepCount: event.stepCount,
    providerAttemptCount: event.providerAttemptCount,
    currentStepAttemptCount: event.currentStepAttemptCount,
    retryAttemptCount: event.retryAttemptCount,
    fallbackAttemptCount: event.fallbackAttemptCount,
    toolProposalCount: event.toolProposalCount,
    toolCallCount: event.toolCallCount,
    validatedToolResultCount: event.validatedToolResultCount,
    progressVersion: event.progressVersion,
    elapsedMs: event.elapsedMs,
    ...(event.attemptKind ? { attemptKind: event.attemptKind } : {}),
    ...(event.providerCategory ? { providerCategory: event.providerCategory } : {}),
    ...(event.attemptLatencyMs !== undefined ? { attemptLatencyMs: event.attemptLatencyMs } : {}),
    ...(tokenUsage ? { tokenUsage } : {}),
    ...(event.outcome ? { outcome: event.outcome } : {}),
    ...(event.toolName ? { toolName: event.toolName } : {}),
    ...(event.stopReason ? { stopReason: event.stopReason } : {}),
  })) }
}
