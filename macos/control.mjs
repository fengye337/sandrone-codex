// User-run file-based controls; this script never connects to the app/debugger.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {dataRoot} from './paths.mjs';
const action=process.argv[2];
if(process.argv.length!==3||!['disable','enable','replay'].includes(action))throw new Error('Usage: node macos/control.mjs disable|enable|replay');
const record=JSON.parse(await readFile(path.join(dataRoot,'state/macos-session.json'),'utf8'));
if(typeof record.launch!=='string')throw new Error('No launch record');
const file=path.join(dataRoot,'state/macos-control.json'),temp=path.join(dataRoot,'state/macos-control-'+randomUUID()+'.tmp');
await writeFile(temp,JSON.stringify({launch:record.launch,nonce:randomUUID(),action}),{mode:0o600});await rename(temp,file);
console.log('已送出 '+action+'；須由仍在執行的載入器處理，請檢查畫面及診斷結果。');
