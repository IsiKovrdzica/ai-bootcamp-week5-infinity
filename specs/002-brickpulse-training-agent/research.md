# Research and Design Decisions: BrickPulse Agentic Training Planner

## Authority consistency result

The official Week 05 assignment, its reliable-stateful-workflows addendum, the approved feature specification, and the repository baseline are consistent.

- Official numeric examples are explicitly adaptable; the approved `3/2/2/6/15s/30s` limits are valid small project-specific choices.
- The official documents require deterministic/read-only tool value, evidence grounding, and application validation. They do not require the tool to choose a semantic focus.
- The approved spec's model-selected focus is therefore compliant and controlling.
- The pre-SpecKit `docs/W05_IMPLEMENTATION_PLAN.md` proposal for a tool-assigned focus and threshold is superseded. No threshold or deterministic focus classifier will be implemented.
- The spec header still says “Draft for human review,” but the current explicit user statement and completed checklist record human approval. The plan does not silently edit the approved spec.

## Decision 1: Adjacent provider interface

**Decision:** Add `AgentModelProvider`; leave `AiAdviceProvider` unchanged.

**Why:** Week 04 accepts a validated `GameSummary` and returns one unknown advice value. Week 05 needs phase-aware structured proposals, bounded evidence context, per-step routing, and usage metadata. Expanding the old interface would risk changing `/api/ai/advice` behavior and its established tests.

**Rejected:** Make `AiAdviceProvider` generic or place the loop inside `GeminiAiAdviceProvider`. Both broaden Week 04 and leak orchestration into the adapter.

## Decision 2: One explicit tool registry

**Decision:** The Core registry is a closed `ReadonlyMap`/object with one descriptor and one typed binding for `analyze_game_performance`. Lookup is exact and case-sensitive. The public executor accepts only a validated registry entry, never an arbitrary function, URL, path, or command.

**Why:** This gives a testable authorization boundary and ensures unknown names have zero actual executions.

## Decision 3: Objective tool output only

**Decision:** Compute exact game facts, completion percentage, and time-normalized brick rate with stable evidence IDs. Do not compute focus, quality labels, causes, or advice.

**Why:** The single terminal summary contains no approved population baseline, player history, or event trace. A “slow/fast” threshold would be invented product policy. Arithmetic normalization and stable evidence still add genuine deterministic value.

## Decision 4: Model choice plus deterministic semantic validation

**Decision:** The model selects `survival`, `efficiency`, or `consistency`, an application-owned action enum, and evidence IDs. The model does not author unrestricted factual prose. The application validates closed support predicates and renders bounded display text from evidence.

**Why:** This preserves meaningful model judgment without asking handwritten code to choose the focus. It also makes unsupported claims rejectable with ordinary deterministic tests.

The rules answer “is this dimension observable and is this action supported?”, not “is this performance objectively poor?”:

- survival is available when at least one life was lost;
- efficiency is available when a finite observed brick rate exists;
- consistency is available when a completed clear can be repeated.

Multiple focuses can be valid. No rule selects one, compares the player to others, or embeds a universal threshold.

**Rejected:** Keyword scanning arbitrary prose. It is brittle and could neither prove full semantic support nor reliably exclude invented causes.

## Decision 5: Counter semantics

**Decision:** Distinguish logical steps, transport attempts, same-primary retries, fixed-fallback attempts, structurally recognized tool proposals, actual tool invocations, and validated tool results. Increment each synchronously at the boundary defined in `data-model.md`.

**Why:** A malformed response, forbidden proposal, invoked-but-invalid tool, retry, and successful result are materially different events. One overloaded `callCount` cannot prove the required safety properties.

## Decision 6: Retry and fallback ownership

**Decision:** A Week 05 routing helper/orchestrator owns at most two attempts for each logical step and six attempts per run. Each `AgentModelProvider.generateStep` adapter invocation is one transport attempt; Gemini SDK retries remain `attempts: 1`.

Eligibility remains exactly Week 04:

