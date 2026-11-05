// User-run, read-only allowlisted diagnostics. The agent must not run this
// against the restricted app. No screenshots, text, HTML, values or URLs saved.
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {dataRoot} from './paths.mjs';
import {Session} from '../engine/cdp.mjs';
import {metadata} from '../engine/macos-skin.mjs';
import {pageDebuggerUrl} from '../engine/macos-skin-utils.mjs';
import {auditOriginalTargets} from '../engine/macos-upstream.mjs';
import {sessionRecord,checkIdentity} from './session-record.mjs';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--manual'||!['home','thread','menu','settings','narrow','opening','replay','disabled','restored'].includes(args[1]))throw new Error('Usage (user only): node macos/audit-current.mjs --manual home|thread|menu|settings|narrow|opening|replay|disabled|restored');
const record=await sessionRecord(),reports=[];
for(const page of await metadata(record.port,'/json/list')){
 const url=pageDebuggerUrl(page,record.port);if(!url)continue;
 await checkIdentity(record);const session=await new Session(url,{port:record.port}).open();
 try{reports.push({target:page.id,audit:await auditOriginalTargets(session)});}finally{await session.close();}
}
await mkdir(path.join(dataRoot,'logs'),{recursive:true});
const output=path.join(dataRoot,`logs/manual-${args[1]}.json`);
await writeFile(output,JSON.stringify({schema:1,appVersion:record.appVersion,scenario:args[1],visualAcceptance:'PENDING_USER_REVIEW',reports},null,2),{mode:0o600});
console.log(`已儲存 ${output}；只含錨點數量、幾何、色彩及媒體狀態。`);
