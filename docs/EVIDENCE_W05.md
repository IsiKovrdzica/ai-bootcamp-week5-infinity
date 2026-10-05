# Week 05 Evidence — BrickPulse Training Planner

**Feature:** `002-brickpulse-training-agent`  
**Pair:** Isidora Prica and Mateja Miletic  
**Status:** Slice 0 in progress; no Week 05 production or test implementation started.  
**Secret boundary:** `.env` and all secret-bearing environment files were not read, searched, printed, or modified.

## Slice 0 — Baseline and repository authority

### T00 — Baseline inventory and no-write audit

| Command | Observed result | Status |
|---|---|---|
| Project-authority `Get-Content -Raw` command from parent workspace, followed by `rg --files` excluding `env` patterns | Failed because the requested project-relative paths are under `ai-bootcamp-week3-infinity`; `rg` identified that project and its `AGENTS.md`. No environment file was targeted. | FAIL — corrected working directory required |
| Project-root `Get-Content -Raw` command for the listed Week05 authorities and `AGENTS.md`, followed by `rg --files` excluding environment patterns | Read the requested authorities and entry instruction. Host output was truncated after 50,028 tokens; later targeted reads covered Slice 0 and the routed instruction modules. `rg` found `AGENTS.md`, `README.md`, and `docs/screenshots/README.md`. | PASS |
| `Get-Content -Raw '.github/00-index.instructions.md'; rg -n -A 18 -B 4 'T00|T01|T02|T03|T04|T05|Slice 0' 'specs/002-brickpulse-training-agent/tasks.md'; rg --files ...; Get-Content -Raw 'package.json'; git status --short; git log -5 --format='%H%n%B%n---'` | Identified Slice 0 task order T00–T04 then G0/T05; package scripts; existing W03/W04 test files; two pre-existing untracked Week05 planning paths (`docs/W05_IMPLEMENTATION_PLAN.md`, `specs/002-brickpulse-training-agent/`); and five existing Week04 commits. | PASS |
| Routed-module `Get-Content -Raw` command for `.github/instructions/01-architecture`, `02-testing`, `03-workflow`, `04-build-and-commands`, and `05-code-review`, plus targeted `quickstart.md` search and untracked-plan diffs | Confirmed the five routed modules. Current architecture/review instructions rejected an agent and second endpoint; workflow was Week04-only. Quickstart requires `npm ci`, eight baseline commands, and three focused Week04 commands. Host output was truncated after 26,882 tokens; Slice 0/task and quickstart portions were observed. | PASS |

### T01 — Authority RED record

Before this Slice 0 edit, `AGENTS.md` limited post-game AI to Week04 and prohibited a second endpoint and agents; `.github/instructions/01-architecture.instructions.md` prohibited a second endpoint and agent; and `.github/instructions/05-code-review.instructions.md` required rejecting agents and a second endpoint. This was the intended authority RED. No production or test code was added.

### T02 — Narrow authority extension

The six approved authority files were updated only for the approved `002` Training Planner exception, fake-first/TDD/evidence/live-gate routing, the exact co-author trailer rule, and the secret boundary. `04-build-and-commands.instructions.md` remains unchanged.

### T03 — Continuous evidence initialization

This file and `docs/AI_USAGE_LOG_W05.md` were created before dependency restoration and baseline verification. No baseline test, build, smoke, or dependency command has been run yet at this entry.

### T03 — Dependency restoration and baseline verification

