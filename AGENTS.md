# BrickPulse Agent Instructions

## Purpose

This is the concise, always-on entry point for agents working on BrickPulse. BrickPulse is a small Week03 Breakout-inspired browser game with the approved additive Week04 AI Coach, Week05 Training Planner, and narrowly scoped Week08 security hardening of that existing planner.

## Authority order

1. The current explicit user request.
2. docs/GAME_SPEC.md for all Week03 gameplay behavior and scope.
3. specs/001-brickpulse-ai-coach/spec.md for the approved Week04 AI Coach boundary and minimum duration telemetry only.
4. specs/002-brickpulse-training-agent/spec.md for the approved additive Week05 bounded Training Planner.
5. specs/003-brickpulse-security/spec.md, plan.md, research.md, quickstart.md, contracts, and tasks.md for the approved Week08 hardening of the existing Week05 planner.
6. docs/BUILD_PROMPT_V1.md for the historical baseline implementation task.
7. This file.
8. The relevant module routed by .github/00-index.instructions.md.
9. docs/CONTEXT_MANIFEST.md for historical Week03 context selection and exclusions.

If two sources conflict, stop and report the conflict instead of guessing.

## Always-on boundaries

- Keep the project limited to vanilla TypeScript, HTML, CSS, and Canvas, with the intended future Vite and Vitest setup.
- Keep game-state updates and collision rules independent from Canvas rendering and browser input.
- Validate `GameConfig` at runtime before creating playable state. A TypeScript type assertion is not runtime validation.
- Follow specification-first and focused test-first development: write the relevant expectation, observe meaningful RED when applicable, implement the smallest coherent change, reach GREEN, and run relevant regression checks.
- Preserve actual baseline results and report commands and failures honestly. Never fabricate evidence or mark an unrun check as passing.
- Add no dependency, framework, infrastructure, or feature outside the approved scope without explicit approval.
- Permit backend, provider, API SDK, post-game AI, retry, and timeout work only where it implements the approved Week04 AI Coach specification and its task plan, the approved Week05 Training Planner specification and its task plan, or the approved Week08 security hardening tasks for that existing planner.
- Week08 permits only hardening of the existing planner: server-owned admission/rate/concurrency limits; regression proof and narrowly justified hardening of existing agent/tool policy; bounded provider/tool lifecycle, deadline, retry, cancellation, tracking, and fail-closed lease handling; and closed server-only security events, safe errors, and synthetic-only containment tests. It authorizes no new endpoint, provider, dynamic/write-capable tool, browser-owned policy, filesystem access, database, authentication, leaderboard, or gameplay redesign.
- Week08 routine work uses deterministic fake providers and synthetic data only. Never read, inspect, print, copy, or use real credentials or secret environment values; never open .env or another secret-bearing environment file; never make a live Gemini or other paid/external provider call. A synthetic sentinel must not enter browser assets, public responses, model context, operational logs, or submitted evidence.
- Execute one independently reviewable Week08 task per Codex interaction: observe RED before corresponding GREEN where applicable, STOP and report after the task, obtain explicit human approval before committing, use a separate commit-only interaction, and do not automatically begin a successor, push, or merge. Mateja owns the approved backend/agent workstream; Isidora owns HTTP-input, browser/XSS, CSP/security-header, game-integrity, CORS/CSRF, and dependency work. Both owners must approve public HTTP 429 DTO/envelope changes, the 400-versus-413 policy, request-abort behavior crossing the route boundary, and shared acceptance artifacts.
- Week05 permits exactly one adjacent backend-owned bounded Training Planner: one `POST /api/ai/training-plan` endpoint, a provider-neutral bounded orchestrator, and the deterministic read-only `analyze_game_performance` tool. Keep `/api/ai/advice` unchanged; use fake-first, credential-free routine tests; and retain the separately gated live-provider workflow.
- Do not add React, Zod, a physics engine, database code, a provider beyond the approved fixed Gemini adapters, authentication, deployment, streaming, unbounded or browser-owned agents, dashboards, gameplay redesign, arbitrary tools, or write-capable tools.
- Do not commit secrets, credentials, private data, or private reasoning.
- Never read, search, print, modify, move, delete, recreate, normalize, or overwrite `.env` or any secret-bearing environment file. Only established environment variable names may be referenced.
- Every Week05 commit must contain exactly one `Co-authored-by: Mateja Miletic <miletic.matejamiletic.mateja@gmail.com>` trailer. Verify it in commit metadata and record its hash in Week05 evidence.

## Instruction routing

Read `.github/00-index.instructions.md`, then load only the smallest relevant instruction module. Authoritative project documents are task context, not material to duplicate into instruction files.

## Stop conditions

Stop and ask for direction when requirements conflict, a material decision is missing, a requested change crosses the approved Week04/Week05 boundary or the narrow approved Week08 hardening scope, an unapproved dependency appears necessary, or work would require paths outside the task's allowed scope.
