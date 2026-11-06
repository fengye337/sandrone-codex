[CmdletBinding()]
param([switch]$VerifyOnly,[switch]$PrepareOnly)
$ErrorActionPreference='Stop'
try {
 $official=Get-AppxPackage -Name OpenAI.Codex
 if(!$official){throw '未找到官方 Codex。'}
 if($VerifyOnly){
  $state=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'current.json') -Raw -Encoding UTF8|ConvertFrom-Json
 }else{
  $state=& (Join-Path $PSScriptRoot 'Prepare-Theme.ps1')
 }
 $bundle=Get-Content -LiteralPath (Join-Path $state.bundleDirectory 'bundle.json') -Raw -Encoding UTF8|ConvertFrom-Json
 $registered=@(Get-AppxPackage -PackageTypeFilter Optional|Where-Object PackageFullName -CEQ $bundle.addonPackageFullName)
 $ready=$official.PackageFullName -ceq $bundle.targetPackage -and $registered.Count -eq 1 -and @($official.Dependencies|Where-Object PackageFullName -CEQ $bundle.addonPackageFullName).Count -eq 1
 if($VerifyOnly -or $PrepareOnly){[pscustomobject]@{version=$bundle.version;target=$bundle.targetPackage;registered=($registered.Count -eq 1);ready=$ready;autoPrepare=$true;legacyLauncherUsed=$false}|ConvertTo-Json -Compress;return}
 if(!$ready){
  Start-Process -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList ('-NoProfile -STA -ExecutionPolicy RemoteSigned -File "'+(Join-Path $PSScriptRoot 'Theme-Setup.ps1')+'" -Mode Install') -WindowStyle Hidden
 }else{Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') -ArgumentList ('shell:AppsFolder\'+$official.PackageFamilyName+'!App')}
}catch{
 if($VerifyOnly -or $PrepareOnly){throw}
 Add-Type -AssemblyName PresentationFramework
 $answer=[Windows.MessageBox]::Show('自动准备未完成：'+$_.Exception.Message+"`n`n是否先打开官方 Codex？",'桑多涅 Codex',[Windows.MessageBoxButton]::YesNo,[Windows.MessageBoxImage]::Information)
 if($answer -eq [Windows.MessageBoxResult]::Yes){Start-Process -FilePath explorer.exe -ArgumentList 'shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App'}
}
