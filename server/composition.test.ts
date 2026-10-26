import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { createGeminiTrainingPlannerService, createProductionAdviceService, createProductionTrainingPlannerService, createTrainingPlannerService } from './composition.js'
import { validWonSummary } from './ai/game-summary-fixtures.js'
import { createTrainingAdmissionController, type TrainingAdmissionPolicy } from './ai/training-admission.js'
import { TrainingAgentOrchestrator } from './ai/training-orchestrator.js'
import { createInFlightOperationTracker, type InFlightOperationTracker } from './ai/training-operation-tracker.js'
import { analyzeGamePerformance } from './ai/training-tool.js'
import { createTrainingToolRegistry } from './ai/training-tool-registry.js'

type Deferred<T> = Readonly<{ promise: Promise<T>; resolve(value: T): void }>

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

const flush = async (): Promise<void> => {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve()
}

const policy: TrainingAdmissionPolicy = {
  maxActiveExecutions: 2,
  maxSuccessfulAdmissions: 5,
  windowMs: 60_000,
}

const refusal = { kind: 'refusal' }

const finalPlan = {
  kind: 'final',
  plan: {
    focus: 'consistency',
    summaryEvidenceIds: ['game.outcome'],
    recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] },
    evidenceIds: ['game.outcome', 'game.completion_rate'],
    confidence: 'high',
    completed: true,
  },
} as const

describe('production advice composition', () => {
  it('maps missing backend Gemini configuration through the existing safe 503 response', async () => {
    const app = createApp(createProductionAdviceService({}))
    const response = await app({
      method: 'POST',
      path: '/api/ai/advice',
      body: JSON.stringify(validWonSummary),
    })

    expect(response).toEqual({
      status: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 'AI_ADVICE_UNAVAILABLE',
          message: 'AI advice is temporarily unavailable. Please try again later.',
        },
      }),
    })
  })
})

describe('production training planner composition', () => {
  it('keeps invalid server configuration unavailable without constructing a planner', async () => {
    let constructions = 0
    const service = createProductionTrainingPlannerService({}, () => {
      constructions += 1
      throw new Error('must not construct')
    })
    expect(await service.createTrainingPlan(validWonSummary)).toMatchObject({ kind: 'unavailable' })
    expect(constructions).toBe(0)
  })

  it('injects only the fixed fallback identity into a configured planner factory', async () => {
    let fallbackModel = ''
    const service = createProductionTrainingPlannerService(
      { GEMINI_API_KEY: 'configured', GEMINI_MODEL: 'configured' },
      (_configuration, fallback) => {
        fallbackModel = fallback
        return {
          async createTrainingPlan() {
            return { kind: 'unavailable' as const, run: { runId: 'unavailable', status: 'failed' as const, stopReason: 'provider_failure' as const, stepCount: 0, providerAttemptCount: 0, toolCallCount: 0, elapsedMs: 0 } }
          },
        }
      },
    )
    await service.createTrainingPlan(validWonSummary)
    expect(fallbackModel).toBe('gemini-3.5-flash-lite')
  })

  it('constructs the actual Gemini training composition with configured primary and exactly fixed fallback providers', async () => {
    const models: string[] = []; let constructions = 0
    const service = createGeminiTrainingPlannerService({ apiKey: 'test-key', model: 'primary-model' }, 'gemini-3.5-flash-lite', configuration => {
      models.push(configuration.model); constructions++
      return constructions === 1
        ? { async generateStep(request) { return request.phase === 'select_tool' ? { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: request.run.gameContextId } } } : { kind: 'final', plan: { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome', 'game.completion_rate'] }, evidenceIds: ['game.outcome', 'game.completion_rate'], confidence: 'high', completed: true } } } }
        : { async generateStep() { throw new Error('fixed fallback must not be selected for successful primary calls') } }
    })
    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'completed' })
    expect(models).toEqual(['primary-model', 'gemini-3.5-flash-lite'])
  })

  it('projects missing planner configuration as the exact safe 503 public envelope', async () => {
    const app = createApp(
      createProductionAdviceService({}),
      createProductionTrainingPlannerService({}),
    )
    await expect(app({ method: 'POST', path: '/api/ai/training-plan', body: JSON.stringify(validWonSummary) })).resolves.toEqual({
      status: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        run: { runId: 'unavailable', status: 'failed', stopReason: 'provider_failure', stepCount: 0, providerAttemptCount: 0, toolCallCount: 0, elapsedMs: 0 },
        error: { code: 'TRAINING_PLAN_UNAVAILABLE', message: 'Training plan is temporarily unavailable. Please try again later.' },
      }),
    })
  })
})