- network/connection, `408`, and `429`: one same-primary retry;
- normalized plain provider-unavailable `404`, `500`, `502`, or `503`: one attempt on the fixed capability-tested Gemini fallback;
- configuration/unsupported-model `404`, other `4xx`, auth, configuration, safety/refusal, cancellation, malformed/invalid structured output, validation, and programming failures: terminal.

A second attempt repeats only the identical current `ModelStepRequest`. It does not increment `stepCount`, reconstruct the run, reset the deadline, or re-execute tool work. There is never both a retry and fallback for one step.

## Decision 7: Deadline composition

**Decision:** The run has one absolute monotonic deadline. Every provider attempt uses `min(15_000ms, remainingRunMs)` and a fresh attempt abort controller linked to the run/request signal. The 250ms Week 04 retry delay is reused only if it fits within remaining time. Tool work is raced against 100ms and the remaining run time.

No operation starts when its relevant count is exhausted or `remainingRunMs <= 0`. Late results are ignored after the state becomes terminal.

## Decision 8: Repetition and progress

**Decision:** Fingerprint the canonical validated action as:

```text
analyze_game_performance\n{"gameContextId":"<id>"}\ncontextVersion=1
```

Record it immediately before invocation. Progress is only (a) committing a newly validated tool result, advancing `progressVersion` from 0 to 1, or (b) accepting a valid final plan, advancing it to 2. A proposal whose fingerprint already exists and whose execution cannot advance beyond the current evidence is `repeated_action` before invocation. Formatting changes cannot change the canonical fingerprint; extra fields fail argument validation first.

## Decision 9: Tool result ceiling and timeout

**Decision:** 2 KiB serialized UTF-8 and 100ms.

**Why:** Six fixed evidence records and scalar metrics serialize far below 2 KiB. The ceiling catches accidental/internal data exposure without approaching a generic payload. The tool is constant-time local arithmetic; 100ms is generous for normal execution and small enough to classify pathological behavior. The timeout guard discards late output; it is not a claim that JavaScript can forcibly preempt arbitrary synchronous code.

## Decision 10: HTTP contract

**Decision:** Add only `POST /api/ai/training-plan`.

- `200`: completed, validated plan.
- `400`: malformed/oversized JSON or invalid/nonterminal `GameSummary`; no run.
- `422`: application-controlled rejection (`invalid_model_proposal`, unknown/invalid/repeated action, limits, invalid final).
- `503`: provider/tool/result/deadline/cancellation failure.
- Existing application-owned `404` and `405` behavior remains for wrong path/method.

Safe stop reasons and bounded counts may be public because they are closed application enums, not raw diagnostics.

## Decision 11: Frontend integration

**Decision:** Add a sibling transport/controller/view for CREATE TRAINING PLAN. Reuse the Coach controller's session/request-ID and abort pattern; do not merge the two features.

The planner is hidden outside terminal states, pending synchronously on click, ignores duplicate clicks, clears and aborts on restart, and ignores results whose game-session or request ID is stale. ASK AI COACH remains independently usable.

## Decision 12: Handwritten validation and no dependency expansion

**Decision:** Follow existing exact-key helpers and discriminated validation results. Add no validation framework, server framework, agent framework, state-machine library, logging framework, or provider.

## Decision 13: Observability

**Decision:** Emit sanitized events to an injected sink at run start/end, step start, provider attempt settle, proposal validation, tool invocation/result validation, and final validation. Allowed fields are IDs, closed categories, bounded counts, safe provider/model identifiers, integer latency, and safe token counts.

Never log summary payloads, arguments, evidence values/findings, prompts, raw responses/errors, environment data, stack traces, secrets, personal data, or hidden reasoning.

## Decision 14: Live verification

**Decision:** Routine and evaluation paths remain fake-only. After all approval/offline/regression/security/evidence gates, use a dedicated explicit script with one sanitized terminal fixture. Default budget is one run; assignment ceilings of 15 development and 3 demo runs are never targets. Primary and fallback capability for the Week 05 schema must be checked deliberately; Week 04 advice capability evidence is insufficient.
