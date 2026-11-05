// Used only by user-invoked diagnostics. Never imported by offline preview.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {dataRoot} from './paths.mjs';
import {execFileSync} from 'node:child_process';
import {metadata} from '../engine/macos-skin.mjs';
export async function sessionRecord(){
 const record=JSON.parse(await readFile(path.join(dataRoot,'state/macos-session.json'),'utf8'));
 if(!Number.isInteger(record.pid)||!Number.isInteger(record.port)||record.port<1||record.port>65535||!/^[-a-zA-Z0-9]+$/.test(record.browserId)||record.executable!=='/Applications/ChatGPT.app/Contents/MacOS/ChatGPT')throw new Error('Invalid session record');
 const listener=execFileSync('/usr/sbin/lsof',['-nP',`-iTCP:${record.port}`,'-sTCP:LISTEN','-Fp'],{encoding:'utf8'});
 if(!listener.split('\n').includes('p'+record.pid))throw new Error('Recorded application no longer owns the listener');
 const binary=execFileSync('/usr/sbin/lsof',['-a','-p',String(record.pid),'-d','txt','-Fn'],{encoding:'utf8'});
 if(!binary.split('\n').includes('n'+record.executable))throw new Error('Application executable identity mismatch');
 await checkIdentity(record);return record;
}
export async function checkIdentity(record){
 const v=await metadata(record.port,'/json/version');
 if(v.webSocketDebuggerUrl!==`ws://127.0.0.1:${record.port}/devtools/browser/${record.browserId}`)throw new Error('Browser identity changed');
}
