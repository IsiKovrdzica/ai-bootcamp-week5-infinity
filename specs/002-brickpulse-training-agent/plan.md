# Implementation Plan: BrickPulse Agentic Training Planner

**Branch**: `002-brickpulse-training-agent` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Gate**: PLAN → human pair review → TASKS. This document authorizes no implementation, test creation, dependency installation, live call, commit, or push.

## Summary

Add one explicitly triggered post-game Training Planner beside the unchanged Week 04 AI Coach. A new backend endpoint validates the existing terminal `GameSummary`, creates one bounded in-memory run, asks a provider-neutral model boundary for a tool proposal, authorizes and executes the single deterministic `analyze_game_performance` tool, validates objective evidence, asks for a final structured decision, deterministically verifies the selected focus/action/evidence, and returns only a safe public plan.

The model selects one supported focus; the tool never does. The application does not secretly rank performance. It verifies only whether the chosen dimension is objectively observable, whether the chosen action is allowed for that focus, and whether all references belong to the current validated result. Display prose is generated from fixed evidence templates, eliminating unsupported free-text claims while preserving the model's bounded choice.

## Authority and consistency check

Authority order for this plan:

1. official `weekly-assignment.md` and reliable-workflows addendum;
2. approved [spec.md](./spec.md);
3. `docs/W05_IMPLEMENTATION_PLAN.md` where consistent;
4. preserved Week 03/04 authorities and current repository architecture.

The official documents were read completely. Their MUST requirements are covered by FR-001–FR-019 and A1–A19. No genuine contradiction exists. Numeric examples in the official documents are explicitly adaptable. One baseline proposal is deliberately rejected: `docs/W05_IMPLEMENTATION_PLAN.md` suggested a tool-assigned focus/threshold, but approved FR-007/FR-013 require objective tool evidence and model-selected focus. This plan follows the approved spec without modifying it.

The repository has no SpecKit CLI, templates, or `.specify` configuration. Feature `001` establishes the manual convention used here: `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/`, and the already approved spec/checklist. No duplicate `AGENT_FLOW.md` or `TOOL_CONTRACTS.md` is needed; this plan and `contracts/tool.md` own that information.

## Technical context

| Area | Decision |
|---|---|
| Frontend | Existing vanilla TypeScript/HTML/CSS/Canvas/Vite; sibling planner controller/view |
| Backend | Existing Node TypeScript ESM and built-in `node:http` handler/composition seams |
| Validation | Handwritten plain-record, exact-key, type/range, cross-field, and semantic validators |
| Agent orchestration | Small backend state machine; no framework/persistence |
| Provider boundary | New adjacent `AgentModelProvider`; unchanged `AiAdviceProvider` |
| Provider | Existing Gemini SDK/configuration, primary plus one fixed Week 04-compatible fallback |
| Tooling | One local read-only deterministic tool; fixed application registry |
| Tests | Existing Vitest, scripted fake, injected clock/IDs/timers/signals; no network or real sleeps |
| Deadlines | 15s per attempt ceiling inside one 30s run deadline |
| Dependencies | None planned |

## Proposed implementation layout

Exact names may change only through TASKS review, but responsibility must remain split as follows:

```text
server/ai/training/
  contracts.ts                 # internal run/model/tool/final types and constants
  validation.ts                # proposal, result, final, and public projection validators
  provider.ts                  # AgentModelProvider only
  scripted-provider.ts         # deterministic queued fake
  performance-tool.ts          # pure analyze_game_performance calculation
  tool-registry.ts             # frozen descriptor/binding and authorization seam
  orchestrator.ts              # state machine, counters, deadline, retry/fallback
  gemini-provider.ts           # Week 05 prompt/schema/SDK translation only
  prompt.ts                    # versioned phase prompts and JSON schemas
  usage-log.ts                 # sanitized Week 05 event types/sink
src/ai/training/
  contracts.ts                 # browser-safe public envelopes
  api-client.ts                # relative endpoint + runtime response validation
  controller.ts                # independent UI request/session state
scripts/
  verify-gemini-training.ts    # explicit, gated, limited live verification
```

Focused tests stay beside these modules under the repository's current `*.test.ts` convention. Existing `server/app.ts`, `server/composition.ts`, `server/index.ts`, `src/main.ts`, `index.html`, `src/style.css`, smoke/boundary scripts, and Vite/server configs receive only the minimum wiring or verification extension. No existing Week 04 module is renamed or repurposed.

