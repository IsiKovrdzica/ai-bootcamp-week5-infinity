# Feature Specification: BrickPulse Agentic Training Planner

**Feature branch**: `002-brickpulse-training-agent`

**Created**: 2026-10-05

**Status**: Draft for human review

**Input**: W05 Assignment — Bounded Agentic Feature; Week 05 Addendum — Reliable Stateful Agentic Workflows; reviewed `docs/W05_IMPLEMENTATION_PLAN.md`

## Scope and authority

This specification defines a new Week 05 feature added to the existing BrickPulse Week 03 game and Week 04 Post-Game AI Coach. The official Week 05 assignment and addendum are the requirements authority; this specification specializes them for BrickPulse. `docs/W05_IMPLEMENTATION_PLAN.md` is the reviewed starting baseline where it is consistent with those sources.

Existing Week 03 and Week 04 specifications, plans, tasks, evidence, logs, and behavior remain historical records. This feature MUST NOT rewrite them or replace the existing `POST /api/ai/advice` AI Coach flow. The current repository instructions that prohibit agents, a second endpoint, or AI work beyond Week 04 require a narrow Week 05 authority extension after this specification is approved; they are not modified in this phase.

No repository-local SpecKit CLI, `.specify` configuration, templates, or scripts are present. This feature therefore follows the established `specs/001-brickpulse-ai-coach/` artifact convention manually. This specification does not authorize planning artifacts, tasks, tests, production implementation, dependency changes, live provider calls, or commits.

## User problem and goal

After a game ends, a player has exact outcome and score data but no focused, evidence-based training plan for the next game. The Week 04 coach gives one-shot advice; it does not demonstrate a bounded workflow in which a model requests deterministic analysis, receives validated evidence, and then makes a grounded decision.

The exact user goal is:

> Analyze my completed BrickPulse game and give me a focused, evidence-based plan for improving my next game.

The user explicitly selects **CREATE TRAINING PLAN** after a `WON` or `GAME_OVER` result. A successful result gives the player one focus, a concise explanation, one actionable next-game recommendation, and evidence from the completed game. The user does not provide a free-text prompt in Core.

## User scenarios and acceptance

### User Story 1 — Create a grounded training plan (Priority: P1)

After completing a game, the player requests a training plan. The backend creates one bounded run. A first model step proposes the allowed analysis tool, the application validates and executes it, and a later model step produces a structured plan grounded in the validated tool evidence.

**Independent test**: With a valid terminal summary and scripted fake model responses, observe exactly two successful model steps, one actual tool execution between them, a completed run, and a validated plan whose evidence references resolve to the tool result.

**Acceptance scenarios**:

1. **Given** a valid completed-game summary, **when** the player selects CREATE TRAINING PLAN and the model proposes the allowed tool with valid arguments, **then** the application executes the tool once, validates its result, performs a later model step, validates the final plan, and returns a safe completed result.
2. **Given** validated evidence that can support more than one reasonable emphasis, **when** the model chooses one training focus, **then** the application accepts it only if every focus-dependent claim and recommendation is explicitly supported by cited evidence from this run.
3. **Given** an active request from a completed game, **when** the game is restarted before settlement, **then** the old result is not displayed and ordinary gameplay remains usable.

### User Story 2 — Reject unsafe or invalid actions (Priority: P1)

The player is protected from model proposals that are malformed, outside the allowlist, wrongly scoped, repeated without progress, or over budget.

**Independent test**: Script an unknown tool proposal and observe a controlled stop with zero tool executions.

**Acceptance scenarios**:

1. **Given** a model proposal for an unknown or forbidden tool, **when** it is validated, **then** no tool executes, `toolCallCount` remains `0`, and the run ends safely with a classified reason.
2. **Given** the allowed tool name with malformed, extra, model-supplied game facts, or wrongly scoped arguments, **when** arguments are validated, **then** no tool executes and no such values enter trusted context.
3. **Given** a previously executed action with no intervening progress, **when** the same canonical action is proposed again, **then** it is rejected before execution and the run stops as a repeated action.

### User Story 3 — Stop safely on invalid evidence, provider failure, or limits (Priority: P1)

The player receives no fabricated or partially trusted plan when input, model output, tool output, provider behavior, or run limits prevent safe completion.

**Independent test**: Use fake time and scripted fakes to exercise invalid input, malformed model output, invalid tool result, provider exhaustion, step limit, and total deadline without credentials or network access.

**Acceptance scenarios**:

