// Dedicated Home composer mode toggle, observed in the installed 26.1027 source.
// No label matching, exact CSS module hashes, generic tablists or global buttons.
export const homeModeToggle=':is(main.main-surface, main[data-app-shell-main-surface], main[class*="_MainContentSurface_"]) [role="group"]:has(> .bg-background-mode-toggle-track):has(> button[aria-pressed][class*="text-mode-toggle-"])';
export const modeToggleAuditEntries=[
 {key:'home-mode-toggle',selector:homeModeToggle,tier:'L2',scope:'home'},
 {key:'home-mode-track',selector:homeModeToggle+' > .bg-background-mode-toggle-track',tier:'L2',scope:'home'},
 {key:'home-mode-indicator',selector:homeModeToggle+' > [class*="_indicator_"]',tier:'L2',scope:'home'},
 {key:'home-mode-selected',selector:homeModeToggle+' > button[aria-pressed="true"]',tier:'L2',scope:'home'},
 {key:'home-mode-inactive',selector:homeModeToggle+' > button[aria-pressed="false"]',tier:'L2',scope:'home'}
];
