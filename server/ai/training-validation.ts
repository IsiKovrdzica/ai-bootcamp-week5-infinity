import { validateGameSummary } from './validation.js'
import type { ValidationResult } from './contracts.js'
import { TRAINING_AGENT_LIMITS, type AgentPhase, type NormalizedModelProposal, type PerformanceAnalysisResult, type RecommendationAction } from './training-contracts.js'
import { TRAINING_CONFIDENCES, TRAINING_EVIDENCE_IDS, TRAINING_FOCUSES, TRAINING_PLAN_STOP_REASONS, type EvidenceId, type PublicTrainingRun, type TrainingConfidence, type TrainingFocus, type TrainingPlan } from '../../src/ai/training-contracts.js'

const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k))
const bytesOk = (v: unknown, max: number) => Buffer.byteLength(JSON.stringify(v), 'utf8') <= max
const isDomainValue = <T extends string>(value: unknown, domain: readonly T[]): value is T => typeof value === 'string' && domain.includes(value as T)
const ids = (v: unknown, min: number, max: number): v is EvidenceId[] => Array.isArray(v) && v.length >= min && v.length <= max && v.every(x => isDomainValue(x, TRAINING_EVIDENCE_IDS)) && new Set(v).size === v.length
const RECOMMENDATION_ACTIONS = ['reduce_lives_lost', 'improve_clear_rate', 'repeat_completed_clear'] as const

function parseFinalProposal(value: unknown): ValidationResult<Extract<NormalizedModelProposal, { kind: 'final' }>> {
  if (!exact(value, ['kind', 'plan']) || value.kind !== 'final' || !exact(value.plan, ['focus', 'summaryEvidenceIds', 'recommendation', 'evidenceIds', 'confidence', 'completed'])) return { ok: false, reason: 'Final proposal must have exact fields.' }
  const plan = value.plan
  if (!isDomainValue(plan.focus, TRAINING_FOCUSES) || !ids(plan.summaryEvidenceIds, 1, 3) || !exact(plan.recommendation, ['action', 'evidenceIds']) || !isDomainValue(plan.recommendation.action, RECOMMENDATION_ACTIONS) || !ids(plan.recommendation.evidenceIds, 1, 2) || !ids(plan.evidenceIds, 1, 3) || !isDomainValue(plan.confidence, TRAINING_CONFIDENCES) || plan.completed !== true) return { ok: false, reason: 'Final proposal fields are invalid.' }
  const focus: TrainingFocus = plan.focus
  const confidence: TrainingConfidence = plan.confidence
  const action: RecommendationAction = plan.recommendation.action
  return { ok: true, value: { kind: 'final', plan: { focus, summaryEvidenceIds: [...plan.summaryEvidenceIds], recommendation: { action, evidenceIds: [...plan.recommendation.evidenceIds] }, evidenceIds: [...plan.evidenceIds], confidence, completed: true } } }
}

export const validateTrainingInitialSummary = validateGameSummary

export function validateTrainingModelProposal(value: unknown, phase: AgentPhase): ValidationResult<NormalizedModelProposal> {
  if (!bytesOk(value, TRAINING_AGENT_LIMITS.maxModelProposalBytes) || !exact(value, ['kind']) && !(exact(value, ['kind', 'toolRequest']) || exact(value, ['kind', 'plan']))) return { ok: false, reason: 'Proposal must have exact fields.' }
  if ((value as { kind: unknown }).kind === 'refusal') return { ok: true, value: { kind: 'refusal' } }
  if ((value as { kind: unknown }).kind === 'tool_request' && phase === 'select_tool') {
    const request = (value as { toolRequest: unknown }).toolRequest
    if (exact(request, ['name', 'arguments']) && request.name === 'analyze_game_performance' && exact(request.arguments, ['gameContextId']) && typeof request.arguments.gameContextId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(request.arguments.gameContextId)) return { ok: true, value: { kind: 'tool_request', toolRequest: { name: request.name, arguments: { gameContextId: request.arguments.gameContextId } } } }
  }
  if ((value as { kind: unknown }).kind === 'final' && phase === 'produce_final') return parseFinalProposal(value)
  return { ok: false, reason: 'Proposal is invalid for phase.' }
}

export function validateTrainingFinalProposal(value: unknown, result: PerformanceAnalysisResult): ValidationResult<Extract<NormalizedModelProposal, { kind: 'final' }>> {
  const parsed = parseFinalProposal(value)
  if (!parsed.ok) return parsed
  const plan = parsed.value.plan
  const known = new Set<string>(result.evidence.map(e => e.id)); const all = [...plan.summaryEvidenceIds, ...plan.recommendation.evidenceIds]
  const union = [...new Set(all)]
  if (!all.every(id => known.has(id as never)) || JSON.stringify(plan.evidenceIds) !== JSON.stringify(union)) return { ok: false, reason: 'Final evidence is invalid.' }
  const req: Record<string, [string, string[]]> = { survival: ['reduce_lives_lost', ['game.lives']], efficiency: ['improve_clear_rate', ['game.bricks_per_minute', 'game.duration_seconds']], consistency: ['repeat_completed_clear', ['game.outcome', 'game.completion_rate']] }
  const [action, required] = req[plan.focus]
  if (plan.recommendation.action !== action || !required.every(id => plan.recommendation.evidenceIds.includes(id as never))) return { ok: false, reason: 'Final semantics are invalid.' }
  if ((plan.focus === 'survival' && result.livesLost <= 0) || (plan.focus === 'efficiency' && result.bricksPerMinute === null) || (plan.focus === 'consistency' && result.outcome !== 'WON')) return { ok: false, reason: 'Final focus is unsupported.' }
  return parsed
}

