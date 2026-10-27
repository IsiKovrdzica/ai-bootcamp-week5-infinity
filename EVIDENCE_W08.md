# EVIDENCE_W08.md — Secure the Arcade

This record separates planned, executed, observed, and pending work. All security runs used deterministic fakes and synthetic fixtures; no live provider, credential, or `.env` file was used.

## 1. Scope and checkpoint

- Team: Isidora Prica (HTTP/browser/platform and remaining shared implementation driver); Mateja Miletic (admission, agent/tool, lifecycle, and event controls; final reviewer pending).
- Project: BrickPulse W03 game, W04 AI Coach, and W05 Training Planner.
- Repository: `ai-bootcamp-week5-infinity`, branch `008-secure-the-arcade`.
- W08 start: `646ddf4adc5158e4a53cdaf296c9627ee0bf5056`.
- W08-027 checkpoint: `ae65e8f23dff631857d9b4d03afdd943191a025d`.
- Current implementation checkpoint: `ae65e8f` plus intentional uncommitted W08-028–W08-040 changes. Final commit is pending authorization.
- Environment: Windows, Node `v24.20.0`, npm `11.19.0`, Playwright Chromium.
- Initial reproduced baseline before W08-027: 38 files / 533 tests passed; typecheck and production build passed.
- Final technical baseline: 40 files / 586 tests passed; typecheck and production build passed; both npm audits reported zero findings.
- Architecture: local, single-process public demo. There are no accounts, authentication cookies, private resources, database, leaderboard, or resource-ID lookup API.

## 2. Architecture and data inventory

```text
Browser game state (untrusted recommendation input)
  -> Node HTTP byte bound / JSON parse / exact runtime validation
  -> process-global admission (rate + concurrency lease)
  -> bounded Training Planner orchestrator
  -> configured provider adapter (deterministic fake in evidence)
  -> exact model-output validation
  -> one fixed read-only tool registry + server-injected context
  -> validated/normalized result -> validated fixed-template plan
  -> text-only browser rendering
  -> allowlisted server-only security events
```

| Field/capability | Controller | Enforcement/use | Sent to model? | Retention | Necessary |
|---|---|---|---|---|---|
| Terminal game summary | Browser supplies untrusted snapshot | `server/app.ts`, `server/ai/validation.ts` | Yes, after validation | Per request | Recommendations |
| Provider choice/config | Server composition | `server/index.ts`, composition | No browser control | Process configuration | AI boundary |
| Run/context IDs | Server | orchestrator and exact tool arguments | Yes, bounded | Per run/events | Correlation/scope |
| Admission limits | Server | `training-admission.ts` | No | In-memory 60s window/active leases | Availability |
| Model output | Provider/fake, untrusted | training validators/orchestrator | N/A | Per run | Proposed action/plan |
| Tool capability | Fixed server registry | exact own-name and argument validation | Descriptor only | Process code | Read-only evidence |
| Tool result | Server tool, still validated | registry/orchestrator normalization | Validated projection only | Per run | Grounding |
| Security event | Server projector | closed event matrix | No | Injected in-memory sink in tests | Auditing |
| URL/localStorage/resource ID | Not used by planner | No associated authority sink exists | No | None | N/A |

## 3. Threat model and priorities

| ID | Concrete scenario | Asset | Likelihood × impact | Control and observed proof | Priority |
|---|---|---|---|---|---|
| R1 | Direct malformed/oversized/privileged HTTP input bypasses UI | Cost and policy | Medium × High | Exact preflight, 16 KiB byte cap, T01/T02 zero-work | P1 |
| R2 | Unknown/inherited/injection-directed tool proposal executes | Capability/game integrity | Medium × High | Fixed registry and exact context, T07–T09 | P1 |
| R3 | Malformed/large/sentinel tool result reaches later model/output | Confidentiality/integrity | Medium × High | Validation/normalization, T10/T14 | P1 |
| R4 | Concurrent/repeated requests multiply cost | Availability/spend | Medium × High | 2 active, 5/60s admission, T13/T17 | P1 |
| R5 | Timeout/disconnect releases capacity while raw work continues | Availability/billing | Low × High | Tracker-owned drain and fail-closed lease, T12 | P2 |
| R6 | Model text becomes executable HTML/Markdown/link | Browser integrity | Low × High | text-only DOM plus CSP, T04/T05/T16 | P2 |
| R7 | Credential/raw diagnostic leaks to bundle/response/model/event | Secret/privacy | Low × Critical | backend config and closed projections, T14/T16 | P2 |
| R8 | Client-modified score gains verified authority | Game integrity | Medium × Medium | no authority sink; exact summary and read-only tool, T15 | P3 |