1. **Given** an invalid or non-terminal game summary, **when** a request is submitted, **then** the backend rejects it before run/model/tool work with zero provider attempts and zero tool calls.
2. **Given** a tool result that is malformed, excessive, non-finite, inconsistent with the authorized game summary, or contains fields outside its contract, **when** it is validated, **then** it is not sent to the model and the run ends safely.
3. **Given** a provider failure eligible under the preserved Week 04 retry/fallback policy, **when** budget and time remain, **then** only the bounded permitted second attempt occurs; otherwise the run stops without multiplying retries across the workflow.
4. **Given** the maximum step, provider-attempt, tool-call, or total-time boundary, **when** further work would cross it, **then** no further provider or tool operation starts and the user receives a safe non-success state.
5. **Given** a structurally invalid, incomplete, or unsupported final result, **when** it is validated, **then** it is never presented as a successful plan.

### User Story 4 — Verify offline first and live only after gates (Priority: P2)

The team can demonstrate the workflow reproducibly with fakes, then perform a deliberately limited real-provider verification only after offline, regression, security, and evidence gates pass.

**Independent test**: Run the future fake-backed acceptance/evaluation suite without credentials or network access and distinguish runs, model steps, provider attempts, retries/fallbacks, tool proposals, tool executions, validation outcomes, and stop reasons.

**Acceptance scenarios**:

1. **Given** no provider credential, **when** the routine Week 05 verification suite runs, **then** all Core paths are verifiable through scripted fakes and deterministic time.
2. **Given** any failing offline, Week 03/04 regression, security, or evidence gate, **when** live verification is considered, **then** no live provider run is authorized.
3. **Given** all gates pass and the pair explicitly authorizes live verification, **when** a small non-private scenario is run, **then** it stays within the documented live budget and records only sanitized evidence.

## Allowed input and context

- The initial request MUST contain only the existing exact six-field terminal `GameSummary`: `outcome`, `score`, `bricksDestroyed`, `livesRemaining`, `livesLost`, and `durationSeconds`.
- The backend MUST apply the existing Week 04 structural and semantic `GameSummary` rules before a run begins. The authorized summary, not model-provided copies of game facts, is the source of truth.
- Each run may provide the model only the fixed domain goal, the minimum relevant validated summary/context, the current bounded run state, the approved tool descriptor, and normalized evidence produced in that run.
- Tool arguments MUST identify only the already authorized run/game context. The application MUST inject the authoritative summary; the model MUST NOT supply or override score, outcome, lives, duration, brick totals, limits, provider/model selection, or policy.
- Text contained in user/game data or tool results is data, not an instruction and cannot alter system policy, the allowlist, budgets, or validation.

## Forbidden context and actions

The feature MUST NOT receive the repository, arbitrary game history, complete internal `GameState`, credentials, environment values, raw provider diagnostics, hidden reasoning, or unrelated user/private data. It MUST NOT expose arbitrary shell, filesystem, browser, network/URL, SQL/database, messaging, code-execution, provider-selection, or dynamically defined tools.

Core is read-only. It MUST NOT mutate canonical game state, score, lives, rules, status, stored data, or provider configuration; start/restart gameplay; write files; make external tool calls; or execute model-generated code. It has no write action and therefore no human-approval flow. Any future write behavior is outside this specification and would require a new approved specification with authorization, idempotency, and explicit human confirmation.

## Bounded agentic behavior

### Successful flow

```text
explicit user goal after a completed game
→ validate exact terminal GameSummary
→ create one bounded backend run
→ model step 1 proposes an allowed action
→ application validates response, phase, tool, arguments, scope, budgets, deadline, and repetition
→ deterministic read-only tool executes
→ application validates and normalizes the tool result
→ model step 2 receives only bounded validated evidence
→ model proposes the final structured training plan
→ application validates structure, semantics, evidence references, and completion
→ safe completed result is returned to the UI
```

Success MUST contain at least two distinct model steps and at least one actual allowed tool execution between them. A response produced without validated tool evidence, or a final result emitted before a successful tool execution, MUST NOT be accepted as success. The backend orchestrator owns run state and continuation; the frontend and model never do.

### Application authority and proposal validation

Every model response is untrusted. Before any tool execution, the application MUST validate, in order sufficient to prevent side effects:

