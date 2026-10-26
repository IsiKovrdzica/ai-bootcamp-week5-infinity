import { describe, expect, it } from 'vitest'
import { createTrainingSecurityEventProjector } from './training-security-events.js'

const counters = {
  activeExecutionCount: 1,
  admissionsInWindow: 1,
  stepCount: 1,
  providerAttemptCount: 1,
  toolCallCount: 0,
  elapsedMs: 12,
}

const admitted = { kind: 'planner.admitted', outcome: 'allowed', ...counters }

const withoutCounter = (counter: keyof typeof counters): Record<string, unknown> => {
  const event: Record<string, unknown> = { ...admitted }
  delete event[counter]
  return event
}

describe('W08 closed training security-event projection', () => {
  it.each([
    [{ kind: 'planner.admitted', outcome: 'allowed', ...counters }],
    [{ kind: 'planner.admission_denied', outcome: 'denied', reasonCode: 'RATE_LIMITED', ...counters }],
    [{ kind: 'planner.admission_denied', outcome: 'denied', reasonCode: 'CONCURRENCY_LIMITED', ...counters }],
    [{ kind: 'planner.tool_denied', outcome: 'denied', reasonCode: 'TOOL_NOT_ALLOWED', ...counters }],
    [{ kind: 'planner.tool_denied', outcome: 'denied', reasonCode: 'TOOL_ARGUMENTS_INVALID', ...counters }],
    [{ kind: 'planner.result_rejected', outcome: 'rejected', reasonCode: 'TOOL_RESULT_INVALID', ...counters }],
    [{ kind: 'planner.result_rejected', outcome: 'rejected', reasonCode: 'MODEL_OUTPUT_INVALID', ...counters }],
    [{ kind: 'planner.run_finished', outcome: 'finished', terminalStatus: 'completed', ...counters }],
    [{ kind: 'planner.run_finished', outcome: 'finished', reasonCode: 'RUN_CANCELLED', terminalStatus: 'stopped', ...counters }],
    [{ kind: 'planner.run_finished', outcome: 'finished', reasonCode: 'RUN_DEADLINE_EXCEEDED', terminalStatus: 'failed', ...counters }],
  ])('projects an exact allowed event for %#', input => {
    const projector = createTrainingSecurityEventProjector({ createCorrelationId: () => 'security_corr_1' })
    expect(projector.project(input)).toEqual({ correlationId: 'security_corr_1', ...input })
  })

  it.each([
    { kind: 'planner.admitted', outcome: 'denied', reasonCode: 'RATE_LIMITED', ...counters },
    { kind: 'planner.admission_denied', outcome: 'denied', ...counters },
    { kind: 'planner.tool_denied', outcome: 'denied', reasonCode: 'RATE_LIMITED', ...counters },
    { kind: 'planner.result_rejected', outcome: 'rejected', reasonCode: 'TOOL_NOT_ALLOWED', ...counters },
    { kind: 'planner.run_finished', outcome: 'finished', terminalStatus: 'stopped', ...counters },
    { kind: 'planner.run_finished', outcome: 'finished', reasonCode: 'RUN_CANCELLED', terminalStatus: 'completed', ...counters },
    { kind: 'planner.run_finished', outcome: 'finished', reasonCode: 'RUN_DEADLINE_EXCEEDED', terminalStatus: 'stopped', ...counters },
    { kind: 'planner.unknown', outcome: 'allowed', ...counters },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, elapsedMs: Number.NaN },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, elapsedMs: Number.POSITIVE_INFINITY },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, elapsedMs: Number.NEGATIVE_INFINITY },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, activeExecutionCount: -1 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, admissionsInWindow: -1 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, stepCount: -1 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, providerAttemptCount: -1 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, toolCallCount: -1 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, elapsedMs: -1 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, activeExecutionCount: 1.5 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, admissionsInWindow: 1.5 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, stepCount: 1.5 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, providerAttemptCount: 1.5 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, toolCallCount: 1.5 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, elapsedMs: 1.5 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, activeExecutionCount: 3 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, admissionsInWindow: 6 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, stepCount: 4 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, providerAttemptCount: 7 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, toolCallCount: 3 },
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, elapsedMs: 30_001 },
    withoutCounter('activeExecutionCount'),
    withoutCounter('admissionsInWindow'),
    withoutCounter('stepCount'),
    withoutCounter('providerAttemptCount'),
    withoutCounter('toolCallCount'),
    withoutCounter('elapsedMs'),
    { kind: 'planner.admitted', outcome: 'allowed', ...counters, correlationId: 'browser_controlled', rawProviderError: 'untrusted' },
  ])('rejects an incompatible, out-of-bounds, or non-allowlisted event for %#', input => {
    const projector = createTrainingSecurityEventProjector({ createCorrelationId: () => 'security_corr_1' })
    expect(projector.project(input)).toBeUndefined()
  })

  it('generates correlation IDs server-side for each accepted projection', () => {
    let sequence = 0
    const projector = createTrainingSecurityEventProjector({ createCorrelationId: () => `security_corr_${++sequence}` })
    const input = { kind: 'planner.admitted', outcome: 'allowed', ...counters }

    expect(projector.project(input)).toMatchObject({ correlationId: 'security_corr_1' })
    expect(projector.project(input)).toMatchObject({ correlationId: 'security_corr_2' })
  })

  it('constructs a fresh event and rejects caller IDs, unknown fields, and malformed inputs before generating an ID', () => {
    let factoryCalls = 0
    const projector = createTrainingSecurityEventProjector({ createCorrelationId: () => `security_corr_${++factoryCalls}` })
    const input = { kind: 'planner.admitted', outcome: 'allowed', ...counters }
    const projected = projector.project(input)

    expect(projected).toEqual({ correlationId: 'security_corr_1', ...input })
    expect(projected).not.toBe(input)
    expect(factoryCalls).toBe(1)
    for (const invalid of [
      { ...input, correlationId: 'caller_controlled' },
      { ...input, rawProviderError: 'untrusted' },
      null,
      [],
      { kind: 'planner.admitted', outcome: 'allowed' },
    ]) {
      expect(() => projector.project(invalid)).not.toThrow()
      expect(projector.project(invalid)).toBeUndefined()
    }
    expect(factoryCalls).toBe(1)
  })

  it.each([
    ['prototype inspection', new Proxy({ ...admitted }, { getPrototypeOf: () => { throw new Error('prototype trap') } })],
    ['own-key enumeration', new Proxy({ ...admitted }, { ownKeys: () => { throw new Error('ownKeys trap') } })],
    ['property access', new Proxy({ ...admitted }, { get: () => { throw new Error('get trap') } })],
  ])('fails closed when %s throws during untrusted input inspection', (_operation, input) => {
    let factoryCalls = 0
    const projector = createTrainingSecurityEventProjector({ createCorrelationId: () => `security_corr_${++factoryCalls}` })

    expect(() => projector.project(input)).not.toThrow()
    expect(projector.project(input)).toBeUndefined()
    expect(factoryCalls).toBe(0)
  })
})
