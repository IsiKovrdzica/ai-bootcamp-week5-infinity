import { describe, expect, it } from 'vitest'
import { validWonSummary } from './game-summary-fixtures.js'
import {
  validateTrainingFinalProposal,
  validateTrainingInitialSummary,
  validateTrainingModelProposal,
  validatePublicTrainingPlan,
  validatePublicTrainingRun,
  renderPublicTrainingPlan,
} from './training-validation.js'

const evidence = {
  schemaVersion: 1,
  gameContextId: 'ctx_1',
  outcome: 'WON', score: 320, bricksDestroyed: 32, totalBricks: 32,
  completionRate: 100, durationSeconds: 30, bricksPerMinute: 64,
  livesLost: 0, livesRemaining: 3,
  evidence: [
    { id: 'game.outcome', metric: 'outcome', value: 'WON' },
    { id: 'game.bricks_destroyed', metric: 'bricks_destroyed', value: '32/32' },
    { id: 'game.completion_rate', metric: 'completion_rate', value: '100.00%' },
    { id: 'game.duration_seconds', metric: 'duration_seconds', value: '30s' },
    { id: 'game.bricks_per_minute', metric: 'bricks_per_minute', value: '64.00 bricks/min' },
    { id: 'game.lives', metric: 'lives', value: '0 lost, 3 remaining' },
  ],
} as const

describe('T11 request and public/run contract validation', () => {
  it('accepts only an exact terminal summary', () => {
    expect(validateTrainingInitialSummary(validWonSummary).ok).toBe(true)
    expect(validateTrainingInitialSummary({ ...validWonSummary, extra: true }).ok).toBe(false)
    expect(validateTrainingInitialSummary({ ...validWonSummary, outcome: 'PLAYING' }).ok).toBe(false)
    expect(validateTrainingInitialSummary({ ...validWonSummary, outcome: 'GAME_OVER', livesRemaining: 1, livesLost: 2 }).ok).toBe(false)
  })
})

