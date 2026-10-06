import type { GameSummary } from './contracts.js'
import type { PublicTrainingRun, TrainingPlan } from './training-contracts.js'
import type { BrowserFetch } from './api-client.js'

export type TrainingPlanTransportResult =
  | { ok: true; kind: 'completed'; plan: TrainingPlan }
  | { ok: false }

export type TrainingPlanTransport = (
  summary: Readonly<GameSummary>,
  options?: { signal?: AbortSignal },
) => Promise<TrainingPlanTransportResult>

export function createTrainingPlanTransport(fetch: BrowserFetch): TrainingPlanTransport {
  return async (summary, options) => {
    try {
      const response = await fetch('/api/ai/training-plan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(summary), signal: options?.signal,
      })
      const payload: unknown = await response.json()
      if (response.status === 200 && isCompletedEnvelope(payload)) {
        return { ok: true, kind: 'completed', plan: payload.plan }
      }
      if ((response.status === 422 || response.status === 503) && isSafeFailureEnvelope(payload, response.status)) return { ok: false }
      return { ok: false }
    } catch { return { ok: false } }
  }
}

function isCompletedEnvelope(value: unknown): value is { run: PublicTrainingRun & { status: 'completed'; stopReason: 'completed' }; plan: TrainingPlan } {
  if (!isExactObject(value, ['run', 'plan'])) return false
  return isRun(value.run, 'completed') && isTrainingPlan(value.plan)
}
function isSafeFailureEnvelope(value: unknown, status: number): boolean {
  if (!isExactObject(value, ['run', 'error'])) return false
  const failed = status === 503
  return isRun(value.run, failed ? 'failed' : 'stopped') && isExactObject(value.error, ['code', 'message']) &&
    value.error.code === (failed ? 'TRAINING_PLAN_UNAVAILABLE' : 'TRAINING_PLAN_REJECTED') &&
    value.error.message === (failed ? 'Training plan is temporarily unavailable. Please try again later.' : 'Training plan could not be completed safely.')
}
function isRun(value: unknown, status: 'completed' | 'stopped' | 'failed'): value is PublicTrainingRun {
  if (!isExactObject(value, ['runId', 'status', 'stopReason', 'stepCount', 'providerAttemptCount', 'toolCallCount', 'elapsedMs'])) return false
  return typeof value.runId === 'string' && value.runId.length > 0 && value.runId.length <= 64 && value.status === status &&
    isStopReason(value.stopReason) && (status !== 'completed' || value.stopReason === 'completed') &&
    isBoundedInteger(value.stepCount, 3) && isBoundedInteger(value.providerAttemptCount, 6) && isBoundedInteger(value.toolCallCount, 2) && isBoundedInteger(value.elapsedMs, 30_000)
}
function isTrainingPlan(value: unknown): value is TrainingPlan {
  if (!isExactObject(value, ['summary', 'focus', 'recommendation', 'evidence', 'confidence', 'completed'])) return false
  return isText(value.summary, 200) && (value.focus === 'survival' || value.focus === 'efficiency' || value.focus === 'consistency') &&
    isText(value.recommendation, 240) && Array.isArray(value.evidence) && value.evidence.length >= 1 && value.evidence.length <= 3 &&
    value.evidence.every((entry) => isExactObject(entry, ['id', 'finding']) && isEvidenceId(entry.id) && isText(entry.finding, 120)) &&
    new Set(value.evidence.map((entry) => entry.id)).size === value.evidence.length &&
    (value.confidence === 'low' || value.confidence === 'medium' || value.confidence === 'high') && value.completed === true
}
function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false
  const actual = Object.keys(value).sort(); return actual.length === keys.length && actual.join(',') === [...keys].sort().join(',')
}
function isText(value: unknown, maximum: number): value is string { return typeof value === 'string' && value.trim().length > 0 && [...value].length <= maximum }
function isBoundedInteger(value: unknown, maximum: number): boolean { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum }
function isEvidenceId(value: unknown): boolean { return value === 'game.outcome' || value === 'game.bricks_destroyed' || value === 'game.completion_rate' || value === 'game.duration_seconds' || value === 'game.bricks_per_minute' || value === 'game.lives' }
function isStopReason(value: unknown): boolean { return value === 'completed' || value === 'invalid_model_proposal' || value === 'unknown_tool' || value === 'invalid_tool_arguments' || value === 'invalid_tool_result' || value === 'tool_failure' || value === 'provider_failure' || value === 'step_limit' || value === 'tool_call_limit' || value === 'provider_attempt_limit' || value === 'total_deadline' || value === 'repeated_action' || value === 'invalid_final_output' || value === 'cancelled' }
