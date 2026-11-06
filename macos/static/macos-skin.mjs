#!/usr/bin/env node
// Personal-use Sandrone artwork from fengye337/sandrone-codex; artwork rights remain with their owners.
import { readFile, access } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appIsRunning, browserIdFromStderr, pageDebuggerUrl } from './macos-skin-utils.mjs';

const app = '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT';
const here = dirname(fileURLToPath(import.meta.url));
const bundledImage = join(here, 'Sandrone-background.png');
const sourceImage = join(here, '../../themes/sandrone/background.png');
const image = await access(bundledImage).then(() => bundledImage, () => sourceImage);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
if (process.platform !== 'darwin') throw new Error('此加载器只支持 macOS。');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更高版本。');
const running = spawnSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8' });
if (running.status !== 0) throw new Error('无法安全确认 ChatGPT 是否已退出；加载器未启动。');
if (appIsRunning(running.stdout, app)) throw new Error('请先保存工作并完全退出 ChatGPT/Codex，然后重新运行加载器。');
const data = await readFile(image);
if (data.length !== 1999638 || (await import('node:crypto')).createHash('sha256').update(data).digest('hex') !== '851e80a8272c8ab6968070206cef44fb6aa161f19cbcc0157296bf208d1f7dcd') throw new Error('角色图片缺失或校验失败。');
const server = createServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const child = spawn(app, [`--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${port}`], { stdio: ['ignore', 'ignore', 'pipe'] });
let browserId = null, stopped = false, stderrBuffer = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', chunk => { stderrBuffer = (stderrBuffer + chunk).slice(-8192); browserId ||= browserIdFromStderr(stderrBuffer, port); });
child.on('exit', () => { stopped = true; });
child.on('error', error => { console.error('无法启动应用：' + error.message); stopped = true; });
const art = `data:image/png;base64,${data.toString('base64')}`;
const expression = `(() => {
 if (!document.body || !document.querySelector('button')) return false;
 if (document.getElementById('sandrone-personal-overlay')) { window.__sandronePersonalLayout?.(); return true; }
 const panel = document.createElement('div'); panel.id = 'sandrone-personal-overlay';
 panel.style.cssText = 'position:fixed;z-index:9990;pointer-events:none;opacity:.24;mix-blend-mode:screen;background-image:url("' + ${JSON.stringify(art)} + '");background-position:right center;background-size:cover;background-repeat:no-repeat;mask-image:linear-gradient(to right,transparent 0%,rgba(0,0,0,.45) 12%,black 30%,black 92%,transparent 100%),linear-gradient(to bottom,transparent 0%,black 7%,black 93%,transparent 100%);mask-composite:intersect';
 const style = document.createElement('style'); style.id='sandrone-personal-style';
 style.textContent='@media(max-width:700px){#sandrone-personal-overlay{display:none}} body:has([role="dialog"]) #sandrone-personal-overlay,body:has([role="alertdialog"]) #sandrone-personal-overlay{display:none}';
 document.head.appendChild(style); document.body.appendChild(panel);
 window.__sandronePersonalLayout = () => {
  const w=window.innerWidth, h=window.innerHeight;
  const mains=[...document.querySelectorAll('main,[role="main"]')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>w*.35 && r.height>h*.45).sort((a,b)=>b.width*b.height-a.width*a.height);
  const sidebars=[...document.querySelectorAll('aside,nav,[role="navigation"]')].map(e=>e.getBoundingClientRect()).filter(r=>r.height>h*.4 && r.right>w*.12 && r.right<w*.6);
  const main=mains[0]; let left=main?.left ?? Math.min(w*.27,400);
  if(sidebars.length) left=Math.max(left,...sidebars.map(r=>r.right));
  const top=Math.max(48,main?.top ?? 48), right=Math.min(w,main?.right ?? w), bottom=Math.min(h,main?.bottom ?? h);
  Object.assign(panel.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
 };
 window.__sandronePersonalLayout(); return true;
})()`;
async function connect(page) {
 const url = pageDebuggerUrl(page, port);
 if (!url) return;
 const socket = new WebSocket(url);
 await new Promise((resolve, reject) => { const t=setTimeout(()=>reject(new Error('连接超时')),3000); socket.onopen=()=>{clearTimeout(t);resolve()};socket.onerror=()=>{clearTimeout(t);reject(new Error('连接失败'))}; });
 let id=0;
 const send = (method, params) => new Promise((resolve,reject)=>{ const n=++id; const timer=setTimeout(()=>reject(new Error('命令超时')),5000); const handler=e=>{const msg=JSON.parse(e.data);if(msg.id!==n)return;socket.removeEventListener('message',handler);clearTimeout(timer);msg.error?reject(new Error(msg.error.message)):resolve(msg.result)};socket.addEventListener('message',handler);socket.send(JSON.stringify({id:n,method,params})); });
 try {
  const current=await send('Runtime.evaluate',{expression:"(window.__sandronePersonalLayout?.(), Boolean(document.getElementById('sandrone-personal-overlay')))",returnByValue:true});
  if(current.result?.value===true) return;
  const result=await send('Runtime.evaluate',{expression,returnByValue:true});
  if(result.exceptionDetails || result.result?.value!==true) return;
  console.log('已向应用窗口添加桑多涅背景，请检查是否显示。');
 } finally { socket.close(); }
}
console.log('正在启动 ChatGPT；退出应用可恢复原样。');
const deadline = Date.now()+30000;
while (!browserId && !stopped && Date.now()<deadline) await sleep(250);
if (!browserId) throw new Error('无法验证本次启动的调试连接。请关闭本次启动的应用后重试。');
while (!stopped) {
 try {
  const base=`http://127.0.0.1:${port}`;
  const version=await (await fetch(`${base}/json/version`,{signal:AbortSignal.timeout(2000),redirect:'error'})).json();
  if(version.webSocketDebuggerUrl!==`ws://127.0.0.1:${port}/devtools/browser/${browserId}`) throw new Error('调试连接身份发生变化');
  const pages=await (await fetch(`${base}/json/list`,{signal:AbortSignal.timeout(2000),redirect:'error'})).json();
  for(const page of pages) if(pageDebuggerUrl(page,port)) await connect(page).catch(()=>{});
 } catch(error) { console.error('加载器停止：'+error.message); break; }
 await sleep(3000);
}
