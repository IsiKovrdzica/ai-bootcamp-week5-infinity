import type { TrainingEvent } from './training-orchestrator.js'

export type TrainingUsageEvent = TrainingEvent
export type TrainingUsageSink = (event: TrainingUsageEvent) => void

export function createTrainingUsageSink(write: TrainingUsageSink): TrainingUsageSink {
  return event => write(Object.freeze({
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
    ...(event.outcome ? { outcome: event.outcome } : {}),
    ...(event.toolName ? { toolName: event.toolName } : {}),
    ...(event.stopReason ? { stopReason: event.stopReason } : {}),
  }))
}