R1–R4 are prioritized because they directly bound reachable HTTP, capability, and aggregate-cost boundaries. Authentication/session attacks are not represented as implemented risks because those features do not exist. Prompt injection is tested as an untrusted fake-provider proposal; the product has no free-text user prompt and no live-model guarantee is claimed.

## 4. SpecKit/SDD invariants and limits

| ID | Rule and enforcement | Test/evidence | Status |
|---|---|---|---|
| I1 | Invalid initial HTTP input stops in `app.ts` before planner/admission/provider/tool | T01/T02, counters `0/0` or `0/0/0` | PASS |
| I2 | Browser/model cannot select identity, provider, privilege, registry, or limits | T02/T03/T15 | PASS |
| I3 | Only exact allowlisted tool + exact context/arguments executes | T07–T09/T17 | PASS |
| I4 | Planner tool has no mutation capability and snapshots are detached | T00/T15 state comparisons | PASS |
| I5 | Untrusted text remains inert | Real Chromium T04/T05 and production T16 | PASS |
| I6 | Body/output/calls/time/concurrency have server bounds | T02/T06/T10–T13 | PASS |
| I7 | Secrets/raw untrusted data stay out of public/model/event/browser boundaries | T14/T16 and audits | PASS |
| I8 | Normal W05 two-step, one-tool flow remains usable | T00 plus full regression | PASS |

| Resource | Enforced limit |
|---|---|
| HTTP body | 16 KiB UTF-8; above limit is 413 |
| Provider/model output | strict schema/size validation; provider `maxOutputTokens: 2048` |
| Tool result | 2 KiB validated/normalized projection |
| Run work | 3 steps, 2 attempts/step, 6 attempts/run, 2 tools/run |
| Time | provider attempt 15s or remaining; tool 100ms or remaining; run 30s |
| Admission | 2 active executions; 5 successful admissions per 60s per Node process |

These are project choices, not industry-standard claims. Admission is process-local, not distributed.

## 5. T00–T17 results

| ID | Fixture/expectation | Executed proof | Observed result and counters/state | Status/limitation |
|---|---|---|---|---|
| T00 | Normal game and planner remains functional | focused W03/W05/state suite; `npm run smoke` | 145 tests and smoke 7/7; model steps/provider `2`, allowed tool `1`, valid plan, state unchanged | PASS |
| T01 | 26 malformed/type/domain negatives; 2 valid boundaries | `server/app.test.ts` | negatives HTTP 400/provider/tool `0/0`; positives 200 and `2/1` | PASS, commit `ae65e8f` |
| T02 | 16 KiB, +1 byte, chunks, multibyte, six privileged fields | real Node HTTP suite | exact bound passes; oversized 413; rejects perform admission/provider/tool `0/0/0` | PASS |
| T03 | Public demo context escape | real Node HTTP mismatch/match | mismatch admission/provider/tool `1/1/0`; server context positive `1/2/1` | PASS; private-resource branch N/A |
| T04 | Hostile marker through Coach/Planner display plus legitimate text | real Chromium scripts | exact inert text, no active descendants/marker; legitimate characters preserved | PASS |
| T05 | HTML/Markdown/`javascript:` syntax | real Chromium scripts | literal text, no rich renderer or link activation | PASS, text-only scope |
| T06 | Invalid/oversized provider decisions/finals | validation/orchestrator suites | no success or unsafe continuation; exact counters retained | PASS |
| T07 | Unknown, `constructor`, `toString` | registry/orchestrator suites | forbidden execution `0` | PASS |
| T08 | Bad/extra/wrong-context args; exact positive | registry/orchestrator and HTTP | invalid tool `0`; exact positive tool `1` | PASS |
| T09 | Injection-directed forbidden fake proposal | orchestrator/T17 | proposal denied, forbidden tool `0` | PASS; deterministic fake only |
| T10 | Invalid/oversized/sentinel-bearing tool result | tool/orchestrator suites | rejected/normalized before later model continuation | PASS |
| T11 | Repeat plus aggregate attempts/tools | orchestrator suites | ceilings stop later work; retry/fallback does not reset totals | PASS |
| T12 | Call timeout, run deadline, late work, disconnect | deferred unit/integration plus real Node HTTP | terminal result immutable; premature disconnect aborts signal; lease waits for raw settlement; recovery succeeds | PASS; local abort is not remote cancellation/billing proof |
| T13 | Concurrency/rate denial then recovery | admission/composition/real HTTP | denial 429 with provider/tool `0/0`; capacity recovered only after drain/window | PASS |
| T14 | Synthetic secret and newline/log injection | event/orchestrator/tool tests + artifact scan | absent from public/model/event/built assets; safe closed events remain | PASS; sentinel value omitted here |
| T15 | Inconsistent score and `verified` claim; valid client summary | real HTTP + state/tool tests | invalid/extra fields `0/0/0`; valid response has no authority/rank/owner field; state unchanged | PASS |
| T16 | Actual `dist`, headers, CSP block, isolated loaded synthetic server configuration, asset/response scan, game/AI | `node scripts/w08-production-security.mjs` | 5/5; game and fake-backed Coach/Planner work; controlled reachable script blocked by CSP; required headers present; loaded synthetic marker absent from response/build | PASS |
| T17 | A holds slot/forbidden tool, B denied, C recovers | real Node HTTP A/B/C + closed event sink | B exact 429 zero-work; A 422/tool `0`; C 200; aggregate provider/tool `3/1`; events closed | PASS |

