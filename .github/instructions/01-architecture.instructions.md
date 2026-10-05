---
description: "BrickPulse Week 3 ownership, state, and browser boundaries."
applyTo: "**/*"
---

# Architecture Instructions

## System boundary

BrickPulse is one small vanilla TypeScript browser application rendered with HTML, CSS, and one Canvas. The logical play area is 640×480 and contains one paddle, one ball, one fixed 4×8 brick grid, one level, score, and three lives.

## Ownership

- Pure game logic owns state, movement, collision response, scoring, life loss, and terminal-state transitions.
- Browser input converts keys into player intent; it does not directly mutate authoritative state.
- Canvas rendering reads state and draws it; it does not decide rules, score, or collisions.
- Startup code validates `GameConfig` before creating playable state.
- Invalid configuration produces a controlled failure and no playable game.

Keep these responsibilities separable when the scaffold is created. Exact file paths may follow the eventual minimal scaffold, but dependency direction must remain game logic → state results, with browser input/rendering around that logic.

## Approved Week04 AI Coach boundary

- docs/GAME_SPEC.md remains authoritative for Week03 gameplay. specs/001-brickpulse-ai-coach/spec.md authorizes only the additive post-game AI Coach and minimum duration telemetry.
- Browser code may send an exact terminal GameSummary only through POST /api/ai/advice; it must not import server/**, provider SDKs, backend environment values, prompts, or provider configuration.
- The TypeScript backend owns request validation, the single advice endpoint, the shared deadline, retry policy, provider output validation, and safe response projection.
- AI generation is accessed only through AiAdviceProvider; routine tests use the fake provider. The Gemini adapter is backend-only and optional live verification remains separate.
- AI work must not run in updateGame, rendering, input handling, or an animation-frame path. Canvas rendering remains free of HTTP and provider behavior.
- The backend may use the configured Gemini primary model and exactly one fixed, capability-tested Gemini fallback model only for the Week04 specification's normalized plain-404/500/502/503 provider-unavailable classes. Both calls share the same deadline and remain within the two-total-call limit.
- No arbitrary model chain, second AI provider, browser-selected model, fallback for auth/safety/validation failures, database, authentication, deployment, streaming, dashboard, or gameplay redesign is authorized.

## Approved Week05 Training Planner boundary

- `specs/002-brickpulse-training-agent/spec.md` authorizes one additive, backend-owned bounded Training Planner alongside the unchanged Week04 Coach.
- The only permitted Week05 route is `POST /api/ai/training-plan`; it accepts the existing exact terminal `GameSummary` and must not alter `/api/ai/advice` behavior.
- The planner loop, provider attempts, deadlines, budgets, validation, tool allowlist, and safe projection are server-owned. The browser submits the summary and renders only validated public status/result data; it owns no provider, tool, budget, prompt, or configuration behavior.
- The only Core tool is the deterministic, local, read-only `analyze_game_performance`. It receives application-injected validated context, cannot mutate game state, and has no filesystem, network, shell, database, or write capability.
- Keep the Week05 provider boundary adjacent to Week04 and provider-neutral. Routine tests use injected fakes with no credentials or network; live verification remains separately gated by `tasks.md`.

## Change rules

- Implement Week03 gameplay only as defined in docs/GAME_SPEC.md, and Week04 AI Coach behavior only as defined in specs/001-brickpulse-ai-coach/spec.md.
- Keep the fixed brick layout and single-level design.
- Use a handwritten runtime validator for the three-field `GameConfig`.
- Do not add a UI framework, validation library, physics engine, database, or any feature outside the approved Week04 boundary. Dependencies still require the explicit gates in tasks.md.
- Do not hide rule decisions inside drawing code or DOM event handlers.
