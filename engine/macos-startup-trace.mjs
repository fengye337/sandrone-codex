import {performance} from 'node:perf_hooks';
import {appendFile} from 'node:fs/promises';
import {earlyHookDiagnosis,startupWaitAnalysis,gateKeys} from './macos-startup-diagnostics.mjs';
// Monotonic host timestamps. Never accept page text, URLs or arbitrary errors.
export class StartupTrace {
 constructor({now=()=>performance.now(),wall=Date.now()}={}){this.now=now;this.begin=now();this.wall=wall;this.events=[];this.queue=Promise.resolve();this.file=null;this.writeFailed=false;}
 mark(event,details={}){
  if(!/^[a-z][a-z0-9.-]{0,80}$/.test(event))throw new Error('Invalid timing stage');
  const allowed=['target','mode','durationMs','requestedMs','actualMs','bytes','calls','count','pass','capturedBeforeScripts','rendererMs','rendererTimeOrigin','rendererUnixMs','code','reused','opening','resourceLoads','unixMs','attempt','cycle','pageCount','eligibleCount','appPageCount','cdpCode'];
  const safe={};for(const key of allowed){const value=details[key];if(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||['target','mode','code'].includes(key)&&typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(value))safe[key]=value;}
  for(const key of ['gate','wakeReason','errorCode'])if(typeof details[key]==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(details[key]))safe[key]=details[key];
  if(Array.isArray(details.blockers))safe.blockers=details.blockers.filter(x=>['DOCUMENT_HIDDEN','MAIN_NOT_VISIBLE_OR_UNMATCHED','SIDEBAR_NOT_VISIBLE','HEADER_NOT_VISIBLE','HOME_COMPOSER_NOT_VISIBLE'].includes(x));
  if(details.rejectionCounts)safe.rejectionCounts=Object.fromEntries(['NON_PAGE','NON_APP','AUXILIARY','INVALID_TARGET','INVALID_ENDPOINT'].map(k=>[k,Number.isInteger(details.rejectionCounts[k])&&details.rejectionCounts[k]>=0?details.rejectionCounts[k]:0]));
  if(details.snapshot){const value=details.snapshot;safe.snapshot={documentVisibility:['visible','hidden','prerender','unknown'].includes(value.documentVisibility)?value.documentVisibility:'unknown',readyState:['loading','interactive','complete','unknown'].includes(value.readyState)?value.readyState:'unknown',gates:(value.gates||[]).filter(e=>gateKeys.includes(e.key)).map(e=>({key:e.key,...Object.fromEntries(['count','active','visible'].map(k=>[k,Number.isInteger(e[k])&&e[k]>=0?e[k]:null])),nodes:(e.nodes||[]).slice(0,3).map(n=>({width:Number.isFinite(n.width)?n.width:null,height:Number.isFinite(n.height)?n.height:null,inViewport:n.inViewport===true,display:typeof n.display==='string'&&/^[a-z-]{1,30}$/.test(n.display)?n.display:null,visibility:['visible','hidden','collapse'].includes(n.visibility)?n.visibility:null,contentVisibility:['visible','hidden','auto'].includes(n.contentVisibility)?n.contentVisibility:null,opacity:Number.isFinite(n.opacity)?n.opacity:null,ancestorBlockers:(n.ancestorBlockers||[]).filter(x=>['DISPLAY_NONE','VISIBILITY_HIDDEN','CONTENT_HIDDEN','OPACITY_ZERO'].includes(x)),ancestorScanTruncated:n.ancestorScanTruncated===true}))}))};}
  const entry={schema:1,event,atMs:Number((this.now()-this.begin).toFixed(3)),...safe};this.events.push(entry);
  if(this.file)this.enqueue(entry);return entry;
 }
 enqueue(entry){this.queue=this.queue.then(()=>appendFile(this.file,JSON.stringify(entry)+'\n',{mode:0o600})).catch(()=>{this.writeFailed=true;});}
 start(file){this.file=file;this.enqueue({schema:1,event:'trace.origin',atMs:0,wallTimeOrigin:this.wall});for(const e of this.events)this.enqueue(e);}
 async flush(){await this.queue;}
}
export function summarizeStartup(events){
 const primaryTarget=events.find(e=>e.event==='validation.end')?.target;
 const first=name=>events.find(e=>e.event===name&&(!primaryTarget||!e.target||e.target===primaryTarget)),spawn=first('process.spawn.requested'),origin=events.find(e=>e.event==='trace.origin')?.wallTimeOrigin;
 const phases=['resources.start','resources.ready','process.spawn.requested','process.spawned','debugger.announced','debugger.connected','renderer.target.discovered','renderer.attached','renderer.document.observed','hook.registered','renderer.document.start','renderer.first-paint','renderer.first-contentful-paint','renderer.anchor.ready','renderer.structure.ready','theme.start','theme.applied','validation.start','validation.end','media.prepare.start','media.prepare.end','animation.request','animation.start','animation.first-frame'];
 const durations=(list)=>{const value={};for(const [key,start,end] of [['audit','audit.start','audit.end'],['theme','theme.start','theme.applied'],['verification','validation.start','validation.end'],['mediaPreparation','media.prepare.start','media.prepare.end'],['showAfterRequest','animation.request','animation.start']]){const a=list.find(e=>e.event===start),b=list.find(e=>e.event===end);value[key+'Ms']=a&&b?Number((b.atMs-a.atMs).toFixed(3)):null;}return value;};
 const targets=[...new Set(events.map(e=>e.target).filter(Boolean))].map(target=>{const own=events.filter(e=>e.target===target),media=own.find(e=>e.event==='media.prepare.end');return {target,...durations(own),mediaHostBeforeFirstCommandMs:own.find(e=>e.event==='media.transfer.start')?.durationMs??null,mediaRendererPreparationMs:media?.durationMs??null,mediaCalls:media?.calls??null,mediaExpressionBytes:media?.bytes??null,rendererTimeOrigin:own.find(e=>Number.isFinite(e.rendererTimeOrigin))?.rendererTimeOrigin??null};});
 return {earlyHook:earlyHookDiagnosis(events,primaryTarget),startupWait:startupWaitAnalysis(events,primaryTarget),startupMode:events.find(e=>e.event==='launcher.begin')?.mode??null,appVersion:events.find(e=>e.event==='app.metadata')?.code??null,nativeLauncherEntryUnixMs:events.find(e=>e.event==='launcher.native.entry')?.unixMs??null,primaryTarget:primaryTarget??null,targets,scope:'host receipt times unless renderer timestamps supplied; no native window visibility measurement',phases:phases.map(event=>{const e=first(event);return {event,atMs:e?.atMs??null,afterSpawnMs:e&&spawn?Number((e.atMs-spawn.atMs).toFixed(3)):null,rendererUnixMs:e?.rendererUnixMs??null,rendererEstimatedAfterSpawnMs:e&&spawn&&Number.isFinite(origin)&&Number.isFinite(e.rendererUnixMs)?Number((e.rendererUnixMs-origin-spawn.atMs).toFixed(3)):null};}),resourceLoads:first('resources.ready')?.resourceLoads??null,pollSleepMs:events.filter(e=>e.event==='poll.sleep').reduce((sum,e)=>sum+(e.actualMs||0),0),earlyTargets:events.filter(e=>e.event==='hook.registered').map(e=>({target:e.target,capturedBeforeScripts:e.capturedBeforeScripts})),validationPass:first('validation.end')?.pass??null,nativeWindowFirstVisibleMs:null};
}

// Numeric browser timing only; no DOM text, values, screenshots or page URLs.
export function installTimingProbe(){
 window.__SANDRONE_MAC_TIMING__?.dispose?.();
 const emit=(phase,at=performance.now())=>{try{window.sandroneStartup(JSON.stringify({phase,rendererMs:at,rendererTimeOrigin:performance.timeOrigin}));}catch{}};
 let observer;try{observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(['first-paint','first-contentful-paint'].includes(entry.name))emit('renderer.'+entry.name,entry.startTime);});observer.observe({type:'paint',buffered:true});}catch{}
 const loaded=()=>emit('renderer.domcontentloaded');
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loaded,{once:true});
 else {const navigation=performance.getEntriesByType('navigation')[0];if(navigation?.domContentLoadedEventEnd>0)emit('renderer.domcontentloaded',navigation.domContentLoadedEventEnd);}
 window.__SANDRONE_MAC_TIMING__={dispose(){observer?.disconnect();document.removeEventListener('DOMContentLoaded',loaded);}};
 return {origin:performance.timeOrigin,now:performance.now(),paints:performance.getEntriesByType('paint').filter(e=>e.name==='first-paint'||e.name==='first-contentful-paint').map(e=>({name:e.name,at:e.startTime}))};
}
