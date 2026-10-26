# Admission and Underlying-Operation Contract

**Scope**: Mateja-owned, server-only internal contracts for the existing W05 Training Planner. These are proposed implementation contracts, not public HTTP DTOs.

## Admission controller

```ts
type TrainingAdmissionPolicy = Readonly<{
  maxActiveExecutions: 2
  maxSuccessfulAdmissions: 5
  windowMs: 60_000
}>

type TrainingRunLease = Readonly<{
  release(): void
}>

type TrainingAdmissionOutcome =
  | Readonly<{ ok: true; lease: TrainingRunLease }>
  | Readonly<{ ok: false; reason: 'rate_limited' | 'concurrency_limited' }>

interface TrainingAdmissionController {
  tryAcquire(): TrainingAdmissionOutcome
}
```

The controller is constructed with fixed application policy and injected monotonic `now(): number`. It is process-global for one local Node process; it accepts no browser/model policy, user ID, provider, budget, or clock value.

### Atomic admission rules

For every `tryAcquire()` call, synchronously and without an `await`:

1. prune timestamps older than `now() - 60_000`;
2. if five successful admissions remain, return `{ ok: false, reason: 'rate_limited' }` without changing timestamps or active count;
3. otherwise, if two leases are active, return `{ ok: false, reason: 'concurrency_limited' }` without changing timestamps or active count;
4. otherwise, increment active count, append one timestamp, and return a new lease.

Only step 4 consumes rate quota. Invalid HTTP preflight never calls the controller. Rate- and concurrency-rejected attempts consume neither capacity nor quota and must produce zero provider/tool calls. `release()` is idempotent: first call decrements its own active lease exactly once; later calls do nothing and never delete timestamps.

### Preconditions, postconditions, and examples

| Case | Preconditions | Required result |
|---|---|---|
| Positive admission | `<5` retained timestamps and `<2` active leases | One timestamp/lease added; one existing planner invocation may begin. |
| Rate rejection | `5` retained successful admissions | `rate_limited`; no state change, provider, or tool. |
| Concurrency rejection | `<5` retained admissions and `2` active leases | `concurrency_limited`; no state change, provider, or tool. |
| Release | An unreleased lease exists | Exactly one active slot becomes available; rate timestamp remains until expiry. |
| Window recovery | Old timestamp ages past window | It is pruned; a later eligible request may acquire. |

Deterministic tests inject time and assert five accepted acquisitions, sixth rate rejection, a separate capacity rejection that does not consume quota, expiry recovery, and idempotent release.

## Underlying-operation tracker

```ts
type OperationKind = 'provider_attempt' | 'tool_execution'
type UnderlyingSettlement = 'fulfilled' | 'rejected'
type PublicOperationDisposition = 'completed' | 'timeout' | 'cancelled'

interface InFlightOperationTracker {
  track<T>(kind: OperationKind, operation: Promise<T>): Promise<T>
  recordPublicDisposition(kind: OperationKind, disposition: PublicOperationDisposition): void
  closeRegistration(): void
  readonly drained: Promise<void>
}

type TrackedPlannerInvocation = Readonly<{
  result: Promise<TrainingPlannerServiceResult>
  drained: Promise<void>
}>
```

`track` may register an actual provider/tool promise only while registration is open, and registration occurs before underlying work begins or before any timeout/abort `Promise.race` can settle. After `closeRegistration()`, every new registration attempt is rejected and can never reopen the tracker; callers must not start untracked work after that point. `track` records only the closed underlying settlement (`fulfilled` or `rejected`) and any closed public disposition (`completed`, `timeout`, or `cancelled`), never a raw value/error. Cleanup observes both fulfillment and rejection with attached handlers; it must not create detached `finally` chains that produce additional unhandled rejections. The original operation result is still delivered to its caller.

### Lifecycle invariants

1. Registration opens before the admitted planner can start provider/tool work.
2. Every started provider attempt and actual tool promise is registered exactly once before being raced or awaited.
3. `closeRegistration()` occurs only after the planner reaches its immutable terminal path and can start no further operation; it permanently rejects all later registration.
4. `drained` resolves only when registration is closed and every successfully registered underlying promise has settled (fulfilled or rejected).
5. The admission lease releases only after `drained`; outer `result`, HTTP response completion, abort, and timeout are not release conditions.
6. A late fulfillment/rejection after terminal state is observed only for draining; it can never change the terminal outcome, create success, or start another step/tool.
7. If a registered abort-ignoring operation never settles, `drained` never resolves and capacity remains occupied fail-closed. Local promise settlement does not claim remote provider cancellation, processing cessation, or billing cessation.

### Existing lifecycle implication

`server/ai/training-tool-registry.ts` currently races raw `binding.execute(...)` against timeout/abort promises. Its losing raw operation can continue after the outer invoke result settles. Provider attempts receive a linked signal in `training-orchestrator.ts` and are awaited directly; an abort-ignoring provider may keep the outer run pending. Both forms must register the raw operation before outer control flow can make a terminal/public decision.

### Deterministic test cases

| Case | Expected result |
|---|---|
| Deferred abort-ignoring tool loses timeout race | Public run becomes safe failure; lease remains active; no late success; resolving raw tool later drains and releases once. |
| Deferred abort-ignoring provider observes signal but stays pending | Cancellation/deadline is terminal; no replacement capacity; actual settlement later drains/release once. |
| Rejected raw operation | Tracker drains after rejection without unhandled rejection; safe terminal result remains unchanged. |
| Normal two-step W05 fake path | Registration closes/drains after normal work; lease releases; counters remain 2 steps/1 actual tool. |
| Registration after closure | New `track` attempt is rejected; no operation starts or reopens the tracker; `drained` remains governed only by earlier registered work. |

## Service integration boundary

The existing `TrainingPlannerService.createTrainingPlan(input)` returns only a public-result promise. W08 needs an internal, tracker-aware invocation factory that creates `TrackedPlannerInvocation` synchronously with lease acquisition. It may wrap the existing public service but must not expose `drained`, raw operation state, or admission policy to browser code.

`server/composition.ts` is Mateja-owned for the internal wrapper. `server/app.ts` may await `result` and map a closed admission-denied outcome, but it must never release a lease. Exact public 429 envelope and request-abort wiring remain shared decisions requiring Isidora review.

## Traceability

| Contract behavior | Positive proof | Negative proof |
|---|---|---|
| Admission | T13 fifth accepted run and post-window recovery | T13 sixth/rate and capacity rejection: zero provider/tool calls. |
| Lease/drain | T00 normal fake run releases after drain | T12 abort-ignoring deferred work retains lease and rejects late success. |
| Two-request chain | T17 A admitted and C later succeeds | T17 B denied while A lease held; B has zero provider/tool calls. |