### CSRF and CORS applicability

No cookie, bearer/session credential, account, or authenticated state exists, and the production UI/API are same-origin. CSRF is therefore N/A for the current architecture. No permissive CORS policy is configured; the tested public API still validates all bodies and grants no identity/resource authority. A future ambient credential would require a fresh CSRF/origin design.

### Dependency audit

- Initial full audit: five development-tool findings through Vitest/Vite transitive paths; production audit was clean.
- Authorized remediation: Vite `7.3.7`, Vitest and `@vitest/mocker` `4.1.12`, `source-map-js` `1.2.2`; vulnerable Tinypool path removed.
- Confirmed with `npm ls vite vitest tinypool @vitest/mocker source-map-js`.
- Final `npm audit`: 0 vulnerabilities. Final `npm audit --omit=dev`: 0 vulnerabilities.
- No `--force`, application behavior weakening, or test removal was used.

### Independent requirement-to-code-to-test acceptance map

| ID | Production enforcement | Executable test / fixture | Acceptance |
|---|---|---|---|
| T00 / I4 / I8 | `TrainingAgentOrchestrator.run`, fixed `createTrainingToolRegistry`, `analyzeGamePerformance`; browser game in `src/main.ts` | `evals/week5-training-agent.test.ts` — `A1: completes the two-step, one-tool evidence-backed success path`; `src/ai/game-summary.test.ts` immutability cases; `npm run smoke` | PASS; orchestrator and browser proofs are separate, explicitly not a single full-stack claim |
| T01 / I1 | `createApp` byte/JSON/`validateGameSummary` ordering | `server/app.test.ts` — `W08-027 T01 direct HTTP preflight`, 26 negatives and 2 positives | PASS |
| T02 / I1/I2/I6 | `MAX_REQUEST_BODY_BYTES`, streaming byte counter, exact summary schema | `server/http-security.integration.test.ts` — `W08-028 real Node HTTP T02 body and privilege boundaries` | PASS |
| T03 / I2/I3 | server-generated context ID and exact registry context match | same file — `W08-028 real Node HTTP T03 public/demo resource scope` | PASS; private branch N/A |
| T04/T05 / I5 | UI assigns `textContent`; no rich renderer | `scripts/w08-browser-security.mjs` — hostile Coach/Planner fields, active-DOM and positive-text assertions | PASS, real Chromium |
| T06 | `validateTrainingStepProposal`/final rendering validation in orchestrator | `server/ai/training-validation.test.ts`, `training-orchestrator.test.ts` invalid/oversized proposal/final cases | PASS |
| T07/T08 / I3 | own-name lookup, exact argument keys, injected context in `training-tool-registry.ts` | `training-tool-registry.test.ts` unknown/inherited and bad/scope-invalid args; matching positive; orchestrator W08 T07/T08 cases | PASS |
| T09 / I3 | executable registry policy independent of model text | `evals/week5-training-agent.test.ts` A4/A15 and real HTTP T17 forbidden proposal | PASS; malicious fake proposal, no free-text/live-model guarantee |
| T10 | tool result recomputation/validation before evidence/model continuation | `training-tool.test.ts`, `training-tool-registry.test.ts`, orchestrator containment cases | PASS |
| T11 / I6 | action fingerprint and shared step/attempt/tool counters | A10–A12 in `evals/week5-training-agent.test.ts`; orchestrator budget tests | PASS |
| T12 / I6 | per-attempt/run/tool timers, `InFlightOperationTracker`, request signal | tracker/registry/orchestrator deferred tests; real HTTP `W08-035 ... premature-disconnect lifecycle` | PASS |
| T13 / I6 | `createTrainingAdmissionController`, planner lease released from `tracker.drained` only | `training-admission.test.ts`; composition tests; real HTTP 429/disconnect/T17 groups | PASS |
| T14 / I7 | closed `createTrainingSecurityEventProjector`, safe public envelopes/provider projection | `training-security-events.test.ts` newline/extra-field cases; orchestrator/tool containment; app thrown-error test | PASS |
| T15 / I2/I4 | summary domain validation, no authority response field, read-only tool | real HTTP `W08-030 ... game-state integrity`; `training-tool.test.ts`; `game-summary.test.ts` | PASS |
| T16 / I5/I7/I8 | `createProductionHttpHandler`, `PRODUCTION_CSP`, built static/API same origin | `server/production-server.test.ts`; `scripts/w08-production-security.mjs` | PASS, actual `dist` and real Chromium |
| T17 / I1/I3/I6/I7 | admission + registry + tracker + closed events across real HTTP | `server/http-security.integration.test.ts` — `W08-037 real Node HTTP T17 A/B/C security chain` | PASS |

