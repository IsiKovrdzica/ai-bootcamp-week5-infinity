# BrickPulse Week 05 Implementation Plan

**Status:** Planning baseline approved for documentation; not yet approved for SpecKit execution or implementation

**Feature:** BrickPulse Agentic Training Planner

**Project baseline:** Week 03 BrickPulse game + Week 04 Post-Game AI Coach

**Pair:** Isidora Prica and Mateja Miletic

**Date:** 2026-10-05

This document is the pre-SpecKit planning artifact for Week 05. It records verified repository facts, proposed decisions, future approval gates, and test/evidence expectations. It does not claim that the Week 05 feature, tests, SpecKit artifacts, or live verification already exist.

## A. Repository baseline

### Verified repository state

- BrickPulse is a vanilla TypeScript/Vite/Vitest browser game. Week 03 gameplay is defined by `docs/GAME_SPEC.md` and implemented primarily in `src/game.ts`, `src/config.ts`, `src/input.ts`, `src/render.ts`, and `src/main.ts`.
- The fixed game has a 640×480 Canvas, one 4×8 brick grid, three lives, 10 points per brick, and terminal `WON`/`GAME_OVER` states.
- `src/ai/game-summary.ts` derives an exact terminal `GameSummary` with outcome, score, bricks destroyed, lives remaining/lost, and duration.
- Week 04 adds one independent Post-Game AI Coach. Browser code uses `src/ai/api-client.ts` and `src/ai/coach-controller.ts`; the backend uses `server/app.ts`, `server/composition.ts`, and `server/ai/**`.
- The established Week 04 endpoint is `POST /api/ai/advice`. It must remain unchanged.
- `server/ai/validation.ts` performs handwritten exact-key, type, range, and cross-field validation before provider use. Invalid summaries make zero provider calls.
- `server/ai/provider.ts` defines `AiAdviceProvider`. Provider output remains `unknown` until runtime validation succeeds.
- `server/ai/fake-provider.ts` supports deterministic success, malformed, delayed, transient, and permanent failure paths.
- `server/ai/gemini-provider.ts` is backend-only, requests structured JSON, passes an abort signal, and configures `retryOptions: { attempts: 1 }` so one adapter call represents one transport attempt.
- `server/ai/advice-service.ts` owns Week 04's shared 15-second deadline and at most two application-level attempts. Transient network/408/429 failures may retry the primary. Approved provider-unavailable 404/500/502/503 classes may use one fixed Gemini fallback. Other failures are terminal.
- `server/ai/usage-log.ts` defines sanitized per-attempt telemetry. It excludes prompts, payloads, credentials, and raw provider errors.
- The frontend/controller already demonstrates abort and stale-response protection after restart. The Canvas update/render loop does not own provider behavior.
- Existing smoke, boundary, focused, formal, and holdout checks are documented and exposed through `package.json` and the repository scripts.
- The only existing SpecKit-style feature directory is `specs/001-brickpulse-ai-coach/`. No SpecKit CLI/configuration/scripts are present in the repository; Week 05 must follow the established artifact convention manually unless tooling is explicitly introduced later.
- The next feature identifier is therefore proposed as `002-brickpulse-training-agent`.

### Baseline verification status

`npm test` was attempted during planning on 2026-10-05 and did not start Vitest because dependencies were not installed (`vitest` was not recognized). No test was claimed as passing. Before implementation, restore the exact lockfile dependency set with `npm ci`, then establish the baseline using:

```text
npm test
npm run typecheck
npm run build
npm run smoke
npm run check:frontend-boundary
npm test -- src/config.test.ts src/game.test.ts src/input.test.ts
npm test -- evals/week3-formal.test.ts
npm test -- evals/week3-holdout.test.ts
```

Focused Week 04 frontend, backend, provider, validation, and integration tests must also be run. Results must be recorded as observed, including failures and skipped checks.

### Reusable components and boundaries

- Reuse `GameSummary`, its validator, backend-only composition, provider failure taxonomy, abort/deadline patterns, fake-first approach, Gemini SDK compatibility decisions, sanitized usage concepts, and frontend controller pattern.
- Do not force multi-step behavior into `AiAdviceProvider` or `AdviceService`; introduce an adjacent Week 05 interface so Week 04 remains historically and behaviorally stable.
- Do not place the loop, allowlist, credentials, prompts, or tool execution in the frontend.

## B. Assignment requirement matrix

