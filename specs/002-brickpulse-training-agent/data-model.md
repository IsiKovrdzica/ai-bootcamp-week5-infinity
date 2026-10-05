# Data Model: BrickPulse Agentic Training Planner

This document fixes the Week 05 runtime entities and counter semantics. It does not change the existing Week 04 `GameSummary`, `AiAdvice`, `AiAdviceProvider`, or `/api/ai/advice` contracts.

## Domain constants and limits

```ts
const TRAINING_AGENT_LIMITS = {
  maxAgentSteps: 3,
  maxToolCalls: 2,
  maxProviderAttemptsPerStep: 2,
  maxProviderAttemptsPerRun: 6,
  providerAttemptTimeoutMs: 15_000,
  totalRunDeadlineMs: 30_000,
  toolTimeoutMs: 100,
  maxModelProposalBytes: 8 * 1024,
  maxToolResultBytes: 2 * 1024,
} as const
```

All byte ceilings use `Buffer.byteLength(JSON.stringify(value), "utf8")` after parsing and before accepting the value. The endpoint retains the existing 16 KiB request-body ceiling.

## Initial request

The request body is exactly the existing six-field terminal `GameSummary`:

```ts
type GameSummary = {
  outcome: "WON" | "GAME_OVER"
  score: number
  bricksDestroyed: number
  livesRemaining: number
  livesLost: number
  durationSeconds: number
}
```

The existing Week 04 validator remains authoritative: exact keys; finite numbers; integer counts; 0–32 bricks; 0–3 lives; `score === bricksDestroyed * 10`; `livesRemaining + livesLost === 3`; `WON` requires 32 destroyed bricks; `GAME_OVER` requires zero remaining lives; duration is finite and non-negative. Invalid input creates no run and causes zero provider attempts and tool executions.

## Run status and phase

```ts
type TrainingRunStatus =
  | "created"
  | "running"
  | "completed"
  | "stopped"
  | "failed"

type TrainingRunPhase =
  | "awaiting_tool"
  | "executing_tool"
  | "awaiting_final"
  | "terminal"
```

`created` is an in-memory construction state. A validated run immediately becomes `running/awaiting_tool`. Only these transitions are legal:

```text
created -> running/awaiting_tool
running/awaiting_tool -> running/executing_tool
running/executing_tool -> running/awaiting_final
running/* -> completed/terminal
running/* -> stopped/terminal
running/* -> failed/terminal
```

Terminal state is immutable. A late provider/tool result may be observed only to discard it; it cannot mutate terminal state.

## Stop reasons and status mapping

```ts
type TrainingStopReason =
  | "completed"
  | "invalid_model_proposal"
  | "unknown_tool"
  | "invalid_tool_arguments"
  | "invalid_tool_result"
  | "tool_failure"
  | "provider_failure"
  | "step_limit"
  | "tool_call_limit"
  | "provider_attempt_limit"
  | "total_deadline"
  | "repeated_action"
  | "invalid_final_output"
  | "cancelled"
```

`invalid_initial_input` is an endpoint/preflight classification, not a run stop reason, because no run exists. `completed` maps to status `completed`. Policy, proposal, budget, repetition, final-validation, and cancellation reasons map to `stopped`. Tool/result/provider/deadline failures map to `failed`.

## Exact counters

| Field | Increment point | Does not increment for |
|---|---|---|
| `stepCount` | Immediately before starting one new logical `generateStep` decision | Retry/fallback attempts for the same request; local validation/tool work |
| `providerAttemptCount` | Immediately before each adapter invocation | Backoff, validation, a call refused by a pre-call guard |
| `currentStepAttemptCount` | Same moment, reset to zero only when a new logical step begins | Attempts belonging to another step |
| `retryAttemptCount` | Immediately before an eligible same-primary second attempt | Initial or fallback attempts |
| `fallbackAttemptCount` | Immediately before an eligible fixed-fallback second attempt | Initial or same-primary retry attempts |
| `toolProposalCount` | After exact top-level parsing establishes `kind: "tool_request"`, before tool-name/argument authorization | Malformed/unparseable output and final proposals |
| `toolCallCount` | Immediately before invoking an authorized registry binding | Rejected, unknown, invalid, repeated, or over-budget proposals |
| `validatedToolResultCount` | When a normalized tool result is committed to run state | Thrown, timed-out, malformed, inconsistent, or oversized results |