Official non-scenario deliverables are present: the architecture/data inventory and eight-risk/priority model are above; SpecKit spec/plan/tasks/contracts/checklist exist under `specs/003-brickpulse-security`; CORS/CSRF and dependency conclusions are recorded; three factual comparisons follow; reproducible commands, event examples, limitations, contributor/AI responsibility, and the executable eight-minute demo are included below. Final commit URL/hash and final Mateja review cannot be supplied until those human-only actions occur.

## 6. Factual before/after comparisons

| Scenario | Before | Change | After | Narrow conclusion |
|---|---|---|---|---|
| Public admission contract | At committed checkpoint `ae65e8f`, the same injected `rate_limited` and `concurrency_limited` fixtures returned 503; the recorded RED was 2 failures | approved safe 429 projection only; admission algorithm unchanged | Current worktree: both fixtures return exact 429 with provider/tool `0/0`, no reason leakage or `Retry-After` | Reproducible from committed old route plus current tests; does not prove distributed limiting |
| Public oversized contract | At `ae65e8f`, the same +1/chunked/multibyte fixtures returned 400; recorded RED was 4 failures | approved 413 projection and streaming tests | Current worktree: same fixtures return 413 with admission/provider/tool `0/0/0`; exact limit passes and in-limit invalid stays 400 | Proves Node/app boundary, not an upstream proxy limit |
| Disconnect lifecycle | At `ae65e8f`, request/planner/orchestrator exposed no per-request signal; recorded RED had 2 failures (missing signal and missing abort) | request-owned signal threaded to orchestrator; tracker remains release owner | Current worktree: destroyed client aborts supported work; abort-ignoring raw work retains lease until settlement; recovery succeeds | Does not prove remote cancellation or billing stop |

Existing good W05 controls were not removed to manufacture vulnerable “before” behavior.

## 7. Architecture, secrets, and security events

