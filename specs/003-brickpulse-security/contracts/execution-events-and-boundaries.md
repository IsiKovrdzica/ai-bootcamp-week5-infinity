# Agent Execution, Security Events, and Shared Boundary Contract

**Scope**: Existing W05 production enforcement plus Mateja’s proposed server-only W08 event/internal-result contracts. This document does not finalize a public HTTP DTO.

## Agent and tool execution contract

The only executable tool remains exact, case-sensitive `analyze_game_performance`. The registry is fixed by application code; there is no runtime registration, property lookup, filesystem/network/shell access, write operation, or model-selected provider/tool.

| Enforcement rule | Existing source | Required behavior |
|---|---|---|
| Proposal shape/phase/size | `training-validation.ts` | Treat provider response as `unknown`; max 8 KiB exact proposal; wrong phase, extra shape, premature final, or invalid final is terminal. |
| Name allowlist | `training-tool-registry.ts` | Equality lookup only. Unknown names and inherited names such as `constructor`/`toString` do not invoke a tool. |
| Exact arguments/scope | `validateAnalyzeGamePerformanceArguments` | Object contains only 1–64 ASCII `gameContextId`, exactly matching the current run. |
| Injected context | orchestrator + registry | Application injects validated `GameSummary`; model arguments cannot supply game facts or policy. |
| Read-only tool | `training-tool.ts` | Deterministic metrics only; no canonical game-state mutation, provider call, I/O, persistence, or code execution. |
| Result normalization | tool validator | Max 2 KiB, exact shape/evidence order and recomputation; only fresh normalized evidence may continue. |
| Final answer | final/public validators | Closed focus/action/evidence rules and bounded templates; only validated public plan crosses boundary. |
| Repetition/budgets | orchestrator/action guard | Canonical repeat stops pre-invocation; preserve 3 steps, 2 tools, 2 attempts/step, 6 attempts/run, 15s attempt, 30s run, 100ms tool. |

These rules already exist and need regression proof for T06–T11 rather than redesign. A rejected initial request must have zero provider and tool calls. A rejected model-proposed tool can have an earlier provider attempt, but must have zero execution of that rejected tool.

The current model-visible goal is fixed application text, not user free text. The executable injection-related fixture is therefore a malicious fake-provider proposal requesting a policy-expanding/forbidden operation. Registry rejection proves enforcement independently of model wording; it does not claim a live model cannot follow injection.

### Required positive/negative evidence

| Trace | Positive | Negative |
|---|---|---|
| T00 | Two model decisions, one actual permitted read-only tool, validated plan | No mutation seam called before/after tool. |
| T06 | Valid phase/final continues only after validation | Invalid/oversized proposal/final cannot be success or continue. |
| T07 | Exact permitted name reaches binding | Unknown/inherited name has zero tool execution. |
| T08 | Matching context argument executes once | Extra/wrong/mismatched argument executes zero times. |
| T09 | Policy still allows legitimate tool | Malicious fake proposal is rejected by executable policy. |
| T10 | Exact recomputed tool result continues | Malformed/oversized/sentinel-bearing result has no later model step. |
| T11 | Normal retry/fallback remains within budget | Repeated action/exhausted budget starts no additional work. |

## Server-only security event contract

```ts
type SecurityEventKind =
  | 'planner.admitted'
  | 'planner.admission_denied'
  | 'planner.tool_denied'
  | 'planner.result_rejected'
  | 'planner.run_finished'

type SecurityReasonCode =
  | 'RATE_LIMITED'
  | 'CONCURRENCY_LIMITED'
  | 'TOOL_NOT_ALLOWED'
  | 'TOOL_ARGUMENTS_INVALID'
  | 'TOOL_RESULT_INVALID'
  | 'MODEL_OUTPUT_INVALID'
  | 'RUN_CANCELLED'
  | 'RUN_DEADLINE_EXCEEDED'

type SecurityEvent = Readonly<{
  correlationId: string
  kind: SecurityEventKind
  outcome: 'allowed' | 'denied' | 'rejected' | 'finished'
  reasonCode?: SecurityReasonCode
  activeExecutionCount: number
  admissionsInWindow: number
  stepCount: number
  providerAttemptCount: number
  toolCallCount: number
  elapsedMs: number
  terminalStatus?: 'completed' | 'stopped' | 'failed'
}>
```