## Verified reusable architecture

- `src/ai/game-summary.ts` already derives the exact terminal summary.
- `server/ai/validation.ts` already validates it before provider access.
- `server/ai/provider.ts` contains the closed Week 04 failure taxonomy.
- `server/ai/advice-service.ts` demonstrates application-owned retry/fallback, shared deadline, late-result protection, and 250ms bounded delay.
- `server/ai/gemini-provider.ts` isolates SDK use and sets one SDK transport attempt.
- `server/ai/fake-provider.ts` and tests establish credential-free testing patterns.
- `server/app.ts` and `server/composition.ts` provide endpoint/composition seams.
- `src/ai/api-client.ts` and `coach-controller.ts` provide strict frontend response and stale-request patterns.
- `src/main.ts` keeps AI work outside update/render/input paths.
- `scripts/check-frontend-boundary.mjs` and `scripts/smoke.mjs` provide boundary and browser evidence conventions.
- `package.json` establishes only `test`, `typecheck`, `build`, `smoke`, `check:frontend-boundary`, and explicit Gemini verification commands; no lint/coverage command exists.

## Architecture and dependency direction

```text
Terminal GameSummary
  -> Training Planner frontend controller
  -> POST /api/ai/training-plan
  -> exact request validation (reuse Week 04 summary validator)
  -> create bounded TrainingRunState
  -> TrainingAgentOrchestrator
       -> step routing/deadline/counters
       -> AgentModelProvider
            -> ScriptedAgentModelProvider (routine tests)
            -> GeminiAgentModelProvider (backend-only adapter)
       -> proposal validator (unknown -> normalized proposal)
       -> fixed ToolRegistry
            -> analyze_game_performance
       -> tool-result validator (unknown -> normalized evidence)
       -> final semantic validator
       -> application-owned text renderer
  -> exact safe public envelope
  -> frontend response validator/controller/view
```

Dependency rules:

- browser modules may share public DTO types but never import `server/**`, SDK/config, prompts, registry, or orchestrator;
- orchestrator depends on provider/tool interfaces, never Gemini;
- Gemini adapter depends on the internal provider contract and existing backend config/failure types;
- tool depends only on validated domain values/constants, not game mutation, provider, network, filesystem, or browser code;
- `/api/ai/advice`, `AdviceService`, `AiAdviceProvider`, and Coach controller remain unchanged.

## Exact run and counter semantics

The state/status/phase/counter contracts are normative in [data-model.md](./data-model.md). In summary:

- a step is one new logical model decision; increment before starting it;
- an attempt is one adapter/transport call; increment before every call;
- retry/fallback is the second attempt for the same immutable step request and never a new step;
- a proposed tool call counts after an exact top-level `tool_request` shape is recognized;
- an actual tool call counts immediately before invoking the authorized binding;
- a validated result counts only after independent normalization is committed;
- terminal state is immutable and late results are ignored.

Normal success: `2` steps, `2` provider attempts, `1` proposed tool, `1` tool execution, `1` validated result, `0` retries/fallbacks.

Configured maxima: `3` steps, `2` tool executions, `2` attempts per step, `6` attempts per run. The single-tool/single-context phase policy and repeat protection make a second useful Core tool execution unreachable; the count of two remains a defense-in-depth outer guard. Likewise, the third step is an outer guard, not a recovery entitlement.

## Model step and provider design

[contracts/provider.md](./contracts/provider.md) fixes `ModelStepRequest`, exact normalized proposal variants, fake scripting, and adapter responsibilities.

Phase rules:

| Phase | Evidence | Visible tools | Allowed successful response |
|---|---|---|---|
| `select_tool` | `null` | one descriptor | `tool_request` for allowed tool |
| `produce_final` | normalized result | none | `final` structured decision |

A premature final, refusal, tool request after evidence, malformed output, extra key, or oversized proposal is terminal; it is not retried. The provider returns `unknown`; parsing/structured generation constraints are not application validation.

### Retry/fallback interaction

For each step, the routing layer permits at most one second attempt:

- network/connection, `408`, `429` → same primary;
- normalized plain unavailable `404`, `500`, `502`, `503` → fixed capability-approved fallback;
- explicitly classified configuration/unsupported-model `404`, other `4xx`, auth, configuration, safety/refusal, cancellation, malformed output, validation, and programming failures → stop.

