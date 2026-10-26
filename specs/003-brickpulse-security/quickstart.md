# W08 Security Quickstart

This guide is the credential-free workflow for Mateja's backend and agent-security workstream. It applies the approved W08 specification, plan, research, and backend contracts without changing W03--W05 behavior.

## Preconditions and scope

- Work on `008-secure-the-arcade` from an approved clean checkpoint.
- Use deterministic fakes and synthetic fixtures only. Never read a secret-bearing file, inspect an environment-secret value, or make a live provider call.
- Do not run the `verify:gemini`, `verify:gemini:fallback-capability`, or `verify:training:live` scripts: each uses `.env` and is outside this workflow.
- Keep the existing read-only `analyze_game_performance` tool and the normal W05 fake-provider flow intact.
- Stop for review before a commit and before any change to a shared HTTP contract.

## Previously observed baseline

The following are historical Phase 0 observations, not results of a command rerun for this document.

| Command or scope | Observed result |
| --- | --- |
| `npm test` | Passed: 423 tests |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm test -- evals/week5-training-agent.test.ts` | Passed: 34 focused W05 fake-provider tests |
| `npm run smoke` | Blocked: sandbox denied loopback TCP binding with `EPERM` |
| `npm run check:frontend-boundary` | Not executed |

The smoke and frontend-boundary items must not be recorded as passing until they are actually run in a suitable controlled environment.

## Credential-free commands

The existing commands below are executable without opening credential files or making a provider call when the test suites use their established fakes:

```bash
npm test
npm run typecheck
npm run build
npm test -- evals/week5-training-agent.test.ts
```

Relevant existing fake-provider regression coverage is located in `evals/week5-training-agent.test.ts` and the `server/ai/training-*.test.ts` files. Run the narrowest applicable focused test first, then run the established W05 regression command above.

The following commands are **PLANNED**, not currently declared scripts or asserted to be runnable. Their paths and names are placeholders for the focused W08 tests created with the implementation:

```bash
# PLANNED: admission rate/concurrency tests
npm test -- server/ai/training-admission.test.ts

# PLANNED: underlying-work tracking and abort-ignoring fake tests
npm test -- server/ai/training-operation-tracker.test.ts

# PLANNED: closed security-event projection and containment tests
npm test -- server/ai/training-security-events.test.ts
```

## Mateja verification sequence

For each independently reviewable control:

1. Add a focused negative expectation and observe a meaningful RED result.
2. Run that focused test using only deterministic fakes.
3. Implement the smallest backend-owned control.
4. Re-run the focused test to GREEN.
5. Re-run the W05 fake-provider regression flow, including its two model decisions and one actual read-only tool execution.
6. Run typecheck and build; run other applicable checks only where the environment safely supports them.
7. Record actual provider and tool counters, event output, state effects, and any timing behavior.
8. Stop for human review before committing.

This sequence covers Mateja's T06--T14 evidence, the backend-independent part of T00, and the two-request portion of T17. T17 must show that admitted request A can reach the fake provider and have a forbidden tool proposal denied, while an intentionally capacity-exhausted request B is denied before provider or tool work. A later legitimate request must demonstrate cleanup and recovery.

## Deterministic fixtures

Future W08 tests use only these kinds of fixtures:

- A scripted fake provider for normal W05 decisions and malicious proposals.
- An injected monotonic clock for sliding-window admission tests.
- Deferred, abort-ignoring provider and tool promises to distinguish an outer timeout from actual underlying settlement.
- A counting tool registry to prove denied admissions cause zero provider and tool calls.
- A captured security-event sink for closed-schema assertions.
- The synthetic sentinel `W08_SERVER_SECRET_DO_NOT_EXPOSE` for containment tests.

The sentinel may be placed only in isolated server-side test configuration. It must never appear in browser bundles or source maps, public responses, model context, operational security logs, submitted evidence, or test output.

## Frontend and browser limitations

The existing `check:frontend-boundary` script reads `process.env.GEMINI_API_KEY`. It must not be run unchanged where that variable could carry a real value. A proposed, not executed, controlled invocation supplies an explicit synthetic value:

```bash
GEMINI_API_KEY=W08_SERVER_SECRET_DO_NOT_EXPOSE npm run check:frontend-boundary
```

This proposal requires review before use and must not be replaced with inspection of an existing environment value. Smoke, browser, CSP, and header verification require an environment that permits local TCP serving; the current sandbox's loopback `EPERM` prevents that work. They remain Isidora-owned and unverified here.

## Pair ownership and handoff

Mateja owns admission limits and leases, underlying-operation tracking, orchestrator/tool defenses, execution budgets, safe server-side security events, errors, and secret containment tests. Isidora owns HTTP-input/access tests, browser XSS, CSP/security headers, game integrity, CORS/CSRF, and dependency checks.

T00 and T17 require shared acceptance: Mateja can supply deterministic backend evidence, while Isidora retains independent HTTP/browser review. The public HTTP 429 response shape and request-abort behavior are shared decisions; stop for pair approval before changing them. Isolated backend work may continue without that approval only while it does not alter a public contract or Isidora-owned file.

## Planned evidence workflow

Do not create `EVIDENCE_W08.md` until actual implementation verification begins. Each later entry records:

- exact command and Git checkpoint;
- deterministic fixture and expected outcome;
- observed outcome, provider/tool counters, and state effects;
- before/after comparison where applicable; and
- remaining limitations, including unrun environment-dependent checks.

Evidence must contain neither real nor synthetic secret values.
