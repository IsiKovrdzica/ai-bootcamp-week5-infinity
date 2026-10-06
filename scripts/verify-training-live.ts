import { readGeminiConfig } from '../server/ai/config.js'
import { createProductionTrainingPlannerService, type TrainingPlannerService } from '../server/composition.js'

/** Fixed, completed, non-private fixture; this module accepts no operator input. */
export const FIXED_TRAINING_LIVE_FIXTURE = Object.freeze({
  outcome: 'WON' as const,
  score: 320,
  bricksDestroyed: 32,
  livesRemaining: 3,
  livesLost: 0,
  durationSeconds: 30,
})

export type TrainingLiveVerificationRecord = Readonly<{
  date: string
  providerCategory: 'gemini' | 'not_configured'
  elapsedMs: number
  logicalStepCount: number
  providerAttemptCount: number
  toolCallCount: number
  stopReason: string
  validationResult: 'PASS' | 'CLASSIFIED_FAILURE' | 'SKIPPED'
}>

export type TrainingLiveVerificationDependencies = Readonly<{
  now?: () => Date
  requestedRuns?: number
  createService?: (environment: Record<string, string | undefined>) => TrainingPlannerService
}>

const record = (date: string, providerCategory: TrainingLiveVerificationRecord['providerCategory'], elapsedMs: number, logicalStepCount: number, providerAttemptCount: number, toolCallCount: number, stopReason: string, validationResult: TrainingLiveVerificationRecord['validationResult']): TrainingLiveVerificationRecord => Object.freeze({ date, providerCategory, elapsedMs: Math.max(0, Math.min(30_000, Math.floor(elapsedMs))), logicalStepCount, providerAttemptCount, toolCallCount, stopReason, validationResult })

/**
 * The sole future live entry point. It composes the production service only after
 * config preflight, performs exactly one fixed-fixture run, and returns no data
 * beyond the T102-approved record fields.
 */
export async function runTrainingLiveVerification(environment: Record<string, string | undefined>, dependencies: TrainingLiveVerificationDependencies = {}): Promise<TrainingLiveVerificationRecord> {
  const date = (dependencies.now ?? (() => new Date()))().toISOString().slice(0, 10)
  if ((dependencies.requestedRuns ?? 1) !== 1) return record(date, 'gemini', 0, 0, 0, 0, 'provider_attempt_limit', 'CLASSIFIED_FAILURE')
  if (!readGeminiConfig(environment).ok) return record(date, 'not_configured', 0, 0, 0, 0, 'provider_failure', 'SKIPPED')

  try {
    const service = (dependencies.createService ?? createProductionTrainingPlannerService)(environment)
    const result = await service.createTrainingPlan(FIXED_TRAINING_LIVE_FIXTURE)
    const run = result.run
    return record(date, 'gemini', run.elapsedMs, run.stepCount, run.providerAttemptCount, run.toolCallCount, run.stopReason, result.kind === 'completed' ? 'PASS' : 'CLASSIFIED_FAILURE')
  } catch {
    return record(date, 'gemini', 0, 0, 0, 0, 'provider_failure', 'CLASSIFIED_FAILURE')
  }
}

if (process.argv[1]?.endsWith('verify-training-live.ts')) {
  void runTrainingLiveVerification(process.env).then(result => console.log(JSON.stringify(result)))
}