The existing 250ms delay applies only if it fits the shared deadline. SDK retries are fixed at one attempt. No catch block reruns the workflow, reconstructs a run, repeats a tool, or combines retry plus fallback. The theoretical count ceiling is `3 × 2 = 6`; the 30s deadline can terminate earlier.

## Tool and evidence design

[contracts/tool.md](./contracts/tool.md) is normative.

`analyze_game_performance` accepts only `{ gameContextId }`; the registry injects the validated summary. It outputs exact facts plus completion percentage and bricks/minute using the rounding/nullability rules in [data-model.md](./data-model.md). It emits exactly six stable evidence IDs:

1. `game.outcome`
2. `game.bricks_destroyed`
3. `game.completion_rate`
4. `game.duration_seconds`
5. `game.bricks_per_minute`
6. `game.lives`

The result is limited to 2 KiB and 100ms, recomputed independently, projected into a fresh normalized object, and never trusted because it is local. Invalid output cannot enter state/model context.

The registry has no runtime registration or generic execution escape hatch. Unknown names, invalid arguments, over-budget work, and repeats stop before invocation.

## Final TrainingPlan and semantic validation

The model's final decision uses closed values rather than unrestricted factual prose. It chooses:

- one focus;
- evidence IDs for summary;
- one focus-compatible action enum plus evidence IDs;
- the final evidence subset;
- confidence and literal completion.

The application checks exact structure, current-run references, uniqueness, availability, required evidence combinations, focus predicate, focus/action mapping, and union consistency. It then renders and validates the public `TrainingPlan`.

### Deterministic support rules without hidden heuristics

| Focus | Objective support | What may be said | What remains forbidden |
|---|---|---|---|
| survival | at least one life was lost; cite lives | reduce lives lost relative to this run | “poor survival,” causal miss claims, universal target |
| efficiency | finite bricks/minute exists; cite rate + duration | use observed rate as personal baseline and try to improve | “slow,” below average, arbitrary good/bad threshold |
| consistency | game was won; cite outcome + completion | try to repeat the completed clear | variance/trend claims or unseen event claims |

These rules can accept multiple focuses for one run and never select among them. The model retains the selection. Tests supply the same evidence with different supported focus/action decisions and expect both to pass, proving there is no hidden deterministic focus heuristic. Unsupported focus/action/reference combinations fail as `invalid_final_output`.

Application templates create summary/recommendation/finding strings only from cited evidence. Bounds are 200, 240, and 120 Unicode code points respectively; 1–3 evidence items; full plan at most 2 KiB. `completed: true` requires at least two steps, one actual validated tool result, phase `awaiting_final`, and every final check. No partial/refusal output is success. No chain-of-thought is requested or stored.

## Stop policy and state transitions

| Stop reason | Status | Detection point | Further provider/tool work | HTTP |
|---|---|---|---|---:|
| `completed` | completed | validated rendered plan | none | 200 |
| invalid initial input (no run) | — | body/JSON/summary preflight | none; counts 0/0 | 400 |
| `invalid_model_proposal` | stopped | proposal/phase/size validator | none | 422 |
| `unknown_tool` | stopped | registry lookup | no tool | 422 |
| `invalid_tool_arguments` | stopped | exact argument/scope validator | no tool | 422 |
| `repeated_action` | stopped | fingerprint guard | no duplicate tool | 422 |
| `step_limit` | stopped | before logical step | none | 422 |
| `tool_call_limit` | stopped | before invocation | no additional tool | 422 |
| `provider_attempt_limit` | stopped | before attempt | none | 422 |
| `invalid_final_output` | stopped | final structural/semantic validator | none | 422 |
| `invalid_tool_result` | failed | result validator | no later step | 503 |
| `tool_failure` | failed | timeout/throw | no later step | 503 |
| `provider_failure` | failed | ineligible/exhausted attempt | no tool/next step | 503 |
| `total_deadline` | failed | pre-operation/timer/race | abort; ignore late work | 503 |
| `cancelled` | stopped | linked request/restart abort | abort; ignore late work | 503 if response channel remains |

The endpoint exposes only the closed public envelopes in [contracts/openapi.yaml](./contracts/openapi.yaml). No raw provider/tool error, stack, prompt, payload, secret, or internal state crosses the boundary.

## Endpoint and composition plan

