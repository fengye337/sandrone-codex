import {installMacUi,removeMacUi} from './macos-ui.mjs';
import {removeNativeUi} from './renderer.mjs';
// Self-contained renderer code; main frame and app protocol only. It never
// conceals the official window or delays showing it. Theme is provisional until
// the host runs the original verifier. No video or opening starts here.
export function earlyDocument(payload,css,headerSelector,mainSelector,install,cleanupUi,cleanupMedia){
 if(window!==window.top||location.protocol!=='app:'||/pet-overlay|avatar-overlay/.test(location.href)||window.__SANDRONE_MAC_BOOTSTRAP__)return;
 const emit=phase=>{try{window.sandroneStartup(JSON.stringify({phase,rendererMs:performance.now(),rendererTimeOrigin:performance.timeOrigin}));}catch{}};
 const state={applied:false,failed:false,disposed:false};window.__SANDRONE_MAC_BOOTSTRAP__=state;
 emit('renderer.document.start');
 let observer,structureObserver,timer,paint;
 state.dispose=()=>{state.disposed=true;observer?.disconnect();structureObserver?.disconnect();clearTimeout(timer);paint?.disconnect();document.removeEventListener?.('visibilitychange',visibility);};
 state.restore=()=>{state.dispose();if(state.applied){cleanupUi();cleanupMedia();window.__CODEX_DREAM_SKIN_DISABLED__=true;window.__CODEX_DREAM_SKIN_STATE__?.cleanup?.();delete window.__SANDRONE_MAC_VERIFIED__;state.applied=false;}};
 try{paint=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(['first-paint','first-contentful-paint'].includes(entry.name))emit('renderer.'+entry.name);});paint.observe({type:'paint',buffered:true});}catch{}
 const visibility=()=>{if(!state.disposed)emit('renderer.wake');};
 document.addEventListener('visibilitychange',visibility);
 const structureReady=()=>{
  if(state.disposed||!state.applied||state.readyNotified)return;
  const usable=selector=>{const nodes=document.querySelectorAll?Array.from(document.querySelectorAll(selector)):[document.querySelector(selector)];return nodes.some(node=>{if(node?.closest?.('[data-app-shell-active-page="false"]'))return false;const r=node?.getBoundingClientRect?.();return r?.width>0&&r.height>0;});};
  if(!usable(headerSelector)||!usable('aside.app-shell-left-panel'))return;
  const home=document.querySelector('[data-testid="home-icon"]:not([data-app-shell-active-page="false"] *)');
  if(home&&!usable('[data-ds-part="composer"],textarea,[contenteditable="true"]'))return;
  state.readyNotified=true;structureObserver?.disconnect();clearTimeout(timer);emit('renderer.structure.ready');
 };
 const apply=()=>{
  if(state.disposed||state.applied||state.failed||window.__CODEX_DREAM_SKIN_DISABLED__)return;
  if(!document.documentElement||!document.querySelector(mainSelector+':not([data-app-shell-active-page="false"], [data-app-shell-active-page="false"] *)'))return;
  observer?.disconnect();emit('renderer.anchor.ready');
  try{emit('theme.start');(0,eval)(payload);install(css,headerSelector);state.applied=true;emit('theme.applied');structureObserver=new MutationObserver(structureReady);structureObserver.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','style','data-app-shell-active-page']});structureReady();}
  catch{state.failed=true;cleanupUi();cleanupMedia();window.__CODEX_DREAM_SKIN_DISABLED__=true;try{window.__CODEX_DREAM_SKIN_STATE__?.cleanup?.();}catch{}emit('hook.failed');}
  try{window.sandroneStartup(JSON.stringify({phase:'renderer.wake',rendererMs:performance.now(),rendererTimeOrigin:performance.timeOrigin}));}catch{}
 };
 observer=new MutationObserver(apply);observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-app-shell-main-surface','data-app-shell-active-page']});
 // Safety deadline releases observers; it is not a startup or playback delay.
 timer=setTimeout(()=>{observer.disconnect();structureObserver?.disconnect();emit('hook.expired');},30000);
 document.addEventListener('DOMContentLoaded',()=>{emit('renderer.domcontentloaded');apply();},{once:true});apply();
}
export function bootstrapSource(resources,contract){
 const header=contract.selectors.find(e=>e.key==='header-tint').selector,main=contract.selectors.find(e=>e.key==='shell-main').selector;
 return `(${earlyDocument.toString()})(${[resources.loaded.payload,resources.css,header,main].map(JSON.stringify).join(',')},(${installMacUi.toString()}),(${removeMacUi.toString()}),(${removeNativeUi.toString()}))`;
}
export const earlyPhaseNames=new Set(['renderer.document.start','renderer.anchor.ready','renderer.structure.ready','renderer.wake','renderer.first-paint','renderer.first-contentful-paint','renderer.domcontentloaded','theme.start','theme.applied','hook.failed','hook.expired','animation.first-frame']);
// Root browser connection belongs exclusively to the newly spawned process.
// Register synchronously-paused targets promptly, always resume in finally,
// and remove registrations on disable/failure/stop. Never reload a user's page.
export async function installEarlyTargets(browser,{source,trace,wake=()=>{},identity=async()=>{}}){
 const pages=new Map(),jobs=new Set();let enabled=true,closed=false;
 const eligible=info=>info?.type==='page'&&(!info.url||info.url==='about:blank'||/^app:\/\//.test(info.url))&&!/pet-overlay|avatar-overlay/.test(info.url||'');
 const sourceBytes=Buffer.byteLength(source);
 const run=async(id,method,params={},timeout=3000)=>{const began=performance.now();let pass=false,errorCode,cdpCode;trace('hook.command.start',{target:pages.get(id)?.info.targetId,code:method});try{const result=await browser.sendTo(id,method,params,timeout);pass=true;return result;}catch(error){errorCode=error.code;cdpCode=error.cdpCode;throw error;}finally{trace('hook.command',{target:pages.get(id)?.info.targetId,code:method,pass,errorCode,cdpCode,durationMs:performance.now()-began,...(method==='Page.addScriptToEvaluateOnNewDocument'?{bytes:sourceBytes}:{})});}};
 const abort=(page)=>{const code=!enabled?'DISABLED':closed?'CLOSED':page.cancelled?'PAUSE_DEADLINE':null;if(code)trace('hook.registration-aborted',{target:page.info.targetId,code});return Boolean(code);};
 async function register(id,page){
  if(!enabled||closed||!eligible(page.info)||page.script){trace('hook.registration-skipped',{target:page.info.targetId,code:!enabled?'DISABLED':closed?'CLOSED':page.script?'ALREADY_REGISTERED':'INELIGIBLE_TARGET'});return;}
  await identity();trace('hook.register.start',{target:page.info.targetId});
  await run(id,'Runtime.enable');
  if(abort(page))return;
  await run(id,'Runtime.addBinding',{name:'sandroneStartup'});
  if(abort(page))return;
  await run(id,'Page.enable');
  if(abort(page))return;
  // A document-start registration covers future navigations. Run the same
  // guarded bootstrap once in the current document when attachment was late.
  const result=await run(id,'Page.addScriptToEvaluateOnNewDocument',{source});page.script=result.identifier;page.owned=true;
  if(abort(page)){await run(id,'Page.removeScriptToEvaluateOnNewDocument',{identifier:page.script});page.script=null;return;}
  if(!page.waiting)await run(id,'Runtime.evaluate',{expression:source,returnByValue:true,awaitPromise:false});
  trace('hook.registered',{target:page.info.targetId,capturedBeforeScripts:page.waiting});
 }
 const listener=(method,params,sessionId)=>{
  if(method==='Target.attachedToTarget'){
   const page={info:params.targetInfo,waiting:params.waitingForDebugger,script:null,cancelled:false};pages.set(params.sessionId,page);
   trace('renderer.attached',{target:page.info.targetId,capturedBeforeScripts:Boolean(page.waiting)});
   const emergency=page.waiting?setTimeout(()=>{page.cancelled=true;trace('hook.pause-deadline',{target:page.info.targetId});run(params.sessionId,'Runtime.runIfWaitingForDebugger').catch(()=>{});wake('hook.pause-deadline');},1500):null;
   const job=(async()=>{try{await register(params.sessionId,page);}catch{trace('hook.registration-failed',{target:page.info.targetId});}finally{clearTimeout(emergency);try{await run(params.sessionId,'Runtime.runIfWaitingForDebugger');page.waiting=false;trace('renderer.resumed',{target:page.info.targetId});}catch{trace('hook.resume-failed',{target:page.info.targetId});}wake('renderer.resumed');}})();jobs.add(job);job.finally(()=>jobs.delete(job));
  }
  if(method==='Target.detachedFromTarget')pages.delete(params.sessionId);
  if(method==='Runtime.bindingCalled'&&params.name==='sandroneStartup'&&pages.has(sessionId)){
   try{const value=JSON.parse(params.payload);if(!earlyPhaseNames.has(value.phase))return;
    if(!Number.isFinite(value.rendererMs)||!Number.isFinite(value.rendererTimeOrigin))return;
    trace(value.phase,{target:pages.get(sessionId).info.targetId,rendererMs:value.rendererMs,rendererTimeOrigin:value.rendererTimeOrigin,rendererUnixMs:value.rendererTimeOrigin+value.rendererMs});wake(value.phase);
   }catch{}
  }
  if(method==='Target.targetCreated'||method==='Target.targetInfoChanged'||method==='Target.targetDestroyed'){
   if(method==='Target.targetCreated'&&params.targetInfo?.type==='page')trace('renderer.target.discovered',{target:params.targetInfo.targetId});wake(method);
  }
 };
 const unsubscribe=browser.onEvent(listener);
 async function suspend(){
  enabled=false;await Promise.allSettled([...jobs]);let failed=false;
  for(const [id,page]of pages){if(page.script){try{await run(id,'Page.removeScriptToEvaluateOnNewDocument',{identifier:page.script});page.script=null;}catch{failed=true;trace('hook.remove-failed',{target:page.info.targetId});}}
   if(page.owned)try{await run(id,'Runtime.evaluate',{expression:'window.__SANDRONE_MAC_BOOTSTRAP__?.restore?.();',returnByValue:true});}catch{if(pages.has(id)){failed=true;trace('hook.restore-failed',{target:page.info.targetId});}}
  }
  if(failed)throw Object.assign(new Error('Early document hook cleanup incomplete'),{code:'EARLY_CLEANUP_INCOMPLETE'});
 }
 const api={suspend,async resume(){enabled=true;for(const [id,page]of pages)await register(id,page);wake();},async close(){closed=true;try{await suspend();}finally{try{await browser.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true});}finally{unsubscribe();}}}};
 try{
  await browser.send('Target.setDiscoverTargets',{discover:true});
  await browser.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'page'},{exclude:true}]});
  return api;
 }catch(error){await api.close().catch(()=>{});throw error;}
}