One provider adapter call must represent exactly one transport attempt. `retryAttemptCount + fallbackAttemptCount <= providerAttemptCount`; a given second attempt is exactly one of retry or fallback, never both. A rejected tool can therefore be proven with both executor count and `toolCallCount` equal to zero. A tool that started and returned invalid output has `toolCallCount === 1` and `validatedToolResultCount === 0`.

## Agent run state

```ts
type TrainingRunState = {
  runId: string
  status: TrainingRunStatus
  phase: TrainingRunPhase
  goal: "analyze_completed_game_for_next_game_improvement"
  gameContextId: string
  contextVersion: 1
  stepCount: number
  providerAttemptCount: number
  currentStepAttemptCount: number
  retryAttemptCount: number
  fallbackAttemptCount: number
  toolProposalCount: number
  toolCallCount: number
  validatedToolResultCount: number
  startedAtMs: number
  deadlineAtMs: number
  executedActionFingerprints: readonly string[]
  progressVersion: 0 | 1 | 2
  validatedEvidence?: PerformanceAnalysisResult
  finalResult?: TrainingPlan
  stopReason?: TrainingStopReason
}
```

`progressVersion` is `0` before evidence, `1` after one validated tool result is committed, and `2` after the final plan is validated. It never decreases. IDs, clock, timers, and abort signals are injected at orchestration boundaries for deterministic tests.

## Tool arguments

```ts
type AnalyzeGamePerformanceArgs = {
  gameContextId: string
}
```

The object has exactly one key. `gameContextId` must exactly equal the current application-issued context ID, be 1–64 ASCII characters from `[A-Za-z0-9_-]`, and never contain game facts. The registry injects the validated `GameSummary`.

## Normalized metrics and evidence

```ts
type EvidenceId =
  | "game.outcome"
  | "game.bricks_destroyed"
  | "game.completion_rate"
  | "game.duration_seconds"
  | "game.bricks_per_minute"
  | "game.lives"

type EvidenceRecord = {
  id: EvidenceId
  metric:
    | "outcome"
    | "bricks_destroyed"
    | "completion_rate"
    | "duration_seconds"
    | "bricks_per_minute"
    | "lives"
  value: string
}

type PerformanceAnalysisResult = {
  schemaVersion: 1
  gameContextId: string
  outcome: "WON" | "GAME_OVER"
  score: number
  bricksDestroyed: number
  totalBricks: 32
  completionRate: number
  durationSeconds: number
  bricksPerMinute: number | null
  livesLost: number
  livesRemaining: number
  evidence: readonly EvidenceRecord[]
}
```

Evidence IDs and ordering are fixed as listed above. IDs are stable across runs for the same metric, unique within a result, and are not user/model supplied. Values are canonical strings:

- outcome: the enum value;
- bricks: `"<destroyed>/32"`;
- completion: exactly two decimal places followed by `%`;
- duration: the shortest finite decimal representation followed by `s`;
- throughput: exactly two decimal places followed by ` bricks/min`, or `"unavailable"`;
- lives: `"<lost> lost, <remaining> remaining"`.

### Numeric normalization

- `completionRate = round2((bricksDestroyed / 32) * 100)` and is in `0..100`.
- `bricksPerMinute = round2((bricksDestroyed * 60) / durationSeconds)` only when `durationSeconds > 0` and the raw result is finite; otherwise it is `null`.
- `round2(x) = Math.floor((x + Number.EPSILON) * 100 + 0.5) / 100` for these non-negative values.
- Validators recompute with this exact algorithm and require exact equality. `-0` is normalized to `0`. `NaN`, infinities, negative values, additional precision, unknown fields, wrong ordering/IDs, and inconsistent canonical strings are rejected.

