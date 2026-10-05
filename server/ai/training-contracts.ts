import type { GameSummary } from '../../src/ai/contracts.js'
import type { EvidenceId, TrainingConfidence, TrainingFocus, TrainingPlan } from '../../src/ai/training-contracts.js'
export type { EvidenceId, TrainingConfidence, TrainingFocus, TrainingPlan }
export const TRAINING_AGENT_LIMITS = { maxAgentSteps: 3, maxToolCalls: 2, maxProviderAttemptsPerStep: 2, maxProviderAttemptsPerRun: 6, providerAttemptTimeoutMs: 15_000, totalRunDeadlineMs: 30_000, toolTimeoutMs: 100, maxModelProposalBytes: 8 * 1024, maxToolResultBytes: 2 * 1024 } as const
export type AgentPhase = 'select_tool' | 'produce_final'
export type RecommendationAction = 'reduce_lives_lost' | 'improve_clear_rate' | 'repeat_completed_clear'
export type PerformanceAnalysisResult = { schemaVersion: 1; gameContextId: string; outcome: 'WON' | 'GAME_OVER'; score: number; bricksDestroyed: number; totalBricks: 32; completionRate: number; durationSeconds: number; bricksPerMinute: number | null; livesLost: number; livesRemaining: number; evidence: readonly { id: EvidenceId; metric: string; value: string }[] }
export type NormalizedModelProposal = { kind: 'tool_request'; toolRequest: { name: 'analyze_game_performance'; arguments: { gameContextId: string } } } | { kind: 'final'; plan: { focus: TrainingFocus; summaryEvidenceIds: readonly EvidenceId[]; recommendation: { action: RecommendationAction; evidenceIds: readonly EvidenceId[] }; evidenceIds: readonly EvidenceId[]; confidence: TrainingConfidence; completed: true } } | { kind: 'refusal' }
export type ModelStepRequest = { schemaVersion: 1; promptVersion: 'brickpulse-training-planner/v1'; phase: AgentPhase; goal: 'analyze_completed_game_for_next_game_improvement'; gameSummary: Readonly<GameSummary> }
export interface AgentModelProvider { generateStep(request: Readonly<ModelStepRequest>, options: { signal: AbortSignal }): Promise<unknown> }
