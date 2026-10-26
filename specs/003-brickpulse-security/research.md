# Research: W08 Security Decisions for BrickPulse

**Feature**: [Secure the Arcade](./spec.md)
**Plan**: [W08 architecture and execution limits](./plan.md)
**Status**: Research only — no implementation or test result is claimed.

## Evidence base

The reviewed backend path is `server/app.ts` → `TrainingPlannerService` in `server/composition.ts` → `TrainingAgentOrchestrator` → `AgentModelProvider` / fixed `TrainingToolRegistry` → validated public result. Review used source and existing fake/test seams only; no environment files, environment values, credentials, or live providers were accessed.

## D1 — Local admission control (M1)

| Item | Decision |
|---|---|
| Question | How can one local Node process admit at most two planner runs and only five successful admissions per sliding 60 seconds? |
| Existing implementation | W05 has per-run step/attempt/tool budgets but no process-wide admission state. `server/app.ts` validates a summary, then directly awaits `trainingPlanner.createTrainingPlan`. |
| Selected approach | Inject a server-only `TrainingAdmissionController` with monotonic `now()`, `tryAcquire()`, and an idempotent `TrainingRunLease.release()`. In one synchronous operation, prune timestamps `< now - 60_000`, reject if five retained timestamps or two active leases exist, otherwise increment active count and append exactly one timestamp. |
| Minimum interfaces | `TrainingAdmissionPolicy { maxActive: 2; maxAdmissions: 5; windowMs: 60_000 }`; `TrainingAdmissionController.tryAcquire(): AdmissionOutcome`; `TrainingRunLease.release(): void`; injected `now(): number`. The accepted outcome carries only an opaque lease; rejected outcomes carry closed `rate_limited` or `concurrency_limited` categories. |
| Alternatives | A browser button guard is not server enforcement. A database/distributed limiter is out of scope. Counting attempts before admission would violate the approved rule and permit concurrency rejections to consume quota. |
| Rationale | The project has no trusted identity/session/persistence scope; a process-global deterministic controller is the smallest bounded local control. |
| Risks/limits | It is not cross-process, restart-persistent, identity-aware, or a defense against all invalid HTTP traffic. Invalid/preflight-denied traffic remains a separate transport-abuse consideration. |
| Locations | New Mateja-owned admission module; `server/composition.ts` service wrapper; minimal planner branch mapping in shared `server/app.ts`. |
| Required tests | Five successful acquisitions at injected times within 60s; sixth rate rejection; concurrency rejection does not consume timestamp; invalid preflight does not enter controller; expiry permits a sixth accepted run; every admission denial has zero provider/tool calls. |
| Isidora approval | Required for `server/app.ts` HTTP contract review; not required for the controller’s isolated unit behavior. |

## D2 — Actual operation settlement and lease lifetime (M3)

| Item | Decision |
|---|---|
| Question | When may an admission lease be released if timeout/cancellation occurs? |
| Existing implementation | `TrainingAgentOrchestrator` creates a run `AbortController`, links an optional external signal, and gives each provider attempt a linked signal. It awaits `provider.generateStep` directly. `training-tool-registry.ts` uses `Promise.race([binding.execute(...), timed, aborted])`; a timeout/abort race can settle while the raw tool promise continues. |
| Existing signals | Orchestrator: external signal → run signal → per-attempt provider signal; registry: run signal → tool-local controller. `GeminiTrainingStepProvider` forwards the signal to its transport. `ScriptedAgentModelProvider` rejects deferred work on abort, so it does not model abort-ignoring work. |
| Selected approach | Introduce a per-run internal operation tracker. Provider and tool starts register their raw underlying promises before any timeout/abort race; their `finally` paths mark each operation settled independently of the public terminal result. The admission wrapper receives both `result` and `drained` completion for one invocation, projects the result when terminal, and releases the lease only after `drained` resolves. |
| Minimum interfaces | Internal `TrackedPlannerInvocation { result: Promise<TrainingPlannerServiceResult>; drained: Promise<void> }`; `InFlightOperationTracker.track(kind, promise): Promise<T>` plus `drained(): Promise<void>`. The tracker must be created synchronously with the admitted invocation, expose no raw values, and resolve `drained` only after all registered promises settle. |
| Alternatives | Releasing in `finally` around only the outer service promise is insufficient because the registry race can have a losing raw promise. Releasing on abort or response end is unsafe. Holding a lease forever whenever cancellation occurs is safe but unnecessarily blocks work that later proves settled. |
| Rationale | This is the smallest mechanism that distinguishes visible termination from real local promise settlement without claiming that abort terminates remote processing or billing. |
| Fail-closed behavior | If a tracked provider/tool ignores abort and never settles, `drained` never resolves and the lease stays occupied. This bounded availability loss is intentional; no replacement run is admitted into that capacity. `AbortController` remains a request signal, not proof of remote termination/billing cessation. |
| Locations | `server/ai/training-orchestrator.ts`, `training-tool-registry.ts`, possibly `training-provider.ts` internal options, and a composition-level tracked service wrapper. `server/app.ts` must not use HTTP response settlement as release. |
| Required tests | A deferred abort-ignoring tool loses a timeout race: outer result settles, active lease remains, later underlying resolution drains/release exactly once. Equivalent provider fixture verifies signal forwarding and fail-closed pending behavior. Late result never changes terminal success. |
| Isidora approval | Shared review for request-lifecycle signal plumbing and route effects; Mateja owns the deterministic backend tracker tests. |