| Mandatory Week 05 requirement | Planned implementation | Planned proof |
|---|---|---|
| Continue Week 03 + Week 04 project | Add an independent post-game Training Planner; preserve game and AI Coach | Week 03/04 regression suites and smoke evidence |
| One bounded domain goal | Analyze the completed game and produce a focused next-game plan | Feature spec, UI acceptance, success trace |
| New SpecKit feature | Create `specs/002-brickpulse-training-agent/` only after approval | Reviewed spec/plan/tasks/checklist artifacts |
| Backend-owned agent loop | Endpoint delegates to a small orchestrator/state machine | Architecture review and orchestrator tests |
| At least two model steps | Normal path: tool proposal, tool execution, final result | Fake success asserts 2 model steps |
| At least one meaningful tool | `analyze_game_performance` computes deterministic metrics/classification | Tool contract and pure unit tests |
| Read-only/deterministic Core tool | Tool receives validated run context and cannot mutate game state | Pure-function tests and security review |
| Explicit tool allowlist | Application registry contains only the approved tool | Unknown-tool test with zero executions |
| Strict proposal/argument/scope validation | Validate exact response kind, name, arguments, run context, and budgets before execution | Negative fake tests and `toolCallCount === 0` proof |
| Validate/normalize tool output | Exact schema, size, ranges, recomputation, evidence IDs, and secret-safe fields | Invalid-result tests; no second model step |
| Explicit run state | Run ID, status, goal, counters, deadline, fingerprints, evidence, result, stop reason | State transition tests and sanitized trace |
| Maximum steps | `maxAgentSteps = 3` | Guard test and stop reason |
| Tool-call budget | `maxToolCalls = 2` | Guard test; never more than two executions |
| Provider-call budget | Two attempts per step and six per run maximum | Retry/fallback/count tests |
| Per-call timeout | Each attempt capped by 15 seconds and remaining total deadline | Fake timer/abort tests |
| Total deadline | `totalDeadlineMs = 30_000` | Deterministic deadline test |
| Bounded retry/fallback | Preserve eligible Week 04 categories within run-wide budgets | Failure-selection/count tests |
| Repeated-call protection | Canonical fingerprint and stop before duplicate execution | Repeated-action fake test |
| Structured final output | `TrainingPlan` exact-key schema | Contract and endpoint tests |
| Evidence-based result | Final evidence references must resolve to validated tool evidence | Unknown/duplicate/unsupported-reference tests |
| Runtime final validation | Structural and semantic validation before success projection | Invalid-final-output test |
| Explicit stop conditions | Application-owned terminal taxonomy | Transition table and tests |
| Provider-neutral boundary | `AgentModelProvider` plus fake and Gemini adapters | Interface/unit tests; no SDK imports in orchestrator |
| Safe frontend status | Pending/completed/stopped/failed without raw reasoning | Controller/UI and smoke tests |
| Context discipline | Fixed goal, validated summary, descriptors, bounded state/evidence only | Request-construction test/security review |
| Fake-first path | Scripted fake responses cover all Core cases | Offline suite, no credentials/network |
| Provider/tool failure flows | Safe terminal envelopes and no uncontrolled continuation | Failure tests and evidence |
| Max-step or deadline flow | Both guards are planned | Fake-timer/budget tests |
| Limited live demo | Live only after offline/security gates; normally one sanitized run | Separate live evidence entry |
| Observability | Distinguish run, step, attempt/retry, and tool-call counts | Sanitized run log tests |
| Security/privacy | Server-only credentials, no arbitrary filesystem/network/shell/SQL/write tools | Boundary scan and checklist |
| Evidence package | New Week 05 eval, evidence, and AI-usage documents | Reviewed factual artifacts |
| Pair understanding/contribution | Driver/reviewer roles rotate; both review spec, tests, diffs, evidence | Contribution log and demo explanations |

No stretch requirement is necessary for Core completion. A second tool, write action, dynamic planner, additional provider, RAG, persistence, or observability dashboard is deliberately excluded.

## C. Conflict/authority analysis

The current explicit Week 05 assignment authorizes planning and, after later approval, one bounded agentic feature. Several historical Week 04 authority files conflict with that new scope:

| Existing authority | Conflict | Smallest future change |
|---|---|---|
| `AGENTS.md` purpose and authority order | Defines the AI Coach as the only approved additive feature | Add the approved `002` spec after Week 04 in the authority chain |
| `AGENTS.md` always-on boundaries | Prohibits agents, a second endpoint, and all AI work beyond the Week 04 Coach | Add one narrow exception for the approved read-only Week 05 training planner and its endpoint |
| `.github/00-index.instructions.md` | Routes only Week 03 and Week 04 work | Add Week 05 spec/task/architecture/testing/review routes |
| `.github/instructions/01-architecture.instructions.md` | Explicitly prohibits an agent and second endpoint | Permit only the approved backend orchestrator, one endpoint, and one deterministic tool |
| `.github/instructions/02-testing.instructions.md` | Test guidance recognizes only Week 03/04 | Add fake-first agent, budget, tool, result, and regression requirements |
| `.github/instructions/03-workflow.instructions.md` | Stops work outside the Week 04 specification | Add the approved Week 05 SpecKit/TDD/evidence sequence |
| `.github/instructions/05-code-review.instructions.md` | Requires rejecting agents and second endpoints | Replace that rejection with checks against the bounded `002` scope while retaining all unrelated bans |

These future edits must not weaken Week 03 gameplay authority or Week 04 reliability rules. Historical specifications and evidence remain unchanged. No authority file changes until the Week 05 specification is approved.

## D. Final proposed user scenario

### User goal

> Analyze my completed BrickPulse game and give me a focused, evidence-based plan for improving my next game.

### Trigger and input

- After `WON` or `GAME_OVER`, the user explicitly clicks `CREATE TRAINING PLAN`.
- The request contains only the existing exact terminal `GameSummary`. There is no arbitrary free-text prompt in Core.
- The backend revalidates the summary before creating a run. Invalid input produces zero model and tool calls.

### Successful flow

```text
completed game
→ explicit user request
→ backend input validation
→ bounded run creation
→ model step 1 proposes analyze_game_performance
→ application validates proposal, arguments, scope, budgets, and fingerprint
→ deterministic read-only tool executes
→ application validates and normalizes tool evidence
→ model step 2 receives only bounded validated evidence
→ model proposes a structured training plan
→ application validates structure, semantics, evidence references, and completion
→ safe plan appears in the UI
```

### Output and success condition

The user receives a concise summary, one focus category, one actionable next-game plan, one to three evidence references, and a confidence category. Success requires a valid tool execution followed by a valid final result grounded only in that tool evidence.

### Why this is agentic and useful

The model selects a permitted next step, the application decides whether it may execute, evidence returns to a later model step, and an application-owned stop policy controls completion. The tool adds deterministic value by computing normalized performance metrics and an explicit focus classification instead of asking the model to calculate or invent them.

## E. Architecture

```text
Terminal-game UI
  → POST /api/ai/training-plan
  → request/runtime validation
  → Training Planner orchestrator
      → run state + deadline + budgets
      → AgentModelProvider
          → fake adapter (routine tests)
          → Gemini step adapter (backend only)
      → untrusted model-step validation
      → application-owned tool registry
      → analyze_game_performance
      → tool-result validation/normalization
      → repeated-action guard
      → final-result structural/semantic validation
  → safe public run envelope
  → Training Planner controller/UI
```

### Responsibilities

