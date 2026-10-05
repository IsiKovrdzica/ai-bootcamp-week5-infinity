import { createAdviceService, type AdviceService } from './ai/advice-service.js'
import { GEMINI_FALLBACK_MODEL, readGeminiConfig } from './ai/config.js'
import { GeminiAiAdviceProvider } from './ai/gemini-provider.js'
import type { TrainingPlan } from '../src/ai/training-contracts.js'
import type { PublicTrainingRun } from '../src/ai/training-contracts.js'
import type { TrainingAgentOrchestrator } from './ai/training-orchestrator.js'
import type { GeminiConfig } from './ai/config.js'

export type TrainingPlannerServiceResult =
  | { readonly kind: 'completed'; readonly run: PublicTrainingRun; readonly plan: TrainingPlan }
  | { readonly kind: 'rejected'; readonly run: PublicTrainingRun }
  | { readonly kind: 'unavailable'; readonly run: PublicTrainingRun }

export type TrainingPlannerService = {
  createTrainingPlan(input: unknown): Promise<TrainingPlannerServiceResult>
}

export type TrainingPlannerServiceFactory = (
  configuration: Readonly<GeminiConfig>,
  fallbackModel: string,
) => TrainingPlannerService

const unavailableService: AdviceService = {
  async requestAdvice() {
    return { ok: false, kind: 'unavailable' }
  },
}

const unavailableTrainingPlannerService: TrainingPlannerService = {
  async createTrainingPlan() {
    return {
      kind: 'unavailable',
      run: { runId: 'unavailable', status: 'failed', stopReason: 'provider_failure', stepCount: 0, providerAttemptCount: 0, toolCallCount: 0, elapsedMs: 0 },
    }
  },
}

function projectTrainingRun(result: Awaited<ReturnType<TrainingAgentOrchestrator['run']>>): PublicTrainingRun {
  const { runId, status, stopReason, stepCount, providerAttemptCount, toolCallCount } = result.state
  return { runId, status: status === 'running' ? 'failed' : status, stopReason: stopReason ?? 'provider_failure', stepCount, providerAttemptCount, toolCallCount, elapsedMs: 0 }
}

export function createTrainingPlannerService(orchestrator: Pick<TrainingAgentOrchestrator, 'run'>): TrainingPlannerService {
  return {
    async createTrainingPlan(input) {
      const result = await orchestrator.run(input)
      const run = projectTrainingRun(result)
      if (run.status === 'completed' && result.plan) return { kind: 'completed', run, plan: result.plan }
      return run.status === 'stopped' ? { kind: 'rejected', run } : { kind: 'unavailable', run }
    },
  }
}

export function createProductionTrainingPlannerService(
  environment: Record<string, string | undefined>,
  factory?: TrainingPlannerServiceFactory,
): TrainingPlannerService {
  const configuration = readGeminiConfig(environment)
  if (!configuration.ok || !factory) return unavailableTrainingPlannerService
  return factory(configuration.value, GEMINI_FALLBACK_MODEL)
}

export function createProductionAdviceService(
  environment: Record<string, string | undefined>,
): AdviceService {
  const configuration = readGeminiConfig(environment)
  if (!configuration.ok) return unavailableService
  return createAdviceService(
    new GeminiAiAdviceProvider(configuration.value),
    undefined,
    {
      provider: 'gemini',
      model: configuration.value.model,
      fallbackModel: GEMINI_FALLBACK_MODEL,
    },
    new GeminiAiAdviceProvider({
      apiKey: configuration.value.apiKey,
      model: GEMINI_FALLBACK_MODEL,
    }),
  )
}