The server generates `correlationId` through an injected ID factory; it is not an access token, browser input, or model input. `elapsedMs` and counters must be finite non-negative integers within their configured bounds. Event kind/outcome/reason combinations are validated by the producer; an unknown tool name maps to `TOOL_NOT_ALLOWED` and is never copied into an event.

### Event compatibility matrix

The projector accepts only these combinations and rejects impossible combinations before emitting an event:

| Event kind | Required outcome | Allowed reason code | Terminal status |
|---|---|---|---|
| `planner.admitted` | `allowed` | Absent | Absent |
| `planner.admission_denied` | `denied` | `RATE_LIMITED` or `CONCURRENCY_LIMITED` | Absent |
| `planner.tool_denied` | `denied` | `TOOL_NOT_ALLOWED` or `TOOL_ARGUMENTS_INVALID` | Absent |
| `planner.result_rejected` | `rejected` | `TOOL_RESULT_INVALID` or `MODEL_OUTPUT_INVALID` | Absent |
| `planner.run_finished` | `finished` | Absent for normal completion; otherwise `RUN_CANCELLED` or `RUN_DEADLINE_EXCEEDED` only | Required: `completed`, `stopped`, or `failed` |

For `planner.run_finished`, normal completion requires `terminalStatus: 'completed'` and no reason. `RUN_CANCELLED` requires a non-completed terminal status; `RUN_DEADLINE_EXCEEDED` requires `terminalStatus: 'failed'`. Any unknown kind, outcome, reason, terminal status, missing required field, or forbidden extra combination is rejected rather than logged.

Events exclude raw prompt/request body/GameSummary, provider response/error, stack, credential/token, user/model free text, arbitrary tool name, arguments, and results. A fixed allowlisted tool label may be omitted entirely; no event needs attacker-controlled tool text.

### Containment tests

- Put `W08_SERVER_SECRET_DO_NOT_EXPOSE` only in isolated synthetic test input (for example, rejected extra tool result data or internal fake error); capture public result, provider request snapshot, usage/security events, and assert absence everywhere.
- Include newline log-injection fixture text; assert it is not copied into a security event or converted into a second event.
- Positive: a permitted/admitted run emits only closed safe metadata with a server-generated test correlation ID.
- Negative: unknown tool, bad arguments, invalid result, rate/concurrency denial each emit their closed reason without raw attacker value.

## Internal result and shared HTTP boundary

Mateja-owned internal result extension may be represented as:

```ts
type TrainingPlannerServiceResult =
  | ExistingCompleted
  | ExistingRejected
  | ExistingUnavailable
  | Readonly<{ kind: 'admission_denied'; reason: 'rate_limited' | 'concurrency_limited' }>
```

`admission_denied` is internal and closed: it contains no run created from untrusted work, no raw cause, no policy configuration, and no provider/tool counters implying work occurred. It is returned before the orchestrator/provider/tool start.

`server/app.ts` mapping of that result to a public 429 body, public browser response validation, exact error code/message, and whether any public metadata is exposed are shared changes requiring Isidora’s review. This contract intentionally does not choose a 429 DTO. The current 400-for-oversized-body behavior versus a future 413 remains unresolved and is not changed here.

## Ownership and traceability

| Contract | Mateja-owned work | Shared / Isidora review |
|---|---|---|
| Agent/tool enforcement | Regression tests and only gaps identified in W08 plan | Final shared acceptance; browser rendering remains Isidora-owned. |
| Security events | Private event projector, injected ID factory, containment tests | No public event/log transport without pair review. |
| Internal admission result | Internal union/composition use | HTTP 429 mapping and public DTO/transport acceptance require Isidora review. |
| T12–T14/T17 | Tracker/event/admission fake tests | Route/browser acceptance remains reserved. |

No frontend, browser, CSP/header, CORS/CSRF, dependency, or game-integrity artifact is authorized by this contract task.