| Command | Observed result | Status |
|---|---|---|
| `npm ci` | Exit code `0`; no output was emitted. It did not leave usable local executables: the immediately following `npm test` could not find `vitest`. | FAIL — restoration did not establish runnable dependencies |
| `npm test` | Exit code `1`; `vitest` was not recognized. | FAIL — dependency executable unavailable |
| `npm run typecheck` | Exit code `1`; `tsc` was not recognized. | FAIL — dependency executable unavailable |
| `npm run build` | Exit code `1`; `tsc` was not recognized. | FAIL — dependency executable unavailable |
| `npm run smoke` | Exit code `1`; Node could not resolve `node_modules/playwright/index.js`. | FAIL — dependency package unavailable |
| `npm run check:frontend-boundary` | Exit code `1`; `dist` was absent because the build did not run. | FAIL — prerequisite build unavailable |
| `npm test -- src/config.test.ts src/game.test.ts src/input.test.ts` | Exit code `1`; `vitest` was not recognized. | FAIL — dependency executable unavailable |
| `npm test -- evals/week3-formal.test.ts` | Exit code `1`; `vitest` was not recognized. | FAIL — dependency executable unavailable |
| `npm test -- evals/week3-holdout.test.ts` | Exit code `1`; `vitest` was not recognized. | FAIL — dependency executable unavailable |
| `npm test -- src/ai/game-summary.test.ts src/ai/api-client.test.ts src/ai/coach-controller.test.ts src/ai/frontend-boundary.test.ts` | Exit code `1`; `vitest` was not recognized. | FAIL — dependency executable unavailable |
| `npm test -- server/ai/validation.test.ts server/ai/advice-service.test.ts server/ai/fake-provider.test.ts server/ai/gemini-provider.test.ts server/ai/genai-compat.test.ts server/ai/config.test.ts server/ai/prompt.test.ts server/ai/usage-log.test.ts` | Exit code `1`; `vitest` was not recognized. | FAIL — dependency executable unavailable |
| `npm test -- server/app.test.ts server/composition.test.ts server/integration.test.ts` | Exit code `1`; `vitest` was not recognized. | FAIL — dependency executable unavailable |

No test count is available because Vitest did not start. No live/provider command was run.

### T04 — Baseline preservation review

| Command | Observed result | Status |
|---|---|---|
| `git diff -- AGENTS.md .github/00-index.instructions.md .github/instructions/01-architecture.instructions.md .github/instructions/02-testing.instructions.md .github/instructions/03-workflow.instructions.md .github/instructions/04-build-and-commands.instructions.md .github/instructions/05-code-review.instructions.md docs/EVIDENCE_W05.md docs/AI_USAGE_LOG_W05.md` | Reviewed only the intended six authority-file modifications. `04-build-and-commands.instructions.md` had no diff. New untracked evidence files do not appear in ordinary `git diff`. Git emitted LF-to-CRLF warnings for six edited text files. | PASS — narrow authority scope |
| `git diff --check` | Exit code `0`; no whitespace error output. Git emitted only LF-to-CRLF warnings. | PASS |
| `git diff --stat` | Exit code `0`; tracked authority diff: 6 files changed, 41 insertions, 12 deletions. New untracked evidence files are excluded from this command's output. | PASS |
| `git status --short` | Six modified authority files; new `docs/AI_USAGE_LOG_W05.md` and `docs/EVIDENCE_W05.md`; pre-existing untracked `docs/W05_IMPLEMENTATION_PLAN.md` and `specs/002-brickpulse-training-agent/`. | PASS — explained working tree |
| `git diff --name-only` | Listed only the six intended authority files. | PASS |
| `rg -n 'POST /api/ai/advice|createApp|/api/ai/advice' server/app.ts; rg -n 'updateGame|requestAnimationFrame|Coach|advice' src/main.ts; git diff -- docs/GAME_SPEC.md specs/001-brickpulse-ai-coach src/game.ts src/main.ts server/app.ts` | Confirmed the existing advice route and Coach/game animation references are present; the final targeted diff emitted no source/spec changes. | PASS — no Week03 gameplay or Week04 API/source modification |

Manual review conclusion: the diff adds no production code, test code, endpoint implementation, tool, orchestrator, frontend behavior, provider call, secret, or environment-file access. Baseline verification is blocked by unusable restored dependencies, so no later slice may begin.

## Slice 0 — Dependency/baseline investigation continuation

### Dependency diagnosis and correction