const points = (text: string) => [...text].length
const summaryTemplate = (focus: string) => `The completed game supports a${focus === 'efficiency' ? 'n' : ''} ${focus} training focus.`
const recommendationTemplates: Record<string, string> = {
  survival: 'For the next game, aim to reduce lives lost from the observed baseline.',
  efficiency: 'For the next game, use the observed clear rate as a personal baseline.',
  consistency: 'For the next game, aim to repeat the completed clear.',
}
const findingLabels: Record<string, string> = { 'game.outcome': 'Outcome', 'game.bricks_destroyed': 'Bricks destroyed', 'game.completion_rate': 'Completion rate', 'game.duration_seconds': 'Duration', 'game.bricks_per_minute': 'Bricks per minute', 'game.lives': 'Lives' }
const findingTemplate = (id: string, result: PerformanceAnalysisResult) => {
  const record = result.evidence.find(e => e.id === id)
  return record ? `${findingLabels[id]}: ${record.value}.` : null
}
export function validatePublicTrainingPlan(value: unknown, result: PerformanceAnalysisResult): ValidationResult<TrainingPlan> {
  if (!exact(value, ['summary', 'focus', 'recommendation', 'evidence', 'confidence', 'completed']) || typeof value.summary !== 'string' || value.summary.trim() !== value.summary || points(value.summary) < 1 || points(value.summary) > 200 || typeof value.recommendation !== 'string' || value.recommendation.trim() !== value.recommendation || points(value.recommendation) < 1 || points(value.recommendation) > 240 || !Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 3 || value.completed !== true || !(TRAINING_FOCUSES as readonly string[]).includes(value.focus as string) || !(TRAINING_CONFIDENCES as readonly string[]).includes(value.confidence as string) || value.summary !== summaryTemplate(value.focus as string) || value.recommendation !== recommendationTemplates[value.focus as string] || !value.evidence.every(e => exact(e, ['id', 'finding']) && typeof e.finding === 'string' && e.finding.trim() === e.finding && points(e.finding) >= 1 && points(e.finding) <= 120 && (TRAINING_EVIDENCE_IDS as readonly string[]).includes(e.id as string) && e.finding === findingTemplate(e.id as string, result)) || new Set(value.evidence.map(e => e.id)).size !== value.evidence.length || !bytesOk(value, 2 * 1024)) return { ok: false, reason: 'Public plan is invalid.' }
  return { ok: true, value: value as TrainingPlan }
}
export function renderPublicTrainingPlan(value: unknown, result: PerformanceAnalysisResult): ValidationResult<TrainingPlan> {
  const validated = validateTrainingFinalProposal(value, result)
  if (!validated.ok) return validated
  const plan = validated.value.plan
  const rendered: TrainingPlan = { summary: summaryTemplate(plan.focus), focus: plan.focus, recommendation: recommendationTemplates[plan.focus], evidence: plan.evidenceIds.map(id => ({ id, finding: findingTemplate(id, result) ?? '' })), confidence: plan.confidence, completed: true }
  return validatePublicTrainingPlan(rendered, result)
}
export function validatePublicTrainingRun(value: unknown): ValidationResult<PublicTrainingRun> {
  const record = value as Record<string, number | string>
  if (!exact(value, ['runId', 'status', 'stopReason', 'stepCount', 'providerAttemptCount', 'toolCallCount', 'elapsedMs']) || typeof record.runId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(record.runId) || !['completed', 'stopped', 'failed'].includes(record.status as string) || !(TRAINING_PLAN_STOP_REASONS as readonly string[]).includes(record.stopReason as string) || ![record.stepCount, record.providerAttemptCount, record.toolCallCount].every(Number.isInteger) || (record.stepCount as number) < 0 || (record.stepCount as number) > 3 || (record.providerAttemptCount as number) < 0 || (record.providerAttemptCount as number) > 6 || (record.toolCallCount as number) < 0 || (record.toolCallCount as number) > 2 || typeof record.elapsedMs !== 'number' || !Number.isFinite(record.elapsedMs) || record.elapsedMs < 0) return { ok: false, reason: 'Public run is invalid.' }
  return { ok: true, value: { ...value, elapsedMs: Math.min(30_000, Math.floor(record.elapsedMs as number)) } as PublicTrainingRun }
}
