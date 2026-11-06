[CmdletBinding()]
param([switch]$ForceBuild)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$mutex=New-Object Threading.Mutex($false,'Local\SandroneCodex.AutoPrepare')
$locked=$false
try {
 $locked=$mutex.WaitOne(0)
 if(!$locked){throw '另一个适配操作正在进行，请稍后再试。'}
 $official=@(Get-AppxPackage -Name OpenAI.Codex)
 if($official.Count -ne 1){throw '未找到唯一的官方 Codex。'}
 $official=$official[0]
 if($official.SignatureKind.ToString() -ne 'Store' -or $official.Status.ToString() -ne 'Ok' -or $official.IsDevelopmentMode -or $official.Architecture.ToString() -ne 'X64' -or $official.Publisher -cne 'CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B' -or $official.PackageFullName -cnotmatch '^OpenAI\.Codex_[0-9.]+_x64__2p2nqsd0c76g0$'){throw '官方安装身份未通过验证。'}
 $pointer=Join-Path $root 'current.json'
 $revisionFiles=@(Get-ChildItem -LiteralPath (Join-Path $root 'source\native-integration\runtime') -File)+@(Get-ChildItem -LiteralPath (Join-Path $root 'source\engine') -File)
 $revision=(($revisionFiles|Sort-Object FullName|ForEach-Object {(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}) -join '')
 $previous=$null
 if(Test-Path -LiteralPath $pointer){
  $previous=Get-Content -LiteralPath $pointer -Raw -Encoding UTF8|ConvertFrom-Json
  $cached=Get-Content -LiteralPath (Join-Path $previous.bundleDirectory 'bundle.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if(!$ForceBuild -and $cached.targetPackage -ceq $official.PackageFullName -and $previous.sourceRevision -ceq $revision){return $previous}
 }
 & (Join-Path $root 'Initialize.ps1')
 $tools=Get-Content -LiteralPath (Join-Path $root 'tools.json') -Raw -Encoding UTF8|ConvertFrom-Json
 $exe=Join-Path $official.InstallLocation 'app\ChatGPT.exe'
 $signature=Get-AuthenticodeSignature -LiteralPath $exe
 if($signature.Status.ToString() -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'OpenAI'){throw '官方程序签名校验失败。'}
 & $tools.node (Join-Path $root 'inspect-contract.cjs') $official.InstallLocation | Out-Host
 if($LASTEXITCODE -ne 0){throw '官方加载接口有变化，需要修复；现有配置和会话保持保留。'}
 $target=[ordered]@{name=$official.Name;version=$official.Version.ToString();architecture='x64';publisher=$official.Publisher;packageFullName=$official.PackageFullName;files=[ordered]@{}}
 foreach($file in @('app/ChatGPT.exe','app/resources/app.asar','app/resources/owl-app.ini','app/resources/native/windows-updater.node')){$target.files[$file]=(Get-FileHash -LiteralPath (Join-Path $official.InstallLocation $file) -Algorithm SHA256).Hash.ToLowerInvariant()}
 $version=[version]'0.4.1.0'
 if($previous -and [version]$cached.version -gt $version){$version=[version]$cached.version}
 foreach($installed in @(Get-AppxPackage -PackageTypeFilter Optional|Where-Object Name -CEQ 'Local.Sandrone.CodexNativeTheme')){if([version]$installed.Version -gt $version){$version=[version]$installed.Version}}
 $next=New-Object Version($version.Major,$version.Minor,$version.Build,($version.Revision+1))
 $build=Join-Path $env:TEMP ('SandroneAutoBuild-'+[Guid]::NewGuid().ToString('N'))
 $null=New-Item -ItemType Directory -Path $build
 Copy-Item -LiteralPath (Join-Path $root 'source') -Destination (Join-Path $build 'source') -Recurse
 $compatFile=Join-Path $build 'source\native-integration\compatibility.json'
 $compat=Get-Content -LiteralPath $compatFile -Raw -Encoding UTF8|ConvertFrom-Json
 $compat.addonVersion=$next.ToString();$compat.targets=@($target)
 [IO.File]::WriteAllText($compatFile,($compat|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
 # Reuse the locally compiled bridge; do not depend on GCC or its temporary directory.
 $bridge=Join-Path $root 'bridge.node'
 if((Get-FileHash -LiteralPath $bridge -Algorithm SHA256).Hash.ToLowerInvariant() -cne $tools.bridgeSha256){throw '本地主题桥接文件校验失败。'}
 $builder=Join-Path $build 'source\native-integration\build.ps1'
 $text=[IO.File]::ReadAllText($builder)
 $start=$text.IndexOf("& `$gcc '-shared'")
 $finish=$text.IndexOf('# Validate the PE machine',$start)
 if($start -lt 0 -or $finish -lt 0){throw '本地构建模板发生变化。'}
 $bridgeLiteral="'"+$bridge.Replace("'","''")+"'"
 $text=$text.Substring(0,$start)+'Copy-Item -LiteralPath '+$bridgeLiteral+' -Destination $proxy'+"`r`n"+$text.Substring($finish)
 $text=$text.Replace('$gcc = Resolve-SandroneCompiler $GccPath','# Precompiled, hash-verified local bridge is reused.')
 [IO.File]::WriteAllText($builder,$text,(New-Object Text.UTF8Encoding($true)))
 $output=Join-Path $build 'bundle'
 & $builder -UseInstalledStorePackage -OutputDirectory $output -MakeAppxPath $tools.makeappx -NodePath $tools.node | Out-Host
 & (Join-Path $output 'install.ps1') -VerifyOnly | Out-Host
 & (Join-Path $build 'source\tests\native-package-bundle.test.ps1') -BundleDirectory $output | Out-Host
 $destination=Join-Path $root ('generated\'+$official.Version+'\'+$next)
 $null=New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force
 Copy-Item -LiteralPath $output -Destination $destination -Recurse
 $state=[ordered]@{schema=1;bundleDirectory=$destination;targetPackage=$official.PackageFullName;version=$next.ToString();sourceRevision=$revision;preparedAt=[DateTimeOffset]::Now.ToString('o');realStartupVerified=$false}
 $temporary=$pointer+'.tmp'
 [IO.File]::WriteAllText($temporary,($state|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
 Move-Item -LiteralPath $temporary -Destination $pointer -Force
 return [pscustomobject]$state
} finally {if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
