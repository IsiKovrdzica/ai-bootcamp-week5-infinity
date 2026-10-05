# Specification Quality Checklist: BrickPulse Agentic Training Planner

**Purpose**: Independently challenge the Week 05 specification before the PLAN gate

**Created**: 2026-10-05

**Feature**: [spec.md](../spec.md)

## Authority and scope

- [x] The official W05 assignment and reliable-workflows addendum are identified as authority above the reviewed implementation baseline.
- [x] The feature continues the W03/W04 project and does not replace or retroactively rewrite it.
- [x] The absence of repository-local SpecKit tooling is stated; the existing artifact convention is followed without invented commands.
- [x] The current phase authorizes only `spec.md` and this checklist; no plan, tasks, tests, implementation, dependency, live-call, or Git action is implied.
- [x] Historical instruction conflicts are disclosed and deferred to a narrow post-approval authority update.

## Ambiguity and testability challenge

- [x] The user problem, exact goal, trigger, allowed input, result, and completion conditions are explicit.
- [x] Every MUST uses observable language; vague terms such as “safe,” “bounded,” and “grounded” are tied to validation, counts, evidence, or terminal behavior.
- [x] Agent steps, provider attempts, and actual tool calls are distinct and independently countable.
- [x] Rejected proposals are explicitly not counted as tool executions, enabling proof of `toolCallCount === 0`.
- [x] Maximum steps, tool calls, attempts per step, attempts per run, per-call timeout, and total deadline are explicit and mutually coherent.
- [x] Deferred constants are limited to contract/plan details that the official requirements do not fix; each has a required behavioral boundary and must be decided before tests.
- [x] No `[NEEDS CLARIFICATION]` marker or unresolved mandatory product decision remains.

## Agent and tool boundary challenge

- [x] The minimum success path has two model steps and a real validated tool execution between them.
- [x] The application—not the model or frontend—owns allowlisting, validation, execution, state, budgets, and stopping.
- [x] Core has one named, meaningful, deterministic, read-only local tool and no generic execution escape hatch.
- [x] Proposal validation covers parse/shape, phase/kind, allowlist, exact arguments, scope/context, budgets, deadline, and repetition before execution.
- [x] Tool output is treated as untrusted and checked for exact shape, size, ranges, semantics, context, stable evidence IDs, and secret-safe content.
- [x] The repeated-action fingerprint, recording point, definition of progress, and pre-execution stop behavior are specified.
- [x] Tool failure and invalid result cannot silently continue to a later model step.

## Focus-design challenge

- [x] Both designs were evaluated: deterministic tool-assigned focus versus objective metrics with model-selected focus.
- [x] The selected design avoids arbitrary single-game thresholds while preserving meaningful deterministic computation.
- [x] The second model step retains a useful bounded decision rather than merely rewording a tool label.
- [x] Application authority is preserved through allowed focus values, resolved evidence references, semantic agreement, and rejection of unsupported claims.
- [x] Testability is preserved through stable evidence IDs, reproducible metric calculations, and explicit unsupported-final negative paths.

## Reliability and negative-path challenge

- [x] Retry is distinguished from an agent step and cannot restart the run or repeat completed tool work.
- [x] Week 04 retry-versus-fallback eligibility is preserved within per-step and run-wide budgets.
- [x] The shared 30-second deadline limits all attempts, backoff, tool work, validation, and result handling; the 15-second attempt ceiling is capped by remaining time.
- [x] Stop conditions cover invalid input/proposal/tool/arguments/result/final, provider/tool failures, every budget, deadline, repetition, completion, and applicable cancellation.
- [x] Acceptance scenarios cover success, zero-call preflight, forbidden tool, invalid arguments, malformed model output, tool failure/result rejection, eligible and ineligible provider failures, repeat loops, limits/deadline, invalid final output, injection-like data, stale/cancelled work, and W03/W04 regression.
- [x] A partial, refused, unsupported, or invalid result cannot be represented as success.

## Evidence, security, and provider challenge

- [x] Final output is structured, bounded, runtime-validated, and evidence-grounded.
- [x] Every performance/focus/recommendation claim must resolve to authorized input or validated same-run tool evidence.
- [x] Least context and injection resistance are explicit; data cannot redefine policy, tools, budgets, providers, or canonical state.
- [x] Arbitrary filesystem, network, browser, shell, SQL, messaging, code execution, dynamic tools, and Core writes are forbidden.
- [x] Credentials, prompts, raw payloads/errors, stack traces, private data, and chain-of-thought are excluded from frontend, results, logs, and evidence.
- [x] The provider boundary remains backend-only and provider-neutral; no additional provider or scattered SDK logic is assumed.
- [x] Observability distinguishes run, step, attempt/retry/fallback, proposal, execution, validation, elapsed time, and stop reason without unsafe content.
- [x] Routine verification is fake-first and credential-free; live use is explicitly gated, separately authorized, and capped by assignment ceilings.

## Regression and implementation-assumption challenge

- [x] The specification preserves the `/api/ai/advice` contract and Week 04 validation, reliability, frontend, and historical evidence behavior.
- [x] It preserves Week 03 game rules, state ownership, Canvas boundary, and ordinary restart/use after AI failures.
- [x] No production filenames, class structure, validation library, SDK redesign, storage mechanism, dependency, or test implementation is prescribed unnecessarily.
- [x] Necessary product/safety constraints—backend orchestration, one Core tool, provider-neutral boundary, counters, deadlines, and validation layers—are not mistaken for premature implementation detail.
- [x] Out-of-scope items prevent accidental expansion into stretch features or a general agent.

## Requirement-authority audit

- [x] W05 assignment: same project, new separate spec, clear domain goal, meaningful read-only/deterministic tool, allowlist, strict argument and result validation are covered.
- [x] W05 assignment: two model steps with a real tool execution, max steps, total deadline, per-call timeout, bounded retry, call budget, repetition protection, and stop conditions are covered.
- [x] W05 assignment: structured/evidence-based final output, runtime validation, safe UI states, fake-first path, limited live demo, evidence, security, and pair understanding are covered.
- [x] W05 addendum: explicit run state concepts, backend orchestration, provider neutrality, layered/semantic validation, retry/fallback discipline, cancellation where applicable, and sanitized evidence are covered.
- [x] Mandatory requirements are represented by FR-001–FR-019 and A1–A19 with no known omission.

## Readiness

- [x] The specification is implementation-independent enough for stakeholder review and concrete enough to drive the later architecture/contract plan.
- [x] The specification is ready for human review at the SPEC gate.
- [x] Human pair review and approval received; only then may `plan.md` be created.

## Notes

- The unchecked human-approval item is an intentional approval gate, not a specification defect.
- The reviewed baseline proposed tool-assigned focus. This specification deliberately changes that design: the tool produces objective evidence and the model selects a focus that the application validates against that evidence.
- Later Week 05 commits must include exactly: `Co-authored-by: Mateja Miletic <miletic.matejamiletic.mateja@gmail.com>`.
