# BrickPulse Week 8 — Secure the Arcade

## Individual Security Evidence: Mateja

**Project:** SITA AI Bootcamp 2026 — BrickPulse
**Branch:** `008-secure-the-arcade`
**Implementation checkpoint:** `2a3d5789a643ba4c29f10a633aa1f039d52a304a`

## 1. Overview and responsibilities

Week 8 hardens the existing Week 5 Training Planner without changing the game, adding a provider, adding a tool, or moving security policy into the browser. My responsibilities covered the backend security workstream: M1 admission control, M2 model/tool policy, M3 execution lifecycle and budgets, and M4 safe events and containment.

The planner remains a bounded server-owned flow. A normal successful run makes two model decisions around one fixed, read-only `analyze_game_performance` tool. Browser input is untrusted; provider output is treated as unknown until validated; the browser cannot select a provider, tool, budget, admission policy, or security configuration.

Isidora owns W08-027–032: HTTP input boundaries, browser rendering, game-state non-escalation, headers/CSP, and CORS/CSRF/dependency review. W08-033–040 are shared. The approved public 429 response remains a contract decision only; its HTTP implementation belongs to shared W08-033. This is individual backend evidence, not final shared acceptance.

Test results below were recorded during their corresponding implementation and verification checkpoints. No additional application tests or live-provider calls were performed solely for preparation of this report.

## 2. Threat model and security design

The main risks were aggregate resource exhaustion, unsafe model-directed tool execution, malformed model or tool data, timeout/late-settlement confusion, unsafe event/error projection, and leakage through synthetic containment fixtures. The design keeps each decision at the narrowest owning boundary.

| Security concern | Design response |
| --- | --- |
| Parallel planner work can multiply cost. | Process-local admission controls rate and active leases before planner work starts. |
| An outer timeout can settle before raw provider/tool work. | An in-flight tracker separates public terminalization from underlying-work drain. |
| Model output can request arbitrary behavior. | A fixed exact tool allowlist, validated arguments, injected context, and bounded validators own execution authority. |
| Diagnostics can expose untrusted data. | Closed server-only security events use reason codes and bounded numeric metadata only. |

The preserved W05 limits are three logical steps, two provider attempts per step, six provider attempts per run, two actual tool executions, a 15-second-or-remaining provider cap, a 30-second run deadline, and a 100-millisecond-or-remaining tool cap. Existing data-size boundaries include a 16 KiB HTTP request body, 8 KiB model proposal/final JSON, and 2 KiB tool-result/public-plan limits. These controls are server-owned and are not configurable by the browser or model.

The admission policy is intentionally process-local rather than distributed. This fits the existing single-process application without introducing unapproved persistence or infrastructure.

### Scope control and implementation sequencing

The W08 SpecKit work defined the threat model, invariants I1–I8, scenarios T00–T17, ownership, contracts, and the credential-free verification workflow before implementation began. This planning was important because the assignment authorized hardening of the existing planner only; it did not authorize a new endpoint, provider, tool, browser-owned policy, or gameplay feature.

Admission composition was deliberately delayed after the isolated controller. The initial review found that an outer `Promise.race` could settle before raw work drained, so releasing a lease at outer settlement would be unsafe. The approved order became admission controller → operation tracker → provider/tool registration → admission composition. This dependency correction kept capacity release tied to a trustworthy drain signal.

The shared W08-009 review approved a common public HTTP 429 response for both internal admission-denial reasons: code `TRAINING_PLAN_ADMISSION_DENIED`, message `Training plan is temporarily unavailable. Please try again later.`, and no `Retry-After` header or exposure of internal rate/concurrency details. It did not implement that HTTP mapping; preserving this distinction avoids treating an approved design as completed route behavior.

## 3. Implementation and security controls

### Rate limiting and concurrency admission

I added a shared production admission controller with two active execution leases and five successful admissions per rolling 60 seconds. Admission is synchronous and atomic: timestamps are pruned at the exact window boundary, rate is checked before concurrency, and rejected attempts consume neither quota nor capacity. Each lease releases idempotently.

