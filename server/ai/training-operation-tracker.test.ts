import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  createInFlightOperationTracker,
  type InFlightOperationTracker,
  type OperationKind,
} from './training-operation-tracker.js'

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}>

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

const expectPending = async (promise: Promise<void>): Promise<void> => {
  let settled = false
  void promise.then(() => {
    settled = true
  })
  await flushMicrotasks()
  expect(settled).toBe(false)
}

describe('W08 in-flight operation tracker lifecycle', () => {
  it('does not drain until registration closes, even with no operations', async () => {
    const tracker = createInFlightOperationTracker()

    await expectPending(tracker.drained)

    tracker.closeRegistration()
    await expect(tracker.drained).resolves.toBeUndefined()
  })

  it('drains only after closed registration and every provider/tool operation settles', async () => {
    const tracker = createInFlightOperationTracker()
    const provider = createDeferred<'provider settled'>()
    const tool = createDeferred<'tool settled'>()

    const trackedProvider = tracker.track('provider_attempt', provider.promise)
    const trackedTool = tracker.track('tool_execution', tool.promise)
    tracker.closeRegistration()

    provider.resolve('provider settled')
    await expect(trackedProvider).resolves.toBe('provider settled')
    await expectPending(tracker.drained)

    tool.resolve('tool settled')
    await expect(trackedTool).resolves.toBe('tool settled')
    await expect(tracker.drained).resolves.toBeUndefined()
  })

  it('observes a rejected underlying operation and then drains without an unhandled rejection', async () => {
    const tracker = createInFlightOperationTracker()
    const provider = createDeferred<void>()
    const trackedProvider = tracker.track('provider_attempt', provider.promise)
    const expectedRejection = expect(trackedProvider).rejects.toThrow('provider rejected')

    tracker.closeRegistration()
    provider.reject(new Error('provider rejected'))

    await expectedRejection
    await expect(tracker.drained).resolves.toBeUndefined()
  })

  it('synchronously rejects post-closure registration without reopening drain', async () => {
    const tracker = createInFlightOperationTracker()
    const unregisteredProvider = createDeferred<void>()

    tracker.closeRegistration()
    // track(kind, Promise) cannot prevent a caller from starting its Promise first.
    // Callers must register before starting underlying work; this closed tracker must
    // reject the supplied Promise without registering it or reopening drained.
    expect(() => tracker.track('provider_attempt', unregisteredProvider.promise)).toThrow()
    await expect(tracker.drained).resolves.toBeUndefined()
    await expect(tracker.drained).resolves.toBeUndefined()
  })

  it('keeps a timeout disposition terminal when the underlying operation later completes', async () => {
    const tracker = createInFlightOperationTracker()
    const provider = createDeferred<void>()
    const trackedProvider = tracker.track('provider_attempt', provider.promise)

    tracker.recordPublicDisposition('provider_attempt', 'timeout')
    tracker.closeRegistration()
    provider.resolve()

    await expect(trackedProvider).resolves.toBeUndefined()
    await expect(tracker.drained).resolves.toBeUndefined()
    // This is deliberately one tracked operation. W08-016/W08-017 review must
    // resolve that dispositions keyed only by kind cannot distinguish multiple
    // provider attempts of the same kind without an operation identifier.
    expect(() => tracker.recordPublicDisposition('provider_attempt', 'completed')).toThrow()
  })

  it('accepts only the approved provider and tool operation kinds', () => {
    expectTypeOf<Parameters<InFlightOperationTracker['track']>[0]>().toEqualTypeOf<OperationKind>()
    const kinds: readonly OperationKind[] = ['provider_attempt', 'tool_execution']
    expect(kinds).toEqual(['provider_attempt', 'tool_execution'])

    // @ts-expect-error Unknown operation kinds are excluded by the server-only API.
    const unknownKind: OperationKind = 'browser_operation'
    void unknownKind
  })
})
