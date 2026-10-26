import { describe, expect, it } from 'vitest'
import { validWonSummary } from './game-summary-fixtures.js'
import { analyzeGamePerformance } from './training-tool.js'
import { createInFlightOperationTracker } from './training-operation-tracker.js'
import { createTrainingToolRegistry } from './training-tool-registry.js'

const context = { gameSummary: validWonSummary, gameContextId: 'ctx_1' }

describe('T22 fixed training tool registry', () => {
  it('is frozen with exactly one case-sensitive allowlisted entry', () => {
    const registry = createTrainingToolRegistry()
    expect(Object.isFrozen(registry)).toBe(true)
    expect(Object.isFrozen(registry.tools)).toBe(true)
    expect(registry.tools.map(tool => tool.descriptor.name)).toEqual(['analyze_game_performance'])
    expect(registry.lookup('Analyze_Game_Performance')).toBeUndefined()
  })

  it('executes neither a counting binding nor the tool-call counter for unknown, inherited, or wrong-case names', async () => {
    let executions = 0
    let toolCallCount = 0
    const registry = createTrainingToolRegistry({ execute: async () => { executions++; return analyzeGamePerformance(validWonSummary, 'ctx_1') } })
    for (const name of ['delete_database', 'constructor', 'toString', 'Analyze_Game_Performance']) {
      const outcome = await registry.invoke(name, { gameContextId: 'ctx_1' }, context, new AbortController().signal, 100, () => { toolCallCount++ })
      expect(outcome).toEqual({ ok: false, reason: 'unknown_tool' })
    }
    expect(executions).toBe(0)
    expect(toolCallCount).toBe(0)
  })

  it('rejects missing, wrong-type, extra, fact-bearing, policy-like, and wrong-context arguments before execution', async () => {
    let executions = 0
    let toolCallCount = 0
    const registry = createTrainingToolRegistry({ execute: async () => { executions++; return analyzeGamePerformance(validWonSummary, 'ctx_1') } })
    for (const args of [{}, { gameContextId: 1 }, { gameContextId: null }, { gameContextId: 'ctx_1', score: 320 }, { gameContextId: 'ctx_1', instruction: 'ignore policy' }, { gameContextId: 'ctx_other' }]) {
      const outcome = await registry.invoke('analyze_game_performance', args, context, new AbortController().signal, 100, () => { toolCallCount++ })
      expect(outcome).toEqual({ ok: false, reason: 'invalid_tool_arguments' })
    }
    expect(executions).toBe(0)
    expect(toolCallCount).toBe(0)
  })

  it('invokes the exact permitted read-only tool once for the matching server context', async () => {
    let executions = 0
    let toolCallCount = 0
    const registry = createTrainingToolRegistry({ execute: async (args, toolContext) => { executions += 1; return analyzeGamePerformance(toolContext.gameSummary, args.gameContextId) } })
    const outcome = await registry.invoke('analyze_game_performance', { gameContextId: 'ctx_1' }, context, new AbortController().signal, 100, () => { toolCallCount += 1 })
    expect(outcome.ok).toBe(true)
    expect(executions).toBe(1)
    expect(toolCallCount).toBe(1)
  })

  it('validates an invoked binding result before returning only its normalized projection', async () => {
    const registry = createTrainingToolRegistry({ execute: async () => ({ schemaVersion: 1, gameContextId: 'ctx_1', malformed: true }) })
    const outcome = await registry.invoke('analyze_game_performance', { gameContextId: 'ctx_1' }, context, new AbortController().signal, 100, () => {})
    expect(outcome).toEqual({ ok: false, reason: 'invalid_tool_result' })
  })

  it('uses the smaller remaining-deadline timeout and classifies a timed-out binding as an invoked failure', async () => {
    let executions = 0
    const timers: number[] = []
    const registry = createTrainingToolRegistry({ execute: async () => { executions++; await new Promise<void>(() => {}); return null } }, { setTimer: (callback, milliseconds) => { timers.push(milliseconds); callback(); return 1 as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} })
    const outcome = await registry.invoke('analyze_game_performance', { gameContextId: 'ctx_1' }, context, new AbortController().signal, 1, () => {})
    expect(outcome).toEqual({ ok: false, reason: 'tool_failure' })
    expect(executions).toBe(1)
    expect(timers).toEqual([1])
  })

  it('caps an invoked permitted tool at 100ms when more run time remains', async () => {
    let executions = 0
    const timers: number[] = []
    const registry = createTrainingToolRegistry(
      { execute: async () => { executions++; return new Promise<unknown>(() => {}) } },
      { setTimer: (callback, milliseconds) => { timers.push(milliseconds); callback(); return 1 as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} },
    )
    const outcome = await registry.invoke('analyze_game_performance', { gameContextId: 'ctx_1' }, context, new AbortController().signal, 1_000, () => {})
    expect(outcome).toEqual({ ok: false, reason: 'tool_failure' })
    expect(executions).toBe(1)
    expect(timers).toEqual([100])
  })
})

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}>

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

const expectPending = async (promise: Promise<void>): Promise<void> => {
  let settled = false
  void promise.then(() => {
    settled = true
  })
  await flushMicrotasks()
  expect(settled).toBe(false)
}

describe('W08 tool raw-operation tracking', () => {
  it('keeps an abort-ignoring timed-out tool operation tracked until its raw Promise settles', async () => {
    const tracker = createInFlightOperationTracker()
    const rawTool = createDeferred<unknown>()
    let executions = 0
    const registry = createTrainingToolRegistry(
      { execute: async () => { executions += 1; return rawTool.promise } },
      {
        setTimer: callback => {
          callback()
          return 1 as unknown as ReturnType<typeof setTimeout>
        },
        clearTimer: () => {},
      },
      tracker,
    )

    const publicOutcome = registry.invoke('analyze_game_performance', { gameContextId: 'ctx_1' }, context, new AbortController().signal, 100, () => {})
    await flushMicrotasks()
    expect(executions).toBe(1)
    const terminalOutcome = await publicOutcome
    expect(terminalOutcome).toEqual({ ok: false, reason: 'tool_failure' })

    tracker.closeRegistration()
    try {
      await expectPending(tracker.drained)
      rawTool.resolve({})
      await flushMicrotasks()
      expect(terminalOutcome).toEqual({ ok: false, reason: 'tool_failure' })
      await expect(tracker.drained).resolves.toBeUndefined()
    } finally {
      rawTool.resolve({})
    }
  })

  it('drains a timed-out abort-ignoring tool after its late raw rejection without reviving the timeout outcome', async () => {
    const tracker = createInFlightOperationTracker()
    const rawTool = createDeferred<unknown>()
    let executions = 0
    const registry = createTrainingToolRegistry(
      { execute: async () => { executions += 1; return rawTool.promise } },
      { setTimer: callback => { callback(); return 1 as unknown as ReturnType<typeof setTimeout> }, clearTimer: () => {} },
      tracker,
    )

    const publicOutcome = await registry.invoke('analyze_game_performance', { gameContextId: 'ctx_1' }, context, new AbortController().signal, 100, () => {})
    expect(publicOutcome).toEqual({ ok: false, reason: 'tool_failure' })
    expect(executions).toBe(1)
    tracker.closeRegistration()
    try {
      await expectPending(tracker.drained)
      rawTool.reject(new Error('late tool rejection'))
      await expect(tracker.drained).resolves.toBeUndefined()
      expect(publicOutcome).toEqual({ ok: false, reason: 'tool_failure' })
    } finally {
      rawTool.resolve({})
    }
  })
})