1. the response is parseable and matches the exact expected proposal shape and size;
2. its decision kind is permitted in the current run phase;
3. the named tool is present in the application-owned allowlist;
4. arguments contain exactly the allowed fields, types, values, and authorized context identity;
5. model-supplied canonical game facts, policies, or resources are absent;
6. the run is active and the proposal is within step, tool-call, provider-attempt, and deadline budgets;
7. the canonical action fingerprint has not already been executed without progress.

Any failed check MUST prevent tool execution. Unknown/forbidden tools and invalid arguments are terminal for Core rather than invitations for an extra model correction call.

### Tool allowlist and responsibility

The Core allowlist contains exactly one tool: `analyze_game_performance`.

Its behavioral responsibility is to deterministically transform the application-injected, already validated terminal summary into bounded objective performance metrics and stable evidence records. At minimum these include the original terminal facts needed for verification and genuinely derived metrics such as completion ratio/rate and a time-normalized brick-destruction rate when mathematically defined. Calculations MUST use the fixed Week 03 domain constants and explicit, reproducible rounding/undefined rules established in the later contract/plan phase.

The tool MUST be deterministic, local, read-only, side-effect-free, and independent of any model/provider. It MUST NOT merely echo the input, infer unobserved play events or causes, make a recommendation, assign a semantic training focus, or use arbitrary thresholds to label the player.

#### Focus-design decision

The tool will expose objective metrics/evidence and the model will select the semantic focus (`survival`, `efficiency`, or `consistency`) subject to evidence validation.

This is stronger than tool-assigned focus because the current single-game summary supports exact facts and derived rates but contains no authoritative domain thresholds proving that one category is always correct. A deterministic focus would embed arbitrary product policy, reduce the second model step to wording, and risk presenting a threshold as evidence. Objective computation still gives the tool meaningful value: it centralizes trusted arithmetic, normalization, semantic consistency, and stable evidence IDs. The model retains a genuinely useful bounded judgment, while the application remains authority by requiring one allowed focus, resolved evidence references, and support for every focus-dependent claim. If evidence cannot support a focus, the model must return an incomplete/refusal outcome or the application must reject the final result; it may not invent support.

### Tool-result validation and normalization

Tool output remains untrusted until the application verifies its exact shape, required fields, allowed values, finite numeric ranges, maximum serialized size, derivation/rounding consistency with the authorized summary, stable unique evidence IDs, absence of unknown fields and secrets/internal state, and correct run/context association. The size ceiling and exact metric schema MUST be fixed in the contract/plan phase before tests, sized only for one game summary and its small evidence set.

Only the normalized validated projection may be added to run state or sent to a later model step. Invalid output MUST NOT trigger a model continuation or be exposed as evidence.

## Run limits, retry/fallback, and stop policy

### Required limits

The specification adopts the reviewed baseline limits:

| Limit | Required boundary | Rationale |
|---|---:|---|
| Maximum agent steps | 3 | The normal flow needs 2; one additional step is a hard safety envelope, not permission to omit the required tool or loop indefinitely. |
| Maximum tool calls | 2 | Preserves the reviewed outer guard. With one Core tool and one authorized context, duplicate-action protection normally makes the effective successful-flow maximum 1; the second slot cannot bypass repetition or scope checks. |
| Maximum attempts for one model step | 2 | Preserves Week 04's application-level initial-plus-one eligible retry/fallback boundary. |
| Maximum provider attempts for one run | 6 | Caps the theoretical 3 steps × 2 attempts and prevents nested or multiplicative retry loops. |
| Per-provider-attempt timeout | 15,000 ms maximum | Reuses the established Week 04 timeout ceiling, further capped by remaining run time. |
| Total run deadline | 30,000 ms | Bounds the whole multi-step run; all validation, backoff, provider attempts, tool work, and result handling share it. |

These are independent counters and guards. An agent step is a new model decision using the current validated state; a provider attempt is one transport attempt for that step; a tool call is one actual invocation after all pre-execution checks pass. Rejected proposals are not tool calls. Retry/fallback does not create a new agent step. No operation may begin without enough remaining budget and time, and the effective timeout for an attempt MUST be no greater than the lesser of 15 seconds and the remaining total deadline.

The 30-second deadline intentionally makes the theoretical six provider attempts unreachable when slow attempts consume their full timeouts; the deadline is an additional safety cap, not a promise to spend every count. Tool execution MUST also be locally time-bounded and subject to the remaining total deadline; its exact short timeout is deferred to the contract/plan phase because no I/O is involved and the official requirements do not prescribe a number.

### Retry and fallback policy

