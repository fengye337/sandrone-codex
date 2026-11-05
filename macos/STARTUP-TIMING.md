# 啟動量測與選用早期注入（0.3.2／0.3.3）

2026-11-06 收斂現有版本：本輪暫停插件及早期載入研究，保留 baseline，主題與開屏稍晚載入列為已知限制；官方圖示不會自動套用。0.3.4 只完善 Dock 啟動器與手動驗收，不改動畫、輪詢間隔或早期登記流程。

歷史 2026-11-05 研究轉向：依使用者指示暫停 `--early-document` 優化，保留 baseline 與既有版本。本輪不修改排程／動畫或發布；Mac 原生早期入口研究見 [research/early-loading/README.md](https://github.com/teddy7286317/sandrone-codex-Mac-Dev/blob/macos/original-engine-integration/macos/research/early-loading/README.md)，沒有將外部注入標成原生等效。

使用者實機回報：主題與自動開屏都晚於官方視窗顯示。**這個問題尚未取得新版本的實機時間線，也未宣稱已消除閃現或完成加速。** 本輪代理沒有啟動、連線或操作受限 ChatGPT；瀏覽器量測全部來自新建的隔離 headless Chrome。

0.3.3 已分析兩份實機 trace：early 因 Runtime.enable 等待與 watchdog 中止，未登記 script，並非摘要漏記；目前只加詳細 gate／retry 診斷，baseline 預設與排程不變。結論及下一輪步驟見 [STARTUP-TRACE-ANALYSIS.md](STARTUP-TRACE-ANALYSIS.md)。以下 0.3.2 隔離結果不能視為實機 early 已成功。

## 已確認的等待來源

- 舊流程在 stderr 宣告 debugger ID 後，須等 250ms 輪詢醒來；主區域未就緒時，每 1 秒才重新掃描。這是額外等待的來源，並非每次都完整增加 250ms 或 1 秒。
- 原流程只在主區域已可見後，才套用主題並開始開屏素材傳輸／準備。這個順序天然可能晚於官方視窗及原生內容的顯示。
- 主題及素材檔案在官方程序 spawn 前已讀取一次，後續用相同 resources／assets 物件；不是每次輪詢重讀。原版 opening-client 也快取素材摘要及窗口媒體，重播不重新讀取檔案。原版 openingAssets 會先讀取備援美術，再在 HD 素材有效時捨棄部分內容；這是一開始的額外 I/O，未改動此原版行為。
- 本機一次獨立資源準備為 47.88ms；主題 payload 2,830,701 bytes、CSS 18,635 bytes、開屏 JSON 15,019,101 bytes。這不是實機啟動耗時，也不是穩定冷快取基準。
- 開屏第一次準備包含主機摘要／序列化、約 15MB 的分塊傳輸、renderer 媒體／圖片解碼，最後還有原版播放器的隱藏布局及 quiet-frame gate。量測將它們拆開；沒有加長動畫、增加固定等待或遮罩，也沒有改動原版 renderer 與 opening-client。

## 時間線

每次手動啟動會在 `~/Library/Application Support/SandroneMacDev/logs/startup-<本次ID>.jsonl` 產生新紀錄。`state/macos-session.json` 只指向本次檔名。寫檔經佇列處理，不在每個階段同步等磁碟。

| 事件 | 定義 |
|---|---|
| launcher.begin / launcher.native.entry | Node 控制器起點；由新 `.app` 啟動時另有我們自己的 Cocoa 入口 epoch |
| resources.start / resources.ready | 原版主題、CSS、素材讀取與驗證；resourceLoads 應為 1 |
| hook.source.prepare.start/end | spawn 前建立早期 script 的成本；僅候選路徑 |
| process.spawn.requested / process.spawned | 送出官方程序啟動請求／Node 確認 spawn 成功 |
| debugger.announced / debugger.connected | stderr 宣告端點／身分核對後 browser WebSocket 已連線 |
| renderer.target.discovered / renderer.attached | 首次觀測 target／附加連線；不是 OS renderer 程序的精確出生時刻 |
| hook.register.start / hook.command / hook.registered | 逐個 CDP 指令耗時及 script 登記；capturedBeforeScripts 表示是否捕捉到等待 debugger 的新 target |
| renderer.document.start / renderer.document.observed | 早期 script 執行／較晚由控制器取樣文件時鐘；兩者不可混為同一個階段 |
| renderer.anchor.ready / renderer.structure.ready | 原版 main 錨點出現／header、sidebar 及首頁輸入所需結構出現 |
| theme.start / theme.applied / theme.reused | 原版主題開始／已套用／控制器復用已早期套用的主題，避免重複 payload |
| validation.start / validation.end | 未改動的原版 verifySession；失敗仍撤回，不能當成成功 |
| media.prepare.start / media.transfer.start / media.prepare.end | 媒體整體準備／第一個原版 client evaluate 指令；記錄呼叫數、表達式總 bytes 及 renderer 自報 preparedMs |
| animation.request / animation.start | 進入 showOpening／原版播放器回報 started；只在驗證通過後發生 |
| animation.first-frame | 註冊後的第一個影片 frame callback；不代表該幀已顯示在 macOS 視窗上 |
| renderer.first-paint / first-contentful-paint | Chromium 文件 paint timing；不是官方原生視窗首次可見時間 |
| rollback.start/end / hook.remove-failed | 撤回及清理結果；清理未能確認會明確報錯並要求手動退出 |

`atMs`、`afterSpawnMs` 是主機 monotonic 的接收／操作時間；renderer 的原始 `rendererMs`、`rendererTimeOrigin` 另記。`rendererEstimatedAfterSpawnMs` 用 epoch 估計對齊，可能受時鐘差異影響。不要把較晚收到的 paint 紀錄當成較晚發生的 paint。未觀測值為 null，不是零耗時。摘要以首次驗證的 main target 分組，避免把輔助頁混入主流程。

不收聊天內容、輸入值、HTML、截圖或頁面 URL，也不記錄任意 renderer 錯誤正文。這些是效能診斷，不能代替可讀性驗收。

## 候選路徑與限制

預設保留原流程與輪詢節奏作為 instrumented baseline。`--early-document` 才啟用候選：

1. 素材、原版主題和 bootstrap 在 spawn 前準備；stderr 事件喚醒連線，target／文件事件喚醒後續工作，保留 1 秒備援掃描。
2. 在已核對身分的本次 browser 上使用 `Target.setAutoAttach` 與 `Page.addScriptToEvaluateOnNewDocument`。來源文件見 [Target protocol](https://chromedevtools.github.io/devtools-protocol/tot/Target/) 與 [Page protocol](https://chromedevtools.github.io/devtools-protocol/tot/Page/)。
3. 新 target 暫停期間只登記腳本，隨即 `Runtime.runIfWaitingForDebugger`；註冊失敗也在 finally 恢復。1.5 秒 watchdog 只作失敗保護，不是正常路徑必須等待的時間。無支援則記錄 fallback，走較晚注入。
4. 腳本只在 app: 主 frame 生效，排除 pet／avatar 頁；遇到原版 main 錨點才用原版 payload 與既有 CSS 暫時套用，不在空白頁或外部頁盲套主題。不隱藏官方視窗，不加透明覆蓋層。
5. 早期 CSS 不等於驗證通過。等結構及可見性可驗證，才呼叫原版 verifier；動畫依舊在通過後開始。失敗、停用或退出會移除登記腳本、停止 observer、撤回主題與釋放媒體，避免重新載入復活。

**外部 CDP 載入器無法保證趕在官方視窗顯示之前。** 除錯端點開放前不能登記；第一個 renderer 可能已載入，也可能先出現空白的原生視窗。`capturedBeforeScripts:false` 表示附加較晚，即使登記能涵蓋後續 navigation，也不能追溯首次畫面。即使值為 true，也不證明 OS 視窗從未先顯示。

要確定控制官方 BrowserWindow 的 show 或 preload，需要官方支援的更早入口／視窗生命周期介面；本方案沒有這項能力，不修改官方 app.asar、簽名、主程序或系統防護。本輪保留此限制，不以動畫遮掩。

## 隔離測試與結果邊界

`node tests/macos-startup.browser.mjs` 自建 headless Chrome、暫存 profile 及本機 HTTP fixture。fixture 的 80ms 回應延遲是兩模式相同的合成工作量，**不在產品載入器中**。僅此測試把 bootstrap 的 app: 條件換成 HTTP，production 保持 app-only。新 target 登記、主題復用、原版驗證、動畫 gate、停用後 reload 不復活均有驗證。

`dist/startup-benchmark.json`、`dist/startup-*-fixture.jsonl` 是本機產生的原始證據，不提交使用者 logs。以下是一次隔離試跑的接收時間，從 Chrome spawn 請求起算，非 ChatGPT：

| 階段（spawn 後 ms） | baseline | early-document |
|---|---:|---:|
| 除錯介面連線 | 615.1 | 285.1 |
| 主 target 首次觀測 | 663.9 | 348.3 |
| 早期 script 登記 | 未觀測 | 512.1 |
| 主題已套用 | 922.3 | 662.9 |
| 原版驗證通過 | 924.7 | 722.1 |
| 動畫 started | 1266.4 | 1058.6 |
| 首個影片 frame callback | 1279.6 | 1088.9 |
| 媒體整體準備（階段耗時） | 402.6 | 307.8 |
| 媒體主機首指令前準備 | 26.6 | 25.3 |
| renderer 自報準備 | 101.6 | 104.2 |
| 媒體指令數／總表達式 bytes | 73 / 15,063,831 | 73 / 15,063,831 |
| 首次 rAF 已有主題 | 否 | 是 |

表格保留其中一輪試跑；重跑的本機證據檔會覆寫，數字不必與表格相同。本次兩模式各只跑一次、按順序執行，瀏覽器冷啟動／檔案快取不同，不能換算效能提升百分比。前面的其他試跑也有 early 模式總耗時反而較慢的結果。能確認的是合成頁中 early 在首次 requestAnimationFrame 前已有主題，baseline 尚無；這不等同於量到所有 paint 像素或原生視窗閃現。候選登記約 2.87MB script 也有成本，不能稱為免費或總是更快。

原版播放器動畫長度、解碼等待上限和 quiet-frame gate 維持原值。沒有實機 trace 前，不宣稱解決真實首次啟動或主觀流暢度。

## 由使用者手動量測

先儲存 Work，結束目前工作後操作。代理不執行下列受限 app 操作。

1. 停止舊載入器並手動 Cmd+Q 完全退出 ChatGPT。在新專案 Terminal A 執行完整開屏的 baseline：

   ```sh
   node engine/macos-skin.mjs
   ```

2. 主題與開屏開始後，Terminal B 只分析已寫出的數字檔：

   ```sh
   node macos/startup-report.mjs > startup-baseline-summary.json
   ```

   記下／另存本次 `logs/startup-<ID>.jsonl`。report 不連線 app，退出後仍可用 `--file /path/to/startup-<ID>.jsonl` 分析。若異常或清理報錯，先回報，勿把它視為通過。
3. Terminal A Ctrl+C、手動完全退出 ChatGPT，再測候選：

   ```sh
   node engine/macos-skin.mjs --early-document
   ```

   以相同方式輸出 `startup-early-summary.json`。兩次不要同時運行，也不要在 Work 正執行任務時退出。可交錯多次，保留每次 trace，避免只選最快的一次。
4. 新 0.3.2 `.app` 也輸出同一套量測，預設 baseline。若要從新 Cocoa 入口測候選，可手動執行：

   ```sh
   open dist/Sandrone-ChatGPT-0.3.2-Mac-Test.app --args --early-document
   ```

   先確認舊實例已退出，否則 macOS 可能把 open 交給既有實例。相同程序仍會拒絕接管現有官方應用。
5. 回傳願意分享的兩份 summary／對應 trace，加上「官方視窗是否仍先顯示」的觀察。若有自願提供的錄影，請避開私人內容；目前程式把原生首次可見時間保留為 null，不能由 paint 值冒充它。

現有對話、Chat／Work 問題修正與重播等使用者確認維持記錄；0.3.2 的 baseline／early 啟動順序、可讀性及停用／重新啟用仍需實機回歸。設定、模型選單、其他未確認互動狀態亦繼續待驗收。
