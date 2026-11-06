on run
    set resources to (POSIX path of (path to me)) & "Contents/Resources/"
    set appPath to "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"
    try
        set nodePath to do shell script "/bin/cat " & quoted form of (resources & "node-path.txt")
        do shell script "/bin/test -x " & quoted form of nodePath & " && /bin/test -x " & quoted form of appPath & " && /bin/test -r " & quoted form of (resources & "macos-skin.mjs") & " && /bin/test -r " & quoted form of (resources & "Sandrone-background.png")
        set processes to do shell script "/bin/ps -axo comm="
        if processes contains appPath then
            display dialog "ChatGPT 已经在运行。请先保存工作并完全退出 ChatGPT，再打开此启动器。" buttons {"知道了", "打开 ChatGPT"} default button "打开 ChatGPT" with title "桑多涅 ChatGPT"
            if button returned of result is "打开 ChatGPT" then do shell script "/usr/bin/open -a /Applications/ChatGPT.app"
            return
        end if
        set loader to quoted form of nodePath & " " & quoted form of (resources & "macos-skin.mjs")
        set failure to "/usr/bin/osascript -e " & quoted form of "display alert \"桑多涅皮肤启动失败\" message \"请检查 ChatGPT 是否已经完全退出；如仍失败，请按照项目文档从终端启动以查看报错。\""
        do shell script "(" & loader & " || " & failure & ") </dev/null >/dev/null 2>&1 &"
    on error messageText
        display alert "无法启动桑多涅 ChatGPT" message messageText
    end try
end run