- **Frontend:** submit the exact summary, show high-level state, abort on restart, ignore stale results, validate the public response shape, and never approve tools or own budgets.
- **Endpoint:** enforce method/path/body-size/JSON rules, perform preflight validation, map terminal outcomes to safe HTTP responses, and never expose raw errors.
- **Orchestrator:** own the state machine, counters, timing, provider routing, proposal validation order, tool execution decision, final validation, and terminal reason.
- **Provider adapter:** translate the internal step request to Gemini structured output and normalize failures. It does not execute tools or own the agent loop.
- **Registry/tool:** expose only explicitly registered application functions; inject authorized context rather than accepting model-supplied game facts.
- **Validators:** treat model proposals and local tool results as untrusted. Structural validity never substitutes for allowlist, scope, budget, or semantic validation.

### Public API proposal

- Add `POST /api/ai/training-plan`; leave `/api/ai/advice` unchanged.
- Request: exact existing `GameSummary`.
- Response:
  - `200`: completed run envelope and validated plan;
  - `400`: invalid initial summary;
  - `422`: safely rejected proposal/result/final output;
  - `503`: provider, tool, or deadline failure.
- The envelope exposes safe status, stop reason, and counts needed for user feedback/evidence, not prompts, chain-of-thought, provider payloads, credentials, stack traces, or internal state.

## F. Agent state model

```ts
type TrainingRunStatus =
  | "created"
  | "running"
  | "completed"
  | "stopped"
  | "failed"

type TrainingStopReason =
  | "completed"
  | "invalid_initial_input"
  | "invalid_model_proposal"
  | "unknown_tool"
  | "invalid_tool_arguments"
  | "invalid_tool_result"
  | "tool_failure"
  | "provider_failure"
  | "step_limit"
  | "tool_call_limit"
  | "provider_attempt_limit"
  | "total_deadline"
  | "repeated_action"
  | "invalid_final_output"

type TrainingRunState = {
  runId: string
  status: TrainingRunStatus
  goal: "analyze_completed_game_for_next_game_improvement"
  gameContextId: string
  stepCount: number
  toolCallCount: number
  providerAttemptCount: number
  startedAtMs: number
  deadlineAtMs: number
  recentActionFingerprints: string[]
  validatedEvidence?: PerformanceAnalysisResult
  finalResult?: TrainingPlan
  stopReason?: TrainingStopReason
}
```

- An **agent step** is one new model decision based on current validated state/evidence.
- A **provider attempt** is one transport attempt for a step; a retry/fallback does not increment `stepCount`.
- A **tool call** is one invocation after name, arguments, context, budgets, and repetition pass. The data model must separately record invocation outcome so an invoked tool whose result fails validation is not mistaken for zero execution.
- Terminal states cannot transition back to running and cannot start new provider or tool work.
- Use an injected clock/timer/ID source in tests. Do not rely on wall-clock sleeps or random IDs in assertions.

## G. Tool contract

### `analyze_game_performance`

**Purpose:** deterministically transform one already validated completed-game summary into bounded metrics and evidence for a later model step.

**Mode:** read-only, deterministic, local backend operation.

**Model-visible input:**

```ts
type AnalyzeGamePerformanceArgs = {
  gameRef: string
}
```

`gameRef` must equal the current run's application-issued context identity. The registry injects the validated `GameSummary`; the model cannot send or override score, outcome, lives, duration, or brick counts.

**Output proposal:**

```ts
type PerformanceFocus = "survival" | "efficiency" | "consistency"

type PerformanceEvidence = {
  id: "outcome" | "completion_rate" | "bricks_per_minute" | "lives_lost"
  metric: string
  value: string
  finding: string
}

type PerformanceAnalysisResult = {
  gameRef: string
  outcome: "WON" | "GAME_OVER"
  completionRate: number
  bricksPerMinute: number
  livesLost: number
  livesRemaining: number
  focus: PerformanceFocus
  evidence: PerformanceEvidence[]
}
```

**Calculation:**

- `completionRate = bricksDestroyed / 32`, normalized to a documented bounded precision.
- `bricksPerMinute = durationSeconds > 0 ? (bricksDestroyed / durationSeconds) * 60 : 0`, normalized to the same documented precision.
- Lives and outcome come from the validated summary.
- Classification rules and precedence must be fixed in the approved tool contract and covered at threshold boundaries. Proposed minimum rule: `GAME_OVER` prioritizes `survival`; a win below an approved bricks-per-minute threshold uses `efficiency`; otherwise use `consistency`. The precise threshold is a genuine specification decision and must be approved before implementation.

**Result validation:**

- Exact object/array keys and allowed enums.
- Finite numeric values and ranges: completion rate 0–1, nonnegative throughput, lives 0–3.
- Correct `gameRef` and semantic consistency with the stored summary.
- Recompute all metrics independently and compare normalized values.
- Required, unique, allowlisted evidence IDs with no arbitrary extra text fields.
- Maximum serialized result size: 4 KiB.
- Only the normalized validator output is returned to the model.

**Timeout:** synchronous/local operation expected to complete immediately; enforce a 100 ms application guard for contract completeness and tests.

**Allowed caller/scope:** only the Week 05 orchestrator, only for its current validated run context, only within budgets.

**Forbidden behavior:** no canonical game-state mutation, score/life/restart changes, browser access, network, filesystem, shell, environment/secrets, database/SQL, arbitrary code, provider calls, persistence, or user messaging.

**Failure behavior:** throw/map to a safe internal tool failure; do not make another model call. Invalid output becomes `invalid_tool_result`; operational failure becomes `tool_failure`.

### Tool registry/allowlist

The application registry contains one fixed descriptor and executable binding. Lookup is exact and case-sensitive. The model cannot register tools, submit function pointers, choose URLs/paths/commands, or alter descriptors. Unknown names stop before invocation; tests must prove zero tool executions.

## H. Model-step and final-result contracts

### Provider-neutral model request