| Command | Observed result | Status |
|---|---|---|
| `node --version; npm --version; Test-Path 'node_modules'; Test-Path 'node_modules/.bin/vitest'; Test-Path 'node_modules/.bin/tsc'; Test-Path 'node_modules/vitest'; Test-Path 'node_modules/typescript'; Test-Path 'node_modules/playwright'; npm config get omit; npm config get include; npm config get production; npm ci --dry-run` | Node `v24.20.0`; npm `11.19.0`; no `node_modules` or requested package/tool paths existed. `omit`/`include` were empty and `production` was `null`, so devDependencies were not omitted. Dry-run resolved the lockfile and listed 94 packages. | PASS — lockfile resolution and config diagnosis |
| `Test-Path 'node_modules'; Test-Path 'node_modules/.bin/vitest'; Test-Path 'node_modules/.bin/tsc'; Test-Path 'node_modules/vitest'; Test-Path 'node_modules/typescript'; Test-Path 'node_modules/playwright'` | After the dry run, all paths still returned `False`. | PASS — dry-run made no installation |
| `npm ci` (sandboxed retry) | Ended at the 30-second execution boundary with no output and without a stable install tree. | FAIL — sandboxed installation did not complete |
| `npm config get bin-links; npm config get ignore-scripts; npm config get install-links; npm config get global-style` | `bin-links=true`, `ignore-scripts=false`, `install-links=false`, `global-style=false`. Later package-directory checks were transient/absent, confirming no stable completed install. | PASS — binary-link configuration is not the cause |
| `Get-Process npm,node -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,StartTime; Test-Path 'node_modules'; Test-Path 'node_modules/.bin'; Test-Path 'node_modules/vitest/package.json'; Test-Path 'node_modules/typescript/package.json'; Test-Path 'node_modules/playwright/package.json'; Get-ChildItem 'node_modules' -Force -ErrorAction SilentlyContinue | Measure-Object` | No npm process was running; all requested installation paths were absent. | PASS — confirms incomplete sandboxed restoration |
| `npm ci` (approved elevated local execution) | Completed: 94 packages added and 95 audited in 4 seconds. npm reported two moderate audit findings and three packages with install scripts not covered by `allowScripts`; no remediation or configuration change was made. | PASS — dependencies restored |
| `Test-Path 'node_modules'; Test-Path 'node_modules/.bin/vitest'; Test-Path 'node_modules/.bin/tsc'; Test-Path 'node_modules/vitest'; Test-Path 'node_modules/typescript'; Test-Path 'node_modules/playwright'; Test-Path 'node_modules/.bin/vitest.cmd'; Test-Path 'node_modules/.bin/tsc.cmd'; npm test -- --version; npx tsc --version` | All eight requested package/tool paths and Windows command shims returned `True`. `tsc` reported `Version 5.9.3`. The Vitest probe reached the local tool but sandbox filesystem access prevented Vite config loading, so remaining checks used the approved elevated local execution context. | PASS — dependency restoration verified |
| `npx playwright install chromium` | Restored local Playwright Chromium, Chromium headless shell, FFmpeg, and Winldd test-runtime binaries. No repository file or dependency version changed. | PASS — minimum smoke-runtime correction |

Root cause: the original `npm ci` command did not complete an installation in the sandboxed execution context, leaving no `node_modules`; this was not caused by `.env`, devDependency omission, npm binary-link configuration, or a package/lockfile inconsistency. After npm dependencies were restored, the smoke-specific remaining issue was the separately absent local Playwright browser executable.

### Baseline rerun after successful restoration

