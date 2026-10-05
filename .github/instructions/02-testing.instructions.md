---
description: "Deterministic Week 3 contract and game-rule testing guidance."
applyTo: "**/*"
---

# Testing Instructions

## Focused implementation tests

- Derive Week03 focused tests from docs/GAME_SPEC.md and approved Week04 focused tests from specs/001-brickpulse-ai-coach/spec.md, not from implementation details.
- Test configuration validation and pure game rules without Canvas wherever possible.
- Use explicit states, positions, velocities, and time deltas. Avoid uncontrolled randomness and wall-clock-sensitive assertions.
- Separate JSON/object handling, contract validation, and gameplay meaning.
- Cover a meaningful success case and a relevant rejection or boundary case for each implemented behavior slice.
- Week04 routine tests are fake-first and credential-free. They must not make live provider calls or wait for real deadline durations.
- Runtime validation must precede every provider invocation; structural and semantic invalid GameSummary cases assert zero provider calls. Provider output remains unknown until strict validation succeeds.
- Use deterministic fake timers or injected timing for the shared deadline and retry behavior.

## RED, GREEN, regression

- Write the focused expectation before implementation when applicable.
- Confirm RED fails for the intended missing behavior, not because the test or fixture is broken.
- Implement the smallest coherent change required for GREEN.
- Rerun the focused check and relevant regression checks.
- Do not weaken or rewrite an expectation merely to make current code pass; an approved requirement change is required.

## Formal evaluation boundary

Formal Week 3 evaluations are evaluator-owned and run only after the baseline is frozen. They are not baseline implementation context and must not be used to tune the initial implementation.

Manual Canvas checks may supplement deterministic tests, but they do not replace contract and rule tests. Record only commands and outcomes that were actually run.

Week03 regressions remain required while testing Week04. Any optional Gemini verification is a separately authorized, one-call check after offline checks are green.

## Approved Week05 Training Planner testing

- Follow `specs/002-brickpulse-training-agent/tasks.md` in order: write the approved focused expectation, observe the intended RED when applicable, implement the smallest change, then record GREEN and regressions contemporaneously.
- Week05 routine tests are fake-first, injected-clock/timer based, credential-free, and network-free. Validate initial input, untrusted model proposals, tool arguments/results, and final output before any later action.
- Assert zero provider/tool execution for rejected input or proposals; separately assert agent steps, provider attempts, and tool calls. Cover allowlist, injected context, repeated-action prevention, limits, deadlines, cancellation, retries/fallbacks, and safe terminal envelopes.
- Preserve Week03 gameplay and Week04 Coach tests, including `/api/ai/advice` behavior. Do not make a live provider call for RED/GREEN or routine regression evidence.
