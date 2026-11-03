export function appIsRunning(processes, appPath) {
 return processes.split('\n').some(line => line.trim() === appPath);
}

export function browserIdFromStderr(text, port) {
 const match = text.match(new RegExp(`DevTools listening on ws://127\\.0\\.0\\.1:${port}/devtools/browser/([A-Za-z0-9-]+)`));
 return match?.[1] ?? null;
}

export function pageDebuggerUrl(page, port) {
 try {
  if (page.type !== 'page' || !/^app:\/\//.test(page.url) || /pet-overlay|avatar-overlay/.test(page.url)) return null;
  if (!/^[A-Za-z0-9-]+$/.test(page.id)) return null;
  const url = new URL(page.webSocketDebuggerUrl);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.port !== String(port) || url.username || url.password || url.search || url.hash || url.pathname !== `/devtools/page/${page.id}`) return null;
  return url.href;
 } catch { return null; }
}
