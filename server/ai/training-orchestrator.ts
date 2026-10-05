import type { GameSummary } from './contracts.js'
import type { TrainingPlan } from '../../src/ai/training-contracts.js'
import { TRAINING_AGENT_LIMITS, type PerformanceAnalysisResult } from './training-contracts.js'
import { renderPublicTrainingPlan, validateTrainingFinalProposal, validateTrainingModelProposal } from './training-validation.js'
import type { AgentModelProvider, ModelStepRequest, ToolDescriptor } from './training-provider.js'
import { createTrainingToolRegistry } from './training-tool-registry.js'

type RunPhase = 'awaiting_tool' | 'executing_tool' | 'awaiting_final' | 'terminal'
type RunStatus = 'running' | 'completed' | 'stopped' | 'failed'
type StopReason = 'completed' | 'invalid_model_proposal' | 'unknown_tool' | 'invalid_tool_arguments' | 'invalid_tool_result' | 'tool_failure' | 'provider_failure' | 'invalid_final_output'
export type TrainingRunState = { readonly runId: string; readonly status: RunStatus; readonly phase: RunPhase; readonly stepCount: number; readonly providerAttemptCount: number; readonly currentStepAttemptCount: number; readonly retryAttemptCount: number; readonly fallbackAttemptCount: number; readonly toolProposalCount: number; readonly toolCallCount: number; readonly validatedToolResultCount: number; readonly progressVersion: 0 | 1 | 2; readonly stopReason?: StopReason; readonly validatedEvidence?: PerformanceAnalysisResult; readonly finalResult?: TrainingPlan }
export type TrainingEvent = { readonly kind: 'run_started' | 'step_started' | 'provider_attempt_settled' | 'proposal_validated' | 'tool_execution_settled' | 'tool_result_validated' | 'final_validated' | 'run_finished'; readonly runId: string; readonly phase: RunPhase; readonly stepCount: number; readonly providerAttemptCount: number; readonly toolCallCount: number }
export type TrainingOrchestratorDependencies = { readonly provider: AgentModelProvider; readonly registry: ReturnType<typeof createTrainingToolRegistry>; readonly clock: () => number; readonly createId: () => string; readonly createContextId: () => string; readonly eventSink?: (event: TrainingEvent) => void; readonly setTimer?: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>; readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void }
export type TrainingRunResult = { readonly state: TrainingRunState; readonly plan?: TrainingPlan; readonly transitions: readonly RunPhase[]; readonly progressVersions: readonly (0 | 1 | 2)[] }

const descriptor: ToolDescriptor = Object.freeze({ name: 'analyze_game_performance', description: 'Deterministic completed-game performance analysis.', inputSchema: Object.freeze({ type: 'object', additionalProperties: false, required: ['gameContextId'] as const, properties: Object.freeze({ gameContextId: Object.freeze({ type: 'string', minLength: 1, maxLength: 64 }) }) }) })
const freezeState = (state: TrainingRunState): TrainingRunState => Object.freeze({ ...state, ...(state.validatedEvidence ? { validatedEvidence: Object.freeze({ ...state.validatedEvidence, evidence: Object.freeze(state.validatedEvidence.evidence.map(item => Object.freeze({ ...item }))) }) } : {}), ...(state.finalResult ? { finalResult: Object.freeze({ ...state.finalResult, evidence: Object.freeze(state.finalResult.evidence.map(item => Object.freeze({ ...item }))) }) } : {}) })

