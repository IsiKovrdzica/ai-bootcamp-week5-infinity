export type TrainingAdmissionPolicy = Readonly<{
  maxActiveExecutions: 2
  maxSuccessfulAdmissions: 5
  windowMs: 60_000
}>

export type TrainingRunLease = Readonly<{
  release(): void
}>

export type TrainingAdmissionOutcome =
  | Readonly<{ ok: true; lease: TrainingRunLease }>
  | Readonly<{ ok: false; reason: 'rate_limited' | 'concurrency_limited' }>

export interface TrainingAdmissionController {
  tryAcquire(): TrainingAdmissionOutcome
}

type TrainingAdmissionControllerOptions = Readonly<{
  policy: TrainingAdmissionPolicy
  now(): number
}>

export const createTrainingAdmissionController = ({
  policy,
  now,
}: TrainingAdmissionControllerOptions): TrainingAdmissionController => {
  const maxActiveExecutions = policy.maxActiveExecutions
  const maxSuccessfulAdmissions = policy.maxSuccessfulAdmissions
  const windowMs = policy.windowMs
  let activeExecutionCount = 0
  let admissionTimestamps: readonly number[] = []

  return {
    tryAcquire(): TrainingAdmissionOutcome {
      const currentTime = now()
      const oldestAllowedTimestamp = currentTime - windowMs
      admissionTimestamps = admissionTimestamps.filter(timestamp => timestamp >= oldestAllowedTimestamp)

      if (admissionTimestamps.length >= maxSuccessfulAdmissions) {
        return { ok: false, reason: 'rate_limited' }
      }

      if (activeExecutionCount >= maxActiveExecutions) {
        return { ok: false, reason: 'concurrency_limited' }
      }

      activeExecutionCount += 1
      admissionTimestamps = [...admissionTimestamps, currentTime]

      let released = false
      const lease: TrainingRunLease = {
        release(): void {
          if (released) return
          released = true
          activeExecutionCount -= 1
        },
      }

      return { ok: true, lease }
    },
  }
}