## D3 — W05 agent/tool controls and malicious-provider fixtures (M2)

| Item | Decision |
|---|---|
| Question | Which W05 controls need new hardening versus regression evidence for T06–T11? |
| Existing implementation | `validateTrainingModelProposal` bounds raw proposal bytes and phases. `createTrainingToolRegistry` exposes one exact `analyze_game_performance` descriptor; lookup is equality, not property access. Argument validation requires only a matching `gameContextId`; the registry injects validated summary. Tool result validation recomputes exact bounded output. `TrainingActionGuard` fingerprints exact canonical arguments. Final validation resolves same-run evidence and closed focus/action rules. |
| Selected approach | Preserve those controls and add focused regression tests plus W08 event/admission integration. Do not add a prompt-based guardrail, dynamic registry, or new user-input field. |
| Existing controls needing regression only | T06 malformed/oversized model proposal/final; T07 unknown/inherited names; T08 extra/wrong-context args; T10 invalid/oversized result; T11 repeat and budget behavior. Their current source boundaries already implement the intended authority. |
| Genuine gaps | No aggregate admission control (T13); no W08 closed security-event taxonomy/sentinel-containment proof (T14); no abort-ignoring deferred fake or tracked-drain behavior (T12). W05’s current scripted fake honors abort and cannot prove this distinction. |
| Malicious fixtures | Scripted provider response proposing `constructor`, `toString`, or a forbidden name with otherwise plausible arguments; allowed name plus extra `instruction` or mismatched context; result with unknown/extra sentinel-bearing field; final with invalid evidence IDs. Fixtures are `unknown` values and synthetic strings only. |
| Prompt-injection-related scenario | The actual W05 model-visible goal is a fixed server constant, so there is no user-controlled text channel to inject. A scripted fake returns a policy-expanding proposal such as a forbidden tool request; the executable registry rejects it. This proves application execution policy despite malicious output, not that a live model cannot follow an injection. |
| Locations | `server/ai/training-validation.ts`, `training-tool-registry.ts`, `training-tool.ts`, `training-orchestrator.ts`, `training-fake-provider.ts`, and their focused tests/eval. |
| Required tests | Assert provider attempts separately from actual tool calls; rejected proposal/args have zero invocation; malformed result gives one invocation but zero later model step; normal fake path remains two decisions/one real tool. |
| Isidora approval | No for isolated Mateja tests; shared final review only. |

## D4 — Safe events, errors, and synthetic containment (M4)

