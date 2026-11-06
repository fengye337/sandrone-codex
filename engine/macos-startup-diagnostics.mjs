// Pure decisions and trace analysis. No app connection, content or URL output.
export const gateKeys=['shell-main','left-panel','header-tint','home-icon','composer-chrome'];
export function readinessDecision(audit,early=false){
 const get=key=>audit.matches?.find(e=>e.key===key),visible=key=>(get(key)?.visible??0)>0;
 const blockers=[];
 if(audit.visibility==='hidden')blockers.push('DOCUMENT_HIDDEN');
 if(!visible('shell-main'))blockers.push('MAIN_NOT_VISIBLE_OR_UNMATCHED');
 if(blockers.length)return {pass:false,code:'MAIN_SURFACE_UNMATCHED',gate:'MAIN',blockers};
 if(early){
  for(const key of ['shell-main','left-panel','header-tint'])if(!visible(key))blockers.push(key==='left-panel'?'SIDEBAR_NOT_VISIBLE':'HEADER_NOT_VISIBLE');
  const home=(get('home-icon')?.active??get('home-icon')?.count??0)>0;
  if(home&&!visible('composer-chrome'))blockers.push('HOME_COMPOSER_NOT_VISIBLE');
  if(blockers.length)return {pass:false,code:'RENDERER_NOT_READY',gate:'EARLY_STRUCTURE',blockers};
 }
 return {pass:true,code:'READY',gate:early?'EARLY_STRUCTURE':'MAIN',blockers:[]};
}
export function safeGateSnapshot(audit){
 return {documentVisibility:['visible','hidden','prerender'].includes(audit.visibility)?audit.visibility:'unknown',readyState:['loading','interactive','complete'].includes(audit.readyState)?audit.readyState:'unknown',gates:gateKeys.map(key=>{const e=audit.matches?.find(e=>e.key===key);return {key,count:e?.count??null,active:e?.active??null,visible:e?.visible??null,nodes:e?.gateNodes??[]};})};
}
export function earlyHookDiagnosis(events,primaryTarget){
 const forTarget=target=>{
  const own=events.filter(e=>e.target===target),commands=own.filter(e=>e.event==='hook.command'),registered=own.some(e=>e.event==='hook.registered'),deadline=own.some(e=>e.event==='hook.pause-deadline'),attempted=commands.some(e=>e.code==='Page.addScriptToEvaluateOnNewDocument'),started=own.some(e=>e.event==='hook.register.start');
  let outcome=registered?'REGISTERED':deadline&&!attempted?'ABORTED_BEFORE_SCRIPT_REGISTRATION':own.some(e=>e.event==='hook.registration-failed')?'REGISTRATION_FAILED':attempted?'SCRIPT_REGISTRATION_NOT_CONFIRMED':started?'REGISTRATION_STARTED_NOT_CONFIRMED':'NOT_OBSERVED';
  return {target,outcome,registered,scriptCommandObserved:attempted,pauseDeadlineObserved:deadline,abortReasons:own.filter(e=>e.event==='hook.registration-aborted').map(e=>e.code),commands:commands.map(e=>({code:e.code,atMs:e.atMs,durationMs:e.durationMs??null,pass:e.pass??null,errorCode:e.errorCode??null,cdpCode:e.cdpCode??null})),lateThemeObserved:own.some(e=>e.event==='theme.start'&&!Number.isFinite(e.rendererMs))};
 };
 const ids=[...new Set(events.filter(e=>e.target&&(e.event.startsWith('hook.')||e.target===primaryTarget)).map(e=>e.target))];
 return {requested:events.some(e=>e.event==='launcher.begin'&&e.mode==='early-document'),explicitControllerFallback:events.some(e=>e.event==='hook.unsupported'),registeredTargetCount:new Set(events.filter(e=>e.event==='hook.registered').map(e=>e.target)).size,targets:ids.map(forTarget),primary:primaryTarget?forTarget(primaryTarget):null};
}
const round=x=>Number(x.toFixed(3));
export function startupWaitAnalysis(events,primaryTarget){
 const first=(event,target)=>events.find(e=>e.event===event&&(!target||e.target===target)),connected=first('debugger.connected'),theme=first('theme.start',primaryTarget);
 const audits=[];
 for(const e of events.filter(e=>e.target===primaryTarget)){
  if(e.event==='audit.start')audits.push({index:audits.length+1,startMs:e.atMs,endMs:null,result:null});
  else if(e.event==='audit.end'&&audits.length)audits.at(-1).endMs=e.atMs;
  else if(e.event==='readiness.result'&&audits.length)audits.at(-1).result={pass:e.pass,code:e.code,gate:e.gate,blockers:e.blockers??[],snapshot:e.snapshot??null};
 }
 const before=audits.filter(a=>theme&&a.startMs<theme.atMs);
 for(let i=0;i<before.length;i++){
  const a=before[i],next=before[i+1];a.nextAttemptAtMs=next?.startMs??null;a.nextAttemptDelayMs=next&&a.endMs!==null?round(next.startMs-a.endMs):null;
  const until=next?.startMs??theme?.atMs??Infinity;
  const stage=events.some(e=>e.target===primaryTarget&&e.atMs>=(a.endMs??a.startMs)&&e.atMs<=until&&(['media.prepare.start','theme.reused'].includes(e.event)||e.event==='theme.start'&&!Number.isFinite(e.rendererMs)));
  if(!a.result)a.result={pass:stage?true:null,code:stage?'PASSED_INFERRED_FROM_APPLICATION':'V1_GATE_CONDITION_NOT_RECORDED',gate:null,blockers:[],snapshot:null};
  a.waits=events.filter(e=>e.event==='poll.sleep'&&e.atMs>(a.endMs??a.startMs)&&e.atMs<=until).map(e=>({endMs:e.atMs,actualMs:e.actualMs,requestedMs:e.requestedMs,wakeReason:e.wakeReason??'V1_WAKE_REASON_NOT_RECORDED'}));
 }
 const discovered=first('renderer.target.discovered',primaryTarget),observed=first('renderer.document.observed',primaryTarget),passed=before.findLast(a=>a.result?.pass===true);
 const segment=(name,a,b)=>({name,startMs:a??null,endMs:b??null,durationMs:Number.isFinite(a)&&Number.isFinite(b)&&b>=a?round(b-a):null});
 return {debuggerToThemeMs:connected&&theme?round(theme.atMs-connected.atMs):null,segments:[segment('connected_to_target_discovered',connected?.atMs,discovered?.atMs),segment('target_discovered_to_document_observed',discovered?.atMs,observed?.atMs),segment('document_observed_to_successful_audit',observed?.atMs,passed?.endMs),segment('successful_audit_to_theme_start',passed?.endMs,theme?.atMs)],attempts:before,conditionsMissing:before.some(a=>a.result?.code==='V1_GATE_CONDITION_NOT_RECORDED'),retryEvents:events.filter(e=>['retry.wait.start','retry.wait.end','scan.targets.end','scan.targets.counts','scan.identity.end','scan.control.end','readiness.no-target','renderer.setup.command','attempt.start','readiness.error'].includes(e.event)&&connected&&theme&&e.atMs>=connected.atMs&&e.atMs<=theme.atMs)};
}
