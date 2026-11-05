import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {StartupTrace,summarizeStartup} from '../engine/macos-startup-trace.mjs';
import {earlyDocument,installEarlyTargets} from '../engine/macos-early-document.mjs';
import {applyOriginalTheme} from '../engine/macos-upstream.mjs';
import {Session} from '../engine/cdp.mjs';
import {launchOptions} from '../engine/macos-skin.mjs';

test('startup trace uses monotonic timestamps and allowlisted metadata, with no invented window timing',()=>{
 let now=0;const trace=new StartupTrace({now:()=>now,wall:1000});trace.mark('resources.ready',{resourceLoads:1,url:'app://private',text:'PRIVATE',bytes:10});now=50;trace.mark('process.spawn.requested');now=80;trace.mark('debugger.connected');trace.mark('poll.sleep',{actualMs:30});
 const summary=summarizeStartup(trace.events);assert.equal(summary.phases.find(e=>e.event==='debugger.connected').afterSpawnMs,30);assert.equal(summary.nativeWindowFirstVisibleMs,null);assert.equal(summary.resourceLoads,1);assert.equal(summary.pollSleepMs,30);assert.ok(!JSON.stringify(trace.events).includes('PRIVATE'));assert.ok(!JSON.stringify(trace.events).includes('app://'));assert.throws(()=>trace.mark('private chat text'));
});
function fixture(protocol='app:',href='app://-/index.html',payload='window.payloadRuns=(window.payloadRuns||0)+1'){
 let observer;const calls=[],messages=[],window={sandroneStartup:s=>messages.push(JSON.parse(s))};window.top=window;
 const document={documentElement:{},querySelector:()=>({}),addEventListener(){}};
 const context={window,location:{protocol,href},document,performance:{now:()=>10,timeOrigin:1000},MutationObserver:class{constructor(fn){this.fn=fn;observer=this;}observe(){calls.push('observe');}disconnect(){calls.push('disconnect');}},setTimeout:()=>1,clearTimeout(){},install:()=>calls.push('install'),cleanupUi:()=>calls.push('cleanup-ui'),cleanupMedia:()=>calls.push('cleanup-media')};
 runInNewContext(`(${earlyDocument.toString()})(${JSON.stringify(payload)},'', 'header','main',install,cleanupUi,cleanupMedia)`,context);
 return {window,calls,messages,observer};
}
test('early bootstrap is main-frame app-only and applies the original payload just once at the anchor',()=>{
 const own=fixture();assert.equal(own.window.payloadRuns,1);own.observer.fn();assert.equal(own.window.payloadRuns,1);assert.equal(own.window.__SANDRONE_MAC_BOOTSTRAP__.applied,true);assert.ok(own.messages.some(e=>e.phase==='theme.applied'));
 assert.equal(fixture('https:','https://example.test').window.payloadRuns,undefined);assert.equal(fixture('app:','app://-/avatar-overlay').window.payloadRuns,undefined);
 own.window.__SANDRONE_MAC_BOOTSTRAP__.dispose();own.observer.fn();assert.equal(own.window.payloadRuns,1);
});
test('early bootstrap restores partial theme after a payload failure without emitting error text',()=>{
 const result=fixture('app:','app://-/index.html','throw new Error("PRIVATE")');assert.equal(result.window.__SANDRONE_MAC_BOOTSTRAP__.failed,true);assert.equal(result.window.__CODEX_DREAM_SKIN_DISABLED__,true);assert.ok(result.calls.includes('cleanup-ui'));assert.ok(result.calls.includes('cleanup-media'));assert.ok(!JSON.stringify(result.messages).includes('PRIVATE'));
});
function browserFixture(failMethod){
 let listener,resume;const calls=[],resumed=new Promise(resolve=>{resume=resolve;});
 return {calls,resumed,browser:{onEvent(fn){listener=fn;return ()=>{};},async send(method,params){calls.push({method,params});},async sendTo(id,method,params){calls.push({id,method,params});if(method===failMethod)throw new Error('injected protocol failure');if(method==='Runtime.runIfWaitingForDebugger')resume();return method==='Page.addScriptToEvaluateOnNewDocument'?{identifier:'script-1'}:{};}},attach(info={type:'page',url:'app://-/index.html',targetId:'main'}){listener('Target.attachedToTarget',{sessionId:'session-1',targetInfo:info,waitingForDebugger:true});}};
}
test('new targets register before resume, without evaluating a paused main world',async()=>{
 const f=browserFixture(),manager=await installEarlyTargets(f.browser,{source:'test-source',trace(){}});f.attach();await f.resumed;assert.ok(f.calls.findIndex(c=>c.method==='Page.addScriptToEvaluateOnNewDocument')<f.calls.findIndex(c=>c.method==='Runtime.runIfWaitingForDebugger'));assert.ok(!f.calls.some(c=>c.method==='Runtime.evaluate'));await manager.suspend();assert.ok(f.calls.some(c=>c.method==='Page.removeScriptToEvaluateOnNewDocument'));await manager.close();
});
test('unsupported early registration always resumes, and foreign targets are never injected',async()=>{
 for(const fail of ['Page.addScriptToEvaluateOnNewDocument',null]){
  const f=browserFixture(fail),manager=await installEarlyTargets(f.browser,{source:'test',trace(){}});f.attach(fail?undefined:{type:'page',url:'https://example.test',targetId:'foreign'});await f.resumed;if(!fail)assert.ok(!f.calls.some(c=>c.method==='Page.addScriptToEvaluateOnNewDocument'));await manager.close();
 }
});
test('failed removal is reported as incomplete, while close still disables auto-attach',async()=>{
 for(const failure of ['Page.removeScriptToEvaluateOnNewDocument','Runtime.evaluate']){const f=browserFixture(failure),manager=await installEarlyTargets(f.browser,{source:'test',trace(){}});f.attach();await f.resumed;await assert.rejects(manager.close(),{code:'EARLY_CLEANUP_INCOMPLETE'});assert.ok(f.calls.some(c=>c.method==='Target.setAutoAttach'&&c.params.autoAttach===false));}
});
test('pre-applied theme must still pass original verification and can roll back without reinstalling the payload',async()=>{
 for(const pass of [true,false]){const calls=[],stages=[],resources={loaded:{payload:'ORIGINAL_PAYLOAD',theme:{id:'test'},revision:'r'},css:'css',assets:null};const session={evaluate:async e=>{calls.push(e);return calls.length===1?{visibility:'visible',matches:[{key:'shell-main',visible:1},{key:'left-panel',visible:1},{key:'header-tint',visible:1}]}:true;}};let verified=0;
  const result=await applyOriginalTheme({session,targetId:'main',resources,reusePreparedTheme:true,verify:async()=>{verified++;return {pass};},trace:(phase,data)=>stages.push({phase,data})});assert.equal(result.pass,pass);assert.equal(verified,1);assert.ok(!calls.includes('ORIGINAL_PAYLOAD'));assert.ok(stages.some(e=>e.phase==='validation.end'&&e.data.pass===pass));if(!pass)assert.ok(calls.some(e=>e.includes('CODEX_DREAM_SKIN_DISABLED__=true')));
 }
});
test('flattened CDP commands carry their target session and ordinary commands remain unscoped',async()=>{
 const session=new Session('ws://127.0.0.1:19337/devtools/browser/test'),packets=[];session.socket={send:s=>{const p=JSON.parse(s);packets.push(p);queueMicrotask(()=>{const job=session.waiting.get(p.id);clearTimeout(job.timer);session.waiting.delete(p.id);job.resolve({});});}};
 await session.sendTo('child-1','Runtime.enable');await session.send('Target.getTargets');assert.equal(packets[0].sessionId,'child-1');assert.equal(packets[1].sessionId,undefined);assert.equal(launchOptions(['--early-document']).earlyDocument,true);
});


test('an early shell alone waits for structure without invoking verification or playing media',async()=>{
 let verified=false;const calls=[];
 const result=await applyOriginalTheme({session:{evaluate:async e=>{calls.push(e);return {visibility:'visible',matches:[{key:'shell-main',visible:1}]};}},targetId:'main',resources:{},reusePreparedTheme:true,opening:true,verify:async()=>{verified=true;return {pass:false};}});
 assert.equal(result.reason,'RENDERER_NOT_READY');assert.equal(verified,false);assert.equal(calls.length,1);
});
