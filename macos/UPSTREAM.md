# 上游與 Mac 適配來源

2026-11-05 由 GitHub 克隆真正 fork，保留完整 commit 歷史（partial clone 僅按需下載 blob，沒有重建歷史）。來源資料夾 `../SandroneCodex-Source` 保留不動。

- Fork： https://github.com/teddy7286317/sandrone-codex-Mac-Dev
- 原版上游： https://github.com/fengye337/sandrone-codex
- 核對 `origin/main`、`upstream/main`：`dfea82e39d9d4a42524dc9eed3d61204254d0d3a`
- 原版快取介面說明：[OPENING-PERFORMANCE.zh-CN.md](../docs/OPENING-PERFORMANCE.zh-CN.md)

沿用且未改動：`engine/renderer.mjs`、`opening-client.mjs`、`assets.mjs`、`native-ui.css`、`themes/sandrone`、`assets`、`vendor/dream-skin`。主題透過上游 `loadPayload` 安裝並由 `verifySession` 驗證；開屏透過上游 `prepareOpening` / `showOpening` / `releaseOpening` 呼叫，不再直接序列化舊版 `showOpening`。

Mac 連線沿用原版 `Session`；`engine/cdp.mjs` 只為 URL 校驗及建構子新增可選 port，預設仍為 Windows 原值。Mac 使用本次手動啟動的隨機 loopback port、stderr browser ID、每輪 browser identity 核對，拒絕接管已執行的應用。輔助 app 頁面另經原版主區域錨點與可見性檢查，不能只因 URL 為 app: 就套用。

Mac 重播、CSS stylesheet 所有權與清理位於 `engine/macos-ui.mjs`；重播按鈕加入實際 header 的正常排列，不使用 Windows WCO、右上 caption backing 或交通燈幾何。此位置僅經離線合成頁面測試，仍待實機驗收。

PR #6 的啟動思路與身分校驗來源繼續記錄於 [PR6-SOURCE.md](PR6-SOURCE.md)。舊前景圖片覆蓋層未納入新執行路徑。`engine/macos-theme.css` 保持停用註解，`macos/research/theme-0.2.0-unverified.css` 只作歷史研究；兩者均不會作為主題 CSS 載入。

上游原生 Windows 附加包的早期 preload 與本機影片播放器不是這個 Mac 移植的一部分。本版使用文件所述的可攜式快取介面；不能援引上游 Windows 原生包的驗收作為 Mac 的效能或功能驗收。

0.3.1 以唯讀安裝包原始碼定位首頁專用 Chat／Work 元件，新增 `engine/macos-controls.css` 與診斷 selector，透過 Mac adapter 附加至原版 stylesheet；原版 native-ui.css 本身未修改。此局部修正不是恢復撤回配色。詳見 [HOME-MODE-TOGGLE.md](HOME-MODE-TOGGLE.md)。

0.3.2 新增 Mac 啟動 trace、CDP 子 session 路由與選用 document-start bootstrap；暫時套用後仍須原版 verifySession 通過才能開屏，失敗與停用需移除早期 script。原版 renderer、opening-client、素材與 CSS 未改；官方視窗首次顯示不受此載入器控制。見 [STARTUP-TIMING.md](STARTUP-TIMING.md)。
