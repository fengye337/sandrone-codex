import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {installStartupScreen}=require('../native-integration/runtime/startup-preload.cjs');
const poster='data:image/jpeg;base64,'+(await fs.readFile(new URL('../assets/motion/sandrone-startup-still.jpg',import.meta.url))).toString('base64');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({reducedMotion:'reduce'});
 for(const [width,height] of [[1920,1080],[1280,800],[1024,768],[800,900],[1600,600],[640,480]]){
  await page.setViewportSize({width,height});
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.evaluate(`window.ui=(${installStartupScreen.toString()})(${JSON.stringify({token:'size',show:true,preferences:{enabled:true,openingOnLaunch:true,autoEnterOnReady:false},media:{intro:null,loop:null,poster,still:poster}})},()=>{})`);
  const probe=()=>page.evaluate(()=>{const s=document.querySelector('#sandrone-startup').shadowRoot;const rect=n=>{const r=s.querySelector(n).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {stage:rect('.stage'),bottom:rect('.bottom'),progress:rect('progress')}});
  const {stage,bottom,progress}=await probe();
  assert.ok(Math.abs(stage.width/stage.height-16/9)<.01);
  assert.ok(Math.abs((bottom.x-stage.x)/stage.width-.05)<.002,'status follows the fitted video, not viewport');
  assert.ok(bottom.y>=stage.y&&bottom.bottom<=stage.bottom+1&&bottom.right<=stage.right+1);
  assert.ok(progress.width>0&&progress.right<=bottom.right&&progress.y>=bottom.y&&progress.bottom<=bottom.bottom);
  await page.evaluate(()=>ui.receive({token:'size',kind:'state',state:{steps:[true,false,false,false,false],ready:false,status:'服务连接失败',recovery:true}}));
  await page.locator('#sandrone-startup').getByRole('button',{name:'使用原生界面',exact:true}).click();
  if(width===1024&&process.env.SANDRONE_TEST_ARTIFACTS){await fs.mkdir(process.env.SANDRONE_TEST_ARTIFACTS,{recursive:true});await page.screenshot({path:process.env.SANDRONE_TEST_ARTIFACTS+'/windowed-progress.png'});}
 }
 console.log('PASS: progress follows fitted artwork at six aspect ratios; recovery stays clickable');
}finally{await browser.close()}
