# Tool Contract: `analyze_game_performance`

## Purpose and mode

Deterministically convert one application-authorized terminal `GameSummary` into small objective metrics and stable evidence for the next model step.

- Mode: local, deterministic, read-only, side-effect-free.
- Allowed caller: only the Week 05 orchestrator through the fixed registry.
- Scope: only the current run's validated summary and matching `gameContextId`.
- Timeout: 100ms and remaining run time, whichever is smaller.
- Maximum result: 2 KiB serialized UTF-8.

## Model-visible input

```json
{
  "gameContextId": "ctx_example"
}
```

The object must contain exactly that field. The value must match the run context exactly and meet the 1–64 ASCII identifier bound. Score, outcome, bricks, lives, duration, thresholds, policies, model/provider names, URLs, paths, or extra fields are forbidden.

The application—not the model—injects the validated summary.

## Deterministic output

The exact schema is `PerformanceAnalysisResult` in `../data-model.md`. It contains:

- schema and context identity;
- authorized outcome/score/brick/life/duration facts;
- fixed total brick count `32`;
- completion percentage rounded to two decimals;
- brick-destruction rate rounded to two decimals, or `null` when mathematically unavailable/non-finite;
- exactly six fixed, ordered, uniquely identified evidence records.

It contains no focus, rating, weakness, cause, event inference, recommendation, threshold, provider data, or free-form model text.

## Registry design

The registry entry binds together:

```ts
type RegisteredTool = {
  descriptor: ToolDescriptor
  validateArguments: (value: unknown, context: RunContext) => ValidationResult<AnalyzeGamePerformanceArgs>
  execute: (args: AnalyzeGamePerformanceArgs, context: RunContext, signal: AbortSignal) => Promise<unknown>
  validateResult: (value: unknown, context: RunContext) => ValidationResult<PerformanceAnalysisResult>
}
```

The registry is created from application constants and frozen. There is no public generic registration API. Lookup happens before argument parsing/execution and is exact/case-sensitive. Tests inject a counting binding at the registry seam to prove rejected proposals never invoke it.

## Validation order

Before invocation:

1. run active and before deadline;
2. model proposal exact and allowed in phase;
3. step/attempt counts already represent the completed model decision;
4. exact allowlist lookup;
5. exact argument shape/value/context check;
6. tool-call budget check;
7. canonical fingerprint/repetition check;
8. fingerprint recorded;
9. `toolCallCount` incremented;
10. binding invoked with linked timeout/run signal.

After invocation, treat output as `unknown` and verify:

1. serialized result is at most 2 KiB;
2. exact object, scalar, and evidence keys/types/order;
3. matching `schemaVersion` and `gameContextId`;
4. finite numeric values and documented ranges/nullability;
5. exact recomputation from the authorized summary and Week 03 constants;
6. exact rounding and canonical evidence values;
7. six stable unique IDs with no unknown fields/text;
8. no focus/recommendation/internal/provider/secret fields.

Only the freshly constructed normalized projection is committed to state and sent to the model. The validator never returns the original object by reference.

## Fingerprint and progress

The canonical fingerprint is tool name + canonical exact arguments + `contextVersion=1`. It is recorded just before invocation. A repeated fingerprint when the current run cannot gain new evidence stops as `repeated_action` before another invocation.

Progress is only a validated result committed to state or a validated final plan. A thrown/timed-out/invalid result is not progress and is already terminal; a formatting change or invalid extra field cannot evade the fingerprint policy.

## Failure behavior

| Condition | Stop reason | Further model step | Actual invocation count |
|---|---|---:|---:|
| Unknown name | `unknown_tool` | No | 0 |
| Invalid/extra/wrong-context args | `invalid_tool_arguments` | No | 0 |
| Tool budget exhausted | `tool_call_limit` | No | 0 additional |
| Duplicate fingerprint | `repeated_action` | No | 0 additional |
| Throws or exceeds timeout | `tool_failure` | No | 1 |
| Malformed/inconsistent/oversized result | `invalid_tool_result` | No | 1 |

The tool must never mutate game state, score, lives, status, rules, storage, or provider configuration; start/restart gameplay; access filesystem, environment, network, browser, shell, database/SQL, or messaging; call a model; persist data; or execute generated code.