```ts
type ToolDescriptor = {
  name: "analyze_game_performance"
  description: string
  inputSchema: unknown
}

type ModelStepRequest = {
  promptVersion: "brickpulse-training-planner/v1"
  goal: "analyze_completed_game_for_next_game_improvement"
  gameSummary: Readonly<GameSummary>
  run: {
    runId: string
    stepNumber: number
    remainingSteps: number
    remainingToolCalls: number
    remainingProviderAttempts: number
    deadlineAt: string
  }
  availableTools: readonly ToolDescriptor[]
  evidence?: Readonly<PerformanceAnalysisResult>
}

interface AgentModelProvider {
  generateStep(
    request: Readonly<ModelStepRequest>,
    options: { signal: AbortSignal },
  ): Promise<unknown>
}
```

The request contains no repository, secret, environment value, raw internal log, prior raw model response, or arbitrary user instruction.

### Untrusted model response

```ts
type ModelStepResponse =
  | {
      kind: "tool_request"
      toolRequest: {
        name: string
        arguments: unknown
      }
    }
  | {
      kind: "final"
      final: unknown
    }
```

Validate exact keys and discriminated shape before using any field. `tool_request` is allowed only when evidence has not yet been accepted and budgets remain. `final` is accepted as success only after valid evidence exists.

### Final result

```ts
type TrainingPlan = {
  summary: string
  focus: "survival" | "efficiency" | "consistency"
  nextGamePlan: string
  evidenceRefs: string[]
  confidence: "low" | "medium" | "high"
  completed: true
}
```

Validation rules:

- Exact keys; `completed` must be literal `true`.
- `summary`: nonblank, maximum 160 characters.
- `nextGamePlan`: nonblank, concrete action, maximum 240 characters.
- One to three unique `evidenceRefs`, each resolving to current validated tool evidence.
- `focus` must equal the deterministic tool focus; the model cannot override it.
- Confidence is an allowed category, not a replacement for evidence.
- Reject unsupported facts or references; do not display an invalid final as partial success.
- No chain-of-thought field is accepted or stored.

The public success response projects only validated fields plus safe run metadata.

## I. Limits and stop policy

### Recommended limits

| Limit | Value | Reason |
|---|---:|---|
| Maximum agent steps | 3 | Normal success needs 2; one defensive extra decision remains bounded |
| Maximum tool calls | 2 | Normal success needs 1; the cap prevents loops while supporting explicit guard testing |
| Maximum attempts per step | 2 | Preserves Week 04 bounded retry/fallback shape |
| Maximum provider attempts per run | 6 | Hard cap: 3 steps × 2 attempts; prevents multiplicative expansion |
| Per-attempt timeout | min(15 seconds, remaining run time) | Reuses Week 04 ceiling without exceeding the run deadline |
| Total run deadline | 30 seconds | Small explicit end-to-end budget for two-step normal flow |
| Tool timeout | 100 ms | Tool is local/deterministic; long execution is abnormal |
| Tool result size | 4 KiB | Result is tiny and structured |

Normal success is two provider attempts and one tool execution. The absolute configured maximum is six provider attempts and two tool executions. SDK retries remain disabled beyond one transport attempt, so application counters reflect real external attempts.

### Validation/check order before tool execution

1. Run is active and total deadline remains.
2. Provider response parsed and exact model-step schema valid.
3. Proposal kind is allowed in the current state.
4. Step/provider budgets remain.
5. Tool name is in the fixed registry.
6. Arguments have exact schema and authorized `gameRef`.
7. Tool-call budget remains.
8. Canonical fingerprint is not a repeated no-progress action.
9. Record the fingerprint immediately before invocation.
10. Execute, then validate and normalize the result.

### Repeated-action protection

Fingerprint:

```text
toolName + canonical-json(arguments) + gameContextId
```

Canonical JSON uses fixed key order and normalized scalar representation. The first accepted proposal is fingerprinted before execution. Progress means acceptance of a new validated tool result into the run state. Proposing the same fingerprint again after that evidence exists cannot add information and triggers `repeated_action` before a second execution. Failed/invalid proposals do not count as progress and do not authorize retries by changing formatting.

### Stop policy

| Stop reason | Detection | Another model call? | Tool executes? | Safe outcome/evidence |
|---|---|---:|---:|---|
| `completed` | Valid evidence-backed final | No | Already executed | HTTP 200; plan + safe counts |
| `invalid_initial_input` | Endpoint/preflight | No | No | HTTP 400; 0/0 counts |
| `invalid_model_proposal` | Response validator | No | No | HTTP 422; schema rejection |
| `unknown_tool` | Registry lookup | No | No | HTTP 422; zero executions |
| `invalid_tool_arguments` | Argument/scope validator | No | No | HTTP 422; zero executions |
| `invalid_tool_result` | Result validator | No | Invocation occurred | HTTP 503; result withheld |
| `tool_failure` | Tool guard/catch | No | Invocation occurred | HTTP 503; sanitized category |
| `provider_failure` | Attempts exhausted/noneligible | Only eligible bounded retry/fallback | No new tool | HTTP 503; attempt counts |
| `step_limit` | Before starting/accepting over-budget step | No | No later tool | Safe stopped envelope |
| `tool_call_limit` | Before over-budget invocation | No | No later tool | Safe stopped envelope |
| `provider_attempt_limit` | Before provider call | No | No | Safe failed envelope |
| `total_deadline` | Shared timer/check | No | No later tool | Abort; ignore late result |
| `repeated_action` | Fingerprint check | No | Duplicate does not execute | HTTP 422; fingerprint category |
| `invalid_final_output` | Final structural/semantic validator | No | No later tool | HTTP 422; no plan displayed |

Public cancellation is not Core. Internal request abort and stale-response rejection remain mandatory.

## J. Error taxonomy