- Extend the current app composition with a separately injected `TrainingPlannerService`; keep `AdviceService` injection and route unchanged.
- Add exact `POST /api/ai/training-plan` handling with the existing 16 KiB UTF-8 body ceiling and JSON/content response conventions.
- Validate the summary before creating the run/service call.
- Project only the `200/400/422/503` envelopes; preserve current `404/405` behavior.
- Configuration failure builds an unavailable Week 05 service without changing Week 04 composition behavior.
- No endpoint lists runs, resumes runs, streams progress, or persists state.

## Frontend integration

Add separate browser-safe contracts, transport, controller, and a minimal sibling panel/button:

```text
hidden -- terminal summary --> idle
idle -- explicit click --> pending
pending -- validated 200 --> success
pending -- safe 4xx/5xx/network --> failure
success/failure -- explicit click --> pending
any -- restart --> hidden + abort + session/request invalidation
```

CREATE TRAINING PLAN appears only for `WON`/`GAME_OVER`. Pending text is `CREATING TRAINING PLAN...`; safe failure text is `Training plan could not be completed safely. Please try again.` The UI shows focus, summary, recommendation, and evidence findings only on validated success. It does not show raw stop detail beyond an optional safe closed label, internal counters, prompts, reasoning, or provider errors.

The existing ASK AI COACH remains visible and independently controlled. Restart calls both controllers' reset paths; each controller owns distinct abort/request IDs so one feature cannot settle the other. Game input, Canvas rendering, and `updateGame` remain free of HTTP/orchestration.

## Observability and sanitization

Future Week 05 events use an injected sink and fixed event kinds:

```text
run_started | step_started | provider_attempt_settled |
proposal_validated | tool_execution_settled |
tool_result_validated | final_validated | run_finished
```

Allowed fields: timestamp, run ID, event kind, status/phase, step and all counters, attempt kind, safe provider/model identifier, closed outcome/failure/validation category, tool name from the allowlist, integer latency, safe token counts, stop reason. Do not include `GameSummary`, tool arguments/result values, final prose, prompts/responses, raw errors, stacks, environment values, keys, private data, or chain-of-thought.

## Narrow repository-authority update (future implementation prerequisite)

Do not edit these files in PLAN. The first approved execution slice must make only these changes:

| File | Exact minimal change |
|---|---|
| `AGENTS.md` | Add approved `002/spec.md` after `001` in purpose/authority; carve out only the new read-only training planner, one endpoint, adjacent provider boundary, one local tool, and its approved tests/evidence from the existing agent/second-endpoint ban; retain every other ban and stop condition. |
| `.github/00-index.instructions.md` | Add `002` plan/tasks/contracts and Week 05 architecture/testing/workflow/review routes; keep historical routing unchanged. |
| `.github/instructions/01-architecture.instructions.md` | Add the sibling endpoint → backend orchestrator → adjacent provider → fixed registry/tool → validated final boundary; explicitly preserve Canvas/gameplay, `/api/ai/advice`, backend credentials, no persistence/write/arbitrary tools. |
| `.github/instructions/02-testing.instructions.md` | Add fake-first scripted model, exact counter, allowlist zero-execution, result/final semantic, injected-time/deadline/repetition, stale UI, and W03/W04 regression requirements. |
| `.github/instructions/03-workflow.instructions.md` | Add SPEC → review → PLAN → review → TASKS → review → TDD/evidence/live-gate sequence and exact co-author requirement; retain no install/live/commit without phase authority. |
| `.github/instructions/05-code-review.instructions.md` | Replace blanket rejection only for approved `002`; review counters, retry multiplication, allowlist, no focus heuristic, evidence semantics, safe envelopes/logs, stale response, secret boundary, regressions, and live gate. |

`.github/instructions/04-build-and-commands.instructions.md` needs no authority exception because established commands do not change in this plan. Historical specs/evidence/instructions are not rewritten.

## TDD implementation slices

Every later slice uses: expectation first → focused command → meaningful RED → capture observed RED → smallest coherent implementation → focused GREEN → relevant regressions → manual diff/security review → factual evidence → pair-approved commit. Every eventual Week 05 commit includes exactly the required Mateja trailer.

### Slice 0 — Baseline and authority

