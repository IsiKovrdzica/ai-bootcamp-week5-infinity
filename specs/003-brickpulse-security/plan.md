# Technical Architecture Plan: BrickPulse Secure the Arcade

**Branch**: `008-secure-the-arcade`
**Date**: 2026-10-26
**Spec**: [spec.md](./spec.md)
**Gate**: PLAN → human pair review → TASKS. This plan authorizes no implementation, test creation, dependency installation, credential access, live call, commit, or push.

## Scope and consistency

This plan hardens only the existing W05 Training Planner. It preserves W03 game ownership, the unchanged W04 `/api/ai/advice` flow, one W05 planner endpoint, the backend-owned provider boundary, and the meaningful normal sequence: two model steps with one actual `analyze_game_performance` execution between them.

The supplied W08 assignment requires aggregate resource bounds and security proof; it does not require a second provider, new tool, authentication, persistence, database, rich text, or a browser-owned agent. Routine evidence remains deterministic, fake-first, network-free, and uses only explicitly synthetic fixtures.

## Existing architecture and controls to preserve

```text
Browser TrainingController
  -> POST /api/ai/training-plan (GameSummary only)
  -> server/app.ts: 16 KiB body ceiling, JSON and GameSummary validation
  -> TrainingPlannerService / TrainingAgentOrchestrator
       -> AgentModelProvider (scripted fake or backend Gemini adapter)
       -> fixed TrainingToolRegistry
       -> analyze_game_performance(validated summary, injected context)
       -> exact result/final validation and safe public projection
  -> browser runtime response validation and textContent rendering
```

Already implemented controls require regression evidence, not replacement:

- `server/app.ts` stops oversized/malformed/invalid summaries before service invocation.
- `server/ai/training-validation.ts` performs exact initial, proposal, final, and public-envelope validation.
- `server/ai/training-tool-registry.ts` has one exact, case-sensitive frozen tool binding; it validates exact matching context arguments before invocation.
- `server/ai/training-tool.ts` is deterministic/read-only and recomputes its bounded 2 KiB result from the authorized summary.
- `server/ai/training-orchestrator.ts` owns phase routing, repeat prevention, 3-step/6-attempt/2-tool ceilings, abort signals, attempt timeout, and total deadline.
- `server/ai/training-usage-log.ts` projects an allowlisted event shape; the browser’s existing planner/coach renderers use `textContent`.

## W08 bounded policy

The following server-owned constants are proposed for a single local Node process. They are fixed application policy, never request/model fields.

| Boundary | Proposed limit | Existing / decision |
|---|---:|---|
| Request body | 16 KiB UTF-8 | Preserve current `MAX_REQUEST_BODY_BYTES`; no W08 expansion. |
| Successfully admitted planner runs | 5 per 60 seconds | New process-global sliding-window limit; count only an accepted lease acquisition. |
| Active planner executions | 2 | New process-global semaphore capacity. |
| Agent steps | 3 per run | Preserve W05. |
| Provider attempts | 2 per step; 6 per run | Preserve W05; retry/fallback consume the same ceiling. |
| Tool calls | 2 per run | Preserve W05 defense-in-depth ceiling; normal flow remains one. |
| Provider attempt deadline | 15 seconds, capped by remaining run time | Preserve W05. |
| Total run deadline | 30 seconds | Preserve W05. |
| Tool deadline | 100 ms, capped by remaining run time | Preserve W05. |
| Model proposal/final raw JSON | 8 KiB | Preserve W05 `maxModelProposalBytes`; validation applies before semantic use. |
| Tool result | 2 KiB UTF-8 | Preserve W05 exact validated result limit. |
| Public plan | 2 KiB serialized; bounded fields/evidence | Preserve W05 public projection bounds. |
| Retry delay | 250 ms only if remaining run time permits | Preserve W05. |