| Item | Decision |
|---|---|
| Question | How should W08 record denials without creating a data/secret/log-injection sink? |
| Existing implementation | `training-usage-log.ts` projects a `TrainingEvent` allowlist: run ID, phase/status, counters, attempt kind/provider category, finite latency/token counts, known tool name, outcome, and stop reason. Public planner responses are closed 200/422/503 envelopes in `server/app.ts`; raw error catch paths map to safe unavailable output. |
| Selected approach | Add a W08 server-only security-event projector beside the existing usage sink. It receives application-generated correlation ID and closed enum values, not raw request/model/error text. Existing usage events remain compatible; security events supplement rather than replace them. |
| Closed event kinds | `planner.admitted`, `planner.admission_denied`, `planner.tool_denied`, `planner.result_rejected`, `planner.run_finished`. |
| Closed reason codes | `RATE_LIMITED`, `CONCURRENCY_LIMITED`, `TOOL_NOT_ALLOWED`, `TOOL_ARGUMENTS_INVALID`, `TOOL_RESULT_INVALID`, `MODEL_OUTPUT_INVALID`, `RUN_CANCELLED`, `RUN_DEADLINE_EXCEEDED`. |
| Allowed fields | Generated correlation ID, fixed event/reason/outcome, active count, admission-window count, step/provider/tool counters, finite elapsed milliseconds, and closed terminal status. No summary, prompt, raw provider response/error, supplied tool name, argument/result value, stack, token, key, or arbitrary text. |
| Correlation ID | Generate server-side per admitted request using the existing random-ID mechanism or an injected deterministic ID factory in tests. It is observability only, never an access token and never browser/model-selected. |
| Synthetic-secret proof | In isolated test configuration only, use `W08_SERVER_SECRET_DO_NOT_EXPOSE` as a fixture in an internal error or rejected extra field. Capture public result, model request snapshot, and security/usage event sink; assert each excludes it and newline log-injection text. No real configuration/key is loaded or inspected. |
| Risks/limits | A fixed-name known tool may be recorded because it is allowlisted; an attacker-controlled unknown name must map only to `TOOL_NOT_ALLOWED`. This proves containment for selected fixtures, not universal data-loss prevention. |
| Locations | Mateja-owned new projector/test and `training-usage-log.ts`/orchestrator injection seam; composition for correlation ID factory. Shared `server/app.ts` retains stable public envelopes. |
| Isidora approval | Needed only if a new public error/HTTP projection is proposed; not for private event schema/tests. |

## D5 — Shared integration boundaries

| Surface | Actual change candidate | Ownership and review |
|---|---|---|
| `server/app.ts` | After existing body/JSON/summary validation, map a closed admission denial to a safe 429 response; preserve `/api/ai/advice`, 400/422/503 behavior otherwise. | Shared: Mateja proposes narrow branch; Isidora reviews route contract and owns HTTP acceptance. Do not decide exact envelope here. |
| `server/composition.ts` | Construct/inject admission controller, tracker-aware planner wrapper, clock/ID seams, and closed service result. | Mateja-owned implementation, with shared review if public result union changes. |
| `TrainingPlannerServiceResult` and browser-safe types | Possible additive admission-denied result / 429 DTO. | Shared contract: requires Isidora approval before choosing exact shape or browser handling. |
| Existing W05 test helpers | Reuse `ScriptedAgentModelProvider`, registry overrides, injected clocks/timers/event sink, summary fixtures. Add abort-ignoring deferred fake only in Mateja-owned test support. | Mateja owns additions; preserve current test behavior. |
| Isidora-owned surfaces | `src/**` browser XSS/transport/CSP work, headers/production serving, HTTP input/access acceptance, game-integrity browser checks, CORS/CSRF and dependency review. | Untouched by this workstream without explicit approval. |

The current `createNodeHttpHandler` does not pass a request lifecycle `AbortSignal` into `AppHandler`; adding that is a shared, unresolved design detail. The existing app’s public route has no 429 result and the browser client has no rate-limit envelope validator. Neither the public 429 shape nor 400-versus-413 policy is resolved by this research.

## Implementation order and remaining risks

1. Obtain the additive W08 instruction authorization described in the approved spec/plan.
2. Write focused RED tests for isolated admission semantics and tracker drain before changing runtime code.
3. Implement admission/tracker seams with fake-only tests, then regression-test existing W05 policy controls.
4. Add private safe-event containment tests; coordinate public mapping/browser acceptance with Isidora.

Risks remaining for pair decision: fail-closed leases can reduce availability if an adapter never settles; 429/public DTO and request-abort design touch shared seams; and browser/CSP/header proof is blocked in the present sandbox because it cannot bind loopback TCP. These are documented limits, not passing evidence.