- **Expectation first:** no new code test; authority checklist must reject Week 05 code until the narrow exception is reviewed.
- **RED:** current instruction files explicitly reject agents/second endpoint.
- **Implementation:** apply only the six authority edits above after PLAN/TASKS approval; establish dependencies/baseline separately with approved `npm ci`.
- **GREEN:** instruction review passes; existing baseline commands are run and observed.
- **Regression:** full existing suite, typecheck, build, smoke, boundary, W03 formal/holdout, focused W04.
- **Review/evidence:** inspect exact diff, record versions/commands/outcomes/skips; historical files unchanged.
- **Commit:** `docs: authorize bounded training planner implementation`.

### Slice 1 — Contracts and validators

- **Expectation first:** exact request/model/tool/result/final/public schemas; size/text/range/cross-field/reference/focus-action negative cases.
- **RED:** modules/validators do not exist; failures must point to missing Week 05 behavior.
- **Implementation:** browser-safe types plus handwritten backend validators/renderers only.
- **GREEN:** focused validator tests pass, including two different supported focuses over identical evidence and unsupported focus rejection.
- **Regression:** Week 04 validation and frontend boundary tests.
- **Review/evidence:** exact-key handling, Unicode code-point limits, no assertion-as-validation, no hidden focus selection.
- **Commit:** `test/feat: define training planner contracts and validation`.

### Slice 2 — Tool registry and deterministic analysis

- **Expectation first:** exact argument/scope, arithmetic/rounding/null case, stable evidence/order, independent result validation, 2 KiB, 100ms, unknown tool zero execution, no focus field.
- **RED:** registry/tool absent.
- **Implementation:** frozen one-entry registry, pure analysis function, timeout wrapper, fresh normalized projection.
- **GREEN:** deterministic boundary fixtures pass; rejected registry executor and tool count remain zero.
- **Regression:** summary validation/game tests.
- **Review/evidence:** dependency/import audit for filesystem/network/environment/provider/game mutation.
- **Commit:** `feat: add deterministic performance analysis tool`.

### Slice 3 — Scripted provider and state machine success path

- **Expectation first:** exactly two steps, two attempts, one tool proposal/execution/result, valid plan, correct transitions/counters.
- **RED:** provider/orchestrator absent.
- **Implementation:** adjacent interface, script queue, injected timing/IDs, minimal happy-path state machine.
- **GREEN:** success trace and safe plan pass offline.
- **Regression:** all Week 04 provider/service tests.
- **Review/evidence:** no SDK import in orchestrator; no raw output retained.
- **Commit:** `test/feat: implement bounded training planner success flow`.

### Slice 4 — Safety, limits, failure routing

- **Expectation first:** malformed/premature/refusal, unknown/invalid/injection args, invalid/throwing/timed tool, repeat, step/tool/attempt limits, eligible/ineligible retry/fallback, deadline/cancellation, invalid final/reference/action.
- **RED:** each new case reaches wrong/unbounded behavior for the intended reason.
- **Implementation:** guards in documented order, exact terminal transitions, linked aborts, preserved routing taxonomy.
- **GREEN:** full fake matrix with exact counts and stop reasons; no work after terminal.
- **Regression:** W04 retry/fallback/deadline suites.
- **Review/evidence:** attempt multiplication audit and sanitized success/rejection/failure traces.
- **Commit:** `feat: enforce training planner safety and stop policy`.

### Slice 5 — Endpoint and composition

- **Expectation first:** route/method/body/JSON/preflight, exact envelopes/statuses, composition with/without config, unchanged advice route.
- **RED:** new route 404s; existing behavior remains green.
- **Implementation:** inject service and add one branch/projection; no framework.
- **GREEN:** endpoint/integration cases pass; `/api/ai/advice` deep-equality/count tests unchanged.
- **Regression:** all server tests and integration.
- **Review/evidence:** public field/error leakage and route isolation.
- **Commit:** `feat: expose bounded training planner endpoint`.

### Slice 6 — Gemini step adapter (offline)

- **Expectation first:** phase schemas/prompts, data delimiting, abort, `attempts:1`, JSON parsing as unknown, safe usage, failure classification, fixed fallback compatibility harness.
- **RED:** adapter absent.
- **Implementation:** isolated adapter/prompt/schema and composition wiring using existing config/failure rules.
- **GREEN:** injected transport tests pass without credentials/network.
- **Regression:** Week 04 Gemini/genai/config tests.
- **Review/evidence:** server-only secret/model access; no adapter-owned loop/tool/focus logic.
- **Commit:** `feat: add Gemini training-step adapter`.

### Slice 7 — Frontend transport/controller/UI

