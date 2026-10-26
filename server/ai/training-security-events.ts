export type SecurityEventKind =
  | 'planner.admitted'
  | 'planner.admission_denied'
  | 'planner.tool_denied'
  | 'planner.result_rejected'
  | 'planner.run_finished'

export type SecurityEventOutcome = 'allowed' | 'denied' | 'rejected' | 'finished'

export type SecurityReasonCode =
  | 'RATE_LIMITED'
  | 'CONCURRENCY_LIMITED'
  | 'TOOL_NOT_ALLOWED'
  | 'TOOL_ARGUMENTS_INVALID'
  | 'TOOL_RESULT_INVALID'
  | 'MODEL_OUTPUT_INVALID'
  | 'RUN_CANCELLED'
  | 'RUN_DEADLINE_EXCEEDED'

export type SecurityTerminalStatus = 'completed' | 'stopped' | 'failed'

export type SecurityEvent = Readonly<{
  correlationId: string
  kind: SecurityEventKind
  outcome: SecurityEventOutcome
  reasonCode?: SecurityReasonCode
  activeExecutionCount: number
  admissionsInWindow: number
  stepCount: number
  providerAttemptCount: number
  toolCallCount: number
  elapsedMs: number
  terminalStatus?: SecurityTerminalStatus
}>

export type TrainingSecurityEventProjector = Readonly<{
  project(input: unknown): SecurityEvent | undefined
}>

type ProjectorOptions = Readonly<{
  createCorrelationId(): string
}>

type EventRecord = Record<string, unknown>

type SecurityEventCounters = Readonly<{
  activeExecutionCount: number
  admissionsInWindow: number
  stepCount: number
  providerAttemptCount: number
  toolCallCount: number
  elapsedMs: number
}>

const hasExactKeys = (value: unknown, keys: readonly string[]): value is EventRecord =>
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key))

const boundedInteger = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum

const baseKeys = [
  'kind',
  'outcome',
  'activeExecutionCount',
  'admissionsInWindow',
  'stepCount',
  'providerAttemptCount',
  'toolCallCount',
  'elapsedMs',
] as const

const readCounters = (event: EventRecord): SecurityEventCounters | undefined => {
  if (!boundedInteger(event.activeExecutionCount, 2)
    || !boundedInteger(event.admissionsInWindow, 5)
    || !boundedInteger(event.stepCount, 3)
    || !boundedInteger(event.providerAttemptCount, 6)
    || !boundedInteger(event.toolCallCount, 2)
    || !boundedInteger(event.elapsedMs, 30_000)) return undefined
  return {
    activeExecutionCount: event.activeExecutionCount,
    admissionsInWindow: event.admissionsInWindow,
    stepCount: event.stepCount,
    providerAttemptCount: event.providerAttemptCount,
    toolCallCount: event.toolCallCount,
    elapsedMs: event.elapsedMs,
  }
}

const matches = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && allowed.includes(value as T)

const securityEventKinds = [
  'planner.admitted',
  'planner.admission_denied',
  'planner.tool_denied',
  'planner.result_rejected',
  'planner.run_finished',
] as const

const securityEventOutcomes = ['allowed', 'denied', 'rejected', 'finished'] as const

export function createTrainingSecurityEventProjector({ createCorrelationId }: ProjectorOptions): TrainingSecurityEventProjector {
  const project = (input: unknown): SecurityEvent | undefined => {
    let projected: Omit<SecurityEvent, 'correlationId'> | undefined
    try {
      if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) return undefined
      const candidate = input as EventRecord
      const kind = candidate.kind
      const outcome = candidate.outcome
      const reasonCode = candidate.reasonCode
      const terminalStatus = candidate.terminalStatus
      const counterValues = readCounters(candidate)
      if (!matches(kind, securityEventKinds) || !matches(outcome, securityEventOutcomes) || counterValues === undefined) return undefined

      let accepted = false
      if (kind === 'planner.admitted') {
        accepted = hasExactKeys(candidate, baseKeys) && outcome === 'allowed'
      } else if (kind === 'planner.admission_denied') {
        accepted = hasExactKeys(candidate, [...baseKeys, 'reasonCode'])
          && outcome === 'denied'
          && matches(reasonCode, ['RATE_LIMITED', 'CONCURRENCY_LIMITED'] as const)
      } else if (kind === 'planner.tool_denied') {
        accepted = hasExactKeys(candidate, [...baseKeys, 'reasonCode'])
          && outcome === 'denied'
          && matches(reasonCode, ['TOOL_NOT_ALLOWED', 'TOOL_ARGUMENTS_INVALID'] as const)
      } else if (kind === 'planner.result_rejected') {
        accepted = hasExactKeys(candidate, [...baseKeys, 'reasonCode'])
          && outcome === 'rejected'
          && matches(reasonCode, ['TOOL_RESULT_INVALID', 'MODEL_OUTPUT_INVALID'] as const)
      } else if (kind === 'planner.run_finished') {
        const normalCompletion = hasExactKeys(candidate, [...baseKeys, 'terminalStatus'])
          && outcome === 'finished'
          && terminalStatus === 'completed'
        const cancelled = hasExactKeys(candidate, [...baseKeys, 'reasonCode', 'terminalStatus'])
          && outcome === 'finished'
          && reasonCode === 'RUN_CANCELLED'
          && matches(terminalStatus, ['stopped', 'failed'] as const)
        const deadlineExceeded = hasExactKeys(candidate, [...baseKeys, 'reasonCode', 'terminalStatus'])
          && outcome === 'finished'
          && reasonCode === 'RUN_DEADLINE_EXCEEDED'
          && terminalStatus === 'failed'
        accepted = normalCompletion || cancelled || deadlineExceeded
      }

      if (!accepted) return undefined
      projected = {
        kind,
        outcome,
        activeExecutionCount: counterValues.activeExecutionCount,
        admissionsInWindow: counterValues.admissionsInWindow,
        stepCount: counterValues.stepCount,
        providerAttemptCount: counterValues.providerAttemptCount,
        toolCallCount: counterValues.toolCallCount,
        elapsedMs: counterValues.elapsedMs,
        ...(reasonCode === undefined ? {} : { reasonCode: reasonCode as SecurityReasonCode }),
        ...(terminalStatus === undefined ? {} : { terminalStatus: terminalStatus as SecurityTerminalStatus }),
      }
    } catch {
      return undefined
    }
    if (projected === undefined) return undefined
    return Object.freeze({ correlationId: createCorrelationId(), ...projected })
  }

  return Object.freeze({ project })
}