- Minimum boundary change: HTTP validation/admission before AI work; exact registry and tracker retained; production static serving wraps the existing API.
- Policy locations: `server/app.ts`, `server/composition.ts`, `server/ai/training-*`, and SpecKit contracts.
- Production provider adapter remains separate from `ScriptedAgentModelProvider`; all evidence uses fakes.
- Read-only proof: the tool receives detached validated summaries and exposes analysis only; state/input before and after is equal.
- Synthetic sentinel: isolated test-only value, intentionally not reproduced in submitted evidence.
- Browser bundle/source maps, HTTP responses, provider snapshots, and captured events were checked for prohibited synthetic patterns.
- Redacted allowed event example: `{"correlationId":"corr_demo","kind":"planner.admitted","outcome":"allowed","activeExecutionCount":1,"admissionsInWindow":1,"stepCount":0,"providerAttemptCount":0,"toolCallCount":0,"elapsedMs":0}`.
- Redacted denied example: `{"correlationId":"corr_demo","kind":"planner.admission_denied","outcome":"denied","reasonCode":"CONCURRENCY_LIMITED","activeExecutionCount":1,"admissionsInWindow":1,"stepCount":0,"providerAttemptCount":0,"toolCallCount":0,"elapsedMs":0}`.
- Test event sinks are process-local arrays and discarded after tests. No production log transport/retention system is introduced.
- Newline/raw tool/error strings were injected in tests and could not create a second event because projection accepts only a closed schema.

## 8. Reproducibility and delivery

| Check | Exact command | Observed output | Limitation |
|---|---|---|---|
| Full deterministic suite | `npm test` | 40 files / 586 tests passed | Fake providers |
| Typecheck | `npm run typecheck` | passed | Static checking |
| Production build | `npm run build` | passed; Vite 7.3.7, 13 modules | Local build |
| HTTP security | `npm test -- server/http-security.integration.test.ts` | 19 tests passed at W08-035; later T17 regression included in focused 86-test run | Loopback local only |
| Browser T04/T05 | `node scripts/w08-browser-security.mjs` | 3/3 security assertions passed | Local Chromium |
| Production T16 | `node scripts/w08-production-security.mjs` | 5/5 assertions passed, including loaded synthetic server configuration containment | Controlled second origin |
| Existing smoke | `npm run smoke` | 7/7 passed | Deterministic local fake |
| Dependency audit | `npm audit`; `npm audit --omit=dev` | 0; 0 | Snapshot at this lockfile |
| Diff hygiene | `git diff --check` | see final handoff result | Work remains uncommitted |

Reset between deterministic tests is provided by fresh app/provider/registry/admission instances and closed servers/browser contexts. The forbidden `npm run check`/frontend-boundary command was not run.

## 9. Conclusions and residual risk

- Technically demonstrated at the current worktree: I1–I8 and T00–T17, including real HTTP, real Chromium, production CSP/headers, clean audits, and W03–W05 regressions.
- Not yet complete: Mateja's final review, any corrections he requests, explicit pair acceptance, authorized commits, and push/merge (not authorized here).
- Local/fake limitation: provider behavior and cancellation are deterministic; abort signals do not guarantee a remote service stops processing or billing.
- Process limitation: admission state is in-memory per Node process and is not a distributed/global rate limiter.
- Public-demo limitation: no identity/private-resource security is claimed because those features do not exist.
- Next concrete action: human review of the intentional diff and this evidence, followed by corrections/reverification if requested.

## 10. Pair contribution and AI responsibility

| Member | Concrete work | Defensible negative test | Understood limitation |
|---|---|---|---|
| Mateja | Admission, tracker, orchestrator/tool restrictions, budgets, safe events/containment | forbidden/inherited tool and abort-ignoring raw-work lease tests | local abort and process-local admission limits |
| Isidora | T01/T02/T03/T15, 429/413/disconnect integration, production serving, browser/CSP, dependency remediation, acceptance/evidence | invalid HTTP zero-work, real-browser inert rendering, CSP blocked resource | client summary is untrusted recommendation data, not verified gameplay |

- AI assistance: Codex helped inspect, propose, implement, and run deterministic checks under human-authorized scopes.
- Human verification: Isidora approved contracts/scope and reviewed checkpoints; automated output and diffs were inspected. Mateja's final completed-work review is not claimed and remains pending.
- Rejected approaches: live credentials/providers, forced audit upgrades, invented authentication, test weakening, fabricated RED/PASS evidence, and route-level lease release.

## 11. Eight-minute demo and individual defense

