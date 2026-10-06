# Week 05 Acceptance Evaluations

Final Slice 8 evaluation on 2026-10-06 was entirely offline. The evaluator uses scripted providers, a deterministic local registry/tool, and injected time/timers. It does not instantiate Gemini, load provider configuration, require credentials, or perform network I/O. The A1–A18 matrix below remains that offline record.

| ID | Literal proof and observed outcome | Proof | Status |
|---|---|---|---|
| A1 | Valid game: 2 steps/attempts, 1 proposal/call/result/executor, current-run IDs and canonical findings, completed plan. | evaluator A1 | PASS |
| A2 | Structural invalid and semantic nonterminal summaries: 0 provider/tool/executor/fingerprint, no plan; HTTP 400 preflight has zero planner work. | evaluator A2; app tests | PASS |
| A3 | Null/incomplete envelopes: `invalid_model_proposal`, 0 tool/executor/fingerprint, no plan/raw projection. | evaluator A3 | PASS |
| A4 | Forbidden tool: `unknown_tool`, 0 call/executor/fingerprint, no plan; one-entry registry unchanged. | evaluator A4 | PASS |
| A5 | Fact-bearing, wrong, missing/invalid context and injection-extra args: `invalid_tool_arguments`, zero work/fingerprint/plan. | evaluator A5 | PASS |
| A6 | Throw and injected timeout: invocation/fingerprint 1, `tool_failure`, validated result 0, no later step/plan. | evaluator A6 | PASS |
| A7 | Malformed, inconsistent, nonfinite, oversized results: `invalid_tool_result`, no continuation/evidence/plan. | evaluator A7; tool tests | PASS |
| A8 | Transient retry is primary 2/fallback 0; unavailable route is primary 1/fallback 1; exact mutually exclusive counters, no third attempt. | evaluator A8 | PASS |
| A9 | Ineligible auth failure: primary 1, retry/fallback/tool 0, `provider_failure`. | evaluator A9 | PASS |
| A10 | Attempt max prevents call 7; immediate deadline prevents all provider/tool work; no plan. | evaluator A10 | PASS |
| A11 | Canonical fingerprint remains exactly once; `repeated_action`, no duplicate execution/call/later step. | evaluator A11 | PASS |
| A12 | Step, tool, per-step-attempt, and run-attempt limits stop before over-budget work. | evaluator A10/A12; orchestrator tests | PASS |
| A13 | Unknown, duplicate, unavailable evidence/focus, and unsupported action reject without success projection. | evaluator A13; semantic tests | PASS |
| A14 | First-step final: 1 step, 0 tool/result/executor, `invalid_model_proposal`, no plan; A1 proves valid later final. | evaluator A14/A1 | PASS |
| A15 | Injection text remains data: invalid args, 0 executor/call/fingerprint, unchanged registry, no later work/plan. | evaluator A15 | PASS |
| A16 | Restart aborts/hides stale result; later session/planner succeeds; Coach remains usable; smoke proves gameplay usability. | evaluator A16; controller/smoke | PASS |
| A17 | Fake/local success and negative paths run without Gemini/config/env/network; final offline commands require no credential. | evaluator A17; T92 | PASS |
| A18 | Fresh W03 42/5/1 and W04 15/155/45 passed; gameplay and `/api/ai/advice` preserved. | final T92 | PASS |

An earlier 18-test evaluator passed before human review found literal traceability gaps. The final evaluator has 34 executable cases; test count is not substituted for the literal matrix.

Second traceability and hostile review found no remaining partial, wrong-scenario, placeholder, missing-proof, or unexplained implementation-defect classification.

## A19 bounded live-verification handoff

A19 was completed after the offline matrix and its explicit human gate. One replacement provider-backed `npm run verify:training:live` invocation on 2026-10-06 completed with two logical steps, four provider attempts, one local tool call, stop reason `completed`, and validation result **PASS**. The preceding invocation was classified **SKIPPED** before the harness loaded, so it made no provider or network request. The full sanitized chronology and G9 handoff audit are recorded in [`docs/EVIDENCE_W05.md`](EVIDENCE_W05.md).

### Evidence interpretation

A1–A18 are deterministic offline evaluations using scripted providers and injected dependencies. A19 is one sanitized, bounded live verification result. Its PASS status demonstrates the application flow for that run; it is not a reliability, availability, latency, or output-quality benchmark for Gemini.