| Command | Observed result | Status |
|---|---|---|
| `npm test` | 22 test files passed; 259 tests passed. | PASS |
| `npm run typecheck` | Completed `tsc --noEmit && tsc -p tsconfig.server.json` without errors. | PASS |
| `npm run build` | Passed; Vite built 11 modules. Output: `dist/index.html` 1.41 kB, CSS 1.32 kB, JS 9.72 kB. | PASS |
| `npm run smoke` (first rerun) | Failed because Playwright’s Chromium headless-shell executable was missing; smoke checks did not run. | FAIL — corrected by local browser-runtime restoration |
| `npm run check:frontend-boundary` | `Frontend bundle boundary passed.` | PASS |
| `npm test -- src/config.test.ts src/game.test.ts src/input.test.ts` | 3 test files passed; 42 tests passed. | PASS |
| `npm test -- evals/week3-formal.test.ts` | 1 test file passed; 5 tests passed. | PASS |
| `npm test -- evals/week3-holdout.test.ts` | 1 test file passed; 1 test passed. | PASS |
| `npm test -- src/ai/game-summary.test.ts src/ai/api-client.test.ts src/ai/coach-controller.test.ts src/ai/frontend-boundary.test.ts` | 4 test files passed; 15 tests passed. | PASS |
| `npm test -- server/ai/validation.test.ts server/ai/advice-service.test.ts server/ai/fake-provider.test.ts server/ai/gemini-provider.test.ts server/ai/genai-compat.test.ts server/ai/config.test.ts server/ai/prompt.test.ts server/ai/usage-log.test.ts` | 8 test files passed; 155 tests passed. | PASS |
| `npm test -- server/app.test.ts server/composition.test.ts server/integration.test.ts` | 3 test files passed; 32 tests passed. | PASS |
| `npm run smoke` (after `npx playwright install chromium`) | All 6 smoke checks passed: page load; Canvas/READY contract; Space start; ArrowRight paddle movement; explicit/safe AI Coach and restart clear; no uncaught browser errors. | PASS — 6/6 |

No `.env` path was opened, read, searched, printed, modified, moved, deleted, or recreated during this investigation. No Gemini/provider request occurred.

### T05 — Slice 0 commit verification

| Command | Observed result | Status |
|---|---|---|
| `git commit -m "docs: authorize bounded training planner implementation" -m "Co-authored-by: Mateja Miletic <miletic.matejamiletic.mateja@gmail.com>"` | Created commit `accb1d83163ce1fd49f3c8286efd6e2158d1eda7` with 19 approved Slice 0 files. | PASS |
| `git log -1 --format='%H%n%B'; git show -s --format='%H%n%(trailers:key=Co-authored-by,valueonly)' HEAD` | Verified commit hash `accb1d83163ce1fd49f3c8286efd6e2158d1eda7`; commit body contains exactly `Co-authored-by: Mateja Miletic <miletic.matejamiletic.mateja@gmail.com>` once, and Git trailer parsing returned `Mateja Miletic <miletic.matejamiletic.mateja@gmail.com>`. | PASS |

This factual post-commit evidence append intentionally leaves `docs/EVIDENCE_W05.md` modified. No additional commit was created. Slice 1 remains unstarted.

## Slice 1 — Contracts and handwritten validators

### T10–T16 factual record

- T10 inspection: retained the browser-safe `src/ai/contracts.ts` ownership, the adjacent server `ValidationResult`/exact-key handwritten-validator convention, and the unchanged Week04 `AiAdviceProvider` boundary.
- T11–T13 RED: `npm test -- src/ai/training-contracts.test.ts server/ai/training-validation.test.ts` failed because `training-contracts.js` and `training-validation.js` did not exist; Vitest collected no tests. This was the intended missing-module RED.
- T14 implementation: added browser-safe training domains/public plan types, adjacent provider-neutral server contract types/limits, and handwritten initial-summary, closed-proposal/argument, and grounded-final validation. No tool execution, registry, orchestrator, endpoint, adapter, or frontend behavior was added.
- Focused GREEN: the same command passed 2 files / 4 tests.
- T15 regression: `npm test -- server/ai/validation.test.ts src/ai/frontend-boundary.test.ts` passed 2 files / 35 tests. `npm run typecheck` passed after one internal type-only correction to the already runtime-validated evidence-reference predicate.
- T16 review: inspected the Slice 1 boundary: exact-key guards, 8 KiB proposal ceiling, 1–64 ASCII context ID, closed tool/action/focus/confidence domains, no model game facts, and no server imports in the browser contract. Week03/Week04 source and `/api/ai/advice` were not modified; no secret or provider operation occurred.

