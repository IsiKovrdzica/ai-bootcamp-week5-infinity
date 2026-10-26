import { describe, expect, it } from 'vitest'
import {
  createTrainingAdmissionController,
  type TrainingAdmissionController,
  type TrainingAdmissionOutcome,
  type TrainingAdmissionPolicy,
  type TrainingRunLease,
} from './training-admission.js'

const policy: TrainingAdmissionPolicy = {
  maxActiveExecutions: 2,
  maxSuccessfulAdmissions: 5,
  windowMs: 60_000,
}

const expectAccepted = (outcome: TrainingAdmissionOutcome): TrainingRunLease => {
  expect(outcome.ok).toBe(true)
  if (!outcome.ok) throw new Error('expected an admitted training run')
  return outcome.lease
}

const expectRateLimited = (outcome: TrainingAdmissionOutcome): void => {
  expect(outcome).toEqual({ ok: false, reason: 'rate_limited' })
}

const expectConcurrencyLimited = (outcome: TrainingAdmissionOutcome): void => {
  expect(outcome).toEqual({ ok: false, reason: 'concurrency_limited' })
}

const createController = (now: () => number): TrainingAdmissionController =>
  createTrainingAdmissionController({ policy, now })

describe('W08 training admission controller', () => {
  it('admits five released leases within one sliding window', () => {
    let now = 1_000
    const controller = createController(() => now)

    for (let admission = 0; admission < 5; admission += 1) {
      const lease = expectAccepted(controller.tryAcquire())
      lease.release()
      now += 1
    }
  })

  it('rejects the sixth admission without creating a lease or consuming quota', () => {
    let now = 1_000
    const controller = createController(() => now)

    for (let admission = 0; admission < 5; admission += 1) {
      expectAccepted(controller.tryAcquire()).release()
      now += 1
    }

    expectRateLimited(controller.tryAcquire())

    now = 61_001
    expectAccepted(controller.tryAcquire()).release()
  })

  it('retains the exact window boundary and admits after the oldest timestamp expires', () => {
    let now = 1_000
    const controller = createController(() => now)

    for (let admission = 0; admission < 5; admission += 1) {
      expectAccepted(controller.tryAcquire()).release()
      now += 1
    }

    now = 61_000
    expectRateLimited(controller.tryAcquire())

    now = 61_001
    expectAccepted(controller.tryAcquire()).release()
  })

  it('uses injected server-side time and accepts no per-request policy override', () => {
    let now = 1_000
    const controller = createController(() => now)

    expect(controller.tryAcquire).toHaveLength(0)
    expectAccepted(controller.tryAcquire()).release()

    now = 61_001
    expectAccepted(controller.tryAcquire()).release()
  })

  it('admits two active leases and rejects the third for concurrency', () => {
    const controller = createController(() => 1_000)

    const firstLease = expectAccepted(controller.tryAcquire())
    const secondLease = expectAccepted(controller.tryAcquire())

    expectConcurrencyLimited(controller.tryAcquire())

    firstLease.release()
    secondLease.release()
  })

  it('does not consume rate quota for concurrency denials', () => {
    const controller = createController(() => 1_000)

    const firstLease = expectAccepted(controller.tryAcquire())
    const secondLease = expectAccepted(controller.tryAcquire())
    expectConcurrencyLimited(controller.tryAcquire())
    expectConcurrencyLimited(controller.tryAcquire())

    firstLease.release()
    const thirdLease = expectAccepted(controller.tryAcquire())
    secondLease.release()
    thirdLease.release()

    expectAccepted(controller.tryAcquire()).release()
    expectAccepted(controller.tryAcquire()).release()
    expectRateLimited(controller.tryAcquire())
  })

  it('releases each lease once without removing rate history or another lease capacity', () => {
    const controller = createController(() => 1_000)

    const firstLease = expectAccepted(controller.tryAcquire())
    const secondLease = expectAccepted(controller.tryAcquire())
    firstLease.release()
    firstLease.release()
    firstLease.release()

    const thirdLease = expectAccepted(controller.tryAcquire())
    firstLease.release()
    expectConcurrencyLimited(controller.tryAcquire())

    secondLease.release()
    const fourthLease = expectAccepted(controller.tryAcquire())
    fourthLease.release()
    thirdLease.release()
    expectAccepted(controller.tryAcquire()).release()
    expectRateLimited(controller.tryAcquire())
  })

  it('returns a closed denial without an executable lease', () => {
    const controller = createController(() => 1_000)

    expectAccepted(controller.tryAcquire())
    expectAccepted(controller.tryAcquire())
    const denied = controller.tryAcquire()

    expectConcurrencyLimited(denied)
    expect('lease' in denied).toBe(false)
    // Planner-start callback and provider/tool zero-call assertions require W08-008 composition integration.
  })

  it('exposes an internal bounded snapshot after admission decisions for security-event projection', () => {
    const controller = createController(() => 1_000) as TrainingAdmissionController & {
      securityEventSnapshot(): Readonly<{ activeExecutionCount: number; admissionsInWindow: number }>
    }

    expect(controller.securityEventSnapshot()).toEqual({ activeExecutionCount: 0, admissionsInWindow: 0 })
    const firstLease = expectAccepted(controller.tryAcquire())
    expect(controller.securityEventSnapshot()).toEqual({ activeExecutionCount: 1, admissionsInWindow: 1 })
    firstLease.release()
    expect(controller.securityEventSnapshot()).toEqual({ activeExecutionCount: 0, admissionsInWindow: 1 })
  })
})
