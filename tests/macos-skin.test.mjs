import test from 'node:test';
import assert from 'node:assert/strict';
import { appIsRunning, browserIdFromStderr, pageDebuggerUrl } from '../engine/macos-skin-utils.mjs';

test('recognizes only the main ChatGPT process', () => {
 const app = '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT';
 assert.equal(appIsRunning(`  ${app}\n`, app), true);
 assert.equal(appIsRunning(`${app} Helper\n`, app), false);
});

test('takes browser identity only from the launched local port', () => {
 const message = 'DevTools listening on ws://127.0.0.1:12345/devtools/browser/abc-123';
 assert.equal(browserIdFromStderr(message, 12345), 'abc-123');
 assert.equal(browserIdFromStderr(message, 12346), null);
 assert.equal(browserIdFromStderr(message.replace('127.0.0.1', '127.0.0.2'), 12345), null);
});

test('only accepts local app page targets with matching identities', () => {
 const page = { type:'page', id:'ABC-123', url:'app://codex/index.html', webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/ABC-123' };
 assert.equal(pageDebuggerUrl(page,12345), page.webSocketDebuggerUrl);
 for (const change of [
  {url:'https://example.com'}, {url:'app://codex/pet-overlay'}, {type:'service_worker'},
  {id:'DIFFERENT'}, {webSocketDebuggerUrl:'ws://127.0.0.1:12346/devtools/page/ABC-123'},
  {webSocketDebuggerUrl:'ws://evil.example:12345/devtools/page/ABC-123'},
  {webSocketDebuggerUrl:'ws://user@127.0.0.1:12345/devtools/page/ABC-123'},
  {webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/ABC-123?x=1'}
 ]) assert.equal(pageDebuggerUrl({...page,...change},12345), null);
});
