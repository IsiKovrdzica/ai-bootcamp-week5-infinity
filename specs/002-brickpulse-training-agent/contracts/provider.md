# Agent Model Provider Boundary

## Application-facing request

```ts
type AgentPhase = "select_tool" | "produce_final"

type ToolDescriptor = {
  name: "analyze_game_performance"
  description: string // application constant, 1..240 code points
  inputSchema: {
    type: "object"
    additionalProperties: false
    required: readonly ["gameContextId"]
    properties: {
      gameContextId: { type: "string"; minLength: 1; maxLength: 64 }
    }
  }
}

type ModelStepRequest = {
  schemaVersion: 1
  promptVersion: "brickpulse-training-planner/v1"
  phase: AgentPhase
  goal: "analyze_completed_game_for_next_game_improvement"
  gameSummary: Readonly<GameSummary>
  run: {
    runId: string
    gameContextId: string
    contextVersion: 1
    stepNumber: 1 | 2 | 3
    remainingSteps: 0 | 1 | 2
    remainingToolCalls: 0 | 1 | 2
    remainingProviderAttempts: number
    deadlineAt: string
  }
  availableTools: readonly ToolDescriptor[]
  evidence: PerformanceAnalysisResult | null
}
```

The request uses exact keys and immutable validated projections. In `select_tool`, `evidence` is `null` and the one descriptor is present. In `produce_final`, normalized evidence is present and `availableTools` is empty because Core has no legitimate second tool action. The request never includes a repository, environment value, credential, raw logs/errors, arbitrary user prompt, provider selection, or prior raw model response.

`deadlineAt` is an ISO representation of the application-owned absolute deadline for provider context only; the orchestrator enforces time with its injected monotonic clock.

## Interface

```ts
type SafeTokenUsage = Readonly<{
  input?: number
  output?: number
}>

interface AgentModelProvider {
  generateStep(
    request: Readonly<ModelStepRequest>,
    options: {
      signal: AbortSignal
      onTokenUsage?: (usage: SafeTokenUsage) => void
    },
  ): Promise<unknown>
}
```

`SafeTokenUsage` is an optional, sanitized, provider-neutral observability
projection for the current provider attempt. It is not model or business
output, is not part of `ModelStepResponse` or a public HTTP response, and
contains no raw provider object, prompt, response, error, configuration, or
secret data. It may contain only approved finite non-negative numeric
`input`/`output` counts, must be attributed only to the producing provider
attempt, and must not affect routing or run success/failure if an observer
throws.

The provider:

- returns `unknown`;
- performs exactly one transport attempt per method call;
- owns no retry, fallback, run state, tool execution, focus validation, completion decision, or public projection;
- maps transport/provider errors to the existing closed `ProviderFailure` taxonomy;
- honors the supplied signal locally, while the orchestrator still guards late settlement.

This interface is adjacent to and does not modify Week 04 `AiAdviceProvider`.

## Accepted normalized response

The adapter parses provider JSON but does not establish trust. The application validator accepts only the exact union in `../data-model.md`:

- `tool_request` with exact `toolRequest` keys;
- `final` with the exact closed plan-decision structure;
- exact `{ "kind": "refusal" }`.

Serialized parsed proposals may not exceed 8 KiB. A malformed, oversized, extra-key, wrong-phase, or invalid-enum response is terminal and receives no retry/fallback.

## Scripted fake design

`ScriptedAgentModelProvider` accepts an immutable queue of steps. Each entry is one of:

```ts
type ScriptedStep =
  | { type: "resolve"; value: unknown }
  | { type: "reject"; failure: ProviderFailure }
  | { type: "deferred"; key: string }
```

Each invocation synchronously records a sanitized snapshot (`phase`, step number, call index, signal state), increments its adapter-call count, consumes exactly one script entry, and then resolves/rejects/waits. An exhausted script throws a programming failure. Deferred entries are controlled by the test and reject as `client_cancelled` on abort. The fake exposes no hidden automatic behavior; retry/fallback scenarios are represented by consecutive script entries and assert exact request equality for attempts belonging to one step.

## Gemini adapter responsibilities

The Week 05 Gemini adapter alone:

1. receives backend-injected key/model configuration;
2. translates `ModelStepRequest` to the versioned prompt and phase-specific structured JSON schema;
3. labels the summary/evidence as data, not instructions;
4. requests JSON and constrains output size/tokens;
5. sets SDK `retryOptions: { attempts: 1 }` and passes the signal;
6. parses returned text as `unknown` without validating business semantics;
7. safely projects token counts when finite/non-negative;
8. classifies errors with the existing Week 04 categories and never exposes raw details.

The application routing layer selects the configured primary or the one fixed `gemini-3.5-flash-lite` fallback. The adapter cannot choose a model dynamically from model output.

## Attempt selection

For each logical step:

1. Start the primary attempt if step/run/time budgets permit.
2. On network/connection, `408`, or `429`, wait the bounded existing 250ms delay and make the second and final attempt on the same primary.
3. On normalized plain unavailable `404`, `500`, `502`, or `503`, wait the same bounded delay and make the second and final attempt on the fixed fallback.
4. All other categories stop immediately.

The same immutable `ModelStepRequest` is used for both attempts. Across the run, no attempt starts beyond two per step or six total. An eligible failure with no configured/capability-approved fallback ends as `provider_failure`; it does not substitute an arbitrary model/provider.