- **Preflight:** invalid JSON/body/summary/context. No run/provider/tool activity where possible.
- **Proposal:** malformed structure, invalid kind for state, unknown tool, invalid/unauthorized arguments, injection-like extra fields.
- **Tool:** timeout/failure versus structurally or semantically invalid result.
- **Provider:** transient network/408/429, provider-unavailable approved classes, auth, configuration, safety, client cancellation, invalid output, permanent/programming failure.
- **Budget/control:** step, tool-call, provider-attempt, deadline, or repeated-action stop.
- **Final:** invalid structure, false/missing completion, unsupported focus, unknown/duplicate evidence reference, or unsupported claim.

Only transient/provider-unavailable categories eligible under the approved routing policy may consume a second attempt. Auth, configuration, safety, invalid schema/output, unknown tool, validation failure, and programming errors are not retried. User responses contain stable codes/messages and safe stop reasons, never raw provider/tool details or stack traces.

## K. TDD test matrix

Every implementation slice follows expectation → focused RED → record why RED is meaningful → smallest implementation → focused GREEN → relevant regression → diff/manual review → evidence → commit.

| Scenario | Expected provider attempts | Expected tool executions | Stop reason / user outcome | Path |
|---|---:|---:|---|---|
| Normal successful run | 2 | 1 | `completed`; validated plan | Offline fake |
| Invalid initial input | 0 | 0 | `invalid_initial_input`; HTTP 400 | Offline fake |
| Unknown/forbidden tool | 1 | 0 | `unknown_tool`; HTTP 422 | Offline fake |
| Invalid/missing/extra arguments | 1 | 0 | `invalid_tool_arguments` | Offline fake |
| Malformed model response | 1 | 0 | `invalid_model_proposal` | Offline fake |
| Injection-like content in arguments | 1 | 0 | rejection; allowlist/policy unchanged | Offline fake |
| Invalid tool result | 1 | 1 invocation | `invalid_tool_result`; no model step 2 | Offline injected tool |
| Tool throws/times out | 1 | 1 invocation | `tool_failure`; safe 503 | Offline injected tool |
| Provider permanent/auth/config/safety failure | 1 | 0 | `provider_failure`; no retry | Offline fake |
| Transient then success on step 1 | 3 total | 1 | `completed`; retry counted separately | Offline fake |
| Transient attempts exhausted | 2 | 0 | `provider_failure` | Offline fake |
| Provider-unavailable then fixed fallback | 3 total normal completion | 1 | `completed` only if W05-capable fallback succeeds | Offline fake |
| Malformed provider output | 1 | 0 | `invalid_model_proposal`; no retry/tool | Offline fake |
| Repeated identical action | 2 | 1 | `repeated_action`; duplicate not executed | Offline fake |
| Maximum steps reached | Up to configured budget | No action after guard | `step_limit` | Offline state/fake |
| Tool-call limit reached | Budget-dependent | Exactly 2 maximum | `tool_call_limit` | Offline state/fake |
| Provider-attempt limit reached | Exactly 6 maximum | No later action | `provider_attempt_limit` | Offline fake timers |
| Total deadline during provider call | Only started attempts | No later action | `total_deadline`; late result ignored | Offline fake timers |
| Invalid final shape/text | 2 | 1 | `invalid_final_output` | Offline fake |
| Final references unknown evidence | 2 | 1 | `invalid_final_output` | Offline fake |
| Final focus contradicts tool | 2 | 1 | `invalid_final_output` | Offline fake |
| Frontend restart while pending | Backend may settle; stale UI ignored | As initiated | Hidden/reset UI | Offline controller |
| Week 04 AI Coach regression | Existing expected counts | 0 W05 tools | Existing exact behavior | Offline existing suite |
| Week 03 gameplay regression | 0 | 0 | Existing game behavior | Offline existing/formal/holdout |
| Browser smoke success/failure UI | Stubbed endpoint | Stubbed | Safe visible states | Offline smoke |
| Frontend secret/backend boundary | 0 | 0 | Scan passes | Offline boundary check |

For rejected tool proposals, tests must explicitly prove registry executor count `=== 0` and run `toolCallCount === 0`. For invalid tool results, evidence must distinguish an invocation from an accepted/validated result.

No routine test uses credentials, network access, real sleeps, or Gemini.

## L. SpecKit workflow

After this document is approved:

1. Clarify only genuine product/contract decisions, especially the deterministic focus threshold.
2. Create `specs/002-brickpulse-training-agent/` as a new feature; never rewrite `001`.
3. Write `spec.md` with user stories, functional requirements, success criteria, allowed context/tools, forbidden actions, limits, stop policy, output, failure behavior, and out-of-scope items.
4. Create and review `checklists/requirements.md`; resolve every ambiguity before approval.
5. Obtain explicit specification approval.
6. Create `research.md`, `data-model.md`, `contracts/openapi.yaml`, `contracts/provider.md`, `contracts/tool.md`, `plan.md`, and `quickstart.md` as needed by the established repository convention.
7. Obtain explicit architecture/plan approval.
8. Generate `tasks.md` in dependency/TDD order, including RED/GREEN, evidence, security, and live gates.
9. Obtain explicit task approval.
10. Apply the minimal Week 05 authority/routing changes documented in section C.
11. Implement fake-first by approved tasks and commit boundaries.
12. Complete offline verification, security review, evidence review, and only then the limited live gate.

SpecKit artifacts replace duplicate standalone feature/flow/tool documents. Supporting Week 05 docs should link to them rather than restating them.

## M. Implementation phases

### Phase 0 — Restore and verify the historical baseline

- **Goal:** establish the real pre-Week-05 state.
- **Expected files:** evidence entries only after the evidence artifact is authorized; no production change.
- **Tests first/RED:** no new test; run the exact baseline commands after `npm ci`.
- **Minimal work:** install only lockfile dependencies, run full/focused checks, classify failures without fixing unrelated behavior.
- **GREEN:** all established Week 03/04 checks pass, or blockers are truthfully documented before feature work.
- **Regression/manual review:** inspect status/diff and ensure historical files are untouched.
- **Evidence:** commands, versions, counts, failures/skips.
- **Commit:** none for dependency restoration; evidence belongs in the later approved documentation commit.

