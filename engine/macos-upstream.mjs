// Mac adapter around the original theme, verifier and cached opening client.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadPayload,verifySession} from '../vendor/dream-skin/windows/scripts/injector.mjs';
import {openingAssets} from './assets.mjs';
import {prepareOpening,showOpening,releaseOpening} from './opening-client.mjs';
import {removeNativeUi,setStartupPhase} from './renderer.mjs';
import {installMacUi,removeMacUi} from './macos-ui.mjs';
import {readinessDecision,safeGateSnapshot} from './macos-startup-diagnostics.mjs';
import {modeToggleAuditEntries} from './macos-controls.mjs';
const root=new URL('../',import.meta.url);
export const originalContract=JSON.parse(await fs.readFile(new URL('vendor/dream-skin/windows/assets/selectors.json',root),'utf8'));
export const call=(fn,...args)=>`(${fn.toString()})(${args.map(x=>JSON.stringify(x)).join(',')})`;
const contract=originalContract;
const evaluators=new WeakMap();
export function evaluateFor(session){if(!evaluators.has(session))evaluators.set(session,(code,options)=>{const metrics=session.startupOpeningMetrics;if(metrics?.active){if(metrics.calls===0)metrics.trace('media.transfer.start',{target:metrics.target,durationMs:performance.now()-metrics.started});metrics.calls++;metrics.bytes+=Buffer.byteLength(code);}return session.evaluate(code,options);});return evaluators.get(session);}