The controller is shared across production planner service instances. Composition acquires a lease before planner work and returns admission denials without provider or tool work. This zero-work behavior is proven at the composition boundary rather than attributed to the isolated controller.

The initial admission tests were collection-level RED tests because the new module did not yet exist. After implementation, the admission suite passed 8/8; the W05 acceptance suite passed 34/34; and the full suite passed 431/431 across 36 files.

### Raw-operation tracking and lease lifecycle

The critical lifecycle issue was that an outer `Promise.race` could settle while a raw provider or tool promise was still pending. Releasing capacity then would permit more work even though the underlying operation had not drained.

I introduced an in-flight tracker. `tracker.start(kind, factory)` registers raw provider/tool work before timeout or abort racing begins. Registration closes permanently when the orchestrator reaches its terminal path; the tracker drains only after closure and settlement of every registered operation, whether fulfilled or rejected. Lease release occurs only after this drain. Cleanup is idempotent, and late completion is drain-only: it cannot revive a terminal run.

An assertion-level RED exposed both missing tool registration and direct awaiting of an abort-ignoring provider. The GREEN integration fixed these paths. Abort-ignoring or never-settling work can retain capacity fail-closed; local abort does not claim to stop remote provider processing or billing.

### Model/tool validation and prompt-injection boundaries

The only executable tool remains the exact, case-sensitive `analyze_game_performance` allowlist entry. The registry rejects unknown and inherited names, validates context-bound arguments, and injects the already validated game summary. The model cannot supply game facts, select another tool, or expand policy.

Model decisions, tool results, repetition, sizes, shapes, and final plans are validated before later work or public projection. W08-011 confirmed that the existing allowlist and argument controls already passed: registry 7/7 and orchestrator 59/59. No artificial RED failure is claimed for that task.

W08-012 exposed a real cyclic-serialization failure when unknown provider output reached JSON-size validation. I added the narrow `bytesOk()` defensive fix, which safely rejects unserializable output. Unauthorized proposals cannot trigger forbidden tool execution; malformed or oversized model/tool data cannot continue into unsafe work.

### Execution budgets, cancellation, and deadlines

The planner retains the bounded W05 budget model described above. Repetition and aggregate counters are shared across retries/fallbacks instead of resetting per step or operation. Late results cannot start new work or change a terminal result.

W08-019 added three late-settlement and cancellation cases; they passed immediately. W08-020 reviewed the existing aggregate-budget behavior and found no production defect. Security work should add a control only where evidence shows a gap.

### Security events and safe data projection

I added a closed, server-only `planner.*` event projector. It accepts only the event matrix's known kind/outcome/reason combinations, server-generated correlation IDs, finite bounded numerical metadata, and exact keys. Unknown/raw fields are rejected. Safe reason codes replace arbitrary provider, tool, request, or stack text.

The permitted event kinds are `planner.admitted`, `planner.admission_denied`, `planner.tool_denied`, `planner.result_rejected`, and `planner.run_finished`. Their outcome, reason code, and terminal status must form an approved combination. Numeric fields are finite, non-negative integers bounded by the configured maxima: 2 active executions, 5 admissions per window, 3 steps, 6 provider attempts, 2 tool calls, and 30,000 elapsed milliseconds. The projector is distinct from W05 usage events. Observer/sink failures cannot alter planner routing, while trusted factory errors are not silently swallowed. Additional hostile-Proxy regression cases for prototype inspection, own-key enumeration, and property access passed against the existing fail-closed implementation; they confirm robustness and do not represent a newly demonstrated production defect.

## 4. Testing and RED/GREEN development evidence

