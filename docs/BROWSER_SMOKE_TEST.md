# BrickPulse Browser Smoke Test

This document describes the automated browser smoke check and the additional manual scenarios for BrickPulse. It supplements deterministic tests; it does not replace them or the evaluator-owned formal tests.

The automated check uses Playwright with headless Chrome/Chromium. It exercises the rendered Canvas and keyboard input, not only HTTP delivery:

```bash
npm run smoke
```

The command starts a temporary Vite server on port 4173, retries server readiness and the module entrypoint request, and then checks the page title, the 640x480 Canvas and READY objects, ball movement after Space, paddle movement while ArrowRight is held, and uncaught browser errors. The server stops when the command finishes, so its printed URL is only an automation target. Use `npm run dev` and its printed URL for manual play. The script uses system Chrome/Chromium when found; otherwise, install Playwright's browser once with `npx playwright install chromium`.

## Reproduce

From the repository root:

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Open the Vite URL, normally `http://127.0.0.1:5173/`, in a browser.

1. Confirm the page title and `BrickPulse` heading are visible.
2. Confirm the game area is a 640x480 Canvas showing the paddle, ball, 32 bricks, `SCORE 0000`, `LIVES 3`, and `READY`.
3. Press `Space` once. Confirm the ready message changes to running play and the ball begins moving.
4. Hold `ArrowRight` briefly, then release it. Confirm the paddle responds while staying inside the game area.
5. Optionally press `A` and `D` briefly to check the alternate movement controls.

## Manual terminal AI scenarios

These scenarios supplement the Canvas-only automated smoke check. They require a configured backend and are not a substitute for the fake-first test suite.

1. Finish a game as either `WON` or `GAME_OVER`. Confirm both **ASK AI COACH** and **CREATE TRAINING PLAN** are visible, and neither starts automatically.
2. Select **CREATE TRAINING PLAN** once. Confirm the pending status is accessible, repeated clicks are disabled while it is pending, and a successful response renders only the validated summary, focus, recommendation, and evidence.
3. Exercise a safe planner failure through an injected/stubbed backend response. Confirm no partial plan, provider diagnostic, raw model output, or internal error is rendered.
4. Start a planner request and restart the game before it settles. Confirm the planner area clears, the request is aborted or ignored when stale, and normal gameplay remains usable.
5. Repeat the terminal-state check for the other outcome and confirm **ASK AI COACH** remains independently usable.

## Review execution

- **Date:** 2026-09-21
- **Server command:** `npm run dev -- --host 127.0.0.1`
- **URL:** `http://127.0.0.1:5173/`
- **Result:** PASS
- **Observed:** The initial screen rendered with the 640x480 Canvas, 32-brick wall, score 0, three lives, paddle, ball, and `READY` message. Pressing Space changed the rendered frame and started play. Holding ArrowRight changed the rendered frame again, confirming basic input was received.
- **Additional signal:** Canvas readback confirmed non-empty rendered pixels and reported `width: 640`, `height: 480`.

## Automated browser smoke execution

- **Command:** `npm run smoke`
- **Date:** 2026-09-28
- **Browser:** Playwright 1.63.0 with system Chrome 147.0.7727.116, headless
- **Result:** PASS
- **Observed:** Vite served the application at `http://127.0.0.1:4173/`; all five checks passed: page title, Canvas contract and READY objects, ball launch after Space, paddle movement after ArrowRight, and no uncaught browser errors.
- **Readiness handling:** The script retries the Vite page and `/src/main.ts` entrypoint before launching the browser, then retries browser navigation on transient failures.

This smoke test was independently repeated during the final review. It is separate from the formal E1-E5 and H1 evaluator artifacts.
