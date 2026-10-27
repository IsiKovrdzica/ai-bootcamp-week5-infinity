import { createServer, request as httpRequest, type ClientRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createAdviceService } from './ai/advice-service.js'
import { FakeAiAdviceProvider } from './ai/fake-provider.js'
import { validWonSummary } from './ai/game-summary-fixtures.js'
import { createTrainingAdmissionController, type TrainingAdmissionController } from './ai/training-admission.js'
import { ScriptedAgentModelProvider } from './ai/training-fake-provider.js'
import { TrainingAgentOrchestrator } from './ai/training-orchestrator.js'
import { analyzeGamePerformance } from './ai/training-tool.js'
import { createTrainingToolRegistry } from './ai/training-tool-registry.js'
import type { SecurityEvent } from './ai/training-security-events.js'
import { createApp, createNodeHttpHandler, MAX_REQUEST_BODY_BYTES } from './app.js'
import { createTrainingPlannerService } from './composition.js'

const invalidEnvelope = {
  error: { code: 'INVALID_GAME_SUMMARY', message: 'Invalid game summary.' },
}

const consistencyFinalProposal = {
  kind: 'final' as const,
  plan: {
    focus: 'consistency' as const,
    summaryEvidenceIds: ['game.outcome'] as const,
    recommendation: {
      action: 'repeat_completed_clear' as const,
      evidenceIds: ['game.outcome', 'game.completion_rate'] as const,
    },
    evidenceIds: ['game.outcome', 'game.completion_rate'] as const,
    confidence: 'high' as const,
    completed: true as const,
  },
}

type NetworkResponse = Readonly<{
  status: number
  headers: Readonly<Record<string, string | string[] | undefined>>
  body: string
}>

const openServers = new Set<Server>()

afterEach(async () => {
  await Promise.all([...openServers].map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  openServers.clear()
})

function countingAdmission(deniedReason?: 'rate_limited' | 'concurrency_limited'): { controller: TrainingAdmissionController; attempts: () => number } {
  const delegate = createTrainingAdmissionController({
    policy: { maxActiveExecutions: 2, maxSuccessfulAdmissions: 5, windowMs: 60_000 },
    now: () => 1_000,
  })
  let attempts = 0
  return {
    controller: {
      tryAcquire() {
        attempts += 1
        if (deniedReason) return { ok: false, reason: deniedReason }
        return delegate.tryAcquire()
      },
      securityEventSnapshot: () => delegate.securityEventSnapshot(),
    },
    attempts: () => attempts,
  }
}

function createNetworkHarness(toolContextId = 'ctx_http_security', deniedReason?: 'rate_limited' | 'concurrency_limited') {
  let executedToolCalls = 0
  const admission = countingAdmission(deniedReason)
  const provider = new ScriptedAgentModelProvider([
    {
      type: 'resolve',
      value: {
        kind: 'tool_request',
        toolRequest: {
          name: 'analyze_game_performance',
          arguments: { gameContextId: toolContextId },
        },
      },
    },
    { type: 'resolve', value: consistencyFinalProposal },
  ])
  const registry = createTrainingToolRegistry({
    async execute(args, context) {
      executedToolCalls += 1
      return analyzeGamePerformance(context.gameSummary, args.gameContextId)
    },
  })
  const planner = createTrainingPlannerService(new TrainingAgentOrchestrator({
    provider,
    registry,
    clock: () => 1_000,
    createId: () => 'run_http_security',
    createContextId: () => 'ctx_http_security',
    setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
    clearTimer: () => {},
  }), {
    admissionController: admission.controller,
    createSecurityCorrelationId: () => 'corr_http_security',
  })
  const advice = createAdviceService(new FakeAiAdviceProvider({
    mode: 'success',
    advice: {
      summary: 'Completed.',
      recommendation: 'Repeat the clear.',
      category: 'consistency',
    },
  }))

  return {
    handler: createNodeHttpHandler(createApp(advice, planner)),
    providerAttempts: () => provider.adapterCallCount,
    executedToolCalls: () => executedToolCalls,
    admissionAttempts: admission.attempts,
  }
}

async function postChunks(handler: ReturnType<typeof createNodeHttpHandler>, chunks: readonly (string | Buffer)[]): Promise<NetworkResponse> {
  const server = createServer(handler)
  openServers.add(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo

  return new Promise<NetworkResponse>((resolve, reject) => {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/ai/training-plan',
      headers: { 'content-type': 'application/json' },
    }, response => {
      const responseChunks: Buffer[] = []
      response.on('data', chunk => responseChunks.push(Buffer.from(chunk)))
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(responseChunks).toString('utf8'),
      }))
    })
    request.once('error', reject)
    for (const chunk of chunks) request.write(chunk)
    request.end()
  })
}

