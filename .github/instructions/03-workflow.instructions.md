---
description: "BrickPulse specification-first, test-first, and evidence workflow."
applyTo: "**/*"
---

# Workflow Instructions

## Required sequence

```text
specification
  → focused implementation expectation
  → RED when applicable
  → smallest implementation
  → GREEN
  → relevant regression
  → frozen baseline
  → evaluator-owned formal evaluation
  → observed signal
  → one hypothesis
  → one controlled change
  → same formal evaluation before/after
  → independently held evaluation
  → evidence and review
```

## Before editing

1. Read `AGENTS.md` and route through `.github/00-index.instructions.md`.
2. For Week03 work, read only context authorized for the current stage by docs/CONTEXT_MANIFEST.md. For the approved Week04 AI Coach, use its SpecKit artifacts and tasks.md dependency order.
3. Confirm the allowed paths and current scope.
4. State assumptions or contradictions before changing files.

## During work

- Make one small, coherent behavior change at a time.
- Keep tests with their behavior change and preserve unrelated work.
- Do not broaden scope to solve an unrelated issue.
- Preserve the completed baseline before formal evaluation or correction.
- For a correction, record the signal, hypothesis, frozen variables, and one controlled change.
- Log meaningful AI assistance without private reasoning.
- For the approved Week04 feature, finish each task phase with its smallest relevant verification and focused diff inspection. Respect RED/GREEN ordering, dependency approval gates, and the separate offline/live verification gates in tasks.md.
- For the approved Week05 Training Planner, follow `specs/002-brickpulse-training-agent/tasks.md` exactly. Maintain factual `docs/EVIDENCE_W05.md` and `docs/AI_USAGE_LOG_W05.md` continuously; record only commands actually run, observed results, review facts, pair decisions, and post-approval commit metadata.
- Never read or alter `.env` or another secret-bearing environment file. Routine Week05 work is offline; a provider call requires the explicit later live gate in the approved tasks.
- Every Week05 commit requires exactly one `Co-authored-by: Mateja Miletic <miletic.matejamiletic.mateja@gmail.com>` trailer. Verify the trailer after committing and record the commit hash in Week05 evidence. Do not commit or begin the next slice before its human gate.

## Evidence and external actions

- Record actual commands, outputs, limitations, and skipped checks.
- Never fabricate results or generated evidence.
- Do not commit, push, deploy, publish, or contact external services unless separately requested.
- Stop on contradictory requirements, missing material decisions, out-of-scope paths, or Week04 behavior outside the approved AI Coach specification. Stop before a dependency install without its required approval and before any live provider call without the required offline gate and explicit authorization.
