export type OperationKind = 'provider_attempt' | 'tool_execution'

export type UnderlyingSettlement = 'fulfilled' | 'rejected'

export type PublicOperationDisposition = 'completed' | 'timeout' | 'cancelled'

export interface InFlightOperationTracker {
  track<T>(kind: OperationKind, operation: Promise<T>): Promise<T>
  recordPublicDisposition(kind: OperationKind, disposition: PublicOperationDisposition): void
  closeRegistration(): void
  readonly drained: Promise<void>
}

export const createInFlightOperationTracker = (): InFlightOperationTracker => {
  let registrationOpen = true
  let outstandingOperationCount = 0
  let resolveDrained!: () => void
  let drainedResolved = false
  const dispositions = new Map<OperationKind, PublicOperationDisposition>()
  const settlements: UnderlyingSettlement[] = []
  const drained = new Promise<void>(resolve => {
    resolveDrained = resolve
  })

  const resolveWhenDrained = (): void => {
    if (!registrationOpen && outstandingOperationCount === 0 && !drainedResolved) {
      drainedResolved = true
      resolveDrained()
    }
  }

  const settle = (settlement: UnderlyingSettlement): void => {
    settlements.push(settlement)
    outstandingOperationCount -= 1
    resolveWhenDrained()
  }

  return Object.freeze({
    track<T>(kind: OperationKind, operation: Promise<T>): Promise<T> {
      if (!registrationOpen) {
        throw new Error(`Cannot register ${kind}: operation tracking is closed`)
      }

      outstandingOperationCount += 1
      void operation.then(
        () => settle('fulfilled'),
        () => settle('rejected'),
      )
      return operation
    },

    recordPublicDisposition(kind: OperationKind, disposition: PublicOperationDisposition): void {
      const recordedDisposition = dispositions.get(kind)
      if (recordedDisposition === undefined) {
        dispositions.set(kind, disposition)
        return
      }
      if (recordedDisposition !== disposition) {
        throw new Error(`Cannot replace terminal ${kind} disposition`)
      }
    },

    closeRegistration(): void {
      registrationOpen = false
      resolveWhenDrained()
    },

    drained,
  })
}
