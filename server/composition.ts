import { createAdviceService, type AdviceService } from './ai/advice-service.js'
import { GEMINI_FALLBACK_MODEL, readGeminiConfig } from './ai/config.js'
import { GeminiAiAdviceProvider } from './ai/gemini-provider.js'
import { GeminiTrainingStepProvider } from './ai/training-gemini-provider.js'
import { TrainingAgentOrchestrator } from './ai/training-orchestrator.js'
import { createTrainingAdmissionController, type TrainingAdmissionController, type TrainingAdmissionPolicy } from './ai/training-admission.js'
import { createInFlightOperationTracker, type InFlightOperationTracker } from './ai/training-operation-tracker.js'
import { createTrainingToolRegistry } from './ai/training-tool-registry.js'
import { validateTrainingInitialSummary } from './ai/training-validation.js'
import { createTrainingSecurityEventProjector, type SecurityEvent } from './ai/training-security-events.js'
import type { TrainingSecurityEventContext } from './ai/training-orchestrator.js'
import type { TrainingPlan } from '../src/ai/training-contracts.js'
import type { PublicTrainingRun } from '../src/ai/training-contracts.js'
import type { GeminiConfig } from './ai/config.js'
import type { AgentModelProvider } from './ai/training-provider.js'

export type TrainingPlannerServiceResult =
  | { readonly kind: 'completed'; readonly run: PublicTrainingRun; readonly plan: TrainingPlan }
  | { readonly kind: 'rejected'; readonly run: PublicTrainingRun }
  | { readonly kind: 'unavailable'; readonly run: PublicTrainingRun }
  | { readonly kind: 'unavailable'; readonly run: PublicTrainingRun; readonly admissionDeniedReason: 'rate_limited' | 'concurrency_limited' }

export type TrainingPlannerService = {
  createTrainingPlan(input: unknown, options?: { signal?: AbortSignal }): Promise<TrainingPlannerServiceResult>
}

export type TrainingPlannerServiceFactory = (
  configuration: Readonly<GeminiConfig>,
  fallbackModel: string,
) => TrainingPlannerService

export const TRAINING_ADMISSION_POLICY: TrainingAdmissionPolicy = Object.freeze({
  maxActiveExecutions: 2,
  maxSuccessfulAdmissions: 5,
  windowMs: 60_000,
})

const productionAdmissionController = createTrainingAdmissionController({
  policy: TRAINING_ADMISSION_POLICY,
  now: () => Date.now(),
})

export type TrainingPlannerServiceOptions = Readonly<{
  admissionController?: TrainingAdmissionController
  createOperationTracker?: () => InFlightOperationTracker
  securityEventSink?: (event: SecurityEvent) => void
  createSecurityCorrelationId?: () => string
}>

type TrackerAwareTrainingOrchestrator = Readonly<{
  run(input: unknown, tracker?: InFlightOperationTracker, securityEvents?: TrainingSecurityEventContext, signal?: AbortSignal): ReturnType<TrainingAgentOrchestrator['run']>
}>

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

const unavailableTrainingRun = (): PublicTrainingRun => ({
  runId: 'unavailable',
  status: 'failed',
  stopReason: 'provider_failure',
  stepCount: 0,
  providerAttemptCount: 0,
  toolCallCount: 0,
  elapsedMs: 0,
})

function projectTrainingRun(result: Awaited<ReturnType<TrainingAgentOrchestrator['run']>>): PublicTrainingRun {
  const { runId, status, stopReason, stepCount, providerAttemptCount, toolCallCount } = result.state
  return { runId, status: status === 'running' ? 'failed' : status, stopReason: stopReason ?? 'provider_failure', stepCount, providerAttemptCount, toolCallCount, elapsedMs: 0 }
}

