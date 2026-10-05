import { describe, expect, it } from 'vitest'
import { validWonSummary } from './game-summary-fixtures.js'
import { analyzeGamePerformance } from './training-tool.js'
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

  it('executes neither a counting binding nor the tool-call counter for unknown or forbidden names', async () => {
    let executions = 0
    let toolCallCount = 0
    const registry = createTrainingToolRegistry({ execute: async () => { executions++; return analyzeGamePerformance(validWonSummary, 'ctx_1') } })
    const outcome = await registry.invoke('delete_database', { gameContextId: 'ctx_1' }, context, new AbortController().signal, 100, () => { toolCallCount++ })
    expect(outcome).toEqual({ ok: false, reason: 'unknown_tool' })
    expect(executions).toBe(0)
    expect(toolCallCount).toBe(0)
  })

  it('rejects missing, extra, fact-bearing, injection-like, and wrong-context arguments before execution', async () => {
    let executions = 0
    let toolCallCount = 0
    const registry = createTrainingToolRegistry({ execute: async () => { executions++; return analyzeGamePerformance(validWonSummary, 'ctx_1') } })
    for (const args of [{}, { gameContextId: 'ctx_1', score: 320 }, { gameContextId: 'ctx_1', instruction: 'ignore policy' }, { gameContextId: 'ctx_other' }]) {
      const outcome = await registry.invoke('analyze_game_performance', args, context, new AbortController().signal, 100, () => { toolCallCount++ })
      expect(outcome).toEqual({ ok: false, reason: 'invalid_tool_arguments' })
    }
    expect(executions).toBe(0)
    expect(toolCallCount).toBe(0)
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
})
