# macOS 靜態背景來源

本移植改編自 wsqUsaqi537 的 Sandrone Codex PR #6：
https://github.com/fengye337/sandrone-codex/pull/6

參考提交：a661a4063b18d6a8b0637e039d4f49f236f3fdbe。
作者：wsqUsaqi537。程式遵循專案 MIT 授權，保留根目錄 LICENSE。角色素材權利仍歸原權利人。

目前為依 PR 可見程式碼改編的實作，並非已取回的原始 Git commit。終端目前無法解析 github.com，尚未建立上游 Git 歷史或推送到 fork。

沿用：靜態背景版面計算、回環除錯、從本次啟動 stderr 取得 browser ID、既有程序保護、圖片 SHA256 與 AppleScript 啟動器概念。

本地調整：辨識 ChatGPT.app 與 Codex Framework.framework、增加僅檢查模式、獨立 renderer 檔案、視窗 resize 更新與移除函式、WebSocket 錯誤清理、Cocoa 原生啟動器、建置到專案 dist/，不寫入 ~/Applications。

啟動器使用既有應用程式設定與登入狀態，與早期 launch-plan 的獨立 profile 規劃不同。這是靜態背景實驗，尚未包含 Windows 開屏。程式會啟用本機除錯介面，本機其他程序可能存取應用內容；完全退出 ChatGPT 才會關閉介面。