export function createTrainingPlannerService(
  orchestrator: TrackerAwareTrainingOrchestrator,
  options: TrainingPlannerServiceOptions = {},
): TrainingPlannerService {
  const admissionController = options.admissionController ?? createTrainingAdmissionController({
    policy: TRAINING_ADMISSION_POLICY,
    now: () => Date.now(),
  })
  const createOperationTracker = options.createOperationTracker ?? createInFlightOperationTracker
  const securityEventSink = options.securityEventSink ?? (() => {})
  const createSecurityCorrelationId = options.createSecurityCorrelationId ?? (() => globalThis.crypto.randomUUID().replaceAll('-', ''))

  return {
    async createTrainingPlan(input, invocationOptions) {
      const initial = validateTrainingInitialSummary(input)
      if (!initial.ok) {
        const result = await orchestrator.run(input, undefined, undefined, invocationOptions?.signal)
        const run = projectTrainingRun(result)
        return run.status === 'stopped' ? { kind: 'rejected', run } : { kind: 'unavailable', run }
      }

      const correlationId = createSecurityCorrelationId()
      const projector = createTrainingSecurityEventProjector({ createCorrelationId: () => correlationId })
      const securityEvents: TrainingSecurityEventContext = {
        admissionSnapshot: () => admissionController.securityEventSnapshot(),
        report(event) {
          const projected = projector.project(event)
          if (projected === undefined) return
          try {
            securityEventSink(projected)
          } catch {
            // Security observation is non-authoritative and must not change planner routing.
          }
        },
      }

      const admission = admissionController.tryAcquire()
      if (!admission.ok) {
        const snapshot = securityEvents.admissionSnapshot()
        securityEvents.report({
          kind: 'planner.admission_denied',
          outcome: 'denied',
          reasonCode: admission.reason === 'rate_limited' ? 'RATE_LIMITED' : 'CONCURRENCY_LIMITED',
          activeExecutionCount: snapshot.activeExecutionCount,
          admissionsInWindow: snapshot.admissionsInWindow,
          stepCount: 0,
          providerAttemptCount: 0,
          toolCallCount: 0,
          elapsedMs: 0,
        })
        return {
          kind: 'unavailable',
          run: { ...unavailableTrainingRun(), runId: 'admission_denied' },
          admissionDeniedReason: admission.reason,
        }
      }

      const admittedSnapshot = securityEvents.admissionSnapshot()
      securityEvents.report({
        kind: 'planner.admitted',
        outcome: 'allowed',
        activeExecutionCount: admittedSnapshot.activeExecutionCount,
        admissionsInWindow: admittedSnapshot.admissionsInWindow,
        stepCount: 0,
        providerAttemptCount: 0,
        toolCallCount: 0,
        elapsedMs: 0,
      })

      let operationTracker: InFlightOperationTracker
      try {
        operationTracker = createOperationTracker()
      } catch {
        admission.lease.release()
        return { kind: 'unavailable', run: unavailableTrainingRun() }
      }

      void operationTracker.drained.then(
        () => admission.lease.release(),
        () => {},
      ).catch(() => {})

      try {
        const result = await orchestrator.run(input, operationTracker, securityEvents, invocationOptions?.signal)
        const run = projectTrainingRun(result)
        if (run.status === 'completed' && result.plan) return { kind: 'completed', run, plan: result.plan }
        return run.status === 'stopped' ? { kind: 'rejected', run } : { kind: 'unavailable', run }
      } catch {
        return { kind: 'unavailable', run: unavailableTrainingRun() }
      } finally {
        operationTracker.closeRegistration()
      }
    },
  }
}

export function createProductionTrainingPlannerService(
  environment: Record<string, string | undefined>,
  factory?: TrainingPlannerServiceFactory,
): TrainingPlannerService {
  const configuration = readGeminiConfig(environment)
  if (!configuration.ok) return unavailableTrainingPlannerService
  return (factory ?? createGeminiTrainingPlannerService)(configuration.value, GEMINI_FALLBACK_MODEL)
}

export function createGeminiTrainingPlannerService(
  configuration: Readonly<GeminiConfig>,
  fallbackModel: string,
  createProvider: (value: Readonly<GeminiConfig>) => AgentModelProvider = value => new GeminiTrainingStepProvider(value),
): TrainingPlannerService {
  const id = () => globalThis.crypto.randomUUID().replaceAll('-', '')
  return createTrainingPlannerService(new TrainingAgentOrchestrator({
    provider: createProvider(configuration),
    fallbackProvider: createProvider({ apiKey: configuration.apiKey, model: fallbackModel }),
    registry: createTrainingToolRegistry(), clock: () => Date.now(), createId: id, createContextId: id,
  }), { admissionController: productionAdmissionController })
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
