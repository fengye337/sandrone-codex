# 首頁 Chat／Work 切換鈕修正（0.3.1）

原始缺陷回報：首頁切換鈕有白底，選中 Work 的淺色文字對比不足。其他首頁區域與窄視窗對話可讀性可接受。這不是全面首頁驗收通過。

最新使用者回報確認 **0.3.1 已解決上述切換鈕問題**。此確認不代表一般、選中、懸停、鍵盤焦點或 Enter／Space 已逐項驗收；這些互動狀態繼續待確認。設定、模型選單及 `.app` 自動開屏也仍待驗收。本次只更新文件，沒有重跑程式或瀏覽器測試。

## 定位依據

只讀取本機 `/Applications/ChatGPT.app/Contents/Resources/app.asar` 的封裝原始碼，沒有連線執行中的應用、操作介面或修改官方檔案。定位到 26.1027.30824 的首頁專用 composer mode toggle：

- `webview/assets/app-primary-95a0e6d83f1e.js` 中，翻譯 ID `composer.home.modeToggle.chat/work` 的元件。
- 容器為 `role="group"`；Chat 和 Work 是直接子 `button[aria-pressed]`，不是 `aria-selected` tabs。
- 軌道使用 `bg-background-mode-toggle-track`。另一個直接子 span 是移動選中底板，CSS Module 前綴 `_indicator_`。
- `webview/assets/59ad52d5aa88.css` 中的 module 將底板背景、邊框及陰影分別綁到 `--color-background-mode-toggle-selected`、`--color-border-mode-toggle-selected` 與 `--shadow-mode-toggle-selected`。寬度、RTL 方向與動畫 transform 由原生元件維護。
- 選中按鈕原生 `:focus-visible` 會移除自身 outline，將 outline 移到移動底板；修正須同時處理這兩處。

樣式問題與專屬 mode-toggle 色彩 alias 未完整配對的情況相符：白底與主題淺字可同時存在。這是根據封裝原始碼及使用者回報的定位；未取得當前實機的逐狀態 computed style，不能聲稱已驗證所有實機 cascade 來源。

## 修正邊界

新增 `engine/macos-controls.css`，與未修改的原版 `native-ui.css` 一起由 Mac adapter 安裝，保持原版引擎及撤回 CSS 不變。只匹配原版 main 表面內、同時具有專用軌道與 mode-toggle 文字 class 的 group，不依賴文字語言或完整 module hash，不套用到一般 button、tablist 或設定頁的共用 SegmentedControl。

- 一般：深藍軌道、可讀的次級文字。
- 選中：深金棕底板、象牙白文字與金色邊框，保留原生底板形狀及位移。
- 懸停：未選中按鈕使用深藍亮底；選中按鈕保持透明，由底板顯示較亮金棕色。
- 鍵盤：兩個實際按鈕都以 2px 金色 outline 顯示 `:focus-visible`，避免底板重複顯示 outline；保留 Enter／Space、ARIA 與原生事件。
- 原生 disabled／升級標記保留，不把所有後代 span 強制改為同色。

離線 fixture 是依結構合約手寫的重現，使用不同 module hash；沒有複製官方 JS/CSS bundle。測試會重現白底低對比，檢查兩個選項的一般／選中／懸停／鍵盤焦點、對比度及原生選擇行為，並比較修正前後其他按鈕、其他 group 和 main 外相似元件的樣式。這仍不能代替實機驗收。

## 手動驗收

1. 先開 `macos/preview.command`，切至「首頁／對話模擬」，在合成 Chat／Work 上檢查狀態。
2. 準備實機測試時，先儲存工作。舊載入器在 Terminal A 按 Ctrl+C；若由 `.app` 啟動，先手動送出 disable。手動 Cmd+Q 完全退出 ChatGPT，再從新原始碼執行 `node engine/macos-skin.mjs --theme-only`，或啟動新 `dist/Sandrone-ChatGPT-0.3.1-Mac-Test.app`。舊載入器不會熱更新此修正。
3. 在首頁交替選中 Chat、Work；各自移入／移出游標，再以 Tab／Shift+Tab 移入兩個按鈕，確認文字、選中底板、懸停底與焦點環均可辨認。用 Enter／Space 確認切換不受影響。比較旁邊的一般按鈕。
4. 在相應狀態下手動執行 `node macos/audit-current.mjs --manual home`。診斷新增 `home-mode-*` 錨點、按下狀態、色彩、outline 及 hover/focus-visible 布林值，不收按鈕文字或聊天內容。可另存每個狀態的 JSON，以免被下一次覆蓋；從 Terminal 收集時焦點可能已移走，因此鍵盤焦點畫面請手動截取。
5. 回傳願意分享的切換鈕局部畫面／診斷。原白底淺字問題已獲使用者確認解決；未逐項回報的四種實機狀態仍待確認。設定、模型選單與 `.app` 自動開屏繼續待驗收。