describe('T12 proposal and argument validation', () => {
  it('accepts only an exact tool proposal for the select-tool phase', () => {
    expect(validateTrainingModelProposal({ kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } }, 'select_tool').ok).toBe(true)
    // The envelope is valid; exact argument/scope validation belongs to the fixed registry.
    expect(validateTrainingModelProposal({ kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1', score: 320 } } }, 'select_tool').ok).toBe(true)
    // Structural parsing deliberately leaves an exact unknown name for the fixed registry allowlist.
    expect(validateTrainingModelProposal({ kind: 'tool_request', toolRequest: { name: 'other', arguments: { gameContextId: 'ctx_1' } } }, 'select_tool').ok).toBe(true)
    for (const value of [null, { kind: 'tool_request' }, { kind: 'final', plan: {} }]) expect(validateTrainingModelProposal(value, 'select_tool').ok).toBe(false)
    for (const argumentsValue of [{}, { gameContextId: 'bad space' }, { gameContextId: 'ctx_1', instruction: 'ignore policy' }]) expect(validateTrainingModelProposal({ kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: argumentsValue } }, 'select_tool').ok).toBe(true)
    expect(validateTrainingModelProposal({ kind: 'refusal' }, 'produce_final').ok).toBe(true)
    expect(validateTrainingModelProposal({ kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'ctx_1' } } }, 'produce_final').ok).toBe(false)
    expect(validateTrainingModelProposal({ kind: 'final', plan: {} }, 'produce_final').ok).toBe(false)
    expect(validateTrainingModelProposal({ kind: 'tool_request', toolRequest: { name: 'analyze_game_performance', arguments: { gameContextId: 'x'.repeat(9000) } } }, 'select_tool').ok).toBe(false)
  })

  it.each([
    { focus: 1, summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome'] }, evidenceIds: ['game.outcome'], confidence: 'medium', completed: true },
    { focus: 'consistency', summaryEvidenceIds: 'game.outcome', recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome'] }, evidenceIds: ['game.outcome'], confidence: 'medium', completed: true },
    { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: 'repeat', evidenceIds: ['game.outcome'], confidence: 'medium', completed: true },
    { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: 'game.outcome' }, evidenceIds: ['game.outcome'], confidence: 'medium', completed: true },
    { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome'] }, evidenceIds: 'game.outcome', confidence: 'medium', completed: true },
    { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome'] }, evidenceIds: ['game.outcome'], confidence: 'certain', completed: true },
    { focus: 'consistency', summaryEvidenceIds: ['game.outcome'], recommendation: { action: 'repeat_completed_clear', evidenceIds: ['game.outcome'] }, evidenceIds: ['game.outcome'], confidence: 'medium', completed: false },
  ])('rejects exact-key final proposal with invalid nested data %#', (plan) => {
    expect(validateTrainingModelProposal({ kind: 'final', plan }, 'produce_final').ok).toBe(false)
  })
})

describe('T13 final semantic validation', () => {
  it('requires grounded final evidence and an allowed focus/action pairing', () => {
    const final = { kind: 'final', plan: { focus: 'efficiency', summaryEvidenceIds: ['game.bricks_per_minute'], recommendation: { action: 'improve_clear_rate', evidenceIds: ['game.bricks_per_minute', 'game.duration_seconds'] }, evidenceIds: ['game.bricks_per_minute', 'game.duration_seconds'], confidence: 'medium', completed: true } }
    expect(validateTrainingFinalProposal(final, evidence).ok).toBe(true)
    expect(validateTrainingFinalProposal({ ...final, plan: { ...final.plan, evidenceIds: ['unknown'] } }, evidence).ok).toBe(false)
    expect(validateTrainingFinalProposal({ ...final, plan: { ...final.plan, focus: 'survival' } }, evidence).ok).toBe(false)
    expect(validateTrainingFinalProposal({ ...final, plan: { ...final.plan, evidenceIds: ['game.duration_seconds', 'game.bricks_per_minute'] } }, evidence).ok).toBe(false)
    expect(validateTrainingFinalProposal({ ...final, plan: { ...final.plan, evidenceIds: ['game.bricks_per_minute'] } }, evidence).ok).toBe(false)
    expect(validateTrainingFinalProposal({ ...final, plan: { ...final.plan, evidenceIds: ['game.bricks_per_minute', 'game.duration_seconds', 'game.outcome'] } }, evidence).ok).toBe(false)
    const multi = { ...evidence, livesLost: 1, livesRemaining: 2 }
    expect(validateTrainingFinalProposal({ kind: 'final', plan: { focus: 'survival', summaryEvidenceIds: ['game.lives'], recommendation: { action: 'reduce_lives_lost', evidenceIds: ['game.lives'] }, evidenceIds: ['game.lives'], confidence: 'low', completed: true } }, multi).ok).toBe(true)
    expect(validateTrainingFinalProposal(final, multi).ok).toBe(true)
  })
})

describe('public projections', () => {
  it('rejects non-template and over-limit code-point prose and bounds public counters', () => {
    const plan = { summary: '😀'.repeat(200), focus: 'efficiency', recommendation: 'x', evidence: [{ id: 'game.bricks_per_minute', finding: 'Measured pace is available.' }], confidence: 'low', completed: true }
    expect(validatePublicTrainingPlan(plan, evidence).ok).toBe(false)
    expect(validatePublicTrainingPlan({ ...plan, summary: '😀'.repeat(201) }, evidence).ok).toBe(false)
    expect(validatePublicTrainingPlan({ ...plan, extra: true }, evidence).ok).toBe(false)
    const projected = validatePublicTrainingRun({ runId: 'run_1', status: 'completed', stopReason: 'completed', stepCount: 2, providerAttemptCount: 2, toolCallCount: 1, elapsedMs: 30_001 })
    expect(projected.ok && projected.value.elapsedMs).toBe(30_000)
    expect(validatePublicTrainingRun({ runId: 'run_1', status: 'completed', stopReason: 'completed', stepCount: 4, providerAttemptCount: 2, toolCallCount: 1, elapsedMs: 1 }).ok).toBe(false)
  })

  it('renders all public prose from fixed application templates', () => {
    const proposal = { kind: 'final', plan: { focus: 'efficiency', summaryEvidenceIds: ['game.bricks_per_minute'], recommendation: { action: 'improve_clear_rate', evidenceIds: ['game.bricks_per_minute', 'game.duration_seconds'] }, evidenceIds: ['game.bricks_per_minute', 'game.duration_seconds'], confidence: 'medium', completed: true } } as const
    const rendered = renderPublicTrainingPlan(proposal, evidence)
    expect(rendered).toEqual({ ok: true, value: { summary: 'The completed game supports an efficiency training focus.', focus: 'efficiency', recommendation: 'For the next game, use the observed clear rate as a personal baseline.', evidence: [{ id: 'game.bricks_per_minute', finding: 'Bricks per minute: 64.00 bricks/min.' }, { id: 'game.duration_seconds', finding: 'Duration: 30s.' }], confidence: 'medium', completed: true } })
    if (!rendered.ok) throw new Error('expected rendered plan')
    expect(validatePublicTrainingPlan({ ...rendered.value, summary: 'Model-authored claim.' }, evidence).ok).toBe(false)
    expect(validatePublicTrainingPlan({ ...rendered.value, recommendation: 'You played badly.' }, evidence).ok).toBe(false)
    expect(validatePublicTrainingPlan({ ...rendered.value, evidence: [{ ...rendered.value.evidence[0], finding: 'Fast performance.' }, rendered.value.evidence[1] ] }, evidence).ok).toBe(false)
  })
})
