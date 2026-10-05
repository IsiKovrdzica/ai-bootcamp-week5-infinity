import { describe, expect, it } from 'vitest'
import { ScriptedAgentModelProvider } from './training-fake-provider.js'
import type { ModelStepRequest } from './training-provider.js'
import { ProviderFailure } from './provider.js'

const request = (phase: ModelStepRequest['phase'], stepNumber: 1 | 2): ModelStepRequest => ({
  schemaVersion: 1, promptVersion: 'brickpulse-training-planner/v1', phase,
  goal: 'analyze_completed_game_for_next_game_improvement',
  gameSummary: { outcome: 'WON', score: 320, bricksDestroyed: 32, livesRemaining: 3, livesLost: 0, durationSeconds: 30 },
  run: { runId: 'run_1', gameContextId: 'ctx_1', contextVersion: 1, stepNumber, remainingSteps: stepNumber === 1 ? 2 : 1, remainingToolCalls: stepNumber === 1 ? 2 : 1, remainingProviderAttempts: 6, deadlineAt: '2026-10-05T00:00:30.000Z' },
  availableTools: phase === 'select_tool' ? [{ name: 'analyze_game_performance', description: 'Deterministic completed-game performance analysis.', inputSchema: { type: 'object', additionalProperties: false, required: ['gameContextId'], properties: { gameContextId: { type: 'string', minLength: 1, maxLength: 64 } } } }] : [],
  evidence: null,
})

describe('T31 scripted agent provider', () => {
  it('snapshots queued resolve values so later caller mutation cannot alter the script', async () => {
    const queued = { kind: 'tool_request', nested: { value: 'original' } }
    const provider = new ScriptedAgentModelProvider([{ type: 'resolve', value: queued }])
    queued.nested.value = 'mutated'
    await expect(provider.generateStep(request('select_tool', 1), { signal: new AbortController().signal })).resolves.toEqual({ kind: 'tool_request', nested: { value: 'original' } })
  })

  it('consumes immutable resolve/reject entries and records sanitized snapshots', async () => {
    const provider = new ScriptedAgentModelProvider([
      { type: 'resolve', value: { kind: 'tool_request' } },
      { type: 'reject', failure: new ProviderFailure('transient') },
    ])
    const first = request('select_tool', 1)
    await expect(provider.generateStep(first, { signal: new AbortController().signal })).resolves.toEqual({ kind: 'tool_request' })
    await expect(provider.generateStep(request('select_tool', 1), { signal: new AbortController().signal })).rejects.toMatchObject({ kind: 'transient' })
    expect(provider.adapterCallCount).toBe(2)
    expect(provider.requests).toEqual([
      { phase: 'select_tool', stepNumber: 1, callIndex: 1, signalAborted: false },
      { phase: 'select_tool', stepNumber: 1, callIndex: 2, signalAborted: false },
    ])
    expect(provider.requests[0]).not.toHaveProperty('gameSummary')
  })

  it('rejects a deferred entry with client_cancelled on abort', async () => {
    const provider = new ScriptedAgentModelProvider([{ type: 'deferred', key: 'late' }])
    const controller = new AbortController()
    const pending = provider.generateStep(request('select_tool', 1), { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'client_cancelled' })
    expect(provider.adapterCallCount).toBe(1)
  })

  it('captures identical sanitized requests for consecutive attempts of one logical step', async () => {
    const provider = new ScriptedAgentModelProvider([{ type: 'reject', failure: new ProviderFailure('transient') }, { type: 'resolve', value: { kind: 'tool_request' } }])
    const same = request('select_tool', 1)
    await expect(provider.generateStep(same, { signal: new AbortController().signal })).rejects.toMatchObject({ kind: 'transient' })
    await provider.generateStep(same, { signal: new AbortController().signal })
    expect(provider.requests.map(({ callIndex: _callIndex, ...snapshot }) => snapshot)).toEqual([
      { phase: 'select_tool', stepNumber: 1, signalAborted: false },
      { phase: 'select_tool', stepNumber: 1, signalAborted: false },
    ])
  })
})