Week 05 MUST preserve the Week 04 failure taxonomy and selection semantics without changing the Week 04 service: within both per-step and run-wide budgets, network/connection, `408`, or `429` may use the one second attempt on the same primary; normalized plain provider-unavailable `404`, `500`, `502`, or `503` may use the one fixed capability-tested Gemini fallback; explicitly classified configuration/unsupported-model `404`, other `4xx`, authentication/authorization, configuration, safety/refusal, cancellation, malformed/invalid structured output, validation, and programming failures are terminal and receive no retry/fallback. The provider SDK MUST remain constrained so one adapter call is one transport attempt.

Retries repeat only the failed provider step. They MUST NOT restart the run, re-execute a completed tool action, or reset counters/deadline. A tool failure or invalid tool result is terminal in Core; there is no model-directed recovery tool.

### Repeated-action protection

A canonical fingerprint MUST combine the approved tool name, normalized validated arguments, and authorized context/state version. It is recorded immediately before actual invocation so an attempted execution cannot be forgotten if output validation later fails. Progress means a newly validated tool result is committed to run state or a valid final result completes the run. Reproposal of the same fingerprint without progress MUST stop as `repeated_action` before another execution. Changing irrelevant formatting or adding forbidden fields cannot create a new action.

### Explicit stop conditions

The application MUST enter an immutable terminal state and start no further provider/tool work when any of these occurs:

- `completed`: required tool evidence exists and the final structured plan passes all validation;
- `invalid_initial_input`: preflight request validation fails (before run/provider/tool work);
- `invalid_model_proposal`: malformed response, wrong decision kind/phase, refusal with no safe plan, or prohibited content;
- `unknown_tool` / `invalid_tool_arguments`: allowlist, exact-argument, authorization, or scope validation fails;
- `invalid_tool_result` / `tool_failure`: execution fails, times out, or its result cannot be validated and normalized;
- `provider_failure`: the current step cannot succeed under the eligible bounded retry/fallback policy;
- `step_limit`, `tool_call_limit`, or `provider_attempt_limit`: further work would exceed the corresponding count;
- `total_deadline`: the shared run deadline expires or insufficient time remains to start safely;
- `repeated_action`: an executed fingerprint is proposed again without progress;
- `invalid_final_output`: structure, completion, focus, recommendation, or evidence grounding fails;
- `cancelled`: an existing user/restart abort signal is observed, if carried into the Week 05 boundary.

Except for `completed`, terminal outcomes MUST return a stable safe stopped/failed response that supports user feedback without including raw model/provider/tool content, stack traces, prompts, secrets, or hidden reasoning. Partial evidence MUST NOT be displayed as a successful plan.

## Final structured result and evidence grounding

A successful plan MUST contain exactly the behaviorally required fields below; exact field names and text ceilings are finalized in the contract/plan phase without changing their meaning:

- a nonblank concise `summary` of the completed-game analysis;
- exactly one `focus`: `survival`, `efficiency`, or `consistency`;
- one nonblank, feasible `recommendation` for the player's next game;
- one to three unique `evidence` references, each identifying a stable evidence ID from this run and a concise supported finding;
- `confidence`: `low`, `medium`, or `high`;
- `completed: true`.

Runtime validation MUST require an exact bounded structure, allowed values, bounded nonblank text, unique evidence IDs that all resolve to normalized tool evidence, and semantic agreement between each finding and its referenced value. Every factual claim about performance and every claim used to justify the focus or recommendation MUST be derivable from the authorized summary or cited validated evidence; unsupported causes, events, comparisons, history, or precision are forbidden. Confidence never substitutes for evidence.

`completed: true` is accepted only after at least one successful allowed tool execution, validated evidence, at least two model steps, and all final structural/semantic checks. `completed: false`, refusal, or missing support is a safe non-success result, not a partially successful plan. Chain-of-thought is neither requested nor stored.

## Provider neutrality and preservation of Week 04

- Agent-step generation MUST cross a small provider-neutral boundary adjacent to, rather than forced into, the Week 04 `AiAdviceProvider` contract.
- Provider adapters may translate the internal structured step contract and normalize failures; they MUST NOT execute tools, own run state, select arbitrary tools, or decide completion.
- Gemini SDK use, credentials, configured primary/fixed fallback models, prompts, and transport details remain backend-only.
- Routine verification MUST use a scripted fake model/provider. Adding another provider is not required.
- Week 05 MUST leave the existing `/api/ai/advice` contract, Coach UI behavior, validation, deadline/retry/fallback semantics, stale-response protection, provider implementation, and evidence history unchanged. Week 03 gameplay and Canvas ownership also remain unchanged.

