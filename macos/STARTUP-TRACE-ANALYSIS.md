# 0.3.2 實機 trace 分析與 0.3.3 診斷補強

本輪只分析使用者保存的摘要及 trace，沒有連線或操作受限應用。0.3.3 只補診斷；**預設 baseline、250ms／1000ms 間隔、early 指令順序、1.5 秒 watchdog、動畫長度、原版驗證與撤回行為均未調整**。尚未宣稱啟動延遲已修復。

## 證據配對

- `startup-baseline-summary.json` 對應 `startup-aea132b1-0e2e-44b2-8a02-946810079dd1.jsonl`，主 target 以 `9D8BC0B4…` 開頭。
- `startup-early-summary.json` 對應 `startup-67613b66-18bf-4c53-b371-d9c4baa33560.jsonl`，主 target 以 `0F1178AA…` 開頭。
- 兩份摘要的 primaryTarget 與每個已報告 phase.atMs 都與對應原始 trace 一致。分析產物 `dist/startup-analysis/baseline.json`、`early.json` 記錄輸入檔名及 SHA256，未覆蓋使用者摘要或原始 trace。這些本機證據檔不提交 Git。
- 兩次 appVersion 為 26.1027.30824；本輪沒有重新查驗正在運行的 app。原生視窗首次可見時間仍未知，不以 renderer paint 代替。

## early 沒有登記成功；不是摘要漏記

主 target 事件（自載入器起點 ms）：

| 事件 | atMs |
|---|---:|
| debugger.connected | 407.620 |
| renderer.target.discovered | 1986.385 |
| renderer.attached，capturedBeforeScripts=true | 1986.983 |
| hook.register.start | 2001.181 |
| hook.pause-deadline | 3487.148 |
| Runtime.enable 返回，耗時 1516.440ms | 3517.872 |
| watchdog 的 runIfWaitingForDebugger 返回 | 3518.392 |
| finally 再次恢復 target，renderer.resumed | 3525.131 |
| 控制器 theme.start | 7891.854 |

整份 early trace 沒有 `Page.addScriptToEvaluateOnNewDocument` 指令、`hook.registered`、`renderer.document.start` 或 `theme.reused`，其他兩個稍晚 target 也遇到相同 deadline／Runtime.enable 模式。因此 earlyTargets 為空與 hook.registered=null 是正確的，不是摘要只漏了主 target。

源碼先 `await Runtime.enable`，才登記 binding／Page script。在這次實機中，Runtime.enable 直到 watchdog 恢復 target 後才返回；此時 `page.cancelled=true`，後續 guard 立即 return，根本沒有走到 script 登記。這是「對被暫停 target 等待 Runtime.enable → watchdog 恢復 → cancel guard 中止登記」的順序問題。隔離 Node 模型重現同樣相依等待及中止分支，但不是聲稱已獨立重現 Electron 的底層 inspector 原因。

沒有 `hook.unsupported`，所以**沒有走全域 unsupported fallback**。early controller 仍存活，逐 target 登記被 watchdog 中止，最後由控制器晚注入主題。`reusePreparedTheme:Boolean(early)` 也仍為 true，early 的結構 gate 仍在使用；不能把這次 early 資料當作「成功啟用早期注入」的效能比較。0.3.3 不改這個順序，先把 abort 與條件記全，預設繼續 baseline。

## 6–7 秒等待的拆解

以下均為同一主機 monotonic 的接收／操作時間差，不混用 renderer epoch：

| 區段 | baseline ms | early ms |
|---|---:|---:|
| debugger.connected → 主 target 首次觀測 | 1504.747 | 1578.765 |
| target 首次觀測 → document.observed | 544.277 | 1544.670 |
| document.observed → 最後成功 audit.end | 4100.613 | 4178.708 |
| 成功 audit.end → theme.start | 187.971 | 182.091 |
| **合計** | **6337.608** | **7484.234** |

- 第一段在尚未觀測到主 target 時等待；舊 trace 沒記每次 `/json/list` 的分類數量，不能斷言所有時間都只是輪詢，也不能確認是否有當時被 URL／身分規則排除的頁面。
- baseline 在 1897.215ms 已收到 target 事件，但固定 sleep 到 2409.561ms 才醒；這一輪有約 512.346ms 是可觀測的事件後剩餘 timer 等待。不是說前面整個 1.505 秒都可移除。
- early 的第二段主要包含上述 1.5 秒暫停／Runtime.enable 相依等待；不應誤稱為資料傳輸或動畫時間。
- 兩者最大的未明區段是文件可觀測後約 4.1 秒的 gate 重試。舊 trace 沒保存 gate 的輸入或 return reason，不能回填「缺 composer」或「document hidden」等具體結論。
- 資源讀取各為約 51.8ms，且在 spawn 前完成、resourceLoads=1。媒體準備分別到 6635.020／7736.321ms 才開始；不能拿後面的 1.905／1.442 秒媒體準備解釋之前整段 6.338／7.484 秒。兩次首播各有 73 次媒體 evaluate，沒有證據顯示在這段等待中反覆讀素材。

## 每次 audit 與重試

時間基準：載入器起點 ms；「下次間隔」從本次 audit.end 到下一次 audit.start，包含 sleep 及掃描／CDP 工作，不等於純 sleep。