### Phase 1 — Specification and authority

- **Goal:** approve `002` requirements and authorize only its narrow scope.
- **Expected files:** new `specs/002...` spec/checklist, then minimal `AGENTS.md`/`.github/**` routing edits after spec approval.
- **Tests first/RED:** checklist initially exposes unresolved requirements rather than executable code RED.
- **Minimal work:** document contracts, limits, acceptance cases, and narrow authority exception.
- **GREEN:** checklist complete and human-approved; no contradiction remains.
- **Regression/manual review:** compare against both Week 05 documents and historical authority.
- **Evidence:** approvals and accepted/rejected scope decisions.
- **Commit:** `docs: authorize and specify bounded training planner`.

### Phase 2 — Contracts and validators

- **Goal:** define public/internal schemas and validation boundaries.
- **Expected files:** new Week 05 contract/validation modules and tests; `002` contract artifacts.
- **Tests first/RED:** exact-key, range, semantic, evidence-reference, and projection tests fail because validators do not exist.
- **Minimal work:** handwritten validators and shared safe types; no orchestrator yet.
- **GREEN:** contract tests pass.
- **Regression/manual review:** existing Week 04 validation remains unchanged; inspect public error exposure.
- **Evidence:** focused RED/GREEN commands and diff.
- **Commit:** `test/feat: define training agent contracts and validation` or split test/feature commits if repository workflow requires observable RED commits.

### Phase 3 — Deterministic performance tool

- **Goal:** calculate trusted normalized evidence without AI or side effects.
- **Expected files:** Week 05 tool/registry modules and tests; tool contract artifact.
- **Tests first/RED:** calculation, threshold, scope, output validation, timeout/size, and forbidden-name tests fail.
- **Minimal work:** pure tool, registry, and independent result validator.
- **GREEN:** tool suite passes, including boundary values and zero execution for unknown tools.
- **Regression/manual review:** confirm no imports for filesystem/network/environment/game mutation.
- **Evidence:** deterministic fixtures, counts, RED/GREEN.
- **Commit:** `feat: add deterministic performance analysis tool`.

### Phase 4 — Fake provider and orchestrator

- **Goal:** complete the bounded workflow offline.
- **Expected files:** model-step provider interface, scripted fake, orchestrator/state/timing modules and tests.
- **Tests first/RED:** success, rejection, budget, repetition, failure, deadline, and invalid-final scenarios fail meaningfully.
- **Minimal work:** smallest state machine and application-owned validation/stop order.
- **GREEN:** full Core fake matrix passes with exact counters.
- **Regression/manual review:** audit every path for work after terminal state and accidental retry multiplication.
- **Evidence:** sanitized success/rejected/failure traces.
- **Commit:** `feat: implement bounded training planner orchestrator`.

### Phase 5 — Endpoint and backend composition

- **Goal:** expose one safe Week 05 endpoint without changing Week 04 behavior.
- **Expected files:** endpoint routing/composition changes and endpoint/integration tests; OpenAPI contract.
- **Tests first/RED:** status/body/body-size/method/path/projection/composition tests fail.
- **Minimal work:** add `/api/ai/training-plan`, inject service, and map safe envelopes.
- **GREEN:** Week 05 endpoint tests and all Week 04 endpoint/integration tests pass.
- **Regression/manual review:** ensure `/api/ai/advice` responses/counts are unchanged.
- **Evidence:** focused plus regression output.
- **Commit:** `feat: expose bounded training planner endpoint`.

### Phase 6 — Gemini model-step adapter

- **Goal:** connect the provider-neutral interface without live calls.
- **Expected files:** Week 05 prompt/schema/Gemini adapter and offline compatibility tests; composition wiring.
- **Tests first/RED:** request shape, abort, one-transport-attempt, parsing, failure classification, token projection, and fallback capability harness tests fail.
- **Minimal work:** adapter using existing backend configuration/failure conventions; no SDK code in orchestrator.
- **GREEN:** all adapter tests pass with injected transport.
- **Regression/manual review:** verify secrets remain server-only and Week 04 adapter tests pass.
- **Evidence:** offline request-shape/call-count results.
- **Commit:** `feat: add provider-neutral Gemini training steps`.

### Phase 7 — Frontend transport, controller, and UI

- **Goal:** let the user explicitly start and safely view a run.
- **Expected files:** new Week 05 frontend contracts/transport/controller tests and minimal `src/main.ts`/HTML/CSS wiring.
- **Tests first/RED:** response validation, duplicate-click, pending, success/failure, abort, restart, and stale-result tests fail.
- **Minimal work:** distinct button/output that reuses established controller principles.
- **GREEN:** focused frontend tests pass.
- **Regression/manual review:** AI Coach and gameplay controls remain independent; Canvas path contains no HTTP/AI loop.
- **Evidence:** UI states and smoke observations.
- **Commit:** `feat: add post-game training planner UI`.

### Phase 8 — Offline eval, regression, and security gate

- **Goal:** prove Core behavior before live use.
- **Expected files:** new Week 05 eval/evidence documents and any approved smoke/boundary updates.
- **Tests first/RED:** eval cases identify missing evidence only; do not weaken requirements to pass.
- **Minimal work:** fix only approved Week 05 defects with one hypothesis/change at a time.
- **GREEN:** full test/typecheck/build/smoke/boundary/regression matrix passes.
- **Regression/manual review:** threat-model allowlist, arguments, result, deadline, secrets, error projection, and log sanitation.
- **Evidence:** actual commands, outputs, diff review, known limitations.
- **Commit:** `test: complete training agent eval and security coverage`.

### Phase 9 — Limited live verification and final evidence