export class TrainingAgentOrchestrator {
  constructor(private readonly deps: TrainingOrchestratorDependencies) {}
  async run(summary: Readonly<GameSummary>): Promise<TrainingRunResult> {
    const runId = this.deps.createId(); const gameContextId = this.deps.createContextId(); const deadlineAtMs = this.deps.clock() + TRAINING_AGENT_LIMITS.totalRunDeadlineMs
    const controller = new AbortController()
    const setTimer: NonNullable<TrainingOrchestratorDependencies['setTimer']> = this.deps.setTimer ?? ((callback, milliseconds) => setTimeout(callback, milliseconds) as ReturnType<typeof setTimeout>)
    const clearTimer: NonNullable<TrainingOrchestratorDependencies['clearTimer']> = this.deps.clearTimer ?? (timer => clearTimeout(timer))
    const deadlineTimer = setTimer(() => controller.abort(), TRAINING_AGENT_LIMITS.totalRunDeadlineMs)
    let state: TrainingRunState = { runId, status: 'running', phase: 'awaiting_tool', stepCount: 0, providerAttemptCount: 0, currentStepAttemptCount: 0, retryAttemptCount: 0, fallbackAttemptCount: 0, toolProposalCount: 0, toolCallCount: 0, validatedToolResultCount: 0, progressVersion: 0 }
    const transitions: RunPhase[] = ['awaiting_tool']; const progressVersions: (0 | 1 | 2)[] = [0]
    const emit = (kind: TrainingEvent['kind']) => this.deps.eventSink?.({ kind, runId, phase: state.phase, stepCount: state.stepCount, providerAttemptCount: state.providerAttemptCount, toolCallCount: state.toolCallCount })
    const terminal = (status: Extract<RunStatus, 'completed' | 'stopped' | 'failed'>, stopReason: StopReason, finalResult?: TrainingPlan) => { if (state.phase === 'terminal') return; state = freezeState({ ...state, status, phase: 'terminal', stopReason, ...(finalResult ? { finalResult } : {}) }); transitions.push('terminal'); emit('run_finished'); clearTimer(deadlineTimer) }
    const request = (phase: ModelStepRequest['phase'], stepNumber: 1 | 2): ModelStepRequest => Object.freeze({ schemaVersion: 1, promptVersion: 'brickpulse-training-planner/v1', phase, goal: 'analyze_completed_game_for_next_game_improvement', gameSummary: Object.freeze({ ...summary }), run: Object.freeze({ runId, gameContextId, contextVersion: 1, stepNumber, remainingSteps: (3 - stepNumber) as 0 | 1 | 2, remainingToolCalls: (2 - state.toolCallCount) as 0 | 1 | 2, remainingProviderAttempts: TRAINING_AGENT_LIMITS.maxProviderAttemptsPerRun - state.providerAttemptCount, deadlineAt: new Date(deadlineAtMs).toISOString() }), availableTools: phase === 'select_tool' ? Object.freeze([descriptor]) : Object.freeze([]), evidence: state.validatedEvidence ?? null })
    const generate = async (phase: ModelStepRequest['phase'], stepNumber: 1 | 2) => { state = { ...state, stepCount: state.stepCount + 1, currentStepAttemptCount: 1, providerAttemptCount: state.providerAttemptCount + 1 }; emit('step_started'); try { const value = await this.deps.provider.generateStep(request(phase, stepNumber), { signal: controller.signal }); emit('provider_attempt_settled'); return value } catch { terminal('failed', 'provider_failure'); return undefined } }
    emit('run_started')
    const first = await generate('select_tool', 1); if (state.phase === 'terminal') return { state, transitions, progressVersions }
    const toolProposal = validateTrainingModelProposal(first, 'select_tool'); if (!toolProposal.ok || toolProposal.value.kind !== 'tool_request') { terminal('stopped', 'invalid_model_proposal'); return { state, transitions, progressVersions } }
    state = { ...state, toolProposalCount: state.toolProposalCount + 1 }; emit('proposal_validated')
    state = { ...state, phase: 'executing_tool' }; transitions.push('executing_tool')
    const invoked = await this.deps.registry.invoke(toolProposal.value.toolRequest.name, toolProposal.value.toolRequest.arguments, { gameSummary: summary, gameContextId }, controller.signal, deadlineAtMs - this.deps.clock(), () => { state = { ...state, toolCallCount: state.toolCallCount + 1 } })
    emit('tool_execution_settled')
    if (!invoked.ok) { terminal(invoked.reason === 'invalid_tool_result' || invoked.reason === 'tool_failure' ? 'failed' : 'stopped', invoked.reason as StopReason); return { state, transitions, progressVersions } }
    const evidence = invoked.value as PerformanceAnalysisResult
    state = { ...state, phase: 'awaiting_final', validatedToolResultCount: state.validatedToolResultCount + 1, progressVersion: 1, validatedEvidence: evidence }; transitions.push('awaiting_final'); progressVersions.push(1); emit('tool_result_validated')
    const second = await generate('produce_final', 2); if (state.phase === 'terminal') return { state, transitions, progressVersions }
    const final = validateTrainingFinalProposal(second, evidence); if (!final.ok) { terminal('stopped', 'invalid_final_output'); return { state, transitions, progressVersions } }
    const rendered = renderPublicTrainingPlan(final.value, evidence); if (!rendered.ok) { terminal('stopped', 'invalid_final_output'); return { state, transitions, progressVersions } }
    state = { ...state, progressVersion: 2 }; progressVersions.push(2); emit('final_validated'); terminal('completed', 'completed', rendered.value)
    return { state, plan: rendered.value, transitions, progressVersions }
  }
}