| Workstream | RED or design signal | GREEN / observed result |
| --- | --- | --- |
| W08-005/006 → 007 admission | Collection-level RED: admission module missing; no assertions ran. | Admission 8/8, W05 34/34, full suite 431/431; typecheck/build passed. |
| W08-015 → 016 tracker | Collection-level RED: tracker module missing; no assertions ran. | Tracker 6/6, admission 8/8, W05 34/34, full suite 437/437; typecheck/build passed. |
| W08-017 → 018 raw-operation integration | Assertion-level RED: raw tool work was not tracked and an abort-ignoring provider left the public run unsettled. | Tool registry 6/6, orchestrator 53/53, tracker 6/6, admission 8/8, W05 34/34, full suite 439/439; typecheck/build passed. |
| W08-008 composition | Initially blocked until the tracker supplied a trustworthy drain signal. Later RED: third concurrent invocation executed instead of being denied. | After cleanup, drain, and shared-budget review: composition 13/13 and full suite 447/447; typecheck/build passed. |
| W08-011 policy regression | Existing control behavior passed immediately. | Registry 7/7 and orchestrator 59/59. |
| W08-012 → 014 serialization | Assertion-level RED: cyclic provider output caused a circular-JSON serialization error. | After `bytesOk()` fix: validation 13/13, tool 7/7, registry 8/8, orchestrator 64/64, W05 34/34, full suite 462/462; typecheck/build passed. |
| W08-019/020 lifecycle and budgets | Three late-settlement cases passed immediately; budget review found no production defect. | Full suite 465/465; applicable focused checks and typecheck/build passed. |
| W08-021 T17 | A capacity-one test fixture initially had a TypeScript policy-type blocker; no unsafe cast was used. | Narrow `1 | 2` test injection preserved production capacity two; composition 14/14 and full suite 466/466; typecheck/build passed. |
| W08-022 → 023 events | Collection-level RED: security-event projector module missing; no event assertion ran. | Original projector 48/48 and full suite 514/514; later hostile-Proxy regressions passed for projector 51/51 and full suite 517/517. |
| W08-024 integration | Integration RED: 87 passing / 9 failing. | 525/525 passed; typecheck/build passed. |
| W08-025 containment | First focused run was 138/140 due to two test-design errors. Test-only corrections followed; no production change. | Focused 140/140 and full suite 532/532. Build was not run during this task. |
| W08-026 W05 metrics | Regression verification found no compatibility defect. | Full suite 533/533; W05 metrics remained unchanged. |

Collection-level REDs demonstrate test-first module introduction, not failed assertions. Immediate-GREEN regressions and test-design corrections are recorded as such rather than being presented as production defects.

## 5. Key acceptance scenarios

### T06–T11: model/tool validation and execution limits

The fixed allowlist, exact argument validation, injected context, bounded result validation, repetition guard, and aggregate budgets protect the planner from provider-directed capability expansion. The cyclic-output RED verified that untrusted `unknown` data also needs defensive serialization handling. The fix leaves the normal flow unchanged while safely rejecting unserializable data.

### T12–T13: deadlines, cancellation, and admission

Raw provider/tool promises register before racing. Terminal public results, registration closure, and raw-operation drain are separate lifecycle stages. Admission capacity remains held until drain, so a late or never-settling operation cannot create unsafe excess concurrency. Denied requests perform zero provider/tool work at composition.

### T14: synthetic containment

Containment tests use synthetic server-side fixtures only. They verify that rejected malicious proposals cannot trigger unauthorized follow-up provider work; invalid tool results do not reach the final model step; and hostile content is excluded from captured safe-result, security-event, and relevant W05 usage-event projections. The tests do not claim that arbitrary untrusted data can never occur in an authorized initial provider request.

