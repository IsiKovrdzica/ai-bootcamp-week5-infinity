import type { GameSummary } from './contracts.js'
import type { TrainingPlan, TrainingPlanStopReason } from '../../src/ai/training-contracts.js'
import type { PerformanceAnalysisResult } from './training-contracts.js'
import { renderPublicTrainingPlan, validateTrainingFinalProposal, validateTrainingInitialSummary, validateTrainingModelProposal } from './training-validation.js'
import { ProviderFailure } from './provider.js'
import type { AgentModelProvider, ModelStepRequest, SafeTokenUsage, ToolDescriptor } from './training-provider.js'
import { createTrainingToolRegistry } from './training-tool-registry.js'
type RunPhase='awaiting_tool'|'executing_tool'|'awaiting_final'|'terminal';
 type RunStatus='running'|'completed'|'stopped'|'failed'
export type TrainingRunState={readonly runId:string;
readonly status:RunStatus;
readonly phase:RunPhase;
readonly stepCount:number;
readonly providerAttemptCount:number;
readonly currentStepAttemptCount:number;
readonly retryAttemptCount:number;
readonly fallbackAttemptCount:number;
readonly toolProposalCount:number;
readonly toolCallCount:number;
readonly validatedToolResultCount:number;
readonly progressVersion:0|1|2;
readonly stopReason?:TrainingPlanStopReason;
readonly validatedEvidence?:PerformanceAnalysisResult;
readonly finalResult?:TrainingPlan}
export type TrainingEvent={readonly kind:'run_started'|'step_started'|'provider_attempt_settled'|'proposal_validated'|'tool_execution_settled'|'tool_result_validated'|'final_validated'|'run_finished';
readonly runId:string;
readonly phase:RunPhase;
readonly status:RunStatus;
readonly stepCount:number;
readonly providerAttemptCount:number;
readonly currentStepAttemptCount:number;
readonly retryAttemptCount:number;
readonly fallbackAttemptCount:number;
readonly toolProposalCount:number;
readonly toolCallCount:number;
readonly validatedToolResultCount:number;
readonly progressVersion:0|1|2;
readonly elapsedMs:number;
readonly attemptKind?:'initial'|'retry'|'fallback';
readonly providerCategory?:'primary'|'fixed_fallback';
readonly attemptLatencyMs?:number;
readonly tokenUsage?:SafeTokenUsage;
readonly outcome?:'success'|'failure'|'rejected'|'validated';
readonly toolName?:'analyze_game_performance';
readonly stopReason?:TrainingPlanStopReason}
export type TrainingOrchestratorDependencies={readonly provider:AgentModelProvider;
readonly fallbackProvider?:AgentModelProvider;
readonly registry:ReturnType<typeof createTrainingToolRegistry>;
readonly clock:()=>number;
readonly createId:()=>string;
readonly createContextId:()=>string;
readonly eventSink?:(event:TrainingEvent)=>void;
readonly setTimer?:(c:()=>void,m:number)=>ReturnType<typeof setTimeout>;
readonly clearTimer?:(t:ReturnType<typeof setTimeout>)=>void;
readonly sleep?:(m:number,s:AbortSignal)=>Promise<void>;
readonly signal?:AbortSignal;
readonly initialActionFingerprints?:readonly string[];
readonly initialCounters?:Readonly<Pick<TrainingRunState,'stepCount'|'providerAttemptCount'|'currentStepAttemptCount'|'retryAttemptCount'|'fallbackAttemptCount'|'toolProposalCount'|'toolCallCount'|'validatedToolResultCount'>>}
export type TrainingRunResult={readonly state:TrainingRunState;
readonly plan?:TrainingPlan;
readonly transitions:readonly RunPhase[];
readonly progressVersions:readonly(0|1|2)[]}
const descriptor:ToolDescriptor=Object.freeze({name:'analyze_game_performance',description:'Deterministic completed-game performance analysis.',inputSchema:Object.freeze({type:'object',additionalProperties:false,required:['gameContextId'] as const,properties:Object.freeze({gameContextId:Object.freeze({type:'string',minLength:1,maxLength:64})})})})
const frozen=(s:TrainingRunState)=>Object.freeze({...s})
export const trainingToolFingerprint=(toolName:string,argumentsValue:{readonly gameContextId:string},contextVersion:number)=>`${toolName}\n${JSON.stringify({gameContextId:argumentsValue.gameContextId})}\ncontextVersion=${contextVersion}`
export class TrainingActionGuard {
  private readonly executed = new Set<string>()
  constructor(seed: readonly string[] = []) { for (const fingerprint of seed) this.executed.add(fingerprint) }
  authorize(toolName: string, argumentsValue: { readonly gameContextId: string }, contextVersion: number): boolean {
    const fingerprint = trainingToolFingerprint(toolName, argumentsValue, contextVersion)
    if (this.executed.has(fingerprint)) return false
    this.executed.add(fingerprint)
    return true
  }
}
export class TrainingAgentOrchestrator { constructor(private readonly deps:TrainingOrchestratorDependencies) {}
 async run(input:unknown):Promise<TrainingRunResult>{
  const actionGuard = new TrainingActionGuard(this.deps.initialActionFingerprints)
  const runId=this.deps.createId(), gameContextId=this.deps.createContextId();
 let startedAt=0;
 let state:TrainingRunState={runId,status:'running',phase:'awaiting_tool',stepCount:0,providerAttemptCount:0,currentStepAttemptCount:0,retryAttemptCount:0,fallbackAttemptCount:0,toolProposalCount:0,toolCallCount:0,validatedToolResultCount:0,progressVersion:0,...this.deps.initialCounters};
 const transitions:RunPhase[]=['awaiting_tool'],progressVersions:(0|1|2)[]=[0];
 const emit=(kind:TrainingEvent['kind'],detail:Pick<TrainingEvent,'attemptKind'|'providerCategory'|'attemptLatencyMs'|'outcome'|'toolName'|'tokenUsage'>={})=>{const event=Object.freeze({kind,runId,phase:state.phase,status:state.status,stepCount:state.stepCount,providerAttemptCount:state.providerAttemptCount,currentStepAttemptCount:state.currentStepAttemptCount,retryAttemptCount:state.retryAttemptCount,fallbackAttemptCount:state.fallbackAttemptCount,toolProposalCount:state.toolProposalCount,toolCallCount:state.toolCallCount,validatedToolResultCount:state.validatedToolResultCount,progressVersion:state.progressVersion,elapsedMs:Math.max(0,Math.min(30000,Math.floor(this.deps.clock()-startedAt))),...(state.stopReason?{stopReason:state.stopReason}:{}),...detail} satisfies TrainingEvent);try{this.deps.eventSink?.(event)}catch{/* Observability is non-authoritative and must not change run routing. */}};
 const finish=(status:Exclude<RunStatus,'running'>,reason:TrainingPlanStopReason,plan?:TrainingPlan)=>{if(state.phase==='terminal')return;
state=frozen({...state,status,phase:'terminal',stopReason:reason,...(plan?{finalResult:plan}:{})});
transitions.push('terminal');
emit('run_finished')};

  const initial=validateTrainingInitialSummary(input);
if(!initial.ok){finish('stopped','invalid_model_proposal');
return{state,transitions,progressVersions}} const summary=initial.value as Readonly<GameSummary>;
const deadline=this.deps.clock()+30000,runAbort=new AbortController(),external=()=>runAbort.abort();
startedAt=deadline-30000;
this.deps.signal?.addEventListener('abort',external,{once:true});
const setTimer=this.deps.setTimer??((c,m)=>setTimeout(c,m) as ReturnType<typeof setTimeout>),clearTimer=this.deps.clearTimer??(t=>clearTimeout(t));
let deadlineExpired=false;
const timer=setTimer(()=>{deadlineExpired=true;
runAbort.abort()},30000);
 const stopped=()=>this.deps.signal?.aborted?'cancelled' as const:deadlineExpired||runAbort.signal.aborted||this.deps.clock()>=deadline?'total_deadline' as const:undefined;

  const request=(phase:ModelStepRequest['phase'],n:1|2|3):ModelStepRequest=>Object.freeze({schemaVersion:1,promptVersion:'brickpulse-training-planner/v1',phase,goal:'analyze_completed_game_for_next_game_improvement',gameSummary:Object.freeze({...summary}),run:Object.freeze({runId,gameContextId,contextVersion:1,stepNumber:n,remainingSteps:(3-n)as 0|1|2,remainingToolCalls:(2-state.toolCallCount)as 0|1|2,remainingProviderAttempts:6-state.providerAttemptCount,deadlineAt:new Date(deadline).toISOString()}),availableTools:phase==='select_tool'?Object.freeze([descriptor]):Object.freeze([]),evidence:state.validatedEvidence??null});

  const generate=async(phase:ModelStepRequest['phase'],n:1|2|3):Promise<unknown|undefined>=>{const pre=stopped();
if(pre){finish(pre==='cancelled'?'stopped':'failed',pre);
return}if(state.stepCount>=3){finish('stopped','step_limit');
return}state={...state,stepCount:state.stepCount+1,currentStepAttemptCount:0};
emit('step_started');
const req=request(phase,n);
let provider=this.deps.provider,route:'initial'|'retry'|'fallback'='initial';
for(let i=0;
i<2;
i++){const blocked=stopped();
if(blocked){finish(blocked==='cancelled'?'stopped':'failed',blocked);
return}if(state.providerAttemptCount>=6){finish('stopped','provider_attempt_limit');
return}const attemptAbort=new AbortController(),link=()=>attemptAbort.abort(),attemptTimeout=Math.min(15000,deadline-this.deps.clock());
runAbort.signal.addEventListener('abort',link,{once:true});
const attemptTimer=setTimer(()=>attemptAbort.abort(),attemptTimeout);
state={...state,providerAttemptCount:state.providerAttemptCount+1,currentStepAttemptCount:state.currentStepAttemptCount+1};
const attemptStartedAt=this.deps.clock(); let tokenUsage:SafeTokenUsage|undefined;
const acceptTokenUsage=(usage:SafeTokenUsage)=>{const input=typeof usage.input==='number'&&Number.isFinite(usage.input)&&usage.input>=0?usage.input:undefined,output=typeof usage.output==='number'&&Number.isFinite(usage.output)&&usage.output>=0?usage.output:undefined;if(input!==undefined||output!==undefined)tokenUsage=Object.freeze({... (input!==undefined?{input}:{}),...(output!==undefined?{output}:{})})};
try{const v=await provider.generateStep(req,{signal:attemptAbort.signal,onTokenUsage:acceptTokenUsage});
clearTimer(attemptTimer);
runAbort.signal.removeEventListener('abort',link);
emit('provider_attempt_settled',{attemptKind:i===0?'initial':route==='fallback'?'fallback':'retry',providerCategory:route==='fallback'?'fixed_fallback':'primary',attemptLatencyMs:Math.max(0,Math.floor(this.deps.clock()-attemptStartedAt)),outcome:'success',...(tokenUsage?{tokenUsage}:{})});
if(stopped()){const r=stopped()!;
finish(r==='cancelled'?'stopped':'failed',r);
return}return v}catch(e){clearTimer(attemptTimer);
runAbort.signal.removeEventListener('abort',link);
emit('provider_attempt_settled',{attemptKind:i===0?'initial':route==='fallback'?'fallback':'retry',providerCategory:route==='fallback'?'fixed_fallback':'primary',attemptLatencyMs:Math.max(0,Math.floor(this.deps.clock()-attemptStartedAt)),outcome:'failure',...(tokenUsage?{tokenUsage}:{})});
if(deadlineExpired){finish('failed','total_deadline');
return}if(this.deps.signal?.aborted){finish('stopped','cancelled');
return}if(attemptAbort.signal.aborted){finish('failed','provider_failure');
return}if(e instanceof ProviderFailure&&e.kind==='client_cancelled'){finish('stopped','cancelled');
return}const kind=e instanceof ProviderFailure?e.kind:'programming',retry=kind==='transient',fallback=kind==='provider_unavailable'&&!!this.deps.fallbackProvider;
if(i||(!retry&&!fallback)||deadline-this.deps.clock()<250){finish('failed','provider_failure');
return}try{await(this.deps.sleep??(async()=>{}))(250,runAbort.signal)}catch{finish(runAbort.signal.aborted?'stopped':'failed',runAbort.signal.aborted?'cancelled':'provider_failure');
return}if(fallback){provider=this.deps.fallbackProvider!;
state={...state,fallbackAttemptCount:state.fallbackAttemptCount+1};route='fallback'}else {state={...state,retryAttemptCount:state.retryAttemptCount+1};route='retry'}}}finish('failed','provider_failure')};

  try{emit('run_started');
const one=await generate('select_tool',1);
if(state.phase==='terminal')return{state,transitions,progressVersions};
const proposal=validateTrainingModelProposal(one,'select_tool');
if(!proposal.ok||proposal.value.kind!=='tool_request'){finish('stopped','invalid_model_proposal');
return{state,transitions,progressVersions}}state={...state,toolProposalCount:state.toolProposalCount+1};
emit('proposal_validated',{outcome:'validated',toolName:'analyze_game_performance'});
if(state.toolCallCount>=2){finish('stopped','tool_call_limit');
return{state,transitions,progressVersions}}
const actionAllowed = actionGuard.authorize(proposal.value.toolRequest.name, proposal.value.toolRequest.arguments, 1)
if (!actionAllowed) { finish('stopped', 'repeated_action'); return { state, transitions, progressVersions } }
state={...state,phase:'executing_tool'};
transitions.push('executing_tool');
const invoked=await this.deps.registry.invoke(proposal.value.toolRequest.name,proposal.value.toolRequest.arguments,{gameSummary:summary,gameContextId},runAbort.signal,Math.min(100,deadline-this.deps.clock()),()=>{state={...state,toolCallCount:state.toolCallCount+1}});
emit('tool_execution_settled',{outcome:invoked.ok?'success':'failure',toolName:'analyze_game_performance'});
if (this.deps.signal?.aborted) { finish('stopped', 'cancelled'); return { state, transitions, progressVersions } }
if (deadlineExpired || this.deps.clock() >= deadline) { finish('failed', 'total_deadline'); return { state, transitions, progressVersions } }
if(!invoked.ok){finish(invoked.reason==='tool_failure'||invoked.reason==='invalid_tool_result'?'failed':'stopped',invoked.reason as TrainingPlanStopReason);
return{state,transitions,progressVersions}}const evidence=invoked.value as PerformanceAnalysisResult;
state={...state,phase:'awaiting_final',validatedToolResultCount:state.validatedToolResultCount+1,progressVersion:1,validatedEvidence:evidence};
transitions.push('awaiting_final');
progressVersions.push(1);
emit('tool_result_validated',{outcome:'validated',toolName:'analyze_game_performance'});
const two=await generate('produce_final',2);
if(state.phase==='terminal')return{state,transitions,progressVersions};
const final=validateTrainingFinalProposal(two,evidence),rendered=final.ok?renderPublicTrainingPlan(final.value,evidence):final;
if(!rendered.ok){finish('stopped','invalid_final_output');
return{state,transitions,progressVersions}}state={...state,progressVersion:2};
progressVersions.push(2);
emit('final_validated',{outcome:'validated'});
finish('completed','completed',rendered.value);
return{state,plan:rendered.value,transitions,progressVersions}}finally{clearTimer(timer);
this.deps.signal?.removeEventListener('abort',external)}}}
