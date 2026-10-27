# BrickPulse

BrickPulse is a small Breakout-inspired browser game rendered on one HTML Canvas. The game contains one paddle, one ball, a fixed 4x8 brick grid, one level, a score, and three lives. Its Week03 scope and required behavior are defined in [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md).

## Setup and execution

```bash
npm install
```

For Week03 browser play only:

```bash
npm run dev -- --host 127.0.0.1
```

For the Week04 AI Coach and Week05 Training Planner with the TypeScript backend, configure the environment below and run:

```bash
npm run dev:all
```

`npm run dev:server` starts only the backend. The browser controls are Left Arrow/Right Arrow or `A`/`D`; Space starts a `READY` game and restarts a terminal state.

For the Week08 production-serving path, run `npm run build`, then `npm run start:server`. It serves the built frontend and API from one Node server with the configured CSP and security headers. `npm run preview` remains a Vite frontend preview; it is not the Week08 production security server.

### Environment

Copy [`.env.example`](.env.example) to `.env` and supply backend-only values:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
```

`GEMINI_API_KEY` is never sent to the browser. `GEMINI_MODEL` selects the primary model. The fallback is not configurable through the environment: it is the fixed backend-only `gemini-3.5-flash-lite` model.

## Week04: Post-Game AI Coach

The optional AI Coach is available only after `WON` or `GAME_OVER`. On an explicit player request, the browser sends the completed-game summary to `POST /api/ai/advice`; the TypeScript backend owns provider access, validation, credentials, and model selection. AI work is never part of the frame-by-frame game loop.

Gemini reliability is deliberately bounded:

- Network/connection failures, 408, and 429 receive one same-primary retry.
- A plain provider 404 (primary-model/resource unavailable), 500, 502, and 503 receive one fixed `gemini-3.5-flash-lite` fallback attempt.
- An explicitly classified configuration/unsupported-model 404 remains terminal; this does not make generic 4xx fallback-eligible.
- All attempts share one 15-second application deadline, with at most two application-level provider calls.
- 400, 401, 403, other 5xx, and auth, configuration, safety, cancellation, malformed-output, and application-validation failures are terminal.
- Gemini SDK internal retries are disabled with `retryOptions.attempts = 1`.

## Week05: Bounded Training Planner

After a `WON` or `GAME_OVER` result, the player can explicitly select **CREATE TRAINING PLAN**. The browser sends the same validated terminal game summary to `POST /api/ai/training-plan`; it never owns provider selection, prompts, tools, retries, or run budgets.

The backend owns one bounded workflow: it validates the summary, accepts only a proposal for the allowlisted local read-only `analyze_game_performance` tool, validates the tool result, then validates a later structured plan before returning it. A completed plan contains a summary, one focus, one next-game recommendation, and evidence references from that run. Invalid input, proposals, tool results, provider failures, deadlines, and stale browser responses resolve to safe non-partial states.

The run is capped at three model steps, two tool calls, two provider attempts per step, six provider attempts per run, 15 seconds per provider attempt, and 30 seconds total. Routine verification is fake-first and credential-free. The separately gated live harness is explicit-only:

```bash
npm run verify:training:live
```

It is not part of `npm test`, build, smoke, development, or startup commands. Its completed limited-live result is recorded in [`docs/EVIDENCE_W05.md`](docs/EVIDENCE_W05.md).

## Week08: Secure the Arcade

Week08 hardens the existing Week03 game, Week04 AI Coach, and Week05 Training Planner without changing the game loop or adding new provider, tool, identity, or persistence features.

### Backend and AI security — Mateja

- Process-local planner admission allows two active executions and five successful admissions per rolling 60 seconds. Denied requests start neither provider nor tool work.
- Provider and tool operations are tracked independently; a lease releases only after underlying work drains, including timeout, cancellation, and late-settlement paths.
- The only executable planner tool is the read-only `analyze_game_performance` allowlist entry. Model proposals, exact context-bound arguments, tool results, and final plans are validated before use.
- Planner work remains bounded to three logical steps, two attempts per step, six provider attempts per run, and two tool calls per run.
- Closed server-only security events exclude raw untrusted diagnostic text, and synthetic containment tests cover safe error/event boundaries.

### HTTP, browser, and platform security — Isidora

- HTTP validation runs before planner execution, with a 16 KiB request-body limit and HTTP 413 for oversized bodies.
- Rate or concurrency admission denial returns a closed HTTP 429 response. Request-disconnect signals propagate to the planner without making remote-cancellation or billing claims.
- Coach and Planner responses render as text only; browser checks cover hostile content and game-state input remains untrusted, read-only recommendation data.
- The production Node handler applies CSP plus `nosniff`, referrer, framing, and permissions-policy headers.
- CORS/CSRF applicability is assessed for the current same-origin, unauthenticated demo; dependency remediation and audits are recorded in the W08 evidence.

Shared W08-033–040 work completed the public API decisions, T00 normal-flow and T17 A/B/C acceptance evidence, browser/CSP verification, final evidence, and handoff. W08-001–040 are complete, and the final shared evidence was accepted by Mateja Miletic and Isidora Prica on 2026-10-27 as documented in the evidence record. This is evidence acceptance, not a GitHub PR approval, remote merge, or deployment approval.

Week08 verification used deterministic fake providers only: no live Gemini request or real credential was used. Admission is per Node process rather than distributed; aborting a local request does not guarantee a remote provider stops processing or billing. Browser-provided score/state is untrusted recommendation input, not verified gameplay or player identity. The current app has no authenticated session or private-resource API, so CORS/CSRF controls remain architecture-dependent.

## Verification commands

Routine verification is offline and fake-first; it does not require Gemini credentials or make provider calls:

```bash
npm test
npm run smoke
npm run typecheck
npm run build
```

- `npm test` runs Vitest's discovered suite, including evaluator files present in the workspace.
- `npm run smoke` starts a temporary Vite server and runs browser checks.
- `npm run typecheck` checks frontend and backend TypeScript without emitting files.
- `npm run build` typechecks and builds the frontend plus server output.

`npm run check:frontend-boundary` is a separately gated frontend-boundary check. It is not part of routine credential-free Week08 verification and was not executed during Week08 because it may access a real provider key.

The formal Week03 evaluations and independent holdout remain evaluator-owned:

```bash
npm test -- evals/week3-formal.test.ts
npm test -- evals/week3-holdout.test.ts
```

Controlled live Gemini checks are separate manual actions that require `GEMINI_API_KEY`; they are not part of the ordinary deterministic flow. Their factual results, including the failed primary check and the separate successful fallback capability check, are recorded in [`docs/EVIDENCE_W04.md`](docs/EVIDENCE_W04.md).

The Week05 acceptance evaluator can also be run directly, without credentials or network access:

```bash
npm test -- evals/week5-training-agent.test.ts
```

### Week08 security verification

The following W08 commands are credential-free. The test and browser checks are deterministic and fake-first; `server/http-security.integration.test.ts` uses real Node HTTP; the browser script uses real Chromium text-rendering checks; the production script checks the built site, CSP, and headers; and the audit commands inspect dependency advisories.

```bash
npm test
npm run typecheck
npm run build
npm test -- server/http-security.integration.test.ts
npm test -- server/ai/training-admission.test.ts
npm test -- server/ai/training-operation-tracker.test.ts
npm test -- server/ai/training-security-events.test.ts
npm test -- evals/week5-training-agent.test.ts
npm run smoke
node scripts/w08-browser-security.mjs
node scripts/w08-production-security.mjs
npm audit
npm audit --omit=dev
```

Recorded final Week08 checkpoint results—not rerun for this README update—were: 40 test files / 586 tests passed; typecheck and production build passed; browser smoke 7/7; browser security 3/3; production security/CSP 5/5; real HTTP security integration 20/20 at the final independent audit; and both full and production dependency audits reported zero vulnerabilities.

The smoke command uses an installed system Chrome/Chromium when available; otherwise install Playwright's Chromium once with `npx playwright install chromium`. The temporary automation server stops when the command finishes. Use `npm run dev` for manual play. Additional manual scenarios are documented in [`docs/BROWSER_SMOKE_TEST.md`](docs/BROWSER_SMOKE_TEST.md).

### Verification boundary: offline versus live provider evidence

Deterministic/offline verification consists of the documented final `npm test`
count, smoke, typecheck, build, and the documented formal and holdout
evaluations. These checks use the fake-first boundary and do not establish
external Gemini availability. The separately gated frontend-boundary check is
not included in that routine set or in the Week08 checkpoint. Live-provider evidence is
separate: the original controlled primary verification failed safely; the
fallback model passed its separate capability check; and a later manual
browser `ASK AI COACH` run rendered valid advice. See
[`docs/EVIDENCE_W04.md`](docs/EVIDENCE_W04.md) for the bounded factual record
and its browser evidence artifact.

## Project documentation

### Week03 baseline

- [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md) — frozen product specification, scope, and Definition of Done.
- [`docs/BUILD_PROMPT_V1.md`](docs/BUILD_PROMPT_V1.md) — baseline implementation prompt.
- [`docs/CONTEXT_MANIFEST.md`](docs/CONTEXT_MANIFEST.md) — clean baseline context boundary.
- [`docs/EVALS.md`](docs/EVALS.md) — evaluator-owned formal expectations.
- [`docs/EVIDENCE_003.md`](docs/EVIDENCE_003.md) — actual development, formal, holdout, audit, and review evidence.
- [`docs/BROWSER_SMOKE_TEST.md`](docs/BROWSER_SMOKE_TEST.md) — reproducible browser smoke-test steps and observed result.

### Week04 AI Coach

- [`spec.md`](specs/001-brickpulse-ai-coach/spec.md) — approved AI Coach requirements.
- [`plan.md`](specs/001-brickpulse-ai-coach/plan.md) — architecture and implementation plan.
- [`tasks.md`](specs/001-brickpulse-ai-coach/tasks.md) — execution and verification record.
- [`provider.md`](specs/001-brickpulse-ai-coach/contracts/provider.md) — provider boundary contract.
- [`docs/EVIDENCE_W04.md`](docs/EVIDENCE_W04.md) — verification evidence and live-check limitations.
- [`docs/AI_USAGE_LOG.md`](docs/AI_USAGE_LOG.md) — factual record of meaningful AI-assisted work and outcomes.

### Week05 Training Planner

- [`spec.md`](specs/002-brickpulse-training-agent/spec.md) — bounded Training Planner requirements.
- [`plan.md`](specs/002-brickpulse-training-agent/plan.md) — architecture and implementation plan.
- [`tasks.md`](specs/002-brickpulse-training-agent/tasks.md) — execution, verification, and live-gate record.
- [`tool.md`](specs/002-brickpulse-training-agent/contracts/tool.md) — deterministic analysis-tool contract.
- [`docs/AGENT_EVALS_W05.md`](docs/AGENT_EVALS_W05.md) — offline A1–A18 acceptance matrix and A19 handoff status.
- [`docs/EVIDENCE_W05.md`](docs/EVIDENCE_W05.md) — factual offline and bounded-live verification evidence.
- [`docs/AI_USAGE_LOG_W05.md`](docs/AI_USAGE_LOG_W05.md) — factual record of meaningful AI-assisted Week05 work.

### Week08 Secure the Arcade

- [`spec.md`](specs/003-brickpulse-security/spec.md) — security hardening requirements and trust boundaries.
- [`plan.md`](specs/003-brickpulse-security/plan.md) — bounded architecture and enforcement plan.
- [`tasks.md`](specs/003-brickpulse-security/tasks.md) — completed W08-001–040 task and acceptance record.
- [`admission-and-operations.md`](specs/003-brickpulse-security/contracts/admission-and-operations.md) and [`execution-events-and-boundaries.md`](specs/003-brickpulse-security/contracts/execution-events-and-boundaries.md) — admission, lifecycle, event, and public-boundary contracts.
- [`EVIDENCE_W08.md`](EVIDENCE_W08.md) — final joint evidence and pair-acceptance record.
- [`docs/mateja-w08-evidence.md`](docs/mateja-w08-evidence.md) — Mateja's individual backend evidence.
- [`docs/W08_EXECUTION_ROADMAP.md`](docs/W08_EXECUTION_ROADMAP.md) — execution checkpoints, recorded results, and handoff.

Implementation and browser code are under `src/`, backend code is under `server/`, and evaluator-owned tests are under `evals/`.

## Observed browser states

The following screenshots document the initial and terminal browser states. The source images are kept in `docs/screenshots/`.

| READY | YOU WON | GAME OVER |
|---|---|---|
| ![BrickPulse READY screen](docs/screenshots/ready.png) | ![BrickPulse YOU WON screen](docs/screenshots/won.png) | ![BrickPulse GAME OVER screen](docs/screenshots/game-over.png) |