export function auditSurface(entries) {
 // Allowlisted geometry, counts and colors only: no text, HTML, values or URLs.
 const describe=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {width:Math.round(r.width),height:Math.round(r.height),inViewport:r.right>0&&r.bottom>0&&r.x<innerWidth&&r.y<innerHeight,background:s.backgroundColor,color:s.color,opacity:s.opacity,display:s.display,visibility:s.visibility,borderColor:s.borderColor,outlineColor:s.outlineColor,outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineOffset:s.outlineOffset,pressed:e.getAttribute?.('aria-pressed')??null,focusVisible:e.matches?.(':focus-visible')??false,hovered:e.matches?.(':hover')??false};};
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.x<innerWidth&&r.y<innerHeight&&s.display!=='none'&&s.visibility!=='hidden'&&s.contentVisibility!=='hidden'&&Number(s.opacity)!==0;};
 const gateKeys=new Set(['shell-main','left-panel','header-tint','home-icon','composer-chrome']);
 const gateNode=e=>{
  const r=e.getBoundingClientRect(),s=getComputedStyle(e),blocked=new Set();let n=e,depth=0;
  while(n&&depth++<32){const a=getComputedStyle(n);if(a.display==='none')blocked.add('DISPLAY_NONE');if(a.visibility==='hidden'||a.visibility==='collapse')blocked.add('VISIBILITY_HIDDEN');if(a.contentVisibility==='hidden')blocked.add('CONTENT_HIDDEN');if(Number(a.opacity)===0)blocked.add('OPACITY_ZERO');n=n.parentElement;}
  return {width:Math.round(r.width),height:Math.round(r.height),inViewport:r.right>0&&r.bottom>0&&r.x<innerWidth&&r.y<innerHeight,display:s.display,visibility:s.visibility,contentVisibility:s.contentVisibility,opacity:Number(s.opacity),ancestorBlockers:[...blocked],ancestorScanTruncated:Boolean(n)};
 };
 const matches=entries.map(({key,selector,tier,scope})=>{
  const elements=Array.from(document.querySelectorAll(selector)),active=elements.filter(e=>!e.closest('[data-app-shell-active-page="false"]')),shown=active.filter(visible);
  return {key,tier,scope,count:elements.length,active:active.length,visible:shown.length,...(gateKeys.has(key)?{gateNodes:active.slice(0,3).map(gateNode)}:{}),samples:shown.slice(0,3).map(e=>{
   const backgrounds=[];for(let a=e;a&&backgrounds.length<6;a=a.parentElement)backgrounds.push(getComputedStyle(a).backgroundColor);
   return {...describe(e),backgrounds};
  })};
 });
 const cache=window.__SANDRONE_MEDIA_CACHE__;
 return {matches,visibility:document.visibilityState,readyState:document.readyState,viewport:{width:innerWidth,height:innerHeight},version:window.__CODEX_DREAM_SKIN_STATE__?.version??null,
  skin:document.documentElement?.getAttribute('data-dream-skin')??null,opening:{stage:window.__SANDRONE_OPENING_STATE__?.stage??null,reason:window.__SANDRONE_OPENING_STATE__?.reason??null,cached:Boolean(cache&&!cache.disposed),videos:[cache?.color,cache?.trace].filter(Boolean).map(v=>({paused:v.paused,readyState:v.readyState,width:v.videoWidth,height:v.videoHeight,hasSource:Boolean(v.getAttribute('src'))}))},replay:{present:Boolean(document.getElementById('sandrone-mac-replay')),hidden:document.getElementById('sandrone-mac-replay')?.hidden??true}};
}
export async function prepareOriginalTheme({opening=true}={}){
 const [loaded,nativeCss,controlsCss,assets]=await Promise.all([loadPayload(fileURLToPath(new URL('themes/sandrone',root))),fs.readFile(new URL('engine/native-ui.css',root),'utf8'),fs.readFile(new URL('engine/macos-controls.css',root),'utf8'),opening?openingAssets():null]);
 return {loaded,css:nativeCss+'\n'+controlsCss,assets};
}
export async function auditOriginalTargets(session){
 const entries=[...contract.selectors,...modeToggleAuditEntries,{key:'code',selector:'pre,code',tier:'L2',scope:'thread'},{key:'input',selector:'textarea,[contenteditable="true"]',tier:'L2',scope:'home+thread'}];
 return session.evaluate(call(auditSurface,entries));
}
export async function removeOriginalTheme(session){
 const failures=[];
 // A failed media command must not prevent theme/style cleanup attempts.
 for(const operation of [()=>releaseOpening(evaluateFor(session)),()=>session.evaluate('window.__SANDRONE_MAC_BOOTSTRAP__?.dispose?.();window.__SANDRONE_MAC_TIMING__?.dispose?.();delete window.__SANDRONE_MAC_VERIFIED__;'+call(removeMacUi)),()=>session.evaluate(call(removeNativeUi)),()=>session.evaluate(`(()=>{window.__CODEX_DREAM_SKIN_DISABLED__=true;return Boolean(window.__CODEX_DREAM_SKIN_STATE__?.cleanup?.());})()`)]){
  try{await operation();}catch(error){failures.push(error);}
 }
 if(failures.length)throw Object.assign(new Error('Theme cleanup incomplete'),{code:'CLEANUP_INCOMPLETE'});
 return {removed:true};
}
export async function replayOriginalOpening(session,resources,{isCancelled=()=>false}={}){
 if(!resources.assets)return {shown:false,reason:'theme-only'};
 if(!await session.evaluate(`document.visibilityState==='visible'&&document.documentElement.getAttribute('data-dream-skin')==='active'&&Boolean(document.querySelector('[data-ds-part="main"]'))`))return {shown:false,reason:'inactive'};
 if(isCancelled())return {shown:false,reason:'cancelled'};
 const prepared=await prepareOpening(evaluateFor(session),resources.assets);
 if(isCancelled()){await releaseOpening(evaluateFor(session));return {shown:false,reason:'cancelled'};}
 return showOpening(evaluateFor(session),resources.assets,{replay:true},prepared);
}
export async function applyOriginalTheme({session,targetId,resources,verify=verifySession,opening=false,isCancelled=()=>false,trace=()=>{},reusePreparedTheme=false}){
 trace('audit.start',{target:targetId});
 const audit=await auditOriginalTargets(session);
 trace('audit.end',{target:targetId});
 const decision=readinessDecision(audit,reusePreparedTheme);
 trace('readiness.result',{target:targetId,pass:decision.pass,code:decision.code,gate:decision.gate,blockers:decision.blockers,snapshot:safeGateSnapshot(audit)});
 if(!decision.pass)return {pass:false,reason:decision.code,audit};
 const {loaded,css,assets}=resources;
 const guard=()=>{if(isCancelled())throw Object.assign(new Error('Theme operation cancelled'),{code:'THEME_CANCELLED'});};
 let preparation;
 try {
  guard();
  trace('theme.preflight.start',{target:targetId});
  await session.evaluate(`(()=>{window.__SANDRONE_MAC_BACKGROUND__?.dispose?.();window.__CODEX_DREAM_SKIN_DISABLED__=false;})()`);
  trace('theme.preflight.end',{target:targetId});
  guard();
  // Prepare media alongside original theme installation. Consume rejection
  // immediately; rollback below cancels renderer preparation before returning.
  if(opening&&assets){const metrics={active:true,calls:0,bytes:0,trace,target:targetId,started:performance.now()};session.startupOpeningMetrics=metrics;trace('media.prepare.start',{target:targetId});preparation=prepareOpening(evaluateFor(session),assets).then(value=>{metrics.active=false;trace('media.prepare.end',{target:targetId,pass:Boolean(value?.prepared),durationMs:value?.preparedMs,calls:metrics.calls,bytes:metrics.bytes});return {value};},error=>{metrics.active=false;trace('media.prepare.end',{target:targetId,pass:false,calls:metrics.calls,bytes:metrics.bytes});return {error};});}
  await session.evaluate(call(setStartupPhase,'applying'));
  guard();
  const reused=reusePreparedTheme&&await session.evaluate(`Boolean(window.__SANDRONE_MAC_BOOTSTRAP__?.applied&&!window.__SANDRONE_MAC_BOOTSTRAP__.disposed&&document.documentElement.getAttribute('data-dream-skin')==='active'&&window.__CODEX_DREAM_SKIN_STATE__?.revision===${JSON.stringify(loaded.revision)}&&window.__SANDRONE_MAC_UI__?.css===${JSON.stringify(css)}&&document.adoptedStyleSheets.includes(window.__SANDRONE_MAC_UI__.sheet))`);
  if(!reused){trace('theme.start',{target:targetId});await session.evaluate(loaded.payload);}
  guard();
  const header=contract.selectors.find(e=>e.key==='header-tint').selector;
  await session.evaluate(call(installMacUi,css,header));
  guard();
  trace(reused?'theme.reused':'theme.applied',{target:targetId});
  trace('validation.start',{target:targetId});
  const result=await verify(session,targetId,loaded.theme.id,loaded.revision);
  trace('validation.end',{target:targetId,pass:Boolean(result?.pass)});
  guard();
  if(!result?.pass){trace('rollback.start',{target:targetId});await removeOriginalTheme(session);trace('rollback.end',{target:targetId,pass:true});if(preparation)await preparation;return {pass:false,reason:'ORIGINAL_VERIFICATION_FAILED',audit};}
  await session.evaluate(`window.__SANDRONE_MAC_VERIFIED__={revision:${JSON.stringify(loaded.revision)}};`);
  await session.evaluate(call(setStartupPhase,'ready'));
  guard();
  let shown;
  if(preparation){const prepared=await preparation;guard();if(prepared.error)throw prepared.error;trace('animation.request',{target:targetId});shown=await showOpening(evaluateFor(session),assets,{},prepared.value);guard();if(shown?.shown){const timing=await session.evaluate(`(()=>{const state=window.__SANDRONE_OPENING_STATE__,video=window.__SANDRONE_MEDIA_CACHE__?.color;video?.requestVideoFrameCallback?.(()=>{try{window.sandroneStartup?.(JSON.stringify({phase:'animation.first-frame',rendererMs:performance.now(),rendererTimeOrigin:performance.timeOrigin}));}catch{}});return {started:state?.started};})()`);trace('animation.start',{target:targetId,rendererUnixMs:timing?.started});}}
  return {pass:true,audit,opening:shown};
 }catch(error){trace('rollback.start',{target:targetId});let cleaned=true;await removeOriginalTheme(session).catch(()=>{cleaned=false;});trace('rollback.end',{target:targetId,pass:cleaned});if(preparation)await preparation;throw error;}
}
