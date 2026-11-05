// Independent headless profile and synthetic controls only; never the real app.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {prepareOriginalTheme,call} from '../engine/macos-upstream.mjs';
import {installMacUi,removeMacUi} from '../engine/macos-ui.mjs';
import {homeModeToggle} from '../engine/macos-controls.mjs';
import {modeToggleMarkup,modeToggleFixtureCss,modeToggleFixtureScript} from './fixtures/macos-mode-toggle.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1000,height:850}}),errors=[],checks=[],ratios=[];
page.on('pageerror',e=>errors.push(e.message));
const resources=await prepareOriginalTheme({opening:false}),nativeCss=await readFile(new URL('../engine/native-ui.css',import.meta.url),'utf8');
const header='header[data-app-shell-header-edge-scroll]';
const contrast=(a,b)=>{
 const luminance=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};
async function state(selector){return page.locator(selector).evaluate(e=>{const s=getComputedStyle(e);return {color:s.color,background:s.backgroundColor,border:s.borderColor,outline:s.outlineColor,outlineWidth:s.outlineWidth,outlineStyle:s.outlineStyle,outlineOffset:s.outlineOffset,focus:e.matches(':focus-visible'),transform:s.transform,opacity:s.opacity};});}
async function textContrast(selector,background){const s=await state(selector),b=await state(background),r=contrast(s.color,b.background);assert.ok(r>=4.5,`${selector}: ${r}`);ratios.push(Number(r.toFixed(2)));}
async function unaffected(){const result=[];for(const selector of ['#ordinary','#unrelated button','#outside button:first-of-type']){
 await page.mouse.move(950,840);result.push(await state(selector));await page.locator(selector).hover();await page.waitForTimeout(220);result.push(await state(selector));await page.keyboard.press('Tab');await page.locator(selector).focus();result.push(await state(selector));await page.locator(selector).evaluate(e=>e.blur());
 }return result;}
try{
 await page.setContent(`<style>body{margin:0;font:16px system-ui}.fixture{padding:20px}header{display:flex;height:48px}button{padding:8px}main{min-height:450px} ${modeToggleFixtureCss}</style><aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface><header data-app-shell-header-edge-scroll>Offline mode toggle regression</header><div class="fixture"><button id="before">Keyboard start</button>${modeToggleMarkup()}<button id="ordinary">Other action</button><div id="unrelated" role="group"><button aria-pressed="true" class="text-mode-toggle-primary">Unrelated selected control</button></div></div></main><div class="fixture">Outside main: ${modeToggleMarkup('outside')}</div><script>${modeToggleFixtureScript}</script>`);
 await page.evaluate(resources.loaded.payload);await page.evaluate(call(installMacUi,nativeCss,header));
 const untouched=await unaffected();
 await page.mouse.move(950,840);
 assert.equal((await state('#home-mode-toggle > [class*="_indicator_"]')).background,'rgb(255, 255, 255)');
 assert.ok(contrast((await state('#home-mode-toggle > button[aria-pressed="true"]')).color,'rgb(255, 255, 255)')<4.5);checks.push('reported-white-selected-surface-reproduced');
 await page.evaluate(call(installMacUi,resources.css,header));
 assert.equal(await page.locator(homeModeToggle).count(),1);
 assert.deepEqual(await unaffected(),untouched);checks.push('other-buttons-and-outside-group-unchanged-in-normal-hover-focus');
 const group='#home-mode-toggle',selected=group+' > button[aria-pressed="true"]',inactive=group+' > button[aria-pressed="false"]',indicator=group+' > [class*="_indicator_"]',track=group+' > .bg-background-mode-toggle-track';
 await page.mouse.move(950,840);await textContrast(selected,indicator);await textContrast(inactive,track);
 const geometry=(await state(indicator)).transform;
 await page.locator(inactive).hover();await page.waitForTimeout(220);await textContrast(inactive,inactive);
 await page.locator(selected).hover();await page.waitForTimeout(220);await textContrast(selected,indicator);
 assert.equal((await state(selected)).background,'rgba(0, 0, 0, 0)');assert.equal((await state(indicator)).transform,geometry);checks.push('normal-selected-and-both-hover-states-readable-with-animation-geometry-retained');
 await page.mouse.move(950,840);await page.locator('#before').focus();await page.keyboard.press('Tab');
 assert.equal(await page.locator(group+' > button:first-of-type').evaluate(e=>e===document.activeElement),true);
 for(let index=0;index<2;index++){
  const button=group+` > button:nth-of-type(${index+1})`,s=await state(button);
  assert.equal(s.focus,true);assert.equal(s.outlineStyle,'solid');assert.equal(s.outlineWidth,'2px');assert.equal(s.outlineOffset,'3px');assert.ok(contrast(s.outline,(await state(track)).background)>=3);
  await textContrast(button,index===0?track:indicator);
  assert.equal((await state(indicator)).outlineStyle,'none');
  await page.keyboard.press(index===0?'Enter':'Space');assert.equal(await page.locator(button).getAttribute('aria-pressed'),'true');
  const selectedFocus=await state(button);assert.equal(selectedFocus.focus,true);assert.equal(selectedFocus.outlineWidth,'2px');assert.equal(selectedFocus.outlineStyle,'solid');assert.equal((await state(indicator)).outlineStyle,'none');await textContrast(button,indicator);
  if(index===0)await page.keyboard.press('Tab');
 }
 checks.push('keyboard-focus-ring-on-both-buttons-and-enter-space-selection');
 await page.locator(group+' > button:first-of-type').evaluate(e=>e.disabled=true);
 const disabledBefore=await state(group+' > button:first-of-type');await page.locator(group+' > button:first-of-type').hover();assert.equal((await state(group+' > button:first-of-type')).opacity,disabledBefore.opacity);checks.push('disabled-semantics-retained');
 await page.locator(group+' > button:first-of-type').evaluate(e=>e.disabled=false);
 await page.mouse.move(950,840);await page.locator('#before').focus();await page.keyboard.press('Tab');
 await mkdir(new URL('../dist/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../dist/preview-mode-toggle-focus.png',import.meta.url))});
 await page.setViewportSize({width:480,height:850});assert.ok(await page.locator(group).evaluate(e=>e.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:fileURLToPath(new URL('../dist/preview-mode-toggle-narrow.png',import.meta.url))});checks.push('narrow-fixture');
 await page.evaluate(call(removeMacUi));assert.equal((await state(indicator)).background,'rgb(255, 255, 255)');checks.push('owned-stylesheet-removal-restores-native-fixture');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pass:true,scope:'synthetic source-contract fixture; actual Chat/Work fix awaits user verification',browser:browser.version(),minimumTextContrast:Math.min(...ratios),checks}));
}finally{await browser.close();}