The tool assigns no focus, rating, weakness, recommendation, cause, or threshold-derived label.

## Normalized model proposal

```ts
type RecommendationAction =
  | "reduce_lives_lost"
  | "improve_clear_rate"
  | "repeat_completed_clear"

type NormalizedModelProposal =
  | {
      kind: "tool_request"
      toolRequest: {
        name: string
        arguments: unknown
      }
    }
  | {
      kind: "final"
      plan: {
        focus: "survival" | "efficiency" | "consistency"
        summaryEvidenceIds: readonly EvidenceId[]
        recommendation: {
          action: RecommendationAction
          evidenceIds: readonly EvidenceId[]
        }
        evidenceIds: readonly EvidenceId[]
        confidence: "low" | "medium" | "high"
        completed: true
      }
    }
  | { kind: "refusal" }
```

Every variant uses exact keys. The final proposal contains no free-form factual prose. This makes semantic validation deterministic: the model still chooses the semantic focus and action, while the application renders bounded text only from validated evidence.

## Focus and recommendation support rules

These rules do not rank performance or introduce universal thresholds:

| Focus | Required objective predicate | Required references | Allowed action |
|---|---|---|---|
| `survival` | `livesLost > 0` | `game.lives`; `game.outcome` may also be cited | `reduce_lives_lost` |
| `efficiency` | `bricksPerMinute !== null` | both `game.bricks_per_minute` and `game.duration_seconds`; completion/bricks may also be cited | `improve_clear_rate` |
| `consistency` | `outcome === "WON"` | both `game.outcome` and `game.completion_rate`; lives may also be cited | `repeat_completed_clear` |

The predicates establish only that the selected training dimension is observable and the action is meaningful. They never claim that a metric is good, bad, high, low, fast, slow, better than peers, or caused by an unobserved event. More than one focus may be valid for the same run; choosing among supported focuses is the model's bounded judgment.

`summaryEvidenceIds` and top-level `evidenceIds` each contain 1–3 unique, known IDs from this run. Recommendation evidence contains 1–2 unique IDs and must include the required references above. All top-level IDs must be the ordered union used by the summary and recommendation. Unknown, duplicate, unavailable, cross-run, contradictory, or extraneous references reject the final.

## Final public training plan

```ts
type TrainingPlan = {
  summary: string
  focus: "survival" | "efficiency" | "consistency"
  recommendation: string
  evidence: readonly {
    id: EvidenceId
    finding: string
  }[]
  confidence: "low" | "medium" | "high"
  completed: true
}
```

Application-owned renderers create `summary`, `recommendation`, and evidence findings from the normalized proposal and referenced records. They are then exact-key validated. Bounds are:

- `summary`: trimmed, nonblank, 1–200 Unicode code points;
- `recommendation`: trimmed, nonblank, 1–240 Unicode code points;
- evidence: 1–3 unique entries; `finding` is trimmed, 1–120 code points and exactly matches the application template for its ID;
- the entire serialized plan: at most 2 KiB UTF-8.

The renderers use only factual templates (for example, the observed rate as a personal baseline) and never emit causal claims or hidden reasoning.

## Public run metadata

```ts
type PublicRunMetadata = {
  runId: string
  status: "completed" | "stopped" | "failed"
  stopReason: TrainingStopReason
  stepCount: number
  providerAttemptCount: number
  toolCallCount: number
  elapsedMs: number
}
```

Each count is a non-negative integer within its configured maximum. `elapsedMs` is finite, non-negative, rounded down to an integer, and capped for projection at `30_000`. Internal retry/fallback/proposal/validation detail belongs in sanitized observability, not the public envelope.
