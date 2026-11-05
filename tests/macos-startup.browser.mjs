// Spawn only our own isolated headless Chrome. No existing browser or app is used.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Session} from '../engine/cdp.mjs';
import {prepareOriginalTheme,applyOriginalTheme,removeOriginalTheme,call} from '../engine/macos-upstream.mjs';
import {bootstrapSource,installEarlyTargets,earlyPhaseNames} from '../engine/macos-early-document.mjs';
import {StartupTrace,summarizeStartup,installTimingProbe} from '../engine/macos-startup-trace.mjs';
import {watchSignal} from '../engine/watch-signal.mjs';
const chrome=process.env.CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixture=`<!doctype html><html><style>body{margin:0;font:16px system-ui}.shell{display:flex;height:100vh}aside{width:190px;flex-shrink:0}main{flex:1;min-width:0;background:white}header{height:48px;display:flex}.composer-surface-chrome{margin:24px;padding:20px;border:1px solid #aaa;min-height:100px}</style><div class="shell"><aside class="app-shell-left-panel">Fixture</aside><main data-app-shell-main-surface><header data-app-shell-header-edge-scroll>Startup fixture</header><div class="composer-surface-chrome"><textarea aria-label="Offline input"></textarea></div><button>Fixture action</button></main></div><script>requestAnimationFrame(()=>{window.themeAtFirstRaf=document.documentElement.getAttribute('data-dream-skin')==='active';});</script></html>`;
// Fixed network response latency belongs ONLY to this synthetic workload; the
// launcher contains no added sleep to hide its startup. Both modes see 80ms.
const server=createServer((req,res)=>setTimeout(()=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(fixture);},80));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const fixtureUrl=`http://127.0.0.1:${server.address().port}/fixture`;
const results=[];
async function trial(mode){
 const trace=new StartupTrace(),mark=(e,v)=>trace.mark(e,v);mark('resources.start');const resources=await prepareOriginalTheme();mark('resources.ready',{resourceLoads:1});
 const contract=JSON.parse(await readFile(new URL('../vendor/dream-skin/windows/assets/selectors.json',import.meta.url),'utf8'));
 // Test-only adaptation for Chrome's HTTP fixture: production stays app-only.
 const source=bootstrapSource(resources,contract).replace("location.protocol!=='app:'","location.protocol!=='http:'");
 const profile=await mkdtemp(path.join(os.tmpdir(),'sandrone-startup-fixture-'));
 let endpoint,announce;const announced=new Promise(resolve=>{announce=resolve;});
 mark('process.spawn.requested');const child=spawn(chrome,['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--window-size=1280,800','about:blank'],{stdio:['ignore','ignore','pipe']});
 child.once('spawn',()=>mark('process.spawned'));let buffer='';child.stderr.setEncoding('utf8');child.stderr.on('data',s=>{buffer=(buffer+s).slice(-8192);const match=buffer.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[\w-]+)/);if(match&&!endpoint){endpoint=match[1];mark('debugger.announced');announce();}});
 let browser,page,early;const signal=watchSignal();
 try{
  const began=Date.now();if(mode==='baseline'){while(!endpoint&&Date.now()-began<15000){const start=performance.now();await new Promise(r=>setTimeout(r,250));mark('poll.sleep',{actualMs:performance.now()-start,requestedMs:250});}}
  else {let timer;await Promise.race([announced,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Chrome endpoint timeout')),15000);})]);clearTimeout(timer);}
  if(!endpoint)throw new Error('No fixture browser endpoint');const port=Number(new URL(endpoint).port);browser=await new Session(endpoint,{port}).open();mark('debugger.connected');
  if(mode==='early-document')early=await installEarlyTargets(browser,{source,trace:mark,wake:()=>signal.wake()});
  else {browser.onEvent((method,params)=>{if(method==='Target.targetCreated'&&params.targetInfo.type==='page')mark('renderer.target.discovered',{target:params.targetInfo.targetId});});await browser.send('Target.setDiscoverTargets',{discover:true});}
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
  if(early){const until=Date.now()+8000;while(!trace.events.some(e=>e.event==='renderer.resumed'&&e.target===targetId)){assert.ok(Date.now()<until,'early target must resume');await signal.wait(50);}}
  page=await new Session(`ws://127.0.0.1:${port}/devtools/page/${targetId}`,{port}).open();
  page.onEvent((method,params)=>{if(method==='Runtime.bindingCalled'&&params.name==='sandroneStartup'){try{const v=JSON.parse(params.payload);if(earlyPhaseNames.has(v.phase)){mark(v.phase,{target:targetId,rendererMs:v.rendererMs,rendererTimeOrigin:v.rendererTimeOrigin,rendererUnixMs:v.rendererMs+v.rendererTimeOrigin});signal.wake();}}catch{}}});
  await page.send('Runtime.enable');await page.send('Runtime.addBinding',{name:'sandroneStartup'});
  const navigation=page.send('Page.navigate',{url:fixtureUrl});navigation.catch(()=>{});
  let result,attempts=0;const deadline=Date.now()+15000;
  do{
   attempts++;try{result=await applyOriginalTheme({session:page,targetId,resources,opening:true,reusePreparedTheme:Boolean(early),trace:mark});}catch(error){if(!/context|navigat/i.test(error.message))throw error;}
   if(result?.pass)break;
   assert.ok(Date.now()<deadline,'fixture verification deadline');const start=performance.now();if(early)await signal.wait(1000);else await new Promise(r=>setTimeout(r,1000));mark('poll.sleep',{requestedMs:1000,actualMs:performance.now()-start});
  }while(true);
  await navigation;assert.equal(result.pass,true);assert.equal(result.opening.shown,true);
  await page.evaluate(call(installTimingProbe));
  const frameDeadline=Date.now()+1000;while(!trace.events.some(e=>e.event==='animation.first-frame')&&Date.now()<frameDeadline)await signal.wait(40);
  const rendered=await page.evaluate(`({firstRaf:window.themeAtFirstRaf,origin:performance.timeOrigin,paints:performance.getEntriesByType('paint').map(e=>({name:e.name,at:e.startTime}))})`);
  for(const paint of rendered.paints)if(['first-paint','first-contentful-paint'].includes(paint.name))mark('renderer.'+paint.name,{target:targetId,rendererMs:paint.at,rendererTimeOrigin:rendered.origin,rendererUnixMs:paint.at+rendered.origin});
  assert.equal(rendered.firstRaf,mode==='early-document');
  assert.ok(trace.events.findIndex(e=>e.event==='validation.end'&&e.pass)<trace.events.findIndex(e=>e.event==='animation.request'));
  if(early){assert.ok(trace.events.some(e=>e.event==='hook.registered'&&e.target===targetId&&e.capturedBeforeScripts));assert.ok(trace.events.some(e=>e.event==='theme.reused'));}
  await early?.suspend();await removeOriginalTheme(page);assert.equal(await page.evaluate("document.documentElement.getAttribute('data-dream-skin')"),null);
  if(early){await page.send('Page.reload');const until=Date.now()+5000;let unthemed=false;while(Date.now()<until){try{unthemed=await page.evaluate("Boolean(document.querySelector('main'))&&!window.__SANDRONE_MAC_BOOTSTRAP__&&document.documentElement.getAttribute('data-dream-skin')!=='active'");if(unthemed)break;}catch{}await new Promise(r=>setTimeout(r,20));}assert.equal(unthemed,true,'disabled document script cannot resurrect after navigation');}
  await mkdir(new URL('../dist/',import.meta.url),{recursive:true});await writeFile(new URL(`../dist/startup-${mode}-fixture.jsonl`,import.meta.url),[{event:'trace.origin',atMs:0,wallTimeOrigin:trace.wall},...trace.events].map(e=>JSON.stringify(e)).join('\n')+'\n');
  results.push({mode,attempts,themeAtFirstRaf:rendered.firstRaf,summary:summarizeStartup([{event:'trace.origin',atMs:0,wallTimeOrigin:trace.wall},...trace.events]),events:[{event:'trace.origin',atMs:0,wallTimeOrigin:trace.wall},...trace.events]});
 }finally{
  await early?.close().catch(()=>{});await page?.close();await browser?.close();signal.dispose();child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(resolve,5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});await rm(profile,{recursive:true,force:true});
 }
}
try{
 await trial('baseline');await trial('early-document');
 await mkdir(new URL('../dist/',import.meta.url),{recursive:true});await writeFile(new URL('../dist/startup-benchmark.json',import.meta.url),JSON.stringify({scope:'isolated headless Chrome with an 80ms HTTP fixture; NOT ChatGPT startup or native-window visibility',testProtocol:'production app-only check changed to HTTP only inside this isolated test',results},null,2));
 console.log(JSON.stringify({pass:true,scope:'isolated synthetic startup; not real app performance',results:results.map(r=>({mode:r.mode,attempts:r.attempts,themeAtFirstRaf:r.themeAtFirstRaf,targets:r.summary.targets.filter(t=>t.target===r.summary.primaryTarget),phases:r.summary.phases.filter(p=>['debugger.connected','renderer.target.discovered','theme.applied','validation.end','animation.start'].includes(p.event)),pollSleepMs:r.summary.pollSleepMs}))}));
}finally{await new Promise(resolve=>server.close(resolve));}