1. **0:00–0:45** — checkpoint, trust-boundary diagram, three prioritized risks.
2. **0:45–1:45** — run `npm test -- evals/week5-training-agent.test.ts -t "A1: completes"` for the real orchestrator/registry path (`2` steps, `2` provider attempts, `1` executed tool), then `npm run smoke` for the real browser game/UI regression. Explain that smoke intercepts HTTP and is not itself the orchestrator proof.
3. **1:45–2:45** — Isidora control: malformed/privileged/oversized real HTTP, exact 400/413 and zero-work counters.
4. **2:45–3:45** — Mateja control: forbidden/inherited tool proposal, zero execution, safe event.
5. **3:45–4:45** — A/B/C: A holds lease, B safe 429/zero work, A drains, C succeeds.
6. **4:45–5:45** — real Chromium inert HTML/Markdown/link text and legitimate special text.
7. **5:45–6:45** — run `node scripts/w08-production-security.mjs`: production CSP/headers, controlled blocked resource, game/AI API success, loaded synthetic server configuration containment, and secret-free asset scan.
8. **6:45–8:00** — show the recorded `npm test` 586-test result and both clean audits, the three checkpoint-based RED/GREEN comparisons, residual risks, and pending final review.

The demo is executable from the repository root after `npm run build`. Browser smoke proves actual canvas/control/UI behavior with deterministic intercepted API responses. The A1 evaluation and HTTP integration tests separately exercise the production orchestrator, registry, validators, admission, and real read-only tool. No claim is made that `npm run smoke` alone is a browser-to-orchestrator full-stack test.

Defense points: name the enforcing boundary before describing the test; explain why counters prove denied work never crossed it; distinguish validation from authorization; explain why tracker drain, not HTTP completion, owns release; state that CSP is defense-in-depth after safe DOM rendering; and state all local/fake/process limitations without overclaiming.

## 12. Final acceptance state

- [x] Automated T00–T17 applicable coverage reproduced.
- [x] Real Node HTTP and real Chromium evidence recorded.
- [x] Production build, CSP/headers, asset scan, typecheck, and audits passed.
- [x] W03–W05 behavior preserved in deterministic regressions.
- [x] Root evidence and SpecKit execution reconciliation prepared.
- [ ] Mateja final review performed and recorded factually.
- [ ] Requested corrections, if any, completed and reverified.
- [ ] Explicit final pair acceptance recorded.
- [ ] Final commits/push handled only with separate authorization.

Week 8 is technically ready for human review, but is not claimed as finally accepted or delivered.

## 13. Final independent acceptance audit — 2026-10-27

The audit re-read the official assignment/template, SpecKit artifacts, contracts, implementation, tests, scripts, complete tracked diff, and every untracked file. It did not rely on the roadmap status labels. One evidence gap was corrected: the production script now proves an isolated synthetic server configuration was actually loaded and remained absent from HTTP output and built assets. Documentation was corrected to name Isidora Prica, identify exact tests/enforcement, make the three historical comparisons checkpoint-based, and distinguish browser UI smoke from the separate real orchestrator/tool proof.

Observed final commands:

- `npm test`: 40 files / 586 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite 7.3.7, 13 modules.
- `npm audit`: 0 vulnerabilities.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm test -- server/http-security.integration.test.ts`: 1 file / 20 tests passed.
- `node scripts/w08-browser-security.mjs`: 3/3 printed security assertions passed.
- `node scripts/w08-production-security.mjs`: 5/5 printed production assertions passed.
- `npm run smoke`: 7/7 browser checks passed.
- `git diff --check`: passed.
- Installed tree: Vite 7.3.7, Vitest/@vitest/mocker 4.1.12, source-map-js 1.2.2; Tinypool absent.

Diff inspection found 12 intentional modified tracked files and 7 intentional untracked W08 files. No unexpected temporary artifact or credential-like token was found. The synthetic fixture appears only in authorized test/spec/script contexts and not in the built client artifacts or recorded operational output.

| Acceptance area | Result | Remaining gap |
|---|---|---|
| Official controls, I1–I8, T00–T17 | PASS | Local/fake and one-process limitations stated above |
| Evidence-template content and executable demo | PASS | Final commit hash/link cannot exist before authorization |
| SpecKit technical reconciliation | PASS | Historical planning checkboxes are preserved and explicitly superseded by the reconciliation record |
| Final pair review and delivery | PARTIAL | Mateja final review, corrections if requested, explicit pair acceptance, commits, and any authorized push remain pending |