- **Goal:** confirm the already-tested adapter against Gemini with minimal cost/risk.
- **Expected files:** live verification script/tests if approved, `docs/EVIDENCE_W05.md`, `docs/AI_USAGE_LOG_W05.md`, possibly README.
- **Tests first/RED:** script behavior is tested offline for missing config, safe output, and call caps.
- **Minimal work:** normally run one sanitized successful scenario; stop if gates fail.
- **GREEN:** record observed PASS/FAIL/SKIPPED honestly; live failure does not permit bypassing validation.
- **Regression/manual review:** rerun relevant offline checks; review evidence for secrets/raw payloads.
- **Evidence:** date, model category, duration, steps, attempts, tool calls, stop reason—no key/prompt/raw response.
- **Commit:** `docs: finalize Week05 evidence and handoff`.

## N. Documentation/evidence strategy

### New Week 05 artifacts

- `docs/W05_IMPLEMENTATION_PLAN.md` — this pre-SpecKit plan.
- `specs/002-brickpulse-training-agent/**` — later approved feature specification, plan, tasks, research, model, contracts, checklist, and quickstart.
- `docs/AGENT_EVALS_W05.md` — scenario definitions and actual outcomes.
- `docs/EVIDENCE_W05.md` — architecture links, safe run traces, commands/results, security review, limitations, pair contribution.
- `docs/AI_USAGE_LOG_W05.md` — meaningful AI assistance and pair decisions without private reasoning.
- README update only near completion, as a forward-looking current feature summary.

### Historical artifacts that remain unchanged

- `specs/001-brickpulse-ai-coach/**`
- `docs/EVIDENCE_W04.md`
- `docs/AI_USAGE_LOG.md`
- `docs/EVIDENCE_003.md`, `docs/GAME_SPEC.md`, `docs/BUILD_PROMPT_V1.md`, `docs/CONTEXT_MANIFEST.md`, and other Week 03 records.

### Continuous evidence record

For each meaningful phase capture: phase, purpose of AI/Codex assistance, proposal, pair acceptance/rejection, manual review, exact command, observed result, decision/next step, and commit. Runtime evidence distinguishes logical runs, agent steps, provider attempts/retries/fallbacks, tool proposals, tool executions, validation outcomes, elapsed time, and stop reasons.

Never reconstruct PASS evidence later, alter Week 04 history, or store credentials, environment values, private data, raw prompts/responses, huge logs, stack traces, or chain-of-thought.

## O. Git/commit strategy

Proposed coherent sequence:

1. `docs: authorize and specify bounded training planner`
2. `test: define training agent contracts and validation`
3. `feat: add deterministic performance analysis tool`
4. `test: define bounded training agent orchestration`
5. `feat: implement bounded training planner orchestrator`
6. `feat: add training planner API and Gemini adapter`
7. `feat: add post-game training planner UI`
8. `test: complete training agent eval and regressions`
9. `docs: finalize Week05 evidence and handoff`

Adjust splitting only to preserve coherent RED/GREEN history. Every Week 05 commit created from Isidora's repository must include exactly:

```text
Co-authored-by: Mateja Miletic <miletic.matejamiletic.mateja@gmail.com>
```

Before each commit: run the smallest relevant checks, inspect the staged diff, verify no secret/generated artifact/unrelated change, update truthful evidence, and obtain pair review. Do not rewrite historical contribution records. Push only when separately requested.

## P. Security checklist

- [ ] Credentials remain backend-only and absent from bundles, prompts, tools, logs, screenshots, commits, and evidence.
- [ ] The Core request contains only a validated completed-game summary; arbitrary user text is excluded.
- [ ] The model receives minimum context: fixed goal, bounded run metadata, one tool descriptor, and validated evidence.
- [ ] Model output is always untrusted `unknown` until exact structural validation.
- [ ] Proposal kind is state-appropriate.
- [ ] Tool name must match the application-owned allowlist exactly.
- [ ] Arguments use exact keys and current application-issued context identity.
- [ ] Scope and all budgets are checked before execution.
- [ ] Unknown/invalid/injection-like proposals execute zero tools.
- [ ] The Core tool is deterministic/read-only and cannot access filesystem, environment, network, shell, SQL/database, provider, or canonical game mutation.
- [ ] Tool output is independently validated, recomputed, normalized, size-bounded, and secret-safe.
- [ ] Repeated actions stop before duplicate execution.
- [ ] SDK automatic retries are disabled; application counters bound all attempts.
- [ ] Retry/fallback eligibility is closed and consumes the shared deadline/call budget.
- [ ] Late provider/tool results cannot change a terminal run or restarted UI.
- [ ] Final output uses exact schema and references only current validated evidence.
- [ ] Chain-of-thought/raw provider diagnostics are neither requested nor retained.
- [ ] Public failures contain stable safe categories, not stack traces or internal payloads.
- [ ] Frontend boundary scan proves no backend/provider/configuration import or configured secret leakage.
- [ ] No write action or human-approval workflow is included in Core.

## Q. Live-provider gate

No Gemini call occurs until all of the following are true:

1. The `002` specification, plan, tasks, contracts, and tool thresholds are explicitly approved.
2. Baseline and all new fake-first tests are green.
3. Typecheck, build, smoke, frontend-boundary, Week 03, and Week 04 regressions are green.
4. Gemini adapter request shape, one-transport-attempt configuration, abort/deadline propagation, structured parsing, and safe logging are proven offline.
5. The configured primary and fixed fallback are deliberately checked for the Week 05 model-step schema; Week 04 advice capability evidence is not reused as proof.
6. Security/diff/evidence review is complete and secrets exist only in ignored backend configuration.
7. A sanitized nonprivate completed-game fixture and explicit live budget are approved.

Default project policy: one small live agent run after offline completion, expected to use two model steps and one tool call. Stop after PASS or a classified failure; do not blindly repeat. The assignment ceiling is up to 15 logged live agent runs during all development and up to 3 during the final demo, but those are ceilings, not targets, and do not override the per-run maximum of six attempts or the 30-second deadline.