async function startPost(handler: ReturnType<typeof createNodeHttpHandler>, body: string): Promise<Readonly<{ request: ClientRequest; response: Promise<NetworkResponse> }>> {
  const server = createServer(handler)
  openServers.add(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  let request!: ClientRequest
  const response = new Promise<NetworkResponse>((resolve, reject) => {
    request = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/api/ai/training-plan', headers: { 'content-type': 'application/json' } }, incoming => {
      const chunks: Buffer[] = []
      incoming.on('data', chunk => chunks.push(Buffer.from(chunk)))
      incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.once('error', reject)
    request.end(body)
  })
  return { request, response }
}

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(message)
}

function expectZeroWork(harness: ReturnType<typeof createNetworkHarness>): void {
  expect(harness.admissionAttempts()).toBe(0)
  expect(harness.providerAttempts()).toBe(0)
  expect(harness.executedToolCalls()).toBe(0)
}

describe('W08-028 real Node HTTP T02 body and privilege boundaries', () => {
  it('accepts a valid JSON request padded to the exact 16 KiB byte boundary', async () => {
    const harness = createNetworkHarness()
    const json = JSON.stringify(validWonSummary)
    const body = json + ' '.repeat(MAX_REQUEST_BODY_BYTES - Buffer.byteLength(json, 'utf8'))

    const response = await postChunks(harness.handler, [body])

    expect(Buffer.byteLength(body, 'utf8')).toBe(MAX_REQUEST_BODY_BYTES)
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/json')
    expect(JSON.parse(response.body)).toMatchObject({
      run: { providerAttemptCount: 2, toolCallCount: 1 },
      plan: { completed: true },
    })
    expect(harness.admissionAttempts()).toBe(1)
    expect(harness.providerAttempts()).toBe(2)
    expect(harness.executedToolCalls()).toBe(1)
  })

  it.each([
    ['single write', (body: string) => [body]],
    ['chunked crossing', (body: string) => [body.slice(0, MAX_REQUEST_BODY_BYTES), body.slice(MAX_REQUEST_BODY_BYTES)]],
  ])('rejects a 16 KiB + 1 byte body sent as %s with 413 and zero work', async (_name, chunksFor) => {
    const harness = createNetworkHarness()
    const body = 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1)

    const response = await postChunks(harness.handler, chunksFor(body))

    expect(Buffer.byteLength(body, 'utf8')).toBe(MAX_REQUEST_BODY_BYTES + 1)
    expect(response.status).toBe(413)
    expect(JSON.parse(response.body)).toEqual(invalidEnvelope)
    expectZeroWork(harness)
  })

  it('enforces the byte limit for a multibyte body rather than counting JavaScript characters', async () => {
    const harness = createNetworkHarness()
    const body = '€'.repeat(Math.floor(MAX_REQUEST_BODY_BYTES / 3) + 1)

    const response = await postChunks(harness.handler, [body])

    expect(body.length).toBeLessThan(MAX_REQUEST_BODY_BYTES)
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(MAX_REQUEST_BODY_BYTES)
    expect(response.status).toBe(413)
    expect(JSON.parse(response.body)).toEqual(invalidEnvelope)
    expectZeroWork(harness)
  })

  it.each([
    ['role', { role: 'admin' }],
    ['ownerId', { ownerId: 'other-user' }],
    ['maxSteps', { maxSteps: 999 }],
    ['provider', { provider: 'attacker-controlled' }],
    ['model', { model: 'attacker-model' }],
    ['nested policy', { policy: { maxSteps: 999, allowWriteTools: true } }],
  ])('rejects the otherwise-valid privileged field %s before admission, provider, or tool work', async (_name, extra) => {
    const harness = createNetworkHarness()
    const body = JSON.stringify({ ...validWonSummary, ...extra })

    const response = await postChunks(harness.handler, [body])

    expect(Buffer.byteLength(body, 'utf8')).toBeLessThan(MAX_REQUEST_BODY_BYTES)
    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toEqual(invalidEnvelope)
    expectZeroWork(harness)
  })
})

