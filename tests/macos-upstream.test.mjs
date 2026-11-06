import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareOriginalTheme,applyOriginalTheme} from '../engine/macos-upstream.mjs';

test('original theme packages compile with verified signature, synchronized video and artwork',async()=>{
  const {loaded,assets,css}=await prepareOriginalTheme();
  assert.equal(loaded.theme.id,'sandrone-marionette');
  assert.ok(loaded.payload.length>10000);assert.doesNotThrow(()=>new Function(loaded.payload));
  assert.ok(assets.signature);assert.ok(assets.video);assert.ok(assets.traceVideo);assert.ok(assets.outline);assert.ok(css.length>1000);
});
test('unmatched main surface prevents all UI mutation',async()=>{
  const calls=[];
  const session={evaluate:async expression=>{calls.push(expression);return {matches:[{key:'shell-main',visible:0}]};}};
  const result=await applyOriginalTheme({session,resources:{}});
  assert.equal(result.reason,'MAIN_SURFACE_UNMATCHED');assert.equal(calls.length,1);
});
test('failed original verification rolls back and never plays the opening',async()=>{
  const calls=[];
  const session={evaluate:async expression=>{calls.push(expression);return calls.length===1?{matches:[{key:'shell-main',visible:1}]}:true;}};
  const resources={loaded:{payload:'/* ORIGINAL THEME */',theme:{id:'test'},revision:'test'},css:'',assets:{}};
  const result=await applyOriginalTheme({session,targetId:'test',resources,verify:async()=>({pass:false}),opening:true});
  assert.equal(result.reason,'ORIGINAL_VERIFICATION_FAILED');
  assert.ok(calls.at(-1).includes('cleanup'));
  assert.ok(!calls.some(x=>x.startsWith('(function showOpening')));
});
