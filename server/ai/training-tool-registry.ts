import type { ValidationResult } from './contracts.js'
import { analyzeGamePerformance, validatePerformanceAnalysisResult, type TrainingToolContext } from './training-tool.js'
import type { PerformanceAnalysisResult } from './training-contracts.js'

export type AnalyzeGamePerformanceArgs = { gameContextId: string }
export type ToolDescriptor = { readonly name: 'analyze_game_performance'; readonly description: 'Deterministic completed-game performance analysis.' }
export type RegisteredTool = { readonly descriptor: ToolDescriptor; readonly validateArguments: (value: unknown, context: TrainingToolContext) => ValidationResult<AnalyzeGamePerformanceArgs>; readonly execute: (args: AnalyzeGamePerformanceArgs, context: TrainingToolContext, signal: AbortSignal) => Promise<unknown>; readonly validateResult: (value: unknown, context: TrainingToolContext) => ValidationResult<PerformanceAnalysisResult> }
export type ToolInvokeResult = ValidationResult<PerformanceAnalysisResult> | { ok: false; reason: 'unknown_tool' | 'invalid_tool_arguments' | 'tool_failure' | 'invalid_tool_result' }

const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
const validContextId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)

export function validateAnalyzeGamePerformanceArguments(value: unknown, context: TrainingToolContext): ValidationResult<AnalyzeGamePerformanceArgs> {
  if (!exact(value, ['gameContextId']) || !validContextId(value.gameContextId) || value.gameContextId !== context.gameContextId) return { ok: false, reason: 'Tool arguments must be the exact matching context ID.' }
  return { ok: true, value: { gameContextId: value.gameContextId } }
}

const defaultTool: RegisteredTool = Object.freeze({
  descriptor: Object.freeze({ name: 'analyze_game_performance', description: 'Deterministic completed-game performance analysis.' }),
  validateArguments: validateAnalyzeGamePerformanceArguments,
  execute: async (args, context) => analyzeGamePerformance(context.gameSummary, args.gameContextId),
  validateResult: validatePerformanceAnalysisResult,
})

export type TrainingToolTiming = { readonly setTimer: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>; readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void }
export function createTrainingToolRegistry(overrides: Partial<Pick<RegisteredTool, 'execute'>> = {}, timing: TrainingToolTiming = { setTimer: globalThis.setTimeout, clearTimer: globalThis.clearTimeout }) {
  const tool = Object.freeze({ ...defaultTool, ...overrides }) as RegisteredTool
  const tools = Object.freeze([tool]) as readonly RegisteredTool[]
  const lookup = (name: string) => name === tool.descriptor.name ? tool : undefined
  const invoke = async (name: string, argumentsValue: unknown, context: TrainingToolContext, signal: AbortSignal, remainingMs: number, onInvocation: () => void): Promise<ToolInvokeResult> => {
    const binding = lookup(name)
    if (!binding) return { ok: false, reason: 'unknown_tool' }
    const args = binding.validateArguments(argumentsValue, context)
    if (!args.ok) return { ok: false, reason: 'invalid_tool_arguments' }
    if (remainingMs <= 0 || signal.aborted) return { ok: false, reason: 'tool_failure' }
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    const timeoutMs = Math.min(100, remainingMs)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timed = new Promise<never>((_, reject) => { timer = timing.setTimer(() => { controller.abort(); reject(new Error('tool timeout')) }, timeoutMs) })
      const aborted = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('tool aborted')), { once: true }))
      onInvocation()
      const raw = await Promise.race([binding.execute(args.value, context, controller.signal), timed, aborted])
      const result = binding.validateResult(raw, context)
      return result.ok ? result : { ok: false, reason: 'invalid_tool_result' }
    } catch {
      return { ok: false, reason: 'tool_failure' }
    } finally {
      if (timer !== undefined) timing.clearTimer(timer)
      signal.removeEventListener('abort', abort)
    }
  }
  return Object.freeze({ tools, lookup, invoke })
}
