# Week 05 Development Quickstart (Planned)

This is a future execution and evidence checklist. No command below was run as part of the PLAN gate, and no result is claimed.

> Historical status: this checklist records the pre-implementation plan and remains intentionally unchanged below. Week05 was subsequently implemented and handed off. For actual commands and results, see [`docs/EVIDENCE_W05.md`](../../docs/EVIDENCE_W05.md), [`docs/AGENT_EVALS_W05.md`](../../docs/AGENT_EVALS_W05.md), and [`docs/AI_USAGE_LOG_W05.md`](../../docs/AI_USAGE_LOG_W05.md).

## Prerequisites and gates

- Human-pair approval of the approved spec, this plan/contracts, and future `tasks.md`.
- Node.js 20+ and npm.
- Exact lockfile dependencies restored only in the authorized execution phase with `npm ci`.
- No Gemini credential or network access for routine tests, evaluation, typecheck, build, smoke, or boundary checks.
- The six narrow authority files updated and reviewed before production/test implementation.

## Establish the historical baseline

Run and record actual outcomes before Week 05 implementation:

```powershell
npm test
npm run typecheck
npm run build
npm run smoke
npm run check:frontend-boundary
npm test -- src/config.test.ts src/game.test.ts src/input.test.ts
npm test -- evals/week3-formal.test.ts
npm test -- evals/week3-holdout.test.ts
```

Also run focused existing Week 04 files using the established `npm test -- <files>` form:

```powershell
npm test -- src/ai/game-summary.test.ts src/ai/api-client.test.ts src/ai/coach-controller.test.ts src/ai/frontend-boundary.test.ts
npm test -- server/ai/validation.test.ts server/ai/advice-service.test.ts server/ai/fake-provider.test.ts server/ai/gemini-provider.test.ts server/ai/genai-compat.test.ts server/ai/config.test.ts server/ai/prompt.test.ts server/ai/usage-log.test.ts
npm test -- server/app.test.ts server/composition.test.ts server/integration.test.ts
```

No lint, format, or coverage command is established; report those as `NOT ESTABLISHED`, not as passing.

## TDD loop for every task

```text
write one approved expectation
-> run the smallest focused Vitest command
-> confirm meaningful RED
-> record command and observed reason
-> implement the smallest coherent behavior
-> rerun focused command to GREEN
-> run relevant W03/W04/W05 regressions
-> inspect diff and security boundaries
-> update factual W05 evidence
-> pair review
-> commit with exact co-author trailer
```

Required trailer on every later Week 05 commit:

```text
Co-authored-by: Mateja Miletic <miletic.matejamiletic.mateja@gmail.com>
```

## Planned full offline gate

After implementation, run the complete established checks plus the discovered Week 05 tests/evals. Do not invent a package script unless later tasks explicitly approve one.

```powershell
npm test
npm run typecheck
npm run build
npm run smoke
npm run check:frontend-boundary
npm test -- src/config.test.ts src/game.test.ts src/input.test.ts
npm test -- evals/week3-formal.test.ts
npm test -- evals/week3-holdout.test.ts
```

The future evidence must record exact test file/count output, command exit status, failures/skips, working tree state, and limitations. A build does not replace tests; smoke does not replace contract/eval coverage.

## Planned manual acceptance

1. Complete a game as `WON`; confirm ASK AI COACH and CREATE TRAINING PLAN are both visible and neither auto-runs.
2. Use a stubbed/fake planner success; observe pending, one completed plan, focus, recommendation, and evidence.
3. Confirm the Coach still works independently.
4. Exercise a stubbed safe planner failure; confirm no partial plan/raw details appear.
5. Start a pending planner request and restart; confirm abort/clear/stale-result protection and usable gameplay.
6. Repeat terminal exposure for `GAME_OVER`.
7. Inspect the built frontend for SDK, secret, model/config, prompt, and `server/` identifiers.

## Evidence capture

For each slice add observed facts to the future Week 05 artifacts:

- `docs/AGENT_EVALS_W05.md`
- `docs/EVIDENCE_W05.md`
- `docs/AI_USAGE_LOG_W05.md`

Capture phase, purpose, pair decision, test name, exact RED/GREEN/regression commands, actual output summary, manual diff/security review, sanitized run/step/attempt/tool counts, stop reason, commit, and next gate. Never copy keys, `.env` values, summary payloads, full prompts/responses, raw errors, stacks, private data, or chain-of-thought.

## Explicit live-provider gate

Do not run existing `verify:gemini` commands as proof of Week 05; they verify the Week 04 advice schema. A later approved Week 05 script must be offline-tested first and remain separate from routine commands.

Before one live run:

- every fake Core/eval scenario is green;
- full W03/W04 regressions, typecheck, build, smoke, and boundary scan are green;
- primary and fixed fallback request shapes/capability for both Week 05 phases are verified as planned;
- deadline, abort, one-SDK-attempt, call budgets, and sanitized logging are proven offline;
- diff/security/evidence review is complete;
- the pair explicitly approves one non-private fixture and the call budget.

Default: one live run, expected normal budget two model attempts and one local tool call. Stop after PASS or one classified failure. Never exceed the assignment ceilings of 15 development runs or 3 final-demo runs. Record only safe model category, date, elapsed time, counts, validation result, and stop reason.

## Git handoff checks

Before every future commit and at each gate:

```powershell
git diff --check
git diff --stat
git status --short
```

Inspect the actual diff as well. Do not commit generated build output, credentials, environment files, unrelated edits, or fabricated evidence.