describe('W08-028 real Node HTTP T03 public/demo resource scope', () => {
  it('rejects an unknown model-proposed context ID without executing the read-only tool', async () => {
    const harness = createNetworkHarness('ctx_unknown')

    const response = await postChunks(harness.handler, [JSON.stringify(validWonSummary)])

    expect(response.status).toBe(422)
    expect(JSON.parse(response.body)).toMatchObject({
      run: { status: 'stopped', stopReason: 'invalid_tool_arguments', providerAttemptCount: 1, toolCallCount: 0 },
      error: { code: 'TRAINING_PLAN_REJECTED' },
    })
    expect(harness.admissionAttempts()).toBe(1)
    expect(harness.providerAttempts()).toBe(1)
    expect(harness.executedToolCalls()).toBe(0)
  })

  it('allows the same read-only tool exactly once for the server-injected matching context ID', async () => {
    const harness = createNetworkHarness('ctx_http_security')

    const response = await postChunks(harness.handler, [JSON.stringify(validWonSummary)])

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({
      run: { status: 'completed', providerAttemptCount: 2, toolCallCount: 1 },
      plan: { completed: true },
    })
    expect(harness.admissionAttempts()).toBe(1)
    expect(harness.providerAttempts()).toBe(2)
    expect(harness.executedToolCalls()).toBe(1)
  })
})

describe('W08-030 real Node HTTP T15 browser-supplied game-state integrity', () => {
  it('rejects an internally inconsistent inflated score before admission, provider, or tool work', async () => {
    const harness = createNetworkHarness()
    const tampered = { ...validWonSummary, score: 999 }

    const response = await postChunks(harness.handler, [JSON.stringify(tampered)])

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toEqual(invalidEnvelope)
    expectZeroWork(harness)
  })

  it('rejects a browser claim that an otherwise valid summary is verified', async () => {
    const harness = createNetworkHarness()
    const tampered = { ...validWonSummary, verified: true }

    const response = await postChunks(harness.handler, [JSON.stringify(tampered)])

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toEqual(invalidEnvelope)
    expectZeroWork(harness)
  })

  it('treats a semantically valid client summary only as planner input and returns no authority claim', async () => {
    const harness = createNetworkHarness()
    const clientReportedSummary = { ...validWonSummary, durationSeconds: 1 }

    const response = await postChunks(harness.handler, [JSON.stringify(clientReportedSummary)])
    const payload = JSON.parse(response.body) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(Object.keys(payload).sort()).toEqual(['plan', 'run'])
    expect(JSON.stringify(payload)).not.toMatch(/verified|trusted|rank|ownerId|authority/i)
    expect(harness.admissionAttempts()).toBe(1)
    expect(harness.providerAttempts()).toBe(2)
    expect(harness.executedToolCalls()).toBe(1)
  })
})

describe('W08-033 real Node HTTP admission-denial contract', () => {
  it.each(['rate_limited', 'concurrency_limited'] as const)(
    'maps internal %s to the same exact public 429 with zero provider and tool work',
    async deniedReason => {
      const harness = createNetworkHarness('ctx_http_security', deniedReason)

      const response = await postChunks(harness.handler, [JSON.stringify(validWonSummary)])

      expect(response.status).toBe(429)
      expect(response.headers['content-type']).toBe('application/json')
      expect(response.headers['retry-after']).toBeUndefined()
      expect(JSON.parse(response.body)).toEqual({
        run: {
          runId: 'admission_denied',
          status: 'failed',
          stopReason: 'provider_failure',
          stepCount: 0,
          providerAttemptCount: 0,
          toolCallCount: 0,
          elapsedMs: 0,
        },
        error: {
          code: 'TRAINING_PLAN_ADMISSION_DENIED',
          message: 'Training plan is temporarily unavailable. Please try again later.',
        },
      })
      expect(response.body).not.toContain(deniedReason)
      expect(harness.admissionAttempts()).toBe(1)
      expect(harness.providerAttempts()).toBe(0)
      expect(harness.executedToolCalls()).toBe(0)
    },
  )
})