describe('W08 training planner admission composition', () => {
  it('releases an acquired lease immediately when tracker construction fails before work can start', async () => {
    const admission = createTrainingAdmissionController({ policy, now: () => 1_000 })
    const service = createTrainingPlannerService({
      async run() { throw new Error('must not invoke orchestrator') },
    } as unknown as TrainingAgentOrchestrator, {
      admissionController: admission,
      createOperationTracker: () => { throw new Error('tracker construction failed') },
    })

    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'unavailable' })
    const first = admission.tryAcquire()
    const second = admission.tryAcquire()
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (first.ok) first.lease.release()
    if (second.ok) second.lease.release()
  })

  it('closes an empty tracker and releases after an orchestrator rejection before raw work', async () => {
    const admission = createTrainingAdmissionController({ policy, now: () => 1_000 })
    const service = createTrainingPlannerService({
      async run() { throw new Error('orchestrator failed before provider start') },
    } as unknown as TrainingAgentOrchestrator, {
      admissionController: admission,
      createOperationTracker: createInFlightOperationTracker,
    })

    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'unavailable' })
    await flush()
    const first = admission.tryAcquire()
    const second = admission.tryAcquire()
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (first.ok) first.lease.release()
    if (second.ok) second.lease.release()
  })

  it('keeps capacity fail-closed when an orchestrator rejection leaves registered raw work pending', async () => {
    const admission = createTrainingAdmissionController({ policy, now: () => 1_000 })
    const raw = deferred<unknown>()
    const service = createTrainingPlannerService({
      async run(_input: unknown, tracker: InFlightOperationTracker | undefined) {
        tracker?.start('provider_attempt', () => raw.promise)
        throw new Error('orchestrator failed after provider start')
      },
    } as unknown as TrainingAgentOrchestrator, {
      admissionController: admission,
      createOperationTracker: createInFlightOperationTracker,
    })

    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'unavailable' })
    const second = admission.tryAcquire()
    expect(second.ok).toBe(true)
    expect(admission.tryAcquire()).toEqual({ ok: false, reason: 'concurrency_limited' })

    raw.resolve(refusal)
    await flush()
    const recovered = admission.tryAcquire()
    expect(recovered.ok).toBe(true)
    if (second.ok) second.lease.release()
    if (recovered.ok) recovered.lease.release()
  })

  it('shares the production capacity budget across separately constructed planner services', async () => {
    const primaryModel = 'synthetic-primary'
    const raw = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()]
    const providerCalls = [0, 0, 0]
    let primaryProviders = 0
    const createProvider = (configuration: { model: string }) => {
      if (configuration.model !== primaryModel) return { async generateStep() { return refusal } }
      const index = primaryProviders
      primaryProviders += 1
      return {
        async generateStep() {
          providerCalls[index] += 1
          return raw[index].promise
        },
      }
    }
    const createService = () => createGeminiTrainingPlannerService(
      { apiKey: 'synthetic', model: primaryModel },
      'synthetic-fallback',
      createProvider,
    )
    const firstService = createService()
    const secondService = createService()
    const deniedService = createService()

    const first = firstService.createTrainingPlan(validWonSummary)
    const second = secondService.createTrainingPlan(validWonSummary)
    await flush()
    await expect(deniedService.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'unavailable', admissionDeniedReason: 'concurrency_limited' })
    expect(providerCalls).toEqual([1, 1, 0])

    raw[0].resolve(refusal)
    raw[1].resolve(refusal)
    await Promise.all([first, second])
  })

  it('shares admission across planner requests and denies a third concurrent run before provider or tool work', async () => {
    let now = 1_000
    const admission = createTrainingAdmissionController({ policy, now: () => now })
    const pending: Deferred<unknown>[] = []
    let providerCalls = 0
    let toolCalls = 0
    const provider = {
      generateStep: async () => {
        providerCalls += 1
        if (providerCalls <= 2) {
          const operation = deferred<unknown>()
          pending.push(operation)
          return operation.promise
        }
        return refusal
      },
    }
    const service = createTrainingPlannerService(new TrainingAgentOrchestrator({
      provider,
      registry: createTrainingToolRegistry({ execute: async () => { toolCalls += 1; return {} } }),
      clock: () => now,
      createId: () => `run_${providerCalls}`,
      createContextId: () => `ctx_${providerCalls}`,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
    }), { admissionController: admission })

    const first = service.createTrainingPlan(validWonSummary)
    const second = service.createTrainingPlan(validWonSummary)
    await flush()
    expect(providerCalls).toBe(2)

    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'unavailable', admissionDeniedReason: 'concurrency_limited' })
    expect(providerCalls).toBe(2)
    expect(toolCalls).toBe(0)

    pending[0].resolve(refusal)
    pending[1].resolve(refusal)
    await Promise.all([first, second])
    await flush()

    for (let count = 0; count < 3; count += 1) {
      await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'rejected' })
    }
    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'unavailable', admissionDeniedReason: 'rate_limited' })
    expect(providerCalls).toBe(5)
  })

  it('uses the injected monotonic clock for exact sliding-window recovery', async () => {
    let now = 1_000
    let providerCalls = 0
    const service = createTrainingPlannerService(new TrainingAgentOrchestrator({
      provider: { async generateStep() { providerCalls += 1; return refusal } },
      registry: createTrainingToolRegistry(),
      clock: () => now,
      createId: () => `run_${providerCalls}`,
      createContextId: () => `ctx_${providerCalls}`,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
    }), { admissionController: createTrainingAdmissionController({ policy, now: () => now }) })

    await expect(service.createTrainingPlan({})).resolves.toMatchObject({ kind: 'rejected' })
    expect(providerCalls).toBe(0)
    for (let count = 0; count < 5; count += 1) {
      await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'rejected' })
      now += 1
    }
    now = 61_000
    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'unavailable', admissionDeniedReason: 'rate_limited' })
    now = 61_001
    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'rejected' })
    expect(providerCalls).toBe(6)
  })

  it('retains a timed-out raw tool lease until its underlying work settles, then admits a later normal W05 run', async () => {
    let now = 1_000
    let providerCalls = 0
    let toolCalls = 0
    const timers: (() => void)[] = []
    const rawTools = [deferred<unknown>(), deferred<unknown>()]
    const provider = {
      async generateStep(request: { phase: 'select_tool' | 'produce_final'; run: { gameContextId: string } }) {
        providerCalls += 1
        return request.phase === 'select_tool'
          ? { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: request.run.gameContextId } } }
          : finalPlan
      },
    }
    const registry = createTrainingToolRegistry({
      async execute(args, context) {
        toolCalls += 1
        if (toolCalls <= 2) return rawTools[toolCalls - 1].promise
        return analyzeGamePerformance(context.gameSummary, args.gameContextId)
      },
    }, {
      setTimer(callback) { timers.push(callback); return timers.length as unknown as ReturnType<typeof setTimeout> },
      clearTimer() {},
    })
    const service = createTrainingPlannerService(new TrainingAgentOrchestrator({
      provider,
      registry,
      clock: () => now,
      createId: () => `run_${providerCalls}`,
      createContextId: () => `ctx_${providerCalls}`,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
    }), { admissionController: createTrainingAdmissionController({ policy, now: () => now }) })

    const first = service.createTrainingPlan(validWonSummary)
    await flush()
    timers.shift()?.()
    await expect(first).resolves.toMatchObject({ kind: 'unavailable' })

    const second = service.createTrainingPlan(validWonSummary)
    await flush()
    timers.shift()?.()
    await expect(second).resolves.toMatchObject({ kind: 'unavailable' })

    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'unavailable', admissionDeniedReason: 'concurrency_limited' })
    expect(providerCalls).toBe(2)
    expect(toolCalls).toBe(2)

    rawTools[0].resolve({})
    await flush()
    await expect(service.createTrainingPlan(validWonSummary)).resolves.toMatchObject({
      kind: 'completed',
      run: { stepCount: 2, providerAttemptCount: 2, toolCallCount: 1 },
    })
    expect(toolCalls).toBe(3)
    expect(providerCalls).toBe(4)

    rawTools[1].resolve({})
  })

  it('retains a cancelled public run lease until an abort-ignoring provider settles', async () => {
    let now = 1_000
    const admission = createTrainingAdmissionController({ policy, now: () => now })
    const firstRaw = deferred<unknown>()
    const secondRaw = deferred<unknown>()
    const firstAbort = new AbortController()
    let firstProviderCalls = 0
    let secondProviderCalls = 0
    let deniedProviderCalls = 0
    let toolCalls = 0
    const createPendingService = (raw: Deferred<unknown>, signal?: AbortSignal, count?: () => void) => createTrainingPlannerService(new TrainingAgentOrchestrator({
      provider: {
        async generateStep(_request, options) {
          count?.()
          options.signal.addEventListener('abort', () => {}, { once: true })
          return raw.promise
        },
      },
      registry: createTrainingToolRegistry({ execute: async () => { toolCalls += 1; return {} } }),
      clock: () => now,
      createId: () => 'pending_run',
      createContextId: () => 'pending_ctx',
      signal,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
    }), { admissionController: admission })
    const cancelledService = createPendingService(firstRaw, firstAbort.signal, () => { firstProviderCalls += 1 })
    const retainedService = createPendingService(secondRaw, undefined, () => { secondProviderCalls += 1 })
    const deniedService = createTrainingPlannerService(new TrainingAgentOrchestrator({
      provider: { async generateStep() { deniedProviderCalls += 1; return refusal } },
      registry: createTrainingToolRegistry({ execute: async () => { toolCalls += 1; return {} } }),
      clock: () => now,
      createId: () => 'denied_run',
      createContextId: () => 'denied_ctx',
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
    }), { admissionController: admission })

    const cancelled = cancelledService.createTrainingPlan(validWonSummary)
    await flush()
    firstAbort.abort()
    await expect(cancelled).resolves.toMatchObject({ kind: 'rejected', run: { status: 'stopped', stopReason: 'cancelled' } })

    const retained = retainedService.createTrainingPlan(validWonSummary)
    await flush()
    await expect(deniedService.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'unavailable', admissionDeniedReason: 'concurrency_limited' })
    expect(firstProviderCalls).toBe(1)
    expect(secondProviderCalls).toBe(1)
    expect(deniedProviderCalls).toBe(0)
    expect(toolCalls).toBe(0)

    firstRaw.resolve(refusal)
    await flush()
    await expect(deniedService.createTrainingPlan(validWonSummary)).resolves.toMatchObject({ kind: 'rejected' })

    secondRaw.resolve(refusal)
    await retained
  })
})
