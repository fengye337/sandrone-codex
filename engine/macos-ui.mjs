// Mac-only placement. The upstream palette and player remain unchanged.
// Serialized into the renderer; no dependencies or native window geometry.
export function installMacUi(css, headerSelector) {
 const key='__SANDRONE_MAC_UI__';
 if(window[key]?.css===css&&document.adoptedStyleSheets.includes(window[key].sheet)){
  window[key].sync();return {installed:true,reused:true};
 }
 window[key]?.dispose();
 const sheet=new CSSStyleSheet();sheet.replaceSync(css);
 document.adoptedStyleSheets=[...document.adoptedStyleSheets,sheet];
 const button=document.createElement('button');button.id='sandrone-mac-replay';button.type='button';
 button.textContent='↻';button.title='重播桑多涅開屏';button.setAttribute('aria-label',button.title);
 button.style.cssText='flex:0 0 28px;align-self:center;width:28px;height:26px;margin:0 8px;border:1px solid #8e795355;border-radius:6px;background:#19232f;color:#e8d4ae;font:18px/24px system-ui;cursor:pointer;-webkit-app-region:no-drag;';
 let disposed=false,scheduled=false;
 const visible=node=>{if(!node||node.closest('[data-app-shell-active-page="false"]'))return false;const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.x<innerWidth&&r.y<innerHeight&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;};
 const sync=()=>{
  scheduled=false;if(disposed)return;
  const header=Array.from(document.querySelectorAll(headerSelector)).find(visible);
  const blocked=Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="menu"],[data-testid="image-preview-dismiss-area"]')).some(visible);
  const active=document.documentElement.getAttribute('data-dream-skin')==='active';
  // Normal header flow reserves space; never paint over traffic lights or use WCO.
  if(header&&button.parentNode!==header)header.appendChild(button);
  const hide=!active||!header||blocked||document.hidden||Boolean(document.fullscreenElement);
  if(button.hidden!==hide)button.hidden=hide;
 };
 const schedule=()=>{if(!scheduled&&!disposed){scheduled=true;queueMicrotask(sync);}};
 button.addEventListener('click',()=>{if(!button.hidden&&typeof window.sandroneReplayOpening==='function')window.sandroneReplayOpening('replay');});
 const observer=new MutationObserver(schedule);
 observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open','data-dream-skin','data-app-shell-active-page']});
 window.addEventListener('resize',schedule);document.addEventListener('visibilitychange',schedule);document.addEventListener('fullscreenchange',schedule);
 window[key]={css,sheet,sync,dispose(){disposed=true;observer.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',schedule);document.removeEventListener('fullscreenchange',schedule);button.remove();document.adoptedStyleSheets=document.adoptedStyleSheets.filter(s=>s!==sheet);delete window[key];}};
 sync();return {installed:true};
}

export function removeMacUi(){window.__SANDRONE_MAC_UI__?.dispose();return {removed:true};}