The first focused T14 run reached 138/140 because of two test-design errors: a hostile tool name exceeded earlier model-proposal validation (correctly producing `MODEL_OUTPUT_INVALID`, not the test's expected `TOOL_NOT_ALLOWED`), and a projector assertion attempted to serialize `undefined`. The tests were corrected to target the intended boundary and avoid the invalid assertion. They then reached 140/140 focused and 532/532 full-suite coverage. No production change was needed, typecheck passed, and no build was run for this task.

### T17: backend admission and recovery sequence

T17 is deterministic backend evidence, not final shared acceptance.

| Request | Observed backend result |
| --- | --- |
| A | Admitted; one provider attempt; forbidden tool rejected; zero tool executions; one lease release after drain. |
| B | Concurrency-limited before provider/tool work; zero provider/tool work. |
| C | Recovery path: two provider attempts, one permitted read-only tool call, and a validated plan. |

The cumulative result was three provider calls, one tool execution, and lease release counts `[1, 1]`. Production capacity remains two; capacity one is permitted only through the narrow test-injection type.

### Normal W05 compatibility

The normal W05 path retained two logical steps, two provider attempts, one tool proposal, one permitted tool execution, one validated tool result, zero retries, zero fallbacks, ten original W05 usage events, and a completed validated public plan.

## 6. Verification results

| Checkpoint | Full-suite result | Related change |
| --- | --- | --- |
| W08 baseline | 423 tests | Pre-W08 baseline; typecheck/build passed; browser smoke blocked. |
| W08-007 | 431/431 across 36 files | Admission controller. |
| W08-016 | 437/437 across 37 files | Operation tracker. |
| W08-018 | 439/439 across 37 files | Provider/tool registration integration. |
| W08-008 | 447/447 across 37 files | Safe admission composition. |
| W08-014 | 462/462 across 37 files | Serialization-safe validation. |
| W08-021 | 466/466 across 37 files | Backend T17 A/B/C. |
| W08-023 | 514/514 across 38 files, then 517/517 | Security projector and hostile-Proxy regressions. |
| W08-024 | 525/525 | Event integration. |
| W08-025 | 532/532 across 38 files | T14 containment after test-only corrections. |
| W08-026 | 533/533 across 38 files | W05 metrics compatibility; typecheck/build passed. |

## 7. Limitations and remaining work

- Admission is process-local and is not distributed rate limiting.
- Local abort does not guarantee remote provider cancellation or billing cessation.
- A never-settling registered operation retains capacity fail-closed.
- No live Gemini or other paid-provider verification was performed.
- Browser smoke was blocked by loopback TCP `EPERM`; it is not reported as passing.
- Frontend-boundary verification was intentionally not run because of secret-safety concerns.
- Isidora-owned W08-027–032 and shared W08-033–040 remain outside this individual evidence. This includes public HTTP 429 implementation, browser/CSP work, and final shared T00/T17 acceptance.

## 8. References and reproduction

### Key implementation references

| Area | Commits |
| --- | --- |
| Planning and authorization | `c66f07f`, `eafea2f`, `828b7a5`, `8c70597`, `e655f98`, `cde00b8`, `f8cb20f` |
| Admission and dependency correction | `2800a9c`, `3bd0800`, `b5b7d04` |
| Operation tracker | `e8e21c4`, `8d07c40`, `7ce189c` |
| Tool/model policy and serialization | `b8966d`, `f7cbeff`, `111bef`, `efd4114` |
| T17 | `d6db34e` |
| Security events and containment | `9899495`, `7370f26`, `2ad8797`, `de90852`, `4ec905d`, `a8fb8f7` |

Primary paths: `server/ai/training-admission.ts`, `training-operation-tracker.ts`, `training-orchestrator.ts`, `training-tool-registry.ts`, `training-validation.ts`, `training-security-events.ts`, `server/composition.ts`, their corresponding tests, `server/ai/training-usage-log.test.ts`, and `evals/week5-training-agent.test.ts`.

### Offline reproduction commands

These credential-free commands are reproducibility guidance only; they were not run for this report.

```bash
npm test -- server/ai/training-admission.test.ts
npm test -- server/ai/training-operation-tracker.test.ts
npm test -- server/ai/training-orchestrator.test.ts
npm test -- server/ai/training-tool-registry.test.ts
npm test -- server/ai/training-validation.test.ts
npm test -- server/ai/training-security-events.test.ts
npm test -- evals/week5-training-agent.test.ts
npm test
npm run typecheck
npm run build
```

The approved W08-009 public 429 contract is recorded as approval-only. No public HTTP implementation is claimed here.
