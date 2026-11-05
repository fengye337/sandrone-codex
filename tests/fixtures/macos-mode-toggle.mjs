// Hand-authored fixture from the installed component's structural contract.
// No official JS/CSS bundle is copied. Hashes intentionally differ from the app.
export function modeToggleMarkup(id='home-mode-toggle'){
 return `<div id="${id}" class="mode-root _root_fixture_1" role="group" aria-label="Composer mode"><span aria-hidden="true" class="bg-background-mode-toggle-track"></span><span aria-hidden="true" class="_indicator_fixture_7"></span><button type="button" class="text-mode-toggle-inactive" aria-pressed="false">Chat</button><button type="button" class="text-mode-toggle-primary" aria-pressed="true"><span class="relative inline-flex">Work</span></button></div>`;
}
// Explicit white aliases reproduce the reported worst-case light-surface mix.
// Selection geometry and focus redirection mirror the documented contract.
export const modeToggleFixtureCss=`
.mode-root{--color-background-mode-toggle-track:#fff;--color-background-mode-toggle-selected:#fff;--color-text-mode-toggle-primary:var(--color-text,#1a1c1f);--color-text-mode-toggle-inactive:var(--color-text,#1a1c1f);--color-border-mode-toggle-selected:#bbb;isolation:isolate;position:relative;display:inline-grid;grid-template-columns:1fr 1fr;width:224px;max-width:100%;height:36px;border-radius:999px;margin:16px 8px}
.mode-root>.bg-background-mode-toggle-track{pointer-events:none;position:absolute;inset:1px;border-radius:999px;background-color:var(--color-background-mode-toggle-track)}
.mode-root>[class*="_indicator_"]{pointer-events:none;position:relative;grid-column:1;grid-row:1;border-radius:999px;width:calc(100% + 9px);transform:translateX(calc(100% - 17px));background-color:var(--color-background-mode-toggle-selected);border:.5px solid var(--color-border-mode-toggle-selected)}
.mode-root>button{position:relative;z-index:1;grid-row:1;display:inline-flex;align-items:center;justify-content:center;min-width:0;border:0;border-radius:999px;padding:0 12px;background:transparent;font:500 14px system-ui;cursor:pointer;white-space:nowrap}
.mode-root>button:first-of-type{grid-column:1}.mode-root>button:last-of-type{grid-column:2}
.text-mode-toggle-primary{color:var(--color-text-mode-toggle-primary)}.text-mode-toggle-inactive{color:var(--color-text-mode-toggle-inactive)}
.mode-root:has(>button[aria-pressed=true]:focus-visible)>button[aria-pressed=true]:focus-visible{outline:none}
.mode-root:has(>button[aria-pressed=true]:focus-visible)>[class*="_indicator_"]{outline:auto;outline-color:-webkit-focus-ring-color}
`;
export const modeToggleFixtureScript=`
for(const group of document.querySelectorAll('.mode-root'))for(const button of group.querySelectorAll(':scope > button'))button.addEventListener('click',()=>{
 for(const item of group.querySelectorAll(':scope > button')){const selected=item===button;item.setAttribute('aria-pressed',String(selected));item.classList.toggle('text-mode-toggle-primary',selected);item.classList.toggle('text-mode-toggle-inactive',!selected);}
 group.querySelector('[class*="_indicator_"]').style.transform=button===group.querySelector('button')?'translateX(0)':'translateX(calc(100% - 17px))';
});`;
