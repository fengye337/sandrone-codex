import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StartupTrace,summarizeStartup} from '../engine/macos-startup-trace.mjs';
import {readinessDecision,safeGateSnapshot} from '../engine/macos-startup-diagnostics.mjs';
import {installEarlyTargets} from '../engine/macos-early-document.mjs';
import {pageSelectionCounts} from '../engine/macos-skin-utils.mjs';

test('real-trace pattern distinguishes per-target deadline abort from global fallback and summary loss',()=>{
 const events=[{event:'launcher.begin',mode:'early-document',atMs:0},{event:'debugger.connected',atMs:407.620},{event:'renderer.attached',target:'main',atMs:1986.983,capturedBeforeScripts:true},{event:'hook.register.start',target:'main',atMs:2001.181},{event:'hook.pause-deadline',target:'main',atMs:3487.148},{event:'hook.command',target:'main',atMs:3517.872,code:'Runtime.enable',durationMs:1516.439541},{event:'theme.start',target:'main',atMs:7891.854},{event:'validation.end',target:'main',atMs:8562.632,pass:true}];
 const report=summarizeStartup(events);assert.equal(report.earlyTargets.length,0);assert.equal(report.earlyHook.explicitControllerFallback,false);assert.equal(report.earlyHook.primary.outcome,'ABORTED_BEFORE_SCRIPT_REGISTRATION');assert.equal(report.earlyHook.primary.scriptCommandObserved,false);assert.equal(report.earlyHook.primary.lateThemeObserved,true);assert.equal(report.startupWait.debuggerToThemeMs,7484.234);
 const other=summarizeStartup([...events,{event:'hook.registered',target:'aux',atMs:9000,capturedBeforeScripts:false}]);assert.equal(other.earlyHook.registeredTargetCount,1);assert.equal(other.phases.find(e=>e.event==='hook.registered').atMs,null);assert.equal(other.earlyHook.primary.registered,false);
 const fallback=summarizeStartup([...events,{event:'hook.unsupported',atMs:1000}]);assert.equal(fallback.earlyHook.explicitControllerFallback,true);
});
test('old audits expose missing conditions rather than inventing visibility or DOM reasons',()=>{
 const report=summarizeStartup([{event:'debugger.connected',atMs:100},{event:'audit.start',target:'main',atMs:200},{event:'audit.end',target:'main',atMs:202},{event:'poll.sleep',atMs:1202,actualMs:1000,requestedMs:1000},{event:'audit.start',target:'main',atMs:1205},{event:'audit.end',target:'main',atMs:1207},{event:'media.prepare.start',target:'main',atMs:1210},{event:'theme.start',target:'main',atMs:1220},{event:'validation.end',target:'main',atMs:1230,pass:true}]);
 const [a,b]=report.startupWait.attempts;assert.equal(a.result.code,'V1_GATE_CONDITION_NOT_RECORDED');assert.equal(a.result.snapshot,null);assert.equal(a.nextAttemptAtMs,1205);assert.equal(a.nextAttemptDelayMs,1003);assert.equal(a.waits[0].actualMs,1000);assert.equal(b.result.code,'PASSED_INFERRED_FROM_APPLICATION');
});
test('readiness diagnostics preserve baseline and early gate decisions',()=>{
 const sample=(visibility,matches)=>({visibility,matches}),main={key:'shell-main',count:1,active:1,visible:1};
 assert.equal(readinessDecision(sample('hidden',[main])).code,'MAIN_SURFACE_UNMATCHED');assert.equal(readinessDecision(sample('visible',[])).code,'MAIN_SURFACE_UNMATCHED');
 assert.equal(readinessDecision(sample('visible',[main]),false).pass,true);
 const early=readinessDecision(sample('visible',[main]),true);assert.equal(early.code,'RENDERER_NOT_READY');assert.deepEqual(early.blockers,['SIDEBAR_NOT_VISIBLE','HEADER_NOT_VISIBLE']);
 const home=[main,{key:'left-panel',visible:1},{key:'header-tint',visible:1},{key:'home-icon',active:1,count:1},{key:'composer-chrome',visible:0}];assert.deepEqual(readinessDecision(sample('visible',home),true).blockers,['HOME_COMPOSER_NOT_VISIBLE']);
 home.at(-1).visible=1;assert.equal(readinessDecision(sample('visible',home),true).pass,true);
});
test('readiness snapshots persist bounded structural observations but never text, values or unknown fields',()=>{
 const snapshot=safeGateSnapshot({visibility:'visible',readyState:'interactive',matches:[{key:'shell-main',count:1,active:1,visible:0,gateNodes:[{width:0,height:0,inViewport:false,display:'none',ancestorBlockers:['DISPLAY_NONE','PRIVATE_TEXT'],text:'PRIVATE_TEXT',value:'PRIVATE_TEXT'}]}]});
 const trace=new StartupTrace();trace.mark('readiness.result',{snapshot,blockers:['MAIN_NOT_VISIBLE_OR_UNMATCHED','PRIVATE_TEXT'],url:'https://private',text:'PRIVATE_TEXT'});
 const json=JSON.stringify(trace.events);assert.ok(json.includes('DISPLAY_NONE'));assert.ok(!json.includes('PRIVATE_TEXT'));assert.ok(!json.includes('https://'));assert.equal(trace.events[0].snapshot.gates[0].nodes[0].display,'none');
});
test('page-list diagnostics count rejection categories without logging page URLs',()=>{
 const valid={type:'page',url:'app://-/index.html',id:'main',webSocketDebuggerUrl:'ws://127.0.0.1:40000/devtools/page/main'};
 const result=pageSelectionCounts([valid,{...valid,url:'https://private.example/'},{...valid,url:'app://-/pet-overlay'},{type:'worker',url:'app://-/private'},{...valid,id:'unsafe/id'},{...valid,webSocketDebuggerUrl:'ws://127.0.0.1:40001/devtools/page/main'}],40000);
 assert.equal(result.eligibleCount,1);assert.equal(result.appPageCount,4);assert.deepEqual(result.rejectionCounts,{NON_PAGE:1,NON_APP:1,AUXILIARY:1,INVALID_TARGET:1,INVALID_ENDPOINT:1});assert.ok(!JSON.stringify(result).includes('private'));
});
test('model of Runtime.enable waiting on resume reproduces deadline abort before script registration',async()=>{
 const originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;let watchdog,listener,releaseEnable,enableStarted=false,finishResume,resumes=0;const calls=[],events=[],resumed=new Promise(resolve=>{finishResume=resolve;});
 globalThis.setTimeout=(fn,ms)=>{assert.equal(ms,1500);watchdog=fn;return 1;};globalThis.clearTimeout=()=>{};
 let manager;
 try{
  const enabled=new Promise(resolve=>{releaseEnable=resolve;});
  const browser={onEvent(fn){listener=fn;return ()=>{};},async send(){},async sendTo(id,method){calls.push(method);if(method==='Runtime.enable'){enableStarted=true;await enabled;}if(method==='Runtime.runIfWaitingForDebugger'){releaseEnable();if(++resumes===2)finishResume();}return {};}};
  manager=await installEarlyTargets(browser,{source:'NO_PRIVATE_PAYLOAD',trace:(event,details)=>events.push({event,...details})});
  listener('Target.attachedToTarget',{sessionId:'session',targetInfo:{targetId:'main',type:'page',url:'app://-/index.html'},waitingForDebugger:true});
  while(!enableStarted)await Promise.resolve();watchdog();await resumed;await manager.suspend();
  assert.ok(events.some(e=>e.event==='hook.registration-aborted'&&e.code==='PAUSE_DEADLINE'));assert.ok(!calls.includes('Page.addScriptToEvaluateOnNewDocument'));assert.ok(!events.some(e=>e.event==='hook.registered'));assert.equal(calls.filter(x=>x==='Runtime.runIfWaitingForDebugger').length,2);
 }finally{await manager?.close();globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;}
});