## Observability and evidence requirements

One user action maps to one logical run ID. Sanitized evidence MUST distinguish run status/stop reason and elapsed time; agent step number; each actual provider attempt, attempt kind, provider/model category, latency, sanitized outcome and safe token counts when available; each proposed tool and validation outcome; each actual tool execution and result-validation outcome; and final-validation outcome. Counters MUST make rejected-before-execution cases, including `toolCallCount === 0`, demonstrable.

Logs/evidence MUST NOT contain credentials, environment values, complete raw prompts/responses, unrestricted user/game payloads, raw provider/tool errors, stack traces, private data, or chain-of-thought. Evidence must record only commands and outcomes actually observed and must distinguish fake/offline results from limited live results. Week 05 receives new evidence/eval/usage artifacts later; historical Week 03/04 evidence is not backfilled.

## Verification requirements

- Development MUST follow the gated sequence SPEC → human review → PLAN → human review → TASKS → human review → TDD implementation.
- Most behavior MUST be proven offline with scripted fake responses, fake transport, injected time/IDs, and no credential or network dependency.
- Future TDD coverage MUST include success, invalid initial input, malformed proposal, unknown/forbidden tool with zero execution, invalid arguments with zero execution, invalid tool result, tool failure, eligible and ineligible provider failures, timeout/deadline, repeated action, step/tool/provider budget exhaustion, invalid final output, prompt-injection-like data, cancellation/stale result where applicable, and Week 03/04 regressions.
- A limited live verification may occur only after fake Core tests, full relevant regression, type/build/smoke/boundary checks, security review, and evidence review pass, and after explicit authorization. The development and demo live-run ceilings from the assignment are maxima, not targets: no more than 15 development runs and no more than 3 final-demo runs, with the project expected to use the smallest practical subset.
- Both pair members MUST review and be able to explain the user goal, tool value, allowlist/validation boundary, step and call budgets, stop policy, rejected-tool non-execution proof, evidence grounding, and observed limitations.

## Functional requirements

- **FR-001**: The system MUST expose CREATE TRAINING PLAN only for `WON` or `GAME_OVER` and start work only after explicit user action.
- **FR-002**: The exact user goal and Core input MUST be those defined in this specification; Core MUST accept no arbitrary free-text prompt.
- **FR-003**: The backend MUST validate the exact terminal `GameSummary` before creating a run; invalid input MUST cause zero provider and tool calls.
- **FR-004**: One action MUST create one explicit bounded backend run; the frontend and model MUST NOT own the loop or security policy.
- **FR-005**: A successful run MUST perform at least two model steps with at least one validated real tool execution between them.
- **FR-006**: The application MUST own an explicit allowlist containing only `analyze_game_performance` for Core and MUST validate proposal structure, phase, name, exact arguments, scope, authorization, budgets, deadline, and repetition before execution.
- **FR-007**: `analyze_game_performance` MUST be deterministic, local, read-only, side-effect-free, and produce objective computed metrics plus stable evidence; it MUST NOT assign the training focus.
- **FR-008**: Tool output MUST be strictly validated and normalized before becoming run state or model context.
- **FR-009**: The run MUST enforce the adopted independent step, tool-call, per-step-attempt, run-attempt, per-call-timeout, total-deadline, and repeated-action boundaries.
- **FR-010**: Retry/fallback MUST retain the stated Week 04 eligibility semantics within Week 05 per-step and run-wide budgets and MUST never restart the workflow or repeat completed tool work.
- **FR-011**: The application MUST own all terminal transitions and the explicit stop taxonomy; terminal runs MUST start no additional work.
- **FR-012**: Success MUST return the bounded structured plan defined above and validate it structurally and semantically at runtime.
- **FR-013**: The model may select one allowed focus, but every focus-dependent statement and recommendation MUST cite and agree with validated evidence from the same run.
- **FR-014**: Unsafe, incomplete, invalid, unavailable, timed-out, cancelled, or over-budget runs MUST fail safely without displaying partial output as success or exposing internals.
- **FR-015**: The model/provider boundary MUST remain provider-neutral and backend-only, with routine fake-first verification and no new provider requirement.
- **FR-016**: Sanitized observability MUST distinguish logical runs, model steps, provider attempts/retries/fallbacks, tool proposals/executions, validation outcomes, elapsed time, and stop reason.
- **FR-017**: Server-side credentials, least context, injection resistance, no arbitrary capabilities, no Core writes, bounded sizes, and secret-safe output/logging MUST be enforced.
- **FR-018**: Existing Week 03 gameplay and the complete Week 04 AI Coach behavior and historical evidence MUST remain stable and independently usable.
- **FR-019**: Verification MUST be specification-driven, gated, TDD, fake-first, and limited-live as defined above; evidence MUST be factual and reproducible.

