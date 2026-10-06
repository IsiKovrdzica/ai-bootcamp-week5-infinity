import type { GameSummary } from './contracts.js'
import type { TrainingPlan } from './training-contracts.js'
import type { TrainingPlanTransport, TrainingPlanTransportResult } from './training-api-client.js'

export type TrainingState = { kind: 'hidden' } | { kind: 'idle' } | { kind: 'pending' } | { kind: 'success'; plan: TrainingPlan } | { kind: 'failure' }
export type TrainingControllerOptions = { transport: TrainingPlanTransport; onStateChange: (state: TrainingState) => void }
export class TrainingController {
  private stateValue: TrainingState = { kind: 'hidden' }; private summary: Readonly<GameSummary> | undefined
  private sessionValue = 0; private requestId = 0; private inFlight: AbortController | undefined
  constructor(private readonly options: TrainingControllerOptions) { options.onStateChange(this.stateValue) }
  showTerminal(summary: Readonly<GameSummary>): void { this.summary = summary; if (this.stateValue.kind === 'hidden') this.setState({ kind: 'idle' }) }
  requestPlan(): void {
    if (!this.summary || this.inFlight || !['idle', 'success', 'failure'].includes(this.stateValue.kind)) return
    const controller = new AbortController(); const sessionId = this.sessionValue; const requestId = ++this.requestId
    this.inFlight = controller; this.setState({ kind: 'pending' })
    let pending: Promise<TrainingPlanTransportResult>
    try { pending = this.options.transport(this.summary, { signal: controller.signal }) } catch { pending = Promise.resolve({ ok: false }) }
    void pending.then((result) => this.settle(sessionId, requestId, result), () => this.settle(sessionId, requestId, { ok: false }))
  }
  restart(): void { this.inFlight?.abort(); this.inFlight = undefined; this.summary = undefined; this.sessionValue += 1; this.setState({ kind: 'hidden' }) }
  get state(): TrainingState { return this.stateValue }; get sessionId(): number { return this.sessionValue }
  private settle(sessionId: number, requestId: number, result: TrainingPlanTransportResult): void { if (sessionId !== this.sessionValue || requestId !== this.requestId) return; this.inFlight = undefined; this.setState(result.ok ? { kind: 'success', plan: result.plan } : { kind: 'failure' }) }
  private setState(state: TrainingState): void { this.stateValue = state; this.options.onStateChange(state) }
}