| 模式／次數 | audit.start | audit.end | 下次開始 | 下次間隔 ms | 條件證據 |
|---|---:|---:|---:|---:|---|
| baseline 1 | 2441.966 | 2443.239 | 3447.766 | 1004.527 | 舊 trace 未記具體條件 |
| baseline 2 | 3447.766 | 3449.065 | 4456.083 | 1007.018 | 舊 trace 未記具體條件 |
| baseline 3 | 4456.083 | 4459.228 | 5467.845 | 1008.617 | 舊 trace 未記具體條件 |
| baseline 4 | 5467.845 | 5471.265 | 6520.254 | 1048.989 | 舊 trace 未記具體條件 |
| baseline 5 | 6520.254 | 6542.105 | — | — | 已進入套用，可反推 gate 通過 |
| early 1 | 3542.380 | 3545.788 | 3555.445 | 9.657 | 舊 trace 未記具體條件 |
| early 2 | 3555.445 | 3561.187 | 3722.442 | 161.255 | 舊 trace 未記具體條件 |
| early 3 | 3722.442 | 3733.896 | 3735.070 | 1.174 | 舊 trace 未記具體條件 |
| early 4 | 3735.070 | 3735.759 | 4379.813 | 644.054 | 舊 trace 未記具體條件 |
| early 5 | 4379.813 | 4381.303 | 5385.317 | 1004.014 | 舊 trace 未記具體條件 |
| early 6 | 5385.317 | 5386.535 | 6422.626 | 1036.091 | 舊 trace 未記具體條件 |
| early 7 | 6422.626 | 6588.674 | 7660.536 | 1071.862 | 舊 trace 未記具體條件 |
| early 8 | 7660.536 | 7709.763 | — | — | 已進入套用，可反推 gate 通過 |

baseline 前四次未進入套用。依當時源碼，return 條件只能收斂到 `document.visibilityState==='hidden'` 或沒有可見的原版 main 錨點；**無法再分辨** count=0、inactive、零尺寸、offscreen 或隱藏樣式。

early 前七次未進入套用。除上述主區域條件外，early controller 還要求可見 header、sidebar，以及首頁所需 composer；**無法知道每次是其中哪個條件未滿足**。之後進入媒體／主題階段可反推最後一次已過 gate，但不是從不存在的快照還原 DOM。

全次 pollSleepMs 包含 debugger 階段與主 target 尚未出現的等待，不能直接從 debugger→theme 差值扣除後宣稱全部是可消除延遲。early 中的接近零毫秒、約 144ms、約 624ms wait 已顯示事件喚醒存在，不是一直完整睡 1 秒；舊 trace 未記 wake reason，只能看時間相鄰，不能當成因果證明。

## 0.3.3 補記內容（不改 gate 或排程）

- `scan.identity.end`、`scan.targets.end/counts`、`scan.control.end`：每輪編號、耗時及頁面分類數量。URL／title 不寫入紀錄。
- `readiness.no-target`：無可處理 app target 的原因分類計數（non-page、non-app、auxiliary、invalid target／endpoint）。
- `attempt.start`、`renderer.setup.command`、`readiness.error`：每個 target 的 attempt 編號、連線／Runtime.enable／binding／timing probe／health check 耗時及錯誤分類，不存任意錯誤正文。
- `readiness.result`：記錄既有 gate 的 pass／return code、實際 blocker，以及文件 visibility／readyState。只保存 main、sidebar、header、home-icon、composer 的 count／active／visible 與最多三個節點的幾何、display、visibility、content-visibility、opacity、祖先隱藏原因；不存正文、輸入值、class 名稱或 HTML。祖先 opacity 等資訊是診斷線索，**沒有拿來新增 gate 條件**。
- `retry.wait.start/end` 與既有 poll.sleep：記錄原定間隔、實際等待、baseline timer／timeout／pending event／具體事件喚醒，以及 cycle。只在首次主題驗證成功前寫詳細 scan／gate 資訊。
- `hook.command.start`／既有 command 結束：補成功與錯誤碼；`hook.registration-aborted/skipped` 明記 PAUSE_DEADLINE、DISABLED 等分支。沒有移動 Runtime.enable，也沒有更改 watchdog。
- 新摘要包含 `earlyHook` 與 `startupWait`，區分全域 fallback、逐 target abort、登記未確認和真正登記成功。舊 trace 的缺漏明列 `V1_GATE_CONDITION_NOT_RECORDED`，絕不補造條件；新的 trace 才能逐次提供 snapshot。

## 下一份證據

先只用 **baseline** 收集詳細資料。儲存工作、結束當前 Work 工作後，手動停止舊載入器並完全退出 ChatGPT，再執行新原始碼或 0.3.3 測試包：

```sh
node engine/macos-skin.mjs
```

開屏出現後，在另一個 Terminal 保存新摘要：

```sh
node macos/startup-report.mjs > startup-baseline-detailed-summary.json
```

回傳該摘要與對應 `startup-<ID>.jsonl`。這輪優先回答 main／visibility／header／sidebar／composer 究竟哪個 gate 持續未就緒，以及重試與命令排隊分別花多少時間。確認後再考慮特定修正；不先改動畫、縮短 timer 或把 early 改成預設。

原版樣式、已確認的可讀性、驗證與失敗撤回保持不變。0.3.3 是診斷版，還不是延遲修復版；先前其他未驗收項目繼續待測。
