import { describe, expect, it } from 'vitest'
import { validWonSummary } from './game-summary-fixtures.js'
import { analyzeGamePerformance, validatePerformanceAnalysisResult } from './training-tool.js'

describe('T21 deterministic performance analysis', () => {
  it('calculates the exact canonical completed-game metrics and ordered evidence', () => {
    expect(analyzeGamePerformance(validWonSummary, 'ctx_1')).toEqual({
      schemaVersion: 1, gameContextId: 'ctx_1', outcome: 'WON', score: 320,
      bricksDestroyed: 32, totalBricks: 32, completionRate: 100, durationSeconds: 30,
      bricksPerMinute: 64, livesLost: 0, livesRemaining: 3,
      evidence: [
        { id: 'game.outcome', metric: 'outcome', value: 'WON' },
        { id: 'game.bricks_destroyed', metric: 'bricks_destroyed', value: '32/32' },
        { id: 'game.completion_rate', metric: 'completion_rate', value: '100.00%' },
        { id: 'game.duration_seconds', metric: 'duration_seconds', value: '30s' },
        { id: 'game.bricks_per_minute', metric: 'bricks_per_minute', value: '64.00 bricks/min' },
        { id: 'game.lives', metric: 'lives', value: '0 lost, 3 remaining' },
      ],
    })
  })

  it('uses the specified two-decimal rounding and null throughput boundary', () => {
    const rounded = analyzeGamePerformance({ ...validWonSummary, outcome: 'GAME_OVER', score: 10, bricksDestroyed: 1, livesRemaining: 0, livesLost: 3, durationSeconds: 7 }, 'ctx_round')
    expect(rounded.completionRate).toBe(3.13)
    expect(rounded.bricksPerMinute).toBe(8.57)
    expect(rounded.evidence[2].value).toBe('3.13%')
    expect(rounded.evidence[4].value).toBe('8.57 bricks/min')
    const zero = analyzeGamePerformance({ ...validWonSummary, durationSeconds: 0 }, 'ctx_zero')
    expect(zero.bricksPerMinute).toBeNull()
    expect(zero.evidence[4].value).toBe('unavailable')
  })

  it('returns only objective analysis fields, never a focus or recommendation', () => {
    const result = analyzeGamePerformance(validWonSummary, 'ctx_1') as Record<string, unknown>
    expect(result).not.toHaveProperty('focus')
    expect(result).not.toHaveProperty('recommendation')
  })
})

describe('T22 result validation', () => {
  it('rejects malformed, nonfinite, inconsistent, oversized, and extra-field results without trusting their references', () => {
    const context = { gameSummary: validWonSummary, gameContextId: 'ctx_1' }
    const valid = analyzeGamePerformance(validWonSummary, 'ctx_1')
    expect(validatePerformanceAnalysisResult(valid, context)).toEqual({ ok: true, value: valid })
    for (const value of [
      null,
      undefined,
      { ...valid, score: Number.POSITIVE_INFINITY },
      { ...valid, completionRate: 99.99 },
      { ...valid, evidence: [...valid.evidence, { id: 'extra', metric: 'extra', value: 'x' }] },
      { ...valid, provider: 'forbidden' },
      { ...valid, evidence: valid.evidence.map((record, index) => index === 4 ? { ...record, value: '64 bricks/min' } : record) },
      { ...valid, evidence: valid.evidence.map((record, index) => index === 0 ? { ...record, value: 'x'.repeat(3_000) } : record) },
      JSON.parse(JSON.stringify({ ...valid, padding: 'x'.repeat(3_000) })),
    ]) expect(() => validatePerformanceAnalysisResult(value, context)).not.toThrow()
    for (const value of [null, undefined, { ...valid, score: Number.POSITIVE_INFINITY }, { ...valid, completionRate: 99.99 }, { ...valid, evidence: [...valid.evidence, { id: 'extra', metric: 'extra', value: 'x' }] }, { ...valid, provider: 'forbidden' }, { ...valid, evidence: valid.evidence.map((record, index) => index === 4 ? { ...record, value: '64 bricks/min' } : record) }, { ...valid, evidence: valid.evidence.map((record, index) => index === 0 ? { ...record, value: 'x'.repeat(3_000) } : record) }, JSON.parse(JSON.stringify({ ...valid, padding: 'x'.repeat(3_000) }))]) expect(validatePerformanceAnalysisResult(value, context).ok).toBe(false)
  })

  it('creates a fresh normalized projection rather than returning the untrusted object', () => {
    const context = { gameSummary: validWonSummary, gameContextId: 'ctx_1' }
    const original = analyzeGamePerformance(validWonSummary, 'ctx_1')
    const checked = validatePerformanceAnalysisResult(original, context)
    if (!checked.ok) throw new Error('expected valid result')
    expect(checked.value).not.toBe(original)
    expect(checked.value.evidence).not.toBe(original.evidence)
  })

  it('accepts equivalent object-key order but rejects a noncanonical negative-zero numeric candidate', () => {
    const context = { gameSummary: validWonSummary, gameContextId: 'ctx_1' }
    const valid = analyzeGamePerformance(validWonSummary, 'ctx_1')
    const reordered = { evidence: valid.evidence, livesRemaining: valid.livesRemaining, livesLost: valid.livesLost, bricksPerMinute: valid.bricksPerMinute, durationSeconds: valid.durationSeconds, completionRate: valid.completionRate, totalBricks: valid.totalBricks, bricksDestroyed: valid.bricksDestroyed, score: valid.score, outcome: valid.outcome, gameContextId: valid.gameContextId, schemaVersion: valid.schemaVersion }
    expect(validatePerformanceAnalysisResult(reordered, context).ok).toBe(true)
    expect(validatePerformanceAnalysisResult({ ...valid, completionRate: -0 }, context).ok).toBe(false)
  })
})