describe('W08-035 real Node HTTP premature-disconnect lifecycle', () => {
  it('does not cancel a normally completed request signal', async () => {
    let observedSignal: AbortSignal | undefined
    const planner = {
      async createTrainingPlan(_input: unknown, options?: { signal?: AbortSignal }) {
        observedSignal = options?.signal
        return { kind: 'completed' as const, run: { runId: 'normal', status: 'completed' as const, stopReason: 'completed' as const, stepCount: 0, providerAttemptCount: 0, toolCallCount: 0, elapsedMs: 0 }, plan: { summary: 'Normal completion.', focus: 'consistency' as const, recommendation: 'Continue.', evidence: [{ id: 'game.outcome' as const, finding: 'Outcome: WON.' }], confidence: 'high' as const, completed: true as const } }
      },
    }
    const advice = createAdviceService(new FakeAiAdviceProvider({ mode: 'success', advice: { summary: 'Completed.', recommendation: 'Continue.', category: 'consistency' } }))

    const response = await postChunks(createNodeHttpHandler(createApp(advice, planner)), [JSON.stringify(validWonSummary)])

    expect(response.status).toBe(200)
    expect(observedSignal).toBeInstanceOf(AbortSignal)
    expect(observedSignal?.aborted).toBe(false)
  })

  it('aborts on premature disconnect while retaining capacity until abort-ignoring raw work settles', async () => {
    let resolveRaw!: (value: unknown) => void
    const raw = new Promise<unknown>(resolve => { resolveRaw = resolve })
    let providerCalls = 0
    let observedProviderSignal: AbortSignal | undefined
    const provider = {
      async generateStep(_request: unknown, options: { signal: AbortSignal }) {
        providerCalls += 1
        observedProviderSignal = options.signal
        if (providerCalls === 1) return raw
        if (providerCalls === 2) return { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_disconnect' } } }
        return consistencyFinalProposal
      },
    }
    let toolCalls = 0
    const admission = createTrainingAdmissionController({ policy: { maxActiveExecutions: 1, maxSuccessfulAdmissions: 5, windowMs: 60_000 }, now: () => 1_000 })
    const planner = createTrainingPlannerService(new TrainingAgentOrchestrator({
      provider,
      registry: createTrainingToolRegistry({ execute: async (args, context) => { toolCalls += 1; return analyzeGamePerformance(context.gameSummary, args.gameContextId) } }),
      clock: () => 1_000,
      createId: () => 'run_disconnect',
      createContextId: () => 'ctx_disconnect',
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
    }), { admissionController: admission, createSecurityCorrelationId: () => 'corr_disconnect' })
    const advice = createAdviceService(new FakeAiAdviceProvider({ mode: 'success', advice: { summary: 'Completed.', recommendation: 'Continue.', category: 'consistency' } }))
    const handler = createNodeHttpHandler(createApp(advice, planner))
    const first = await startPost(handler, JSON.stringify(validWonSummary))
    void first.response.catch(() => {})
    await waitUntil(() => providerCalls === 1, 'first provider attempt did not start')

    first.request.destroy()
    await waitUntil(() => observedProviderSignal?.aborted === true, 'disconnect did not abort the provider signal')

    const denied = await postChunks(handler, [JSON.stringify(validWonSummary)])
    expect(denied.status).toBe(429)
    expect(providerCalls).toBe(1)
    expect(toolCalls).toBe(0)
    expect(admission.securityEventSnapshot().activeExecutionCount).toBe(1)

    resolveRaw({ kind: 'refusal', reason: 'late result' })
    await waitUntil(() => admission.securityEventSnapshot().activeExecutionCount === 0, 'lease did not release after raw work settled')

    const recovered = await postChunks(handler, [JSON.stringify(validWonSummary)])
    expect(recovered.status).toBe(200)
    expect(providerCalls).toBe(3)
    expect(toolCalls).toBe(1)
    expect(admission.securityEventSnapshot().activeExecutionCount).toBe(0)
  })
})

describe('W08-037 real Node HTTP T17 A/B/C security chain', () => {
  it('denies B with zero work while A is active, records closed events, then permits C after cleanup', async () => {
    let resolveA!: (value: unknown) => void
    const pendingA = new Promise<unknown>(resolve => { resolveA = resolve })
    let providerCalls = 0
    let toolCalls = 0
    const provider = {
      async generateStep() {
        providerCalls += 1
        if (providerCalls === 1) return pendingA
        if (providerCalls === 2) return { kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_chain' } } }
        return consistencyFinalProposal
      },
    }
    const admission = createTrainingAdmissionController({ policy: { maxActiveExecutions: 1, maxSuccessfulAdmissions: 5, windowMs: 60_000 }, now: () => 1_000 })
    const events: SecurityEvent[] = []
    let correlation = 0
    const planner = createTrainingPlannerService(new TrainingAgentOrchestrator({
      provider,
      registry: createTrainingToolRegistry({ execute: async (args, context) => { toolCalls += 1; return analyzeGamePerformance(context.gameSummary, args.gameContextId) } }),
      clock: () => 1_000,
      createId: () => 'run_chain',
      createContextId: () => 'ctx_chain',
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
    }), {
      admissionController: admission,
      securityEventSink: event => events.push(event),
      createSecurityCorrelationId: () => `corr_${++correlation}`,
    })
    const advice = createAdviceService(new FakeAiAdviceProvider({ mode: 'success', advice: { summary: 'Completed.', recommendation: 'Continue.', category: 'consistency' } }))
    const handler = createNodeHttpHandler(createApp(advice, planner))

    const requestA = await startPost(handler, JSON.stringify(validWonSummary))
    await waitUntil(() => providerCalls === 1, 'A did not reach its first provider step')
    const responseB = await postChunks(handler, [JSON.stringify(validWonSummary)])
    expect(responseB.status).toBe(429)
    expect(providerCalls).toBe(1)
    expect(toolCalls).toBe(0)

    resolveA({ kind: 'tool_request', toolRequest: { name: 'delete_database', arguments: { gameContextId: 'ctx_chain' } } })
    const responseA = await requestA.response
    expect(responseA.status).toBe(422)
    expect(JSON.parse(responseA.body)).toMatchObject({ run: { stopReason: 'unknown_tool', providerAttemptCount: 1, toolCallCount: 0 } })
    await waitUntil(() => admission.securityEventSnapshot().activeExecutionCount === 0, 'A lease did not release after cleanup')

    const responseC = await postChunks(handler, [JSON.stringify(validWonSummary)])
    expect(responseC.status).toBe(200)
    expect(providerCalls).toBe(3)
    expect(toolCalls).toBe(1)
    expect(admission.securityEventSnapshot().activeExecutionCount).toBe(0)

    expect(events).toContainEqual(expect.objectContaining({ correlationId: 'corr_1', kind: 'planner.admitted', outcome: 'allowed' }))
    expect(events).toContainEqual(expect.objectContaining({ correlationId: 'corr_2', kind: 'planner.admission_denied', outcome: 'denied', reasonCode: 'CONCURRENCY_LIMITED', providerAttemptCount: 0, toolCallCount: 0 }))
    expect(events).toContainEqual(expect.objectContaining({ correlationId: 'corr_1', kind: 'planner.tool_denied', outcome: 'denied', reasonCode: 'TOOL_NOT_ALLOWED', providerAttemptCount: 1, toolCallCount: 0 }))
    expect(events).toContainEqual(expect.objectContaining({ correlationId: 'corr_3', kind: 'planner.run_finished', outcome: 'finished', terminalStatus: 'completed', providerAttemptCount: 2, toolCallCount: 1 }))
    expect(JSON.stringify(events)).not.toContain('delete_database')
  })
})
