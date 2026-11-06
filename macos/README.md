# Sandrone Mac 0.3.4 本地整合測試包

本輪收斂現有 **baseline**，暫停插件與早期載入研究。原版主題、開屏播放器、驗證與失敗撤回保留，撤回的 `engine/macos-theme.css` 持續停用。**主題與開屏稍晚載入是已知限制；官方 ChatGPT 圖示啟動不會自動套用主題。** 未公開發布，也不代表完整實機驗收完成。

使用者先前已確認對話／輸入框可讀，開屏重播、停用及重新啟用正常；首頁其他區域與窄視窗對話可接受，0.3.1 已解決 Chat／Work 原白底淺字問題。未逐項確認的互動狀態不擴大標記。**設定頁、模型選單、`.app` 普通啟動、Dock 操作與錯誤恢復均仍待本版手動驗收。**

## 日常使用：放進 Dock，不需 Terminal 持續開著

本地產物：`dist/Sandrone-ChatGPT-0.3.4-Mac-Test.app`。保留舊版，把新包放到固定位置後拖入 Dock。完成目前 Work 工作、儲存內容、結束舊載入器並手動 Cmd+Q 完全退出 ChatGPT，再從桑多涅啟動器啟動。

啟動器提供狀態視窗、停用／重新啟用、重播、停止與清理，以及包內離線說明。關閉視窗仍繼續運行；再點 Dock 重開視窗，不重複啟動。結束啟動器會先請求載入器停止清理，不強制退出 ChatGPT；清理未確認時保留提示，不標為已還原。

- [Dock 安裝、使用、完整還原與移除](DOCK-LAUNCHER.md)
- [設定／模型／普通啟動／錯誤恢復的逐項手動驗收](MANUAL-ACCEPTANCE.md)
- [程式測試、已確認範圍及其餘待驗收](VALIDATION.md)

需要建置時使用的 Node.js 24 以上版本；路徑記在包內 `Contents/Resources/node-path.txt`，Node 尚未內嵌。移動 `.app` 不依賴原始碼位置，但移除 Node 會無法啟動。包使用本機臨時簽名、未 Apple 公證；不是免依賴公開發行包。不修改官方安裝、簽名、登入資料或系統防護；若系統阻擋，不關閉防護來繞過。

## 還原與移除摘要

先停用主題，再停止並等載入器結束，結束桑多涅啟動器。儲存工作並手動完全退出 ChatGPT，之後從官方圖示啟動即可回原生介面。**只停止載入器不會關閉仍在官方程序內的 loopback 除錯端點，完全退出 ChatGPT 才會關閉。**

完成還原、確認新舊載入器都已結束後，可從 Dock 移除捷徑、把桑多涅 `.app` 移至垃圾桶；工具資料可備份後選擇移除 `~/Library/Application Support/SandroneMacDev/`。不要刪官方聊天、帳號資料、Keychain 或其他工具使用的 Node。詳細步驟見 [DOCK-LAUNCHER.md](DOCK-LAUNCHER.md)。沒有安裝登入項目、LaunchAgent 或系統服務。

## 可選手動診斷

實機操作、控制與 audit 均由使用者手動執行；代理不連線／操作受限 `com.openai.codex`，也不換管道繞過限制。日常 `.app` 控制不需 Terminal。需要診斷時，才在倉庫根目錄或包內 `Contents/Resources` 執行：

```sh
node macos/audit-current.mjs --manual settings
node macos/audit-current.mjs --manual menu
node macos/startup-report.mjs
```

只在目前由本載入器啟動的程序仍在運行、且你已手動切到相應畫面時使用 audit；它會核對 PID／binary／port／browser ID，再收集限定錨點、幾何、色彩及媒體狀態，不收正文、輸入值、HTML、頁面 URL 或截圖。只分享願意提供的畫面與對應檔案，不需整個資料目錄或啟動 state。

資料位於 `~/Library/Application Support/SandroneMacDev/state/` 與 `logs/`。所有命令可共用 `SANDRONE_DATA_DIR` 指向另一個工具資料夾。這些本機檔案不提交 Git。既有 `node macos/control.mjs disable|enable|replay` 仍保留；命令送出不等於清理或畫面已確認。

## 開發檢查與本地打包

```sh
node --test tests/*.test.mjs
node engine/macos-skin.mjs --check
node tests/macos-launcher.cocoa.mjs  # 僅自己的 Cocoa／假子程序，不啟動官方 app
zsh Build-Mac.command
```

`--check` 僅讀應用 metadata 並驗證主題和素材，不啟動／連線官方 app。打包需要本機 Node.js 24 與 Xcode Command Line Tools；已存在產物時拒絕覆蓋，可先改名保留再重建。包只含本專案合法引擎、vendor、主題、素材、說明與授權，不含官方 ASAR／原生模組、帳號、profile、logs、state、研究原型或測試程式。原版 renderer／opening-client／native-ui.css 未改；0.3.1 局部切換鈕樣式及已驗證功能保留。

若要只看合成頁，不退出 Work，可執行 `node macos/build-preview.mjs` 後開啟 `dist/Sandrone-Mac-preview.html`，或雙擊 `macos/preview.command`。預覽沒有官方帳號或介面，不能代替實機驗收。

歷史啟動 trace 分析見 [STARTUP-TRACE-ANALYSIS.md](STARTUP-TRACE-ANALYSIS.md)。`--early-document` 原始碼保留但不作日常入口，本輪不再優化；不改動畫長度或壓低輪詢間隔掩蓋延遲。上游與原引擎來源見 [UPSTREAM.md](UPSTREAM.md)。本輪只推送開發分支，不合併 main、不發布、不向上游送 PR。
