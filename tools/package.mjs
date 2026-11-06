import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {checkStartupMedia} from './startup-media.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await checkStartupMedia(root);
const theme=path.join(root,'themes/sandrone'),edition=JSON.parse(await fs.readFile(path.join(root,'asset-edition.json'),'utf8'));
const names=['theme.json','theme.css','background.png','LICENSE.txt'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest={packageVersion:1,themeId:'sandrone-marionette',version:'0.3.0',skinApiVersion:1,minClientVersion:'1.5.21',platforms:['windows'],capabilities:['background','tokens','safe-css'],publisher:{id:'local-workshop',displayName:'Sandrone Workshop'},license:edition.edition==='public-placeholder'?'MIT':'LicenseRef-User-Supplied-Artwork',provenance:{aiGenerated:true,summary:edition.edition==='public-placeholder'?'AI-assisted code and original geometric placeholder art; no game character images or videos.':'AI-assisted code with user-supplied third-party art. The code license grants no rights to the art.'},createdAt:'2026-10-24T00:00:00+08:00',files:[]};
const mime={'theme.json':'application/json','theme.css':'text/css','background.png':'image/png','LICENSE.txt':'text/plain'};
for(const name of names){const b=await fs.readFile(path.join(theme,name));manifest.files.push({path:name,bytes:b.length,sha256:sha(b),mediaType:mime[name]});}
await fs.writeFile(path.join(theme,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sandrone-release-validator-'));
try{
 const r=spawnSync(process.execPath,[path.join(root,'vendor/dream-skin/runtime/theme-package-validator.mjs'),'--source',theme,'--stage',temp,'--platform','windows','--client-version','1.5.21'],{encoding:'utf8'});
 if(r.status!==0)throw new Error('Upstream theme validation failed: '+(r.stderr||r.stdout));
}finally{if(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('sandrone-release-validator-'))await fs.rm(temp,{recursive:true,force:true});}

// Small deterministic ZIP writer; stored filenames are a fixed allowlist.
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=b=>{let c=0xffffffff;for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const chunks=[],central=[];let offset=0;
for(const name of [...names,'manifest.json']){
 const raw=await fs.readFile(path.join(theme,name)),packed=deflateRawSync(raw),n=Buffer.from(name),crc=crc32(raw),date=((2026-1980)<<9)|(10<<5)|24;
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt16LE(date,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(n.length,26);chunks.push(local,n,packed);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt16LE(date,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);central.push(c,n);offset+=local.length+n.length+packed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(names.length+1,8);end.writeUInt16LE(names.length+1,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
await fs.mkdir(path.join(root,'dist'),{recursive:true});await fs.writeFile(path.join(root,'dist/Sandrone-Marionette.zip'),Buffer.concat([...chunks,directory,end]));
const hashes={};
async function walk(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){if(entry.isSymbolicLink())throw new Error('Links are not package inputs');const p=path.join(directory,entry.name);if(entry.isDirectory())await walk(p);else if(entry.isFile())hashes[path.relative(root,p).split(path.sep).join('/')]=sha(await fs.readFile(p));}}
for(const directory of ['engine','launcher','runtime','vendor','assets','themes','tools','tests','docs'])await walk(path.join(root,directory));
for(const name of ['SandroneCodex.exe','Setup.ps1','Remove-Shortcuts.ps1','Build-From-Source.ps1','build.ps1','build-preview.mjs','verify-integrity.mjs','Theme-Actions.ps1','安装快捷方式.cmd','移除快捷方式.cmd','从源码构建.cmd','检查安装.cmd','一键应用桑多涅主题.cmd','一键恢复官方原版.cmd','一键重载当前主题.cmd','asset-edition.json','README.md','LICENSE','THIRD-PARTY-NOTICES.md','dist/Sandrone-preview.html','dist/Sandrone-Marionette.zip']){
 hashes[name]=sha(await fs.readFile(path.join(root,name)));
}
await fs.writeFile(path.join(root,'integrity.json'),JSON.stringify(hashes,null,2)+'\n');
console.log(JSON.stringify({pass:true,files:Object.keys(hashes).length,edition:edition.edition,version:'0.7.0'}));
