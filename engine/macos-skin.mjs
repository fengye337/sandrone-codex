#!/usr/bin/env node
// User-run Mac launcher. Never attaches to, quits, or modifies an existing app.
import {readFile,appendFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {StartupTrace,installTimingProbe} from './macos-startup-trace.mjs';
import {bootstrapSource,installEarlyTargets,earlyPhaseNames} from './macos-early-document.mjs';
import {watchSignal} from './watch-signal.mjs';
import {diagnose} from '../macos/doctor.mjs';
import {dataRoot} from '../macos/paths.mjs';
import {launcherChannel} from '../macos/launcher-channel.mjs';
import {appIsRunning,browserIdFromStderr,pageDebuggerUrl,pageSelectionCounts} from './macos-skin-utils.mjs';
import {Session} from './cdp.mjs';
import {prepareOriginalTheme,applyOriginalTheme,removeOriginalTheme,replayOriginalOpening,call,originalContract} from './macos-upstream.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let logFile,launchedChild,activeTrace,activeLauncher,launcherCleanup='not-needed';
async function log(event,details={}){if(logFile)await appendFile(logFile,JSON.stringify({time:new Date().toISOString(),event,...details})+'\n',{mode:0o600});}
export function launchOptions(args){
 if(args.some(a=>!['--check','--theme-only','--early-document'].includes(a))||new Set(args).size!==args.length)throw new Error('Usage: node engine/macos-skin.mjs [--check] [--theme-only] [--early-document]');
 return {check:args.includes('--check'),opening:!args.includes('--theme-only'),...(args.includes('--early-document')?{earlyDocument:true}:{})};
}
export async function metadata(port,resource){
 const r=await fetch(`http://127.0.0.1:${port}${resource}`,{signal:AbortSignal.timeout(2000),redirect:'error'});
 if(!r.ok)throw new Error('Debugger metadata unavailable');const body=await r.text();if(body.length>1024*1024)throw new Error('Metadata too large');return JSON.parse(body);
}
async function main(){
 const trace=new StartupTrace();activeTrace=trace;const mark=(event,details)=>trace.mark(event,details);
 const options=launchOptions(process.argv.slice(2));
 let stopRequested=false,controlHandler;let requestStop=()=>{stopRequested=true;};
 if(!options.check)activeLauncher=launcherChannel({token:process.env.SANDRONE_LAUNCHER_TOKEN,onDisconnect:()=>requestStop(),onAction:async(action,id)=>{if(action==='stop'){requestStop();activeLauncher?.emit('status',{state:'stopping'});return;}if(!controlHandler)throw new Error('載入器尚未就緒，請稍候。');return controlHandler(action,id);}});
 activeLauncher?.emit('status',{state:'starting'});
 const nativeStart=Number(process.env.SANDRONE_NATIVE_LAUNCH_START_MS);if(Number.isFinite(nativeStart)&&nativeStart>0)mark('launcher.native.entry',{unixMs:nativeStart});
 mark('launcher.begin',{mode:options.earlyDocument?'early-document':'baseline'});
 if(process.platform!=='darwin'||Number(process.versions.node.split('.')[0])<24)throw new Error('需要 macOS 與 Node.js 24。');
 const projectRoot=dataRoot;
 mark('diagnose.start');const report=await diagnose();mark('diagnose.end');if(!report.app)throw new Error('找不到相容的 ChatGPT/Codex 應用程式。');
 mark('app.metadata',{code:report.app.version});
 const app=report.app,executable=path.join(app.path,'Contents/MacOS',app.executable);
 mark('resources.start');
 const resources=await prepareOriginalTheme();
 mark('resources.ready',{resourceLoads:1,bytes:Buffer.byteLength(resources.loaded.payload)+Buffer.byteLength(resources.css)+Object.values(resources.assets).reduce((n,v)=>n+Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v)),0)});
 const contract=originalContract;
 if(options.earlyDocument)mark('hook.source.prepare.start');
 const earlySource=options.earlyDocument?bootstrapSource(resources,contract):null;
 if(earlySource)mark('hook.source.prepare.end',{bytes:Buffer.byteLength(earlySource)});
 if(options.check){console.log(JSON.stringify({pass:true,app,theme:resources.loaded.theme.id,revision:resources.loaded.revision,originalAssets:{signature:Boolean(resources.assets.signature),outline:Boolean(resources.assets.outline),video:Boolean(resources.assets.video),traceVideo:Boolean(resources.assets.traceVideo)},withdrawnCssLoaded:false,launched:false,acceptance:'NOT_TESTED'},null,2));return;}
 if(stopRequested)return;
 // This branch must be run manually by the user after saving and exiting Work.
 const running=spawnSync('/bin/ps',['-axo','comm='],{encoding:'utf8'});
 if(running.status!==0)throw new Error('無法確認 ChatGPT 是否已退出，未啟動。');
 if(appIsRunning(running.stdout,executable))throw new Error('請先儲存工作並完全退出 ChatGPT，再手動執行此實驗啟動器。');
 await mkdir(path.join(projectRoot,'logs'),{recursive:true});await mkdir(path.join(projectRoot,'state'),{recursive:true});
 logFile=path.join(projectRoot,'logs/macos-skin.jsonl');await log('starting',{node:process.versions.node,opening:options.opening});
 const launch=randomUUID();trace.start(path.join(projectRoot,`logs/startup-${launch}.jsonl`));
 const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 launcherCleanup='unconfirmed';mark('process.spawn.requested');
 const child=spawn(executable,['--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`],{stdio:['ignore','ignore','pipe']});launchedChild=child;
 child.once('spawn',()=>mark('process.spawned'));
 let stopped=false,browserId=null,buffer='',spawnError=false;
 let debuggerReady;const announced=new Promise(resolve=>{debuggerReady=resolve;});
 child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{buffer=(buffer+chunk).slice(-8192);if(!browserId){browserId=browserIdFromStderr(buffer,port);if(browserId){mark('debugger.announced');debuggerReady(browserId);}}});
 child.on('exit',()=>{stopped=true;mark('process.exited');debuggerReady(null);});child.on('error',()=>{stopped=true;spawnError=true;debuggerReady(null);});
 await log('app-spawned',{port,pid:child.pid});
 const stop=()=>{stopRequested=true;debuggerReady(null);};requestStop=stop;process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const sessions=new Map(),signal=watchSignal(),attemptCounts=new Map();let browser,early;
 let wakeSequence=0,consumedWakeSequence=0,lastWakeReason='NONE';
 const wakeSignal=reason=>{wakeSequence++;lastWakeReason=reason;signal.wake();};
 async function observed(markPhase,event,details,operation){const began=performance.now();let pass=false,errorCode,cdpCode;try{const result=await operation();pass=true;return result;}catch(error){errorCode=error.code;cdpCode=error.cdpCode;throw error;}finally{markPhase(event,{...details,pass,errorCode,cdpCode,durationMs:performance.now()-began});}}
 async function pollSleep(ms){const detailed=!ready,began=performance.now(),before=wakeSequence,pending=wakeSequence>consumedWakeSequence;if(detailed)mark('retry.wait.start',{cycle,requestedMs:ms});if(options.earlyDocument)await signal.wait(ms);else await sleep(ms);const actualMs=performance.now()-began,wakeReason=!options.earlyDocument?'BASELINE_TIMER':pending?'PENDING_EVENT':wakeSequence!==before?lastWakeReason:'TIMEOUT';consumedWakeSequence=wakeSequence;if(detailed){mark('poll.sleep',{cycle,requestedMs:ms,actualMs,wakeReason});mark('retry.wait.end',{cycle,requestedMs:ms,actualMs,wakeReason});}}
 async function identity(){if(stopped)throw new Error('Launched application exited');const v=await metadata(port,'/json/version');if(v.webSocketDebuggerUrl!==`ws://127.0.0.1:${port}/devtools/browser/${browserId}`)throw Object.assign(new Error('Debugger identity changed'),{fatal:true,code:'IDENTITY_MISMATCH'});}
 let disabled=false,ready=false,openingShown=false,lastCommand=null,generation=0,command=null,controlError=null,replayedCommand=null,cycle=0;
 let controlTimer,controlQueue=Promise.resolve();
 const record={port,pid:child.pid,executable,launch,appVersion:app.version,traceFile:`startup-${launch}.jsonl`,startupMode:options.earlyDocument?'early-document':'baseline'};
 async function removeAll(){let pass=true;for(const s of sessions.values())if(!s.closed){try{await removeOriginalTheme(s);}catch{pass=false;}}return pass;}
 try{
  const deadline=Date.now()+30000;
  if(options.earlyDocument){let timer;await Promise.race([announced,new Promise(resolve=>{timer=setTimeout(resolve,30000);})]);clearTimeout(timer);}
  else while(!stopped&&!stopRequested&&!browserId&&Date.now()<deadline)await pollSleep(250);
  if(stopRequested)return;
  if(!browserId)throw new Error(spawnError?'應用啟動失敗。':'未能核對本次啟動的除錯身分；請手動退出本次啟動的 ChatGPT。');
  await identity();record.browserId=browserId;
  browser=await new Session(`ws://127.0.0.1:${port}/devtools/browser/${browserId}`,{port}).open();mark('debugger.connected');
  if(options.earlyDocument){try{early=await installEarlyTargets(browser,{source:earlySource,trace:mark,wake:reason=>wakeSignal(reason||'EARLY_EVENT'),identity});}catch{mark('hook.unsupported',{code:'FALLBACK_TO_LATE_INJECTION'});}}
  else {browser.onEvent((method,params)=>{if(method==='Target.targetCreated'&&params.targetInfo?.type==='page')mark('renderer.target.discovered',{target:params.targetInfo.targetId});});await browser.send('Target.setDiscoverTargets',{discover:true});}
  await writeFile(path.join(projectRoot,'state/macos-session.json'),JSON.stringify(record,null,2),{mode:0o600});
  async function applyControl(next){
   if(next.launch!==record.launch||next.nonce===lastCommand)return;
   lastCommand=next.nonce;command=next;
   if(next.action==='disable'){disabled=true;generation++;await identity();let hooksClean=true;try{await early?.suspend();}catch{hooksClean=false;}const cleanupComplete=await removeAll();await log('disabled',{cleanupComplete:cleanupComplete&&hooksClean});activeLauncher?.emit('status',{state:'disabled',cleanup:cleanupComplete&&hooksClean?'confirmed':'unconfirmed'});if(!hooksClean)throw new Error('早期註冊清理未能確認；主題清理已嘗試，請手動完全退出本次 ChatGPT。');}
   if(next.action==='enable'){generation++;await early?.resume();disabled=false;wakeSignal('CONTROL_ENABLE');await log('enabled');activeLauncher?.emit('status',{state:'starting'});}
  }
  async function readControl(){let next;try{next=JSON.parse(await readFile(path.join(projectRoot,'state/macos-control.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}await applyControl(next);}
  controlHandler=(action,nonce)=>{const operation=controlQueue.then(()=>{if(stopped||stopRequested)throw new Error('載入器正在停止。');return applyControl({launch:record.launch,nonce,action});});controlQueue=operation.catch(error=>{controlError=error;});return operation;};
  controlTimer=setInterval(()=>{controlQueue=controlQueue.then(()=>stopped||stopRequested?null:readControl()).catch(error=>{controlError=error;});},200);
  await log('debugger-identified');const readyDeadline=Date.now()+30000;
  while(!stopped&&!stopRequested){
   cycle++;const detailed=!ready,scanMark=(event,details)=>{if(detailed)mark(event,{cycle,...details});};
   await observed(scanMark,'scan.identity.end',{},identity);
   const pages=await observed(scanMark,'scan.targets.end',{},()=>metadata(port,'/json/list'));if(!Array.isArray(pages))throw new Error('Invalid target list');
   const counts=pageSelectionCounts(pages,port);scanMark('scan.targets.counts',counts);if(!counts.eligibleCount)scanMark('readiness.no-target',{code:'NO_ELIGIBLE_APP_TARGET',...counts});
   const valid=pages.filter(p=>pageDebuggerUrl(p,port)),ids=new Set(valid.map(p=>p.id));
   for(const [id,s]of sessions)if(!ids.has(id)||s.closed){await s.close();sessions.delete(id);}
   await observed(scanMark,'scan.control.end',{},()=>controlQueue);if(controlError)throw controlError;
   for(const page of valid){
    let session=sessions.get(page.id),stage='PAGE_CONNECT';const attempt=(attemptCounts.get(page.id)||0)+1;attemptCounts.set(page.id,attempt);
    const attemptMark=(event,details)=>{if(detailed||event!=='readiness.result')mark(event,{cycle,attempt,...details});};
    if(detailed)attemptMark('attempt.start',{target:page.id});
    try{
     if(!session){
      stage='PAGE_IDENTITY';await observed(scanMark,'renderer.setup.command',{target:page.id,attempt,code:stage},identity);stage='PAGE_CONNECT';session=await observed(scanMark,'renderer.setup.command',{target:page.id,attempt,code:'PAGE_CONNECT'},()=>new Session(pageDebuggerUrl(page,port),{port}).open());sessions.set(page.id,session);
      mark('renderer.page.connected',{target:page.id});if(!early)mark('renderer.attached',{target:page.id,capturedBeforeScripts:false});
      session.onEvent((method,params)=>{
       if(method==='Runtime.executionContextCreated'&&params.context?.auxData?.isDefault){mark('renderer.context.observed',{target:page.id});wakeSignal('Runtime.executionContextCreated');}
       if(method==='Runtime.bindingCalled'&&params.name==='sandroneStartup'){try{const v=JSON.parse(params.payload);if(earlyPhaseNames.has(v.phase)&&Number.isFinite(v.rendererMs)&&Number.isFinite(v.rendererTimeOrigin)){mark(v.phase,{target:page.id,rendererMs:v.rendererMs,rendererTimeOrigin:v.rendererTimeOrigin,rendererUnixMs:v.rendererMs+v.rendererTimeOrigin});wakeSignal(v.phase);}}catch{}return;}
       if(method!=='Runtime.bindingCalled'||params.name!=='sandroneReplayOpening'||params.payload!=='replay'||disabled||stopped||stopRequested||session.replaying)return;
       session.replaying=true;
       (async()=>{const own=generation;await identity();await replayOriginalOpening(session,resources,{isCancelled:()=>disabled||stopRequested||generation!==own});await log('replay-requested');})().catch(()=>log('replay-failed')).finally(()=>{session.replaying=false;});
      });
      stage='RUNTIME_ENABLE';await observed(scanMark,'renderer.setup.command',{target:page.id,attempt,code:stage},()=>session.send('Runtime.enable'));
      stage='BIND_REPLAY';await observed(scanMark,'renderer.setup.command',{target:page.id,attempt,code:stage},()=>session.send('Runtime.addBinding',{name:'sandroneReplayOpening'}));
      stage='BIND_TIMING';await observed(scanMark,'renderer.setup.command',{target:page.id,attempt,code:stage},()=>session.send('Runtime.addBinding',{name:'sandroneStartup'}));
      stage='TIMING_PROBE';const clock=await observed(scanMark,'renderer.setup.command',{target:page.id,attempt,code:stage},()=>session.evaluate(call(installTimingProbe)));
      mark('renderer.document.observed',{target:page.id,rendererTimeOrigin:clock.origin,rendererMs:clock.now,rendererUnixMs:clock.origin+clock.now});
      for(const paint of clock.paints)mark('renderer.'+paint.name,{target:page.id,rendererMs:paint.at,rendererTimeOrigin:clock.origin,rendererUnixMs:clock.origin+paint.at});
     }
     if(disabled){await removeOriginalTheme(session);continue;}
     stage='HEALTH_CHECK';const healthy=await observed(scanMark,'renderer.setup.command',{target:page.id,attempt,code:stage},()=>session.evaluate(`Boolean(window.__SANDRONE_MAC_VERIFIED__?.revision===${JSON.stringify(resources.loaded.revision)}&&document.documentElement?.getAttribute('data-dream-skin')==='active'&&window.__CODEX_DREAM_SKIN_STATE__?.revision===${JSON.stringify(resources.loaded.revision)}&&window.__SANDRONE_MAC_UI__&&document.adoptedStyleSheets.includes(window.__SANDRONE_MAC_UI__.sheet))`));
     if(!healthy){
      stage='APPLY_ORIGINAL_THEME';const operation=generation;
      const result=await applyOriginalTheme({session,targetId:page.id,resources,opening:options.opening&&!openingShown,isCancelled:()=>disabled||stopRequested||operation!==generation,trace:attemptMark,reusePreparedTheme:Boolean(early)});
      if(result.reason==='ORIGINAL_VERIFICATION_FAILED'){let hooksClean=true;try{await early?.suspend();}catch{hooksClean=false;}throw Object.assign(new Error(hooksClean?'原版主題驗證未通過，已撤回。':'原版驗證失敗且早期註冊清理未能確認，請手動退出本次 ChatGPT。'),{fatal:true});}
      if(result.pass){if(!ready)mark('startup.ready',{target:page.id});ready=true;openingShown||=Boolean(result.opening?.shown);await log('original-theme-verified',{target:page.id,openingShown,visualAcceptance:'PENDING'});console.log('原版程式驗證通過，仍待手動檢查畫面。');if(!stopRequested)activeLauncher?.emit('status',{state:'ready'});}
     }
     if(command?.launch===record.launch&&command.action==='replay'&&command.nonce===lastCommand&&replayedCommand!==lastCommand){const own=generation;const result=await replayOriginalOpening(session,resources,{isCancelled:()=>disabled||stopRequested||generation!==own});if(result.reason!=='inactive')replayedCommand=lastCommand;}
    }catch(error){
     if(detailed)attemptMark('readiness.error',{target:page.id,gate:stage,code:'COMMAND_ERROR',errorCode:error.code||'UNCLASSIFIED',cdpCode:error.cdpCode});
     if(error.fatal)throw error;
     // Context destruction while routing/reloading is retried; never log page contents.
     await log('target-unavailable',{target:page.id,code:error.code||'RENDERER_UNAVAILABLE'});
     await session?.close();sessions.delete(page.id);
    }
   }
   if(!ready&&!disabled&&Date.now()>readyDeadline)throw new Error('30 秒內未能驗證原版主題；請回傳手動診斷。');
   await pollSleep(1000);
  }
 }finally{
  controlHandler=null;clearInterval(controlTimer);await controlQueue;
  let hooksClean=true;await early?.close().catch(()=>{hooksClean=false;if(!stopped){mark('hook.cleanup-incomplete');console.error('早期註冊清理未能確認，請手動完全退出本次 ChatGPT。');}});signal.dispose();
  // Restore only the app this launcher started. Never quit or kill the user's app.
  // On an identity mismatch do not send further renderer commands.
  if(stopped)launcherCleanup='application-exited';
  else {try{await identity();const removed=await removeAll();launcherCleanup=removed&&hooksClean?'confirmed':'unconfirmed';}catch{launcherCleanup='unconfirmed';}}
  for(const s of sessions.values())await s.close();await browser?.close();await trace.flush();if(trace.writeFailed)console.error('啟動時間線寫入失敗，未取得完整量測。');
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  child.unref();child.stderr.unref?.();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().then(()=>{activeLauncher?.emit('status',{state:'stopped',cleanup:launcherCleanup});}).catch(async error=>{await log('failed',{code:error.code||'LAUNCHER_FAILED'}).catch(()=>{});console.error(error.message);activeLauncher?.emit('status',{state:'failed',message:error.message,cleanup:launcherCleanup});process.exitCode=1;await activeTrace?.flush();launchedChild?.unref();launchedChild?.stderr?.unref?.();}).finally(()=>activeLauncher?.close());
