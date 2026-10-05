import { ProviderFailure, type ProviderFailureKind } from './provider.js'
import type { AgentModelProvider, ModelStepRequest } from './training-provider.js'

export type ScriptedStep = { readonly type: 'resolve'; readonly value: unknown } | { readonly type: 'reject'; readonly failure: ProviderFailure } | { readonly type: 'deferred'; readonly key: string }
export type SanitizedProviderRequest = { readonly phase: ModelStepRequest['phase']; readonly stepNumber: number; readonly callIndex: number; readonly signalAborted: boolean }
const cloneScriptEntry = (entry: ScriptedStep): ScriptedStep => entry.type === 'resolve'
  ? Object.freeze({ type: 'resolve', value: structuredClone(entry.value) })
  : entry.type === 'reject'
    ? Object.freeze({ type: 'reject', failure: new ProviderFailure(entry.failure.kind) })
    : Object.freeze({ type: 'deferred', key: entry.key })

export class ScriptedAgentModelProvider implements AgentModelProvider {
  private readonly script: readonly ScriptedStep[]
  private cursor = 0
  adapterCallCount = 0
  readonly requests: SanitizedProviderRequest[] = []
  constructor(entries: readonly ScriptedStep[]) { this.script = Object.freeze(entries.map(cloneScriptEntry)) }
  generateStep(request: Readonly<ModelStepRequest>, { signal }: { signal: AbortSignal }): Promise<unknown> {
    this.adapterCallCount += 1
    this.requests.push(Object.freeze({ phase: request.phase, stepNumber: request.run.stepNumber, callIndex: this.adapterCallCount, signalAborted: signal.aborted }))
    const entry = this.script[this.cursor++]
    if (!entry) return Promise.reject(new ProviderFailure('programming'))
    if (entry.type === 'resolve') return Promise.resolve(entry.value)
    if (entry.type === 'reject') return Promise.reject(entry.failure)
    return new Promise((_, reject) => {
      const abort = () => reject(new ProviderFailure('client_cancelled' satisfies ProviderFailureKind))
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })
  }
}
