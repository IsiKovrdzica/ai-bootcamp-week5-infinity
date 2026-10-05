import { BRICK_COUNT } from './contracts.js'
import type { GameSummary, ValidationResult } from './contracts.js'
import { TRAINING_AGENT_LIMITS, type PerformanceAnalysisResult } from './training-contracts.js'

export type TrainingToolContext = { readonly gameSummary: Readonly<GameSummary>; readonly gameContextId: string }

const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
const round2 = (value: number) => Math.floor((value + Number.EPSILON) * 100 + 0.5) / 100
const duration = (seconds: number) => `${String(seconds)}s`
const withinResultBytes = (value: unknown) => {
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string' && Buffer.byteLength(serialized, 'utf8') <= TRAINING_AGENT_LIMITS.maxToolResultBytes
  } catch {
    return false
  }
}

export function analyzeGamePerformance(summary: Readonly<GameSummary>, gameContextId: string): PerformanceAnalysisResult {
  const completionRate = round2((summary.bricksDestroyed / BRICK_COUNT) * 100)
  const rawBricksPerMinute = summary.durationSeconds > 0 ? (summary.bricksDestroyed * 60) / summary.durationSeconds : Number.NaN
  const bricksPerMinute = Number.isFinite(rawBricksPerMinute) ? round2(rawBricksPerMinute) : null
  return {
    schemaVersion: 1,
    gameContextId,
    outcome: summary.outcome,
    score: summary.score,
    bricksDestroyed: summary.bricksDestroyed,
    totalBricks: BRICK_COUNT,
    completionRate,
    durationSeconds: summary.durationSeconds,
    bricksPerMinute,
    livesLost: summary.livesLost,
    livesRemaining: summary.livesRemaining,
    evidence: [
      { id: 'game.outcome', metric: 'outcome', value: summary.outcome },
      { id: 'game.bricks_destroyed', metric: 'bricks_destroyed', value: `${summary.bricksDestroyed}/${BRICK_COUNT}` },
      { id: 'game.completion_rate', metric: 'completion_rate', value: `${completionRate.toFixed(2)}%` },
      { id: 'game.duration_seconds', metric: 'duration_seconds', value: duration(summary.durationSeconds) },
      { id: 'game.bricks_per_minute', metric: 'bricks_per_minute', value: bricksPerMinute === null ? 'unavailable' : `${bricksPerMinute.toFixed(2)} bricks/min` },
      { id: 'game.lives', metric: 'lives', value: `${summary.livesLost} lost, ${summary.livesRemaining} remaining` },
    ],
  }
}

export function validatePerformanceAnalysisResult(value: unknown, context: TrainingToolContext): ValidationResult<PerformanceAnalysisResult> {
  if (!withinResultBytes(value) || !exact(value, ['schemaVersion', 'gameContextId', 'outcome', 'score', 'bricksDestroyed', 'totalBricks', 'completionRate', 'durationSeconds', 'bricksPerMinute', 'livesLost', 'livesRemaining', 'evidence'])) return { ok: false, reason: 'Tool result must have exact fields.' }
  const expected = analyzeGamePerformance(context.gameSummary, context.gameContextId)
  const sameEvidence = Array.isArray(value.evidence) && value.evidence.length === expected.evidence.length && value.evidence.every((record, index) => exact(record, ['id', 'metric', 'value']) && record.id === expected.evidence[index].id && record.metric === expected.evidence[index].metric && record.value === expected.evidence[index].value)
  const numericKeys = ['score', 'bricksDestroyed', 'totalBricks', 'completionRate', 'durationSeconds', 'livesLost', 'livesRemaining'] as const
  const sameNumbers = numericKeys.every(key => value[key] === expected[key] && !Object.is(value[key], -0)) && (value.bricksPerMinute === expected.bricksPerMinute && !Object.is(value.bricksPerMinute, -0))
  if (value.schemaVersion !== expected.schemaVersion || value.gameContextId !== expected.gameContextId || value.outcome !== expected.outcome || !sameNumbers || !sameEvidence) return { ok: false, reason: 'Tool result is inconsistent with the authorized summary.' }
  return { ok: true, value: { ...expected, evidence: expected.evidence.map(record => ({ ...record })) } }
}