The rate limit is deliberately global because the verified architecture has no trusted user/session/resource scope. It is a local demonstration control, not a distributed or identity-based rate limit. In one Node process, pruning the 60-second window, checking both quotas, acquiring a lease, and appending its timestamp are one synchronous/atomic admission decision: only a successfully admitted run consumes one rate timestamp. Invalid HTTP preflight, rate-rejected, and concurrency-rejected requests consume neither rate quota nor active capacity and call neither provider nor tool. Invalid/denied HTTP traffic is therefore not bounded by this planner-admission limit; transport-abuse controls remain a separate, explicitly documented consideration.

## Minimal architecture additions

### M1 — Admission, rate limiting, and concurrency

Add a small backend-only admission component adjacent to planner composition (for example `server/ai/training-admission.ts`), injected through `server/composition.ts`. It owns a monotonic injected clock, a FIFO-safe record of admitted timestamps, active-count/lease state, and a closed outcome:

```ts
type TrainingAdmissionOutcome =
  | { readonly ok: true; readonly lease: TrainingRunLease }
  | { readonly ok: false; readonly reason: 'rate_limited' | 'concurrency_limited' }

type TrainingRunLease = { readonly release: () => void }
```

`release()` is idempotent. It is created only after preflight validation and admission success, in the same atomic decision that records the rate timestamp. It does not expose counters, provider details, or mutable policy to browser/model input.

Wrap `TrainingPlannerService.createTrainingPlan()` in composition. The wrapper acquires a lease, invokes the existing service exactly once, and maps admission failure into an explicit internal service result without constructing an orchestrator/run or calling provider/tool. It must not equate settlement of an outer `createTrainingPlan()` or timeout-race promise with completion of every provider/tool operation that it started.

The smallest `server/app.ts` integration is after body/JSON/`GameSummary` validation and before calling the planner service: map the new closed admission result to a safe 429 envelope. The existing advice route is untouched. The browser already treats unexpected safe failures as a generic planner failure; any public union/transport exact-shape extension is a shared API contract requiring Isidora review.

### M2 — Agent/tool authorization and malicious-provider defense

Do not add a generic executor or new tool. Preserve the existing fixed registry and enforce its boundary before `invoke`:

1. proposal is exact and valid for the current phase;
2. descriptor name is exact allowlisted `analyze_game_performance` (including rejecting `constructor`/`toString`);
3. arguments contain only matching current-run `gameContextId`;
4. tool budget, run state, remaining deadline, and repetition fingerprint permit work;
5. registry injects the validated `GameSummary`, not model-supplied game facts;
6. output is unknown until the bounded exact recomputation validator creates a normalized copy;
7. only normalized evidence reaches final validation/model context; only validated public plan reaches the browser.

The fixed W05 goal leaves no actual free-text user-goal channel. The W08 injection proof therefore uses a malicious scripted provider response and records that it proves execution policy—not immunity of a live model. If a real untrusted model-visible text channel is discovered before implementation, its validation/data labeling becomes a new plan decision rather than an assumed feature.

### M3 — Budgets, retries, deadlines, and cancellation

Keep `TrainingAgentOrchestrator` as the sole owner of step/attempt/tool counters and terminal routing. An admission wrapper must not reset counters, rerun an orchestrator, retry an HTTP request, or treat fallback as a new run. Existing retry taxonomy remains: at most one same-primary retry for transient/408/429 or one fixed fallback for eligible unavailable conditions; never both.

Pass a linked cancellation signal from Node request lifecycle through the planner wrapper to the orchestrator, then to provider/tool. A deadline/cancellation stops accepting results and triggers abort, but neither `AbortController` nor settlement of a `Promise.race` proves remote provider processing or billing has stopped. The implementation must explicitly track every admitted provider/tool operation that can outlive an outer timeout race, and release the lease only after all tracked operations settle. If actual completion cannot be proven for an abort-ignoring adapter/tool, the lease remains occupied under a documented fail-closed policy; it is never released merely because an outer timeout response was projected. Focused deterministic tests use deferred abort-ignoring fakes to prove that the outer result can settle while the lease remains held, then prove one-time release only after actual underlying settlement.