Record only date, provider/model category, status, elapsed time, run/step/attempt/tool counts, stop reason, and validation outcome. Never record a key, `.env`, raw prompt, raw response, private data, or chain-of-thought.

## R. Final acceptance checklist

- [ ] Existing Week 03 game and Week 04 AI Coach remain stable and independently usable.
- [ ] A new approved `002` SpecKit feature defines one BrickPulse-specific user goal.
- [ ] User explicitly starts one logical training-plan run after a completed game.
- [ ] Backend/orchestrator, not frontend/model, controls the workflow.
- [ ] The successful path has at least two model steps and one actual tool execution between them.
- [ ] `analyze_game_performance` has an approved read-only deterministic contract and genuine computed value.
- [ ] A fixed application-owned allowlist prevents arbitrary tools.
- [ ] Model proposal shape, kind, name, arguments, scope, budgets, and repetition are validated before execution.
- [ ] At least one rejected proposal proves both executor count and `toolCallCount` are zero.
- [ ] Tool output is structurally and semantically validated and normalized before model reuse.
- [ ] Run state explicitly distinguishes step, provider-attempt, and tool-call counters.
- [ ] Maximum steps, tool calls, per-step/run provider attempts, per-attempt timeout, and total deadline are enforced.
- [ ] Retry/fallback is bounded, category-specific, and cannot multiply into an uncontrolled loop.
- [ ] Repeated identical no-progress action stops before duplicate execution.
- [ ] Every terminal path has a safe status, stop reason, response, and evidence event.
- [ ] Final result is structured, exact-key, bounded, evidence-linked, semantically validated, and completed only after valid tool evidence.
- [ ] Provider-specific SDK code remains in backend adapters behind `AgentModelProvider`.
- [ ] Fake provider covers success, malformed/rejected actions, failures, budgets, deadline, repetition, and invalid final output.
- [ ] Prompt-injection-like data cannot alter the allowlist/system policy.
- [ ] Week 03 gameplay and Week 04 AI Coach regressions pass.
- [ ] UI shows safe pending/completed/stopped/failed states and protects restart/stale responses.
- [ ] No secrets, raw reasoning, arbitrary filesystem/network/shell/SQL, write access, or canonical game mutation exist.
- [ ] Week 05 eval, evidence, and AI usage artifacts contain observed—not fabricated—results and pair contribution.
- [ ] Limited live verification occurs last and stays within approved budgets.
- [ ] Both pair members can explain the tool choice, validation boundary, counters, stop rules, and proof that rejected tools do not execute.

## S. 7-minute demo plan

### 0:00–0:45 — Goal and value

- Show the completed BrickPulse game and explain the fixed goal.
- Explain why deterministic evidence plus a later model decision is useful and genuinely agentic.

### 0:45–1:30 — Architecture

- Trace frontend → endpoint → orchestrator → provider proposal → registry/tool → validated evidence → provider final → UI.
- Point out that the model proposes while the application authorizes.

### 1:30–3:00 — Successful run

- Trigger `CREATE TRAINING PLAN`.
- Show two model steps, one allowed tool execution, validated metrics/evidence, final plan, counters, and `completed` stop reason.
- Do not show chain-of-thought or raw provider content.

### 3:00–4:00 — Safety boundaries

- Show the one-tool allowlist, exact argument/result validation, max steps/tool calls/provider attempts, total deadline, and server-only credentials.

### 4:00–5:00 — Negative path

- Run the fake unknown-tool or repeated-action scenario.
- Show the safe stop reason and prove the forbidden/duplicate tool executor count is zero.

### 5:00–6:00 — Tests and reliability

- Show the fake provider matrix, deadline/retry tests, final-evidence validation, and Week 03/04 regressions.

### 6:00–7:00 — Evidence and pair ownership

- Show the sanitized run log, model-attempt/tool counts, known limitation, live budget/result if authorized, and continuous evidence.
- Isidora and Mateja each explain a boundary and describe their driver/reviewer rotation.

## T. Risks / open questions

### Risks with planned mitigations

- **Historical authority conflict:** implementation could violate always-on instructions. Mitigation: approve `002`, then minimally update authority/routing files before code.
- **Retry multiplication:** three steps × provider routing could exceed expectations. Mitigation: SDK attempts fixed at one, two attempts per step, six per run, shared 30-second deadline, exact counter tests.
- **Weak/trivial tool:** merely echoing the summary would not justify a tool. Mitigation: recompute metrics, normalize evidence, and derive a deterministic focus under explicit rules.
- **Evidence hallucination:** model could cite unsupported facts. Mitigation: stable allowlisted evidence IDs, focus equality, and semantic final validation.
- **Counter ambiguity:** invalid tool results could obscure whether code executed. Mitigation: separately define proposal, invocation, accepted result, and run counters in the data model/evidence.
- **Fallback assumption:** the Week 04 fallback was checked for advice, not the agent-step contract. Mitigation: new offline and limited live Week 05 capability gate.
- **Missing dependencies/baseline:** current tests cannot run before install. Mitigation: `npm ci`, then truthful baseline before feature changes.
- **UI coupling:** adding another feature could disturb Coach/gameplay. Mitigation: separate controller/transport/output and full regression/smoke checks.

### Genuine open questions requiring specification approval

1. What exact bricks-per-minute threshold separates `efficiency` from `consistency`, and should the threshold be a documented constant derived from a small approved fixture set? This affects deterministic output and must not be guessed during implementation.
2. Should public stopped/failed envelopes expose the detailed safe stop-reason enum or map some internal categories into fewer user-facing categories while retaining detailed sanitized evidence? The API contract must choose one mapping before endpoint tests.
3. Should `toolCallCount` mean invocation begun or successfully validated execution? Recommended resolution: count invocation begun and record a separate validation outcome, but the SpecKit data model must lock this before tests.

All other defaults are intentionally fixed: one game only, no persistence/history, one Core tool, no free-text goal, no public cancellation, no write action, no additional provider, and no stretch feature until all Core acceptance criteria pass.