- **Expectation first:** exact response validation, terminal-only/explicit trigger, pending duplicate guard, success/safe failure, retry-after-settle, restart abort, stale ignore, Coach independence.
- **RED:** planner browser modules/UI absent.
- **Implementation:** sibling controller/transport and minimal DOM/CSS/main wiring.
- **GREEN:** focused browser/controller tests pass.
- **Regression:** Coach frontend tests, game/input/config tests.
- **Review/evidence:** no server/SDK/env import; no AI work in Canvas loop; accessible status.
- **Commit:** `feat: add post-game training planner UI`.

### Slice 8 — Eval, regression, security, and evidence

- **Expectation first:** evaluator scenarios A1–A18 and boundary/smoke extensions, with required call counts/stop reasons.
- **RED:** missing acceptance evidence or real defect only; never weaken the spec.
- **Implementation:** only approved defect corrections, one hypothesis/change at a time; create W05 eval/evidence/log artifacts.
- **GREEN:** complete offline gate passes.
- **Regression:** all commands in `quickstart.md`.
- **Review/evidence:** threat model, full diff/stat/status, no secret/raw reasoning, known limitations and pair roles.
- **Commit:** `test: complete training planner eval and regressions`, then `docs: record Week05 evidence and AI usage` if separation is coherent.

### Slice 9 — Limited live verification

- **Expectation first:** live script itself has offline tests for missing config, caps, safe output, and single-run behavior.
- **RED:** explicit harness/gate absent; no live request is used as RED.
- **Implementation:** smallest explicit script reusing production adapter/validators; no routine-script integration.
- **GREEN:** one authorized fixture records PASS/FAIL/SKIPPED truthfully.
- **Regression:** rerun relevant offline adapter/full gates after any correction.
- **Review/evidence:** inspect output for secrets/prompts/raw payloads; stop after one outcome unless separately authorized.
- **Commit:** `docs: finalize Week05 verification and handoff`.

## Future test/eval matrix

| Scenario | Provider attempts | Tool executions | Expected stop/outcome | Mode |
|---|---:|---:|---|---|
| success | 2 | 1 | `completed`, 200 | fake |
| invalid input | 0 | 0 | no run, 400 | local |
| malformed/premature model output | 1 | 0 | `invalid_model_proposal`, 422 | fake |
| unknown tool | 1 | 0 | `unknown_tool`, 422 | fake |
| invalid/extra/wrong-context args | 1 | 0 | `invalid_tool_arguments`, 422 | fake |
| injection-like extra instruction | 1 | 0 | rejected; policy unchanged | fake |
| tool throw/timeout | 1 | 1 | `tool_failure`, 503 | injected tool/time |
| invalid/inconsistent/oversized result | 1 | 1 | `invalid_tool_result`, 503; no step 2 | injected tool |
| transient then complete | 3 | 1 | one retry, completed | fake |
| unavailable then fixed fallback complete | 3 | 1 | one fallback, completed | fake |
| auth/config/safety/invalid output | 1 | 0 | `provider_failure`, 503 | fake |
| transient exhausted | 2 | 0 | `provider_failure`, 503 | fake |
| repeated action | 2 | 1 | `repeated_action`, duplicate zero | fake |
| next step/tool/attempt over limit | exact boundary | no extra | corresponding limit, 422 | seeded state/fake |
| deadline during attempt/backoff/tool | only started | no later | `total_deadline`, 503 | fake time |
| unsupported focus/action/reference | 2 | 1 | `invalid_final_output`, 422 | fake |
| same evidence, two supported focuses | 2 each | 1 each | both complete | fake |
| final before evidence/second step | 1 | 0 | rejected | fake |
| restart while pending | initiated only | initiated only | stale hidden; game usable | controller |
| W03/W04 regressions | existing | 0 W05 | unchanged | existing suites |

## Verification and evidence strategy

The future baseline and regression commands are listed exactly in [quickstart.md](./quickstart.md). No check is claimed as run or passing in this PLAN phase. `npm ci` is deferred to the approved execution phase.

New later evidence artifacts:

- `docs/AGENT_EVALS_W05.md`: scenario definitions and actual outcomes;
- `docs/EVIDENCE_W05.md`: architecture links, observed commands/results, sanitized traces, security review, limitations, pair contribution;
- `docs/AI_USAGE_LOG_W05.md`: meaningful AI assistance and pair accept/reject decisions.

