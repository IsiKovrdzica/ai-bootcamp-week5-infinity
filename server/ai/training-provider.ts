import type { GameSummary } from './contracts.js'
import type { PerformanceAnalysisResult } from './training-contracts.js'

export type AgentPhase = 'select_tool' | 'produce_final'
export type SafeTokenUsage = Readonly<{ input?: number; output?: number }>
export type ToolDescriptor = { readonly name: 'analyze_game_performance'; readonly description: string; readonly inputSchema: { readonly type: 'object'; readonly additionalProperties: false; readonly required: readonly ['gameContextId']; readonly properties: { readonly gameContextId: { readonly type: 'string'; readonly minLength: 1; readonly maxLength: 64 } } } }
export type ModelStepRequest = { readonly schemaVersion: 1; readonly promptVersion: 'brickpulse-training-planner/v1'; readonly phase: AgentPhase; readonly goal: 'analyze_completed_game_for_next_game_improvement'; readonly gameSummary: Readonly<GameSummary>; readonly run: { readonly runId: string; readonly gameContextId: string; readonly contextVersion: 1; readonly stepNumber: 1 | 2 | 3; readonly remainingSteps: 0 | 1 | 2; readonly remainingToolCalls: 0 | 1 | 2; readonly remainingProviderAttempts: number; readonly deadlineAt: string }; readonly availableTools: readonly ToolDescriptor[]; readonly evidence: PerformanceAnalysisResult | null }
export interface AgentModelProvider { generateStep(request: Readonly<ModelStepRequest>, options: { signal: AbortSignal; onTokenUsage?: (usage: SafeTokenUsage) => void }): Promise<unknown> }