The deterministic local performance tool has no I/O and is bounded by its existing 100 ms signal/timeout. Provider adapters perform one transport attempt per `generateStep`; any SDK retry remains disabled/one attempt as in W05. No timeout path may turn into success after terminal state.

### M4 — Safe security events, errors, and synthetic containment

Extend the existing injected event-sink boundary with a small W08-safe event projection or adjacent event wrapper. It may record only a generated correlation ID, closed event kind, closed reason category, active/admitted counters, run counters, and finite elapsed duration. It must never copy raw request/body, summary, tool name supplied by an attacker, tool arguments/result values, prompt, model response, stack, provider diagnostic, or arbitrary error text.

Use only `W08_SERVER_SECRET_DO_NOT_EXPOSE` inside isolated server-side test configuration. It may be intentionally placed in a synthetic internal error or rejected extra tool field, but must be absent from public envelopes, model request snapshots, event captures, frontend bundles/source maps, and submitted evidence. No implementation/test reads real configuration or environment-secret values.

## Enforcement points and contracts

| Boundary | Owner / location | Required enforcement |
|---|---|---|
| Transport body | `server/app.ts` Node handler | Keep byte counting before full body buffering/parsing; invalid/oversized exits before planner admission. |
| JSON and game semantics | `server/app.ts`, `server/ai/validation.ts` | Exact `GameSummary`; extra privilege/model/budget fields cannot alter policy. |
| Admission | new injected admission component + `server/composition.ts` wrapper | One synchronous local decision: preflight-valid request only; prune timestamps, reject rate/concurrency without recording, or atomically acquire lease and record timestamp. |
| HTTP projection | `server/app.ts` | Preserve 400/422/503 and advice behavior; add only safe closed 429 mapping for admission rejection after pair contract review. |
| Run state | `training-orchestrator.ts` | Existing immutable terminal state/counters/deadlines; accept no policy from browser/model. |
| Provider | `training-provider.ts`, fake/Gemini adapters | One attempt per call; signal forwarding; unknown output; no raw diagnostics outward. |
| Tool | registry/tool/validation modules | Fixed descriptor, exact args and injected scope, 100ms/max-2KiB normalized result, no game mutation. |
| Events | usage-log/orchestrator injection seam | Closed metadata projection, no untrusted/free-form values or sentinel. |
| Browser/public DTO | existing training API client and Isidora-owned browser work | Runtime exact-shape validation and text-only rendering remain; CSP/header changes are reserved. |

## Concurrency lifecycle

```text
validated request
  -> prune rate-window timestamps
  -> reject 429 if five successful admissions are already recorded in window (record nothing)
  -> reject 429 if two leases are active (record nothing)
  -> atomically acquire lease + append one admission timestamp
  -> invoke one existing planner service promise
       -> terminal result / abort / timeout starts shutdown
       -> outer response may settle before losing provider/tool work
       -> explicitly tracked underlying provider/tool work settles, or lease remains fail-closed
  -> release lease exactly once only after tracked work settles
  -> a later valid request may acquire capacity
```

An HTTP response may be projected once the terminal outcome is known, but it is not a lease-release condition. Cancellation/timeout marks the run terminal and aborts supported work; the lease persists until explicitly tracked admitted work actually settles. This prevents an ignored-abort provider/tool from freeing capacity early. If the implementation cannot prove real completion, it fails closed by retaining the lease; it does not claim that `AbortController` terminates remote processing or billing. The bounded cost is intentional availability degradation, surfaced only through safe rejection/error categories.

## Verification design

