---
description: "Risk-based Week 3 review checklist for BrickPulse."
applyTo: "**/*"
---

# Code Review Instructions

## Review order

1. Confirm Week03 gameplay changes match docs/GAME_SPEC.md, Week04 AI Coach changes match specs/001-brickpulse-ai-coach/spec.md, Week05 Training Planner changes match specs/002-brickpulse-training-agent/spec.md, and Week08 changes match the narrow hardening scope in specs/003-brickpulse-security/spec.md and tasks.md.
2. Reject features outside the approved Week04 Coach, bounded Week05 Planner, or approved Week08 hardening of that existing planner.
3. Check that `GameConfig` is validated at runtime before playable state exists.
4. Check all eight gameplay rules, including collision-side response.
5. Check that pure rules remain separate from browser input and Canvas rendering.
6. Check focused tests, evaluator-owned formal results, and the preserved baseline without overstating evidence.
7. Check that one correction has one hypothesis, one controlled change, and the same formal evaluation before/after.
8. Check dependency restraint, intentional files, and absence of secrets or generated claims.
9. Check `docs/EVIDENCE_003.md` and `docs/AI_USAGE_LOG.md` against actual work.
10. For Week04, check exact request and provider-output runtime validation, including zero provider calls for every invalid summary.
11. Check the one 15-second shared deadline, at most two total attempts, same-primary retry only for network/408/429, and the one fixed capability-tested Gemini fallback only for normalized plain 404/500/502/503 provider-unavailability; retain fake-first tests and no real deadline sleeps.
12. Check browser/backend separation, backend-only credentials, sanitized diagnostics, exact 200/400/503 responses, stale-response handling, and Week03 regression evidence.
13. For Week05, check the single bounded planner endpoint, server-owned loop/budgets/deadlines, one allowlisted deterministic read-only tool, fake-first tests, strict proposal/tool/final validation, sanitized public/evidence data, unchanged Week04 advice behavior, and the later live gate.
14. Check each Week05 commit for exactly one `Co-authored-by: Mateja Miletic <miletic.matejamiletic.mateja@gmail.com>` trailer and a matching factual evidence hash.
15. For Week08, check only approved hardening: server-owned admission limits; exact existing tool-policy enforcement; tracked underlying provider/tool work and fail-closed lease lifetime; bounded deadlines/retries/budgets; closed safe events/errors; synthetic-only containment; and regression of normal W05 behavior. Verify no real credential, secret environment value, live provider, new endpoint/provider/tool, browser-owned policy, write capability, or gameplay change was introduced. Confirm public HTTP 429 DTO/envelope, 400-versus-413, request-abort, and shared acceptance changes have both owners' approval.

## Findings to reject

- Type assertions presented as runtime validation.
- Rule or score logic implemented only in rendering or event handlers.
- Multiple simultaneous changes that prevent causal comparison.
- Formal evaluations supplied as baseline implementation context.
- Unrun checks marked PASS or fabricated screenshots/output.
- React, Zod, physics engines, database/authentication/deployment additions, endpoints other than the approved Week05 planner endpoint, providers outside the approved fixed adapters, streaming, unbounded/browser-owned/write-capable agents or tools, dashboards, gameplay redesign, or other excluded additions.
- Provider calls before local validation, provider output treated as trusted, raw provider diagnostics in public responses, browser imports of server/provider/configuration code, unapproved dependencies, or unapproved live calls.
- Unrelated formatting, dependency upgrades, or infrastructure.

## Handoff

Report behavior changed, files changed, checks actually run, results, known limitations, and evidence still missing. A successful demo is not proof beyond the scenarios actually checked.
