import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectApp} from '../macos/doctor.mjs';
import {launchPlan} from '../macos/launch-plan.mjs';

const app={path:'/Applications/Test Codex.app',id:'com.openai.codex',executable:'Codex',electron:true};
test('launch plan keeps paths containing spaces as one argv item and isolates the profile',()=>{
  const plan=launchPlan(app,'/tmp/Theme Test');
  assert.equal(plan.executable,'/Applications/Test Codex.app/Contents/MacOS/Codex');
  assert.deepEqual(plan.args,['--remote-debugging-address=127.0.0.1','--remote-debugging-port=19337','--user-data-dir=/tmp/Theme Test/profile/macos']);
  assert.equal(plan.status,'PLAN_ONLY');
});
test('reject unrelated, unverified, relative and escaped executable paths',()=>{
  for(const changes of [{id:'com.example.other'},{electron:false},{error:'broken'},{path:'Codex.app'},{executable:'../Codex'},{executable:''}]){
    assert.throws(()=>launchPlan({...app,...changes}));
  }
  assert.throws(()=>launchPlan(app,'relative'));
});
test('missing bundle is an ordinary diagnostic result',async()=>{
  const result=await inspectApp('/nonexistent-sandrone-test/Codex.app');
  assert.equal(result.error,'APP_NOT_FOUND');
});
