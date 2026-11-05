// Adapted from wsqUsaqi537, upstream PR #6, commit a661a4063b18d6a8b0637e039d4f49f236f3fdbe (MIT).
export function appIsRunning(processes, appPath) {
  return processes.split('\n').some(line=>line.trim()===appPath);
}
export function browserIdFromStderr(text,port) {
  if(!Number.isInteger(port)||port<1||port>65535) return null;
  const match=text.match(/(?:^|\n)DevTools listening on (ws:\/\/[^\s]+)(?=\s|$)/);
  if(!match) return null;
  try {
    const u=new URL(match[1]);
    if(u.protocol!=='ws:'||u.hostname!=='127.0.0.1'||u.port!==String(port)||u.username||u.password||u.search||u.hash) return null;
    return /^\/devtools\/browser\/([A-Za-z0-9-]+)$/.exec(u.pathname)?.[1]??null;
  } catch {return null;}
}
export function pageDebuggerUrl(page,port) {
  try {
    if(page.type!=='page'||!/^app:\/\//.test(page.url)||/pet-overlay|avatar-overlay/.test(page.url)||!/^[-A-Za-z0-9]+$/.test(page.id)) return null;
    const u=new URL(page.webSocketDebuggerUrl);
    if(u.protocol!=='ws:'||u.hostname!=='127.0.0.1'||u.port!==String(port)||u.username||u.password||u.search||u.hash||u.pathname!==`/devtools/page/${page.id}`) return null;
    return u.href;
  } catch {return null;}
}

// Classification only: do not persist page URLs, titles or rejected metadata.
export function pageSelectionCounts(pages,port){
 let appPageCount=0,eligibleCount=0;const rejectionCounts={NON_PAGE:0,NON_APP:0,AUXILIARY:0,INVALID_TARGET:0,INVALID_ENDPOINT:0};
 for(const page of pages){
  const app=page?.type==='page'&&typeof page.url==='string'&&page.url.startsWith('app://');if(app)appPageCount++;
  if(pageDebuggerUrl(page,port)){eligibleCount++;continue;}
  const reason=page?.type!=='page'?'NON_PAGE':!app?'NON_APP':/pet-overlay|avatar-overlay/.test(page.url)?'AUXILIARY':!/^[-A-Za-z0-9]+$/.test(page.id||'')?'INVALID_TARGET':'INVALID_ENDPOINT';rejectionCounts[reason]++;
 }
 return {pageCount:pages.length,appPageCount,eligibleCount,rejectionCounts};
}