## Acceptance matrix

| ID | Scenario | Required observable outcome |
|---|---|---|
| A1 | Valid completed game, allowed proposal, valid evidence, grounded final | Completed; 2 model steps; 1 tool execution between them; valid plan shown |
| A2 | Invalid/non-terminal initial summary | Safe input rejection; 0 provider attempts; 0 tool calls |
| A3 | Malformed model proposal | Classified stop; 0 tool calls; no raw output exposed |
| A4 | Unknown/forbidden tool | `unknown_tool`; `toolCallCount === 0`; no execution |
| A5 | Allowed tool with invalid/extra/out-of-scope arguments | `invalid_tool_arguments`; 0 tool calls |
| A6 | Tool throws/times out | Safe `tool_failure`; no later model step |
| A7 | Tool returns malformed/inconsistent/oversized output | `invalid_tool_result`; result not sent to model |
| A8 | Eligible transient/provider-unavailable failure then success | Only permitted second attempt; counts remain within step/run/deadline limits |
| A9 | Auth/config/safety/invalid-output/ineligible provider failure | No retry/fallback; safe `provider_failure` |
| A10 | Provider attempts exhaust or deadline expires | No later operation starts; controlled terminal response |
| A11 | Same canonical action proposed without progress | Rejected before duplicate execution; `repeated_action` |
| A12 | Next work would exceed step/tool/provider budget | No over-budget call; corresponding classified stop |
| A13 | Final cites unknown/duplicate/contradictory evidence or unsupported claim/focus | `invalid_final_output`; no success projection |
| A14 | Final appears before validated tool evidence or before second model step | Rejected; cannot complete |
| A15 | Prompt-injection-like text attempts to change tool/policy | Treated as data; allowlist and policy unchanged; unsafe proposal rejected |
| A16 | Restart/cancellation while pending | Active work aborted/ignored; stale result hidden; game remains usable |
| A17 | Routine suite without credential/network | Core success and negative paths reproducible through fakes |
| A18 | Week 03 and Week 04 regressions | Gameplay and `/api/ai/advice` remain unchanged and pass their existing checks |
| A19 | Limited authorized live run | Within live/call/time budgets; sanitized result recorded without secrets |

## Out of scope

- A new application, replacement of the AI Coach, changes to Week 03 rules/Canvas rendering, or rewriting historical W03/W04 artifacts.
- General-purpose autonomy, unrestricted/dynamic tools, unbounded loops, multi-agent/swarm behavior, dynamic planning, self-modification, or model-generated code execution.
- A second Core tool, write actions, automatic game-state/score/life/rule changes, human-approval UI, persistence, database/SQL, RAG/vector storage, arbitrary filesystem/network/browser/shell access, background processing, authentication, deployment, streaming, dashboards, or React/framework migration.
- Additional AI providers, cross-provider expansion, model comparison, fine-tuning, or an observability UI.
- Inferring detailed gameplay events, causes, paddle/ball behavior, trends across games, or player history not present in the one terminal summary.
- Production code, tests, `plan.md`, `tasks.md`, dependency changes, live calls, commits, or pushes during this specification phase.

## Assumptions and deferred contract details

- Week 03 constants remain 32 bricks, 10 points per brick, and 3 starting lives; the existing validated terminal summary remains sufficient for Core.
- The three focus labels are product categories for a bounded model judgment, not deterministic ground truth. A later contract must define semantic support rules precise enough to test without inventing universal performance thresholds.
- The exact tool-result field names, rounding convention, maximum result bytes, short local-tool timeout, final text ceilings, endpoint/public envelope, HTTP mapping, and safe UI wording are deferred to the architecture/plan and contract phase. Each must be fixed before tests and must preserve the behavioral boundaries here.
- Cancellation is required where the existing restart/abort architecture naturally carries it into Week 05; it does not authorize persistent or resumable runs.
- No unresolved product clarification blocks human review of this specification. Any later proposal to add context, a tool, a write action, or relax a limit requires explicit specification review.