| Coverage | Deterministic proof | Expected observable facts |
|---|---|---|
| T00 (Mateja portion) | Scripted fake normal run and counting registry | 2 steps, 2 provider attempts, 1 actual read-only tool call, validated plan; no game mutation seam invoked. |
| T06 | Invalid/oversized proposal/final fixtures | No successful plan or later unsafe continuation; counters remain exact. |
| T07 | `unknown_tool`, `constructor`, `toString` proposals | One provider proposal at most; zero tool invocation/side effect. |
| T08 | Extra/wrong/mismatched context args plus matching positive case | Invalid case zero invocation; valid exact case invokes once. |
| T09 | Malicious scripted proposal after documented fixed-goal channel | Production registry rejects it independent of prompt/model text; record limitation. |
| T10 | Malformed/oversized/sentinel-bearing tool result | One attempted tool where applicable; zero normalized result/later model call/sentinel propagation. |
| T11 | Repeated fingerprint and exhausted counters | No additional provider/tool call; retry/fallback count toward same run. |
| T12 | Fake clock plus deferred abort-ignoring provider/tool | Outer timeout/cancellation result cannot complete late; lease remains held while losing work runs and releases once only after actual deferred settlement. |
| T13 | Admission fake clock: five accepted runs in 60s, sixth, concurrency rejection, expiry recovery | Exactly five successful acquisitions consume timestamps; sixth rate rejection and capacity rejection consume none and make zero provider/tool calls; post-window legitimate admission succeeds. |
| T14 | Synthetic sentinel/newline fixtures captured by fake provider/event sink/public service | Sentinel/untrusted text absent from allowed outputs; only closed safe event data remains. |
| T17 (Mateja) | Capacity 1 fixture: A admitted, reaches deferred abort-ignoring fake then forbidden proposal; B attempted while A lease held; A’s tracked work settles; C normal | A’s forbidden tool has zero execution; B has zero provider/tool calls and safe admission event; outer settlement does not free A early; exactly one later release; C succeeds. |

Tests inject clock, timer, provider, event sink, and admission component. They do not use network, real sleeps, provider SDK transport, or a real credential. Existing W05 test suites are retained as regression evidence; Isidora independently owns HTTP/browser/CSP/game-integrity acceptance and final shared review.

## Mateja–Isidora boundaries

Mateja’s independently executable changes are the backend admission wrapper/policy, orchestration/registry regression and security tests, safe event containment, and service-level contracts needed to express admission denial. Isidora retains direct HTTP input/access tests, public HTTP header/status/browser transport acceptance, XSS and CSP/header implementation, browser game-integrity checks, CORS/CSRF applicability, dependency review, and final shared/browser acceptance.

`server/app.ts` and public response types are shared seams: the plan limits Mateja’s later change to one additive planner admission mapping; Isidora reviews route-level behavior and owns browser/API acceptance. Neither workstream changes `/api/ai/advice`.

## Instruction reconciliation and unresolved decisions

`AGENTS.md` and the routed `.github` modules currently authorize only W03–W05. Before implementation, apply only an additive W08 authority statement covering this existing planner’s admission control, security-event projection, fake-first W08 tests, and factual evidence. Retain prohibitions on real secrets/live routine calls, arbitrary tools, writes, new providers, dependencies, and unbounded/browser-owned agents. Add explicit Mateja/Isidora shared-seam review ownership; do not mark Isidora review complete here.

Planning decisions resolved here are local capacity `2`, validated-admission limit `5/60s`, and existing W05 bounds. The following remain intentionally open until pair/API review:

- exact closed public 429 envelope/code and whether current generic frontend failure handling requires an explicit DTO extension;
- whether oversized body status stays historical 400 or becomes assignment-aligned 413, which is Isidora’s route-contract decision;
- Node request-abort wiring details and whether the existing handler can expose a lifecycle signal without affecting W04;
- exact file names and test ownership after pair review;
- browser/CSP/header verification in an environment that can bind local TCP (the current sandbox cannot).

## Planned implementation footprint

Likely Mateja-owned additions are one admission module and focused tests, with minimal composition/orchestrator/usage-event updates justified by test-first work. Potential `server/app.ts` and public contract changes are shared and require Isidora approval. No instruction files, browser files, environment files, W03–W05 historical documents, or live verification scripts change in this plan task.