Each slice records: phase; assistance purpose; proposal; pair decision; expectation and meaningful RED; exact commands/results; GREEN/regressions; manual diff/security review; sanitized counters/stop result; next step; commit. Fake/offline/live evidence is labeled. Existing Week 03/04 evidence and `docs/AI_USAGE_LOG.md` remain untouched.

## Live-provider gate

No live call until all are true:

1. spec, this plan/contracts, future tasks, and narrow authority edits have human-pair approval;
2. baseline, focused fake tests, A1–A18 evals, W03/W04 regressions, typecheck, build, smoke, and frontend boundary pass;
3. SDK one-attempt, linked abort/deadline, structured request, error mapping, and safe logging pass offline;
4. primary and fixed fallback are deliberately capability-checked for both Week 05 phase schemas;
5. security/diff/evidence review finds no credential/raw payload/reasoning leakage;
6. explicit authorization identifies one non-private fixture and one-run default budget.

Stop after the first classified outcome. Assignment ceilings remain at most 15 development runs and 3 demo runs, but are not targets. Record only date, safe provider/model category, result, elapsed time, step/attempt/tool counts, stop reason, and validation outcome.

## Requirement traceability

### Functional requirements

| Spec | Architecture component | Future proof | Evidence artifact |
|---|---|---|---|
| FR-001 | terminal planner controller/button | terminal-only, explicit-click, no-auto-call tests | W05 eval A1/A16 + smoke |
| FR-002 | exact request DTO; fixed goal | extra/free-text rejection; request construction | contracts + eval A2/A15 |
| FR-003 | existing summary validator before run | invalid matrix, 0 attempts/tools | eval A2 trace |
| FR-004 | orchestrator/run state | one action/one run; frontend/provider cannot loop | state tests + architecture review |
| FR-005 | select-tool and produce-final phases | exact 2 steps/1 tool success | eval A1 trace |
| FR-006 | frozen one-tool registry/proposal guards | unknown/invalid/scope/budget/repeat zero execution | A4/A5/A11/A12 |
| FR-007 | pure analysis tool | calculations, deterministic fixtures, absence of focus | tool test evidence |
| FR-008 | independent result validator/projection | malformed/oversized/nonfinite/inconsistent rejected | A7 trace |
| FR-009 | run guards/linked timing | exact independent limit/deadline counters | A10/A12 traces |
| FR-010 | step router + one-attempt adapters | eligible/ineligible categories and no rerun/retool | A8/A9 traces |
| FR-011 | terminal transition function | transition table; no work after terminal | state/failure traces |
| FR-012 | final validator/renderer/public schema | exact shape/bounds/completion tests | A1/A13/A14 |
| FR-013 | focus predicates/action map/evidence resolver | same evidence accepts multiple supported focuses; unsupported rejected | semantic eval set |
| FR-014 | safe terminal projection/stale guards | failure/deadline/cancel/no partial plan | A6/A7/A10/A16 |
| FR-015 | adjacent provider + scripted fake/Gemini adapter | import/interface/adapter tests, no network routine | A17 + boundary |
| FR-016 | injected sanitized event sink | event/counter/sanitization tests | sanitized traces |
| FR-017 | backend boundary, closed context/tools/sizes | injection, secret scan, import/security review | A15 + security checklist |
| FR-018 | sibling endpoint/controllers | full W03/W04 checks and deep-equality route tests | A18 command log |
| FR-019 | gated slices/quickstart/live gate | RED/GREEN/evidence audit and authorized A19 | usage/evidence docs |

### Acceptance scenarios

| Acceptance | Planned future test/eval | Expected evidence |
|---|---|---|
| A1 | scripted allowed tool then supported final | 2 steps, 2 attempts, 1 execution/result, 200 |
| A2 | invalid/nonterminal summary table | 400, no run, 0/0 |
| A3 | malformed/extra/wrong-phase proposal | 422, 0 tool executions |
| A4 | `delete_database` proposal | `unknown_tool`, executor/tool count 0 |
| A5 | missing/extra/fact-bearing/wrong-context args | `invalid_tool_arguments`, count 0 |
| A6 | throw and fake-time timeout | `tool_failure`, no step 2 |
| A7 | malformed/nonfinite/inconsistent/oversized result | `invalid_tool_result`, withheld evidence |
| A8 | transient retry and unavailable fallback success | exact second attempt only; no reset/retool |
| A9 | auth/config/safety/invalid output | one attempt, `provider_failure` |
| A10 | exhausted attempts and deadline at boundaries | no later operation; exact counts |
| A11 | repeat same canonical action | duplicate execution count 0; `repeated_action` |
| A12 | seeded next-step/tool/attempt limits | corresponding stop before operation |
| A13 | unknown/duplicate/unavailable refs and unsupported focus/action | `invalid_final_output`, no plan |
| A14 | final in step 1 or without committed evidence | rejected; cannot complete |
| A15 | instruction text in extra argument/model data | exact validator rejects; registry unchanged |
| A16 | restart abort/stale settlement | planner cleared; Coach/game usable |
| A17 | routine suite without credential/network | fake matrix passes independently |
| A18 | established W03/W04 suites | observed unchanged results |
| A19 | one authorized final live scenario | sanitized bounded live record |

