[CmdletBinding()]
param([ValidateSet('Install','Restore')][string]$Mode='Install', [switch]$VerifyOnly)
$ErrorActionPreference='Stop'
$setupScriptPath=$PSCommandPath
$state=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'current.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$bundleDirectory=$state.bundleDirectory
$bundle=Get-Content -LiteralPath (Join-Path $bundleDirectory 'bundle.json') -Raw | ConvertFrom-Json
if($VerifyOnly){
    & (Join-Path $bundleDirectory 'install.ps1') -BundleDirectory $bundleDirectory -VerifyOnly
    return
}
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
[xml]$xaml=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="桑多涅主题 · 本机试用" Width="620" Height="345" ResizeMode="NoResize" WindowStartupLocation="CenterScreen" Background="#101923" Foreground="#F2E9D6">
 <Grid Margin="24"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
  <TextBlock Name="Heading" FontSize="25" FontWeight="Bold" Text="桑多涅主题 0.3.9.0"/>
  <TextBlock Grid.Row="1" Margin="0,12,0,0" FontSize="14" TextWrapping="Wrap" Text="自动识别本机官方 Codex，准备匹配的主题包。安装后沿用官方应用入口。"/>
  <TextBlock Name="Status" Grid.Row="2" Margin="0,20,0,10" FontSize="16" TextWrapping="Wrap" VerticalAlignment="Center"/>
  <StackPanel Grid.Row="3" Orientation="Horizontal" HorizontalAlignment="Right">
   <Button Name="CancelButton" Padding="18,10" Margin="0,0,10,0" Content="暂不操作" Background="#243442" Foreground="#F2E9D6"/>
   <Button Name="PrimaryButton" Padding="18,10" Content="安装主题并打开 Codex" Background="#D3B775" Foreground="#111922" FontWeight="Bold"/>
  </StackPanel>
 </Grid>
</Window>
'@
$window=[Windows.Markup.XamlReader]::Load((New-Object Xml.XmlNodeReader $xaml))
$heading=$window.FindName('Heading'); $status=$window.FindName('Status')
$primary=$window.FindName('PrimaryButton'); $cancel=$window.FindName('CancelButton')
$heading.Text='桑多涅主题 '+$bundle.version
$script:busy=$false
function Test-CodexRunning {
    foreach($process in @(Get-Process ChatGPT -ErrorAction SilentlyContinue)){
        $filename=$null;try{$filename=$process.Path}catch{}
        if(!$filename -or $filename -match '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\ChatGPT\.exe$'){return $true}
    }
    return $false
}
function Update-Readiness {
    if($script:busy){return}
    $running=Test-CodexRunning
    $primary.IsEnabled=!$running
    if($running){$status.Text='请先保存工作，并从托盘或菜单退出所有 Codex 窗口。退出后，下方按钮会自动启用；这里不会强制结束任何进程。'}
    elseif($Mode -eq 'Restore'){$status.Text='Codex 已退出。将只移除本次桑多涅主题附加包，保留官方程序、登录、聊天和配置。'}
    else{$status.Text='Codex 已退出，可以安装。Windows 可能弹出权限确认；确认后会校验版本和文件，再安装主题附加包。'}
}
if($Mode -eq 'Restore'){$heading.Text='恢复官方 Codex 界面';$primary.Content='恢复官方版并打开 Codex'}
$cancel.Add_Click({$window.Close()})
$timer=New-Object Windows.Threading.DispatcherTimer
$timer.Interval=[TimeSpan]::FromSeconds(2)
$timer.Add_Tick({Update-Readiness})
$primary.Add_Click({
    if(Test-CodexRunning){Update-Readiness;return}
    $script:busy=$true;$primary.IsEnabled=$false;$cancel.IsEnabled=$false;$timer.Stop()
    try{
        if($Mode -eq 'Install'){
            $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
            if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
                $argsText='-NoProfile -ExecutionPolicy RemoteSigned -STA -File "'+$setupScriptPath+'" -Mode Install'
                Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $argsText -Verb RunAs -WindowStyle Hidden
                $window.Close();return
            }
            $status.Text='正在校验并安装主题，请稍候……'
            & (Join-Path $bundleDirectory 'install.ps1') -BundleDirectory $bundleDirectory | Out-String | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'last-operation.txt') -Encoding UTF8
        }else{
            $status.Text='正在移除主题附加包，请稍候……'
                        $installed=@(Get-AppxPackage -PackageTypeFilter Optional | Where-Object { $_.Name -ceq 'Local.Sandrone.CodexNativeTheme' -and $_.PackageFullName -match '^Local\.Sandrone\.CodexNativeTheme_0\.(3|4)\.[0-9]+\.[0-9]+_x64__vt89pjxv8jer8$' })
            if($installed.Count -gt 1){throw '发现多个主题附加包，请保留日志后检查安装状态。'}
            if($installed.Count -eq 0){$result=[pscustomobject]@{status='completed';note='No supported Sandrone add-on registered.'}}
            else{$result=& (Join-Path $bundleDirectory 'uninstall.ps1') -Action Remove -StateDirectory (Join-Path $PSScriptRoot 'recovery-state') -ExpectedPackageFullName $installed[0].PackageFullName}
            $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'last-operation.txt') -Encoding UTF8
            if($result.status -ne 'completed'){throw 'Windows 仍在等待释放主题包，请稍后重试恢复。'}
        }
        $official=Get-AppxPackage -Name OpenAI.Codex
        if(!$official){throw '未找到官方 Codex。主题操作已完成，请从开始菜单手动启动。'}
        $manifest=Get-AppxPackageManifest -Package $official.PackageFullName
        if(!@($manifest.Package.Applications.Application.Id).Contains('App')){throw '主题操作已完成，但官方启动入口已变化，请从开始菜单手动启动。'}
        Start-Process -FilePath explorer.exe -ArgumentList ('shell:AppsFolder\'+$official.PackageFamilyName+'!App')
        $window.Close()
    }catch{
        $_ | Out-String | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'last-error.txt') -Encoding UTF8
        $status.Text='操作未完成：'+$_.Exception.Message+' 详细信息保存在 last-error.txt；可使用 Restore-Theme.cmd 恢复。'
        $script:busy=$false;$primary.IsEnabled=$true;$cancel.IsEnabled=$true;$timer.Start()
    }
})
$window.Add_Closed({$timer.Stop()})
Update-Readiness
$timer.Start()
$null=$window.ShowDialog()