### G1 human-review correction

- Added review-requested coverage for malformed/oversized/wrong-phase/refusal proposals; unknown, missing, extra, fact-bearing, invalid-context, and instruction-bearing arguments; ordered final evidence union; multiple supported model-selected focuses; Unicode code-point plan bounds; byte/exact-key checks; and bounded public run metadata projection.
- Genuine RED: `npm test -- server/ai/training-validation.test.ts` produced 3 failures: untrusted `final` shape accepted in `produce_final`; extraneous top-level evidence accepted; public validators absent. Corrected with exact nested final shape parsing, exact ordered unique union equality, and handwritten public plan/run validators.
- GREEN/regression: `npm test -- src/ai/training-contracts.test.ts server/ai/training-validation.test.ts server/ai/validation.test.ts src/ai/frontend-boundary.test.ts` passed 4 files / 40 tests; `npm run typecheck` passed; `git diff --check` passed with LF-to-CRLF warnings only.
- Review conclusion: no heuristic focus selection, no backend import in browser contract, no raw diagnostics/secrets, no W03/W04 source change, and no `.env` or provider access.

### Final G1 renderer/preflight correction

- Coverage completion: explicit `PLAYING` and semantically nonterminal `GAME_OVER` summaries were added and immediately rejected by the existing handwritten initial-summary validator.
- Executable zero-call proof is explicitly deferred: Slice 1 contains pure contracts/validators and no legitimate provider/tool invocation seam. Adding one would prematurely implement later orchestration. `T41 — Invalid-proposal and preflight RED tests` owns the counting provider/tool preflight proof after the orchestrator seam exists.
- Focused RED: `npm test -- server/ai/training-validation.test.ts` passed 3 tests and failed 2 because arbitrary public prose was accepted and `renderPublicTrainingPlan` did not exist.
- Implementation: added fixed application-owned factual templates and `renderPublicTrainingPlan`, which first validates the normalized final proposal, then renders only from its supported focus/action/references and the current validated `PerformanceAnalysisResult`. `validatePublicTrainingPlan` now requires exact template equality as well as existing code-point and 2 KiB limits.
- Templates: summary `The completed game supports a[n] <focus> training focus.`; recommendations are fixed per validated action/focus; findings are `<factual metric label>: <canonical validated evidence value>.` No quality judgment, causal claim, or focus selector is present.
- GREEN: focused Slice 1 command passed 2 files / 6 tests; W04 validation/frontend-boundary regression passed 2 files / 35 tests; typecheck passed; `git diff --check` passed with LF-to-CRLF warnings only.

### Final nested-proposal validation correction

- Focused RED: seven exact-key `final` proposals with respectively numeric focus, non-array summary IDs, malformed recommendation, non-array recommendation IDs, non-array top-level IDs, invalid confidence, or `completed: false` were all incorrectly returned as `ok: true` by the shallow produce-final branch.
- Correction: a handwritten structural parser now validates every nested field and closed domain, then constructs a fresh `NormalizedModelProposal`. Current-run evidence availability, ordered-union equality, and focus-support semantics remain in `validateTrainingFinalProposal`.
- Code-point evidence clarification: the public-plan test rejects both 200-emoji and 201-emoji summaries because neither equals the fixed application template; the 201 case also exceeds the 200-code-point ceiling. No accepted 200-code-point boundary result is claimed.

## Deferred gates

- Slice 0 human approval/commit gate (G0): approved and completed.
- Slice 0 commit: `accb1d83163ce1fd49f3c8286efd6e2158d1eda7`.
- Slice 1 implementation/review (G1): approved and ready for commit.
- Executable invalid-input zero provider/tool call proof remains deferred to T41.
- No live provider verification was attempted.