### Official Week 05 MUST coverage

The official checklist maps to the same proofs: continuation and separate spec (authority + A18); clear goal/context (FR-001/002); meaningful read-only tool and contract (FR-006–008); allowlist/input/result validation (A4/A5/A7); two steps plus execution (A1); step/tool/call/time/repetition bounds (A10–A12); structured validated evidence-backed final (A13/A14); provider/failure paths (A8–A10); fake-first and limited-live (A17/A19); observability/security/evidence/pair understanding (FR-016/017/019 and demo/evidence review). No mandatory item is unmapped.

## Security review checklist

- [ ] Exact terminal summary validated before run/provider/tool work.
- [ ] Fixed goal; no free-text Core prompt.
- [ ] Provider credentials/config stay server-only.
- [ ] Orchestrator/provider/tool boundaries remain separate.
- [ ] One frozen tool registry; no dynamic/arbitrary capability.
- [ ] Exact argument scope prevents model-supplied game facts.
- [ ] Rejected proposal proves executor and `toolCallCount` zero.
- [ ] Tool cannot mutate game or access filesystem/network/env/shell/SQL/provider.
- [ ] Tool output is size/time/shape/range/semantic/context validated.
- [ ] Tool assigns no focus and no hidden threshold exists.
- [ ] Step/attempt/retry/fallback/proposal/execution/result counters are distinct.
- [ ] SDK, step, run, tool, deadline, and repeat guards compose without multiplication.
- [ ] Final uses current-run evidence and closed deterministic support/action rules.
- [ ] Public/error/log/event projections exclude raw data, errors, prompts, stacks, secrets, and reasoning.
- [ ] Linked abort plus terminal-state guard discards late work.
- [ ] Frontend contains no backend/SDK/config identifiers and does not own policy.
- [ ] `/api/ai/advice`, Coach UI, gameplay, Canvas, and historical evidence remain unchanged.

## Seven-minute demo plan

| Time | Demonstration |
|---|---|
| 0:00–0:45 | State the fixed user goal and show both independent post-game actions. |
| 0:45–1:30 | Trace frontend → endpoint → orchestrator → provider proposal → registry/tool → evidence → final validator → UI. |
| 1:30–3:00 | Run one bounded success and show 2 steps, 1 tool execution, grounded focus/action, and completed reason without raw reasoning. |
| 3:00–4:00 | Show the one-tool registry, exact arguments/result contract, independent counters, 3/2/2/6 limits, and 30s deadline. |
| 4:00–5:00 | Run the scripted unknown-tool or repeated-action case and prove zero forbidden/duplicate execution. |
| 5:00–6:00 | Show fake-first semantic/retry/deadline tests plus W03/W04 regression results. |
| 6:00–7:00 | Show sanitized evidence, known limitations/live status, and have both pair members explain one boundary and their review contribution. |

## Risks and resolved questions

- **Focus grounding:** resolved with non-ranking observability predicates, closed action enum, current-run evidence, and application-rendered prose.
- **Zero-duration games:** throughput is `null`; efficiency is unsupported, while another supported focus may still be chosen.
- **Tool timeout limitations:** the async guard discards late output; the constant-time built-in function is reviewed so it cannot contain arbitrary blocking work.
- **Theoretical unused limits:** second tool and third step are defense-in-depth and explicitly tested via seeded state; they do not authorize recovery loops.
- **Spec status label:** no content change is made; current user approval is the gate authority.

## Remaining open questions

None. All contract details deferred by the approved specification are fixed by this plan and its supporting artifacts. Any request to add free text, another tool/provider, persistence, a write action, a threshold/classifier, streaming, or public run history requires a new specification decision.
