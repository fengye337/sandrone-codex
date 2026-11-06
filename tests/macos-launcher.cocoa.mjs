// Only the test-compiled Cocoa launcher and a fake Node child are run.
// Never launches, discovers or connects to ChatGPT or its debugger.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
if(process.platform!=='darwin')throw Error('Cocoa fixture requires macOS');
const root=fileURLToPath(new URL('../',import.meta.url)),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sandrone-cocoa-fixture-')),bundle=path.join(tmp,'CocoaFixture.app'),contents=path.join(bundle,'Contents'),binary=path.join(contents,'MacOS/Fixture'),out=path.join(root,'dist/launcher-tests');
await fs.mkdir(path.dirname(binary),{recursive:true});await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(contents,'Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundleIdentifier</key><string>local.sandrone.cocoa-fixture</string><key>CFBundleName</key><string>Isolated Sandrone Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
execFileSync('/usr/bin/clang',['-fobjc-arc','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-DSANDRONE_LAUNCHER_TEST=1','-framework','Cocoa',path.join(root,'macos/Launcher.m'),'-o',binary]);
const results=[];
for(const mode of ['normal','missing-node','child-error','unconfirmed','stop-unconfirmed']){
 const stdout=execFileSync(binary,['--self-test',mode],{encoding:'utf8',timeout:20000,env:{...process.env,SANDRONE_TEST_NODE:process.execPath,SANDRONE_TEST_SCRIPT:path.join(root,'tests/fixtures/macos-launcher-child.mjs')}});
 const result=JSON.parse(stdout.trim());assert.equal(result.pass,true);assert.equal(result.dockVisiblePolicy,true);assert.equal(result.tasksLaunched,mode==='missing-node'?0:1);assert.equal(result.windowReopened,true);
 if(['normal','stop-unconfirmed'].includes(mode)){assert.ok(result.terminationDeferrals>=1);assert.deepEqual(result.events.filter(e=>['ready','disabled','stopped'].includes(e.state)).map(e=>e.state),['ready','disabled','ready','stopped']);}
 if(mode==='stop-unconfirmed')assert.equal(result.cancelledQuits,1);
 results.push(result);
}
await fs.writeFile(path.join(out,'cocoa.json'),JSON.stringify({pass:true,scope:'Owned Cocoa fixture only; no official app or profile access',results},null,2)+'\n');
console.log(JSON.stringify({pass:true,modes:results.map(r=>r.mode),checks:['nonblocking-owned-child-and-bounded-output','private-controls','dock-regular-policy','reopen-without-duplicate-child','graceful-quit-waits-for-cleanup','missing-node','child-error','unconfirmed-cleanup-is-not-success','quit-cancelled-on-unconfirmed-cleanup'],realAppAcceptance:'PENDING'}));
