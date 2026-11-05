import {test} from 'node:test';
import assert from 'node:assert/strict';
import {debuggerUrl,Session} from '../engine/cdp.mjs';
import {applyOriginalTheme,evaluateFor,prepareOriginalTheme,removeOriginalTheme,replayOriginalOpening,auditSurface} from '../engine/macos-upstream.mjs';
import {launchOptions} from '../engine/macos-skin.mjs';
import {runInNewContext} from 'node:vm';
const resources={loaded:{payload:'/* ORIGINAL PAYLOAD */',theme:{id:'test'},revision:'test'},css:'/* UPSTREAM CSS */',assets:null};
const audit={visibility:'visible',matches:[{key:'shell-main',visible:1}]};

test('Mac ephemeral transport validates exact loopback port while Windows default remains fixed',()=>{
 assert.equal(debuggerUrl('ws://127.0.0.1:19337/devtools/page/main'),'ws://127.0.0.1:19337/devtools/page/main');
 assert.throws(()=>new Session('ws://127.0.0.1:40000/devtools/page/main'));
 assert.equal(new Session('ws://127.0.0.1:40000/devtools/page/main',{port:40000}).url,'ws://127.0.0.1:40000/devtools/page/main');
 for(const url of ['ws://localhost:40000/devtools/page/main','ws://127.0.0.1:40001/devtools/page/main','ws://127.0.0.1:40000/devtools/page/main?x=1','wss://127.0.0.1:40000/devtools/page/main'])assert.throws(()=>new Session(url,{port:40000}));
 assert.throws(()=>debuggerUrl('ws://127.0.0.1:40000/devtools/page/main',null,'40000'));
});
test('original verifier retains CDP send and cached opening evaluator forwards timeout options',async()=>{
 const session=new Session('ws://127.0.0.1:40000/devtools/page/main',{port:40000});
 let observed;session.send=async(...args)=>{observed=args;return {result:{value:42}};};
 assert.equal(await evaluateFor(session)('test',{timeoutMs:15000}),42);
 assert.deepEqual(observed,['Runtime.evaluate',{expression:'test',returnByValue:true,awaitPromise:true},15000]);
 assert.equal(evaluateFor(session),evaluateFor(session));
});
test('hidden shell does not install, verify, prepare or play anything',async()=>{
 const calls=[];let verified=false;
 const result=await applyOriginalTheme({session:{evaluate:async expression=>{calls.push(expression);return {...audit,visibility:'hidden'};}},resources,verify:async()=>{verified=true;},opening:true});
 assert.equal(result.pass,false);assert.equal(calls.length,1);assert.equal(verified,false);
});
test('disable while original payload is pending cancels later UI and rolls back',async()=>{
 let cancelled=false,verified=false;const calls=[];
 const session={evaluate:async expression=>{calls.push(expression);if(calls.length===1)return audit;if(expression===resources.loaded.payload)cancelled=true;return true;}};
 await assert.rejects(applyOriginalTheme({session,resources,verify:async()=>{verified=true;},isCancelled:()=>cancelled}),{code:'THEME_CANCELLED'});
 assert.equal(verified,false);assert.ok(!calls.some(e=>e.startsWith('(function installMacUi')));
 assert.ok(calls.some(e=>e.includes('CODEX_DREAM_SKIN_DISABLED__=true')));
 assert.ok(calls.some(e=>e.includes('dispose')));
});
test('verification failure prevents opening and disables original state',async()=>{
 const calls=[];const session={evaluate:async e=>{calls.push(e);return calls.length===1?audit:true;}};
 const result=await applyOriginalTheme({session,resources,verify:async()=>({pass:false})});
 assert.equal(result.reason,'ORIGINAL_VERIFICATION_FAILED');assert.ok(calls.at(-1).includes('cleanup'));
 assert.ok(!calls.some(e=>e.includes('window.__SANDRONE_PLAYER__.show')));
});
test('successful Mac install uses upstream CSS and ready only after original verification',async()=>{
 const calls=[];const session={evaluate:async e=>{calls.push(e);return calls.length===1?audit:true;}};
 let beforeReady;
 const result=await applyOriginalTheme({session,targetId:'main',resources,verify:async(s,id,theme,revision)=>{assert.equal(s,session);assert.equal(id,'main');assert.equal(theme,'test');assert.equal(revision,'test');beforeReady=calls.length;return {pass:true};}});
 assert.equal(result.pass,true);assert.ok(calls.some(e=>e.includes('UPSTREAM CSS')));
 assert.ok(calls.slice(beforeReady).some(e=>e.endsWith('("ready")')));
});
test('offline preparation can exclude opening and never reads withdrawn CSS',async()=>{
 const original=await prepareOriginalTheme({opening:false});assert.equal(original.assets,null);assert.ok(original.loaded.payload.length>10000);
 assert.ok(!original.css.includes('Theme disabled pending verification'));
 assert.deepEqual(launchOptions(['--check','--theme-only']),{check:true,opening:false});assert.throws(()=>launchOptions(['--attach']));
});


test('cleanup still attempts style and original theme removal when media release fails',async()=>{
 const calls=[];const session={evaluate:async e=>{calls.push(e);if(calls.length===1)throw new Error('transport failure');return true;}};
 await assert.rejects(removeOriginalTheme(session),{code:'CLEANUP_INCOMPLETE'});
 assert.equal(calls.length,4);assert.ok(calls.at(-1).includes('CODEX_DREAM_SKIN_DISABLED__=true'));
});
test('disable after replay preparation cannot invoke the player',async()=>{
 let cancelled=false;const calls=[];
 const session={evaluate:async e=>{calls.push(e);if(e.startsWith('document.visibilityState'))return true;if(e.startsWith('({epoch:'))return {epoch:0,reusable:true};if(e.includes('?.ready??')){cancelled=true;return {prepared:true};}return true;}};
 assert.equal((await replayOriginalOpening(session,{assets:{}},{isCancelled:()=>cancelled})).shown,false);
 assert.ok(!calls.some(e=>e.includes('return window.__SANDRONE_PLAYER__.show')));
 assert.ok(calls.at(-1).includes('delete window.__SANDRONE_PLAYER__'));
});
test('manual diagnostic excludes inactive routes and never touches page text or input values',()=>{
 const secret='PRIVATE_TEST_CONTENT';
 const node={parentElement:null,closest:()=>null,getBoundingClientRect:()=>({x:0,y:0,right:500,bottom:200,width:500,height:200})};
 for(const key of ['textContent','innerHTML','value'])Object.defineProperty(node,key,{get(){throw new Error('Private field read: '+key);}});
 const inactive={...node,closest:()=>({})};
 const document={visibilityState:'visible',querySelectorAll:()=>[node,inactive],getElementById:()=>null,documentElement:{getAttribute:()=>null}};
 const report=runInNewContext(`(${auditSurface.toString()})([{key:'composer',selector:'textarea',tier:'L2',scope:'thread'}])`,{document,window:{},innerWidth:1000,innerHeight:800,getComputedStyle:()=>({backgroundColor:'rgb(0, 0, 0)',color:'rgb(255, 255, 255)',opacity:'1',visibility:'visible',display:'block'})});
 assert.equal(report.matches[0].count,2);assert.equal(report.matches[0].active,1);assert.equal(report.matches[0].visible,1);
 assert.ok(!JSON.stringify(report).includes(secret));assert.equal(report.matches[0].samples.length,1);
});
