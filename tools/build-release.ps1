[CmdletBinding()]
param([string]$Version='0.7.0',[string]$NodePath,[string]$NodeLicense,[string]$BridgePath)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
if(!$NodePath){$NodePath=(Get-Command node.exe -ErrorAction Stop).Source}
if(!$NodeLicense){$candidates=@((Join-Path (Split-Path $NodePath) 'LICENSE'),(Join-Path (Split-Path (Split-Path $NodePath)) 'LICENSE'));$NodeLicense=$candidates|Where-Object {Test-Path -LiteralPath $_}|Select-Object -First 1}
$out=Join-Path $repo ('dist\release-'+$Version)
if(Test-Path -LiteralPath $out){throw 'Release output must be new'}
$null=New-Item -ItemType Directory -Path $out
if(!$NodeLicense){
 $nodeVersion=& $NodePath -p 'process.version'
 if($nodeVersion -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$'){throw 'Invalid Node version'}
 $NodeLicense=Join-Path $out 'LICENSE-node.txt'
 Invoke-WebRequest -UseBasicParsing -Uri ('https://raw.githubusercontent.com/nodejs/node/'+$nodeVersion+'/LICENSE') -OutFile $NodeLicense
 if((Get-Item -LiteralPath $NodeLicense).Length -lt 10000){throw 'Incomplete Node license'}
}
$source=Join-Path $out 'Source'
$null=New-Item -ItemType Directory -Path $source
$tracked=& git -C $repo -c core.quotepath=false ls-files
if($LASTEXITCODE -ne 0){throw 'Source file inventory failed'}
foreach($relative in $tracked){$target=Join-Path $source $relative;$null=New-Item -ItemType Directory -Path (Split-Path $target) -Force;Copy-Item -LiteralPath (Join-Path $repo $relative) -Destination $target}
Compress-Archive -LiteralPath $source -DestinationPath (Join-Path $out ('SandroneCodex-'+$Version+'-Source.zip'))
$portable=Join-Path $out 'Windows-Portable'
Copy-Item -LiteralPath $source -Destination $portable -Recurse
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $portable 'runtime\node.exe')
Copy-Item -LiteralPath $NodeLicense -Destination (Join-Path $portable 'runtime\LICENSE-node.txt')
& (Join-Path $portable 'Build-From-Source.ps1')
& (Join-Path $portable 'runtime\node.exe') (Join-Path $portable 'verify-integrity.mjs')
if($LASTEXITCODE -ne 0){throw 'Portable integrity verification failed'}
Compress-Archive -LiteralPath $portable -DestinationPath (Join-Path $out ('SandroneCodex-'+$Version+'-Windows-x64.zip'))
if(!$BridgePath){
 $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
 $vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
 if(!$vs){throw 'C++ compiler required for the release bridge'}
 $BridgePath=Join-Path $out 'bridge.node'
 $batch=Join-Path $out 'compile-bridge.cmd'
 $lines=@('@echo off',('call "'+$vs+'\VC\Auxiliary\Build\vcvars64.bat" >nul'),('cl /nologo /LD /O2 /W3 /TC "'+(Join-Path $repo 'native-integration\bridge.c')+'" /link /OUT:"'+$BridgePath+'"'))
 [IO.File]::WriteAllLines($batch,$lines,(New-Object Text.ASCIIEncoding))
 Push-Location $out
 try{& cmd.exe /d /c $batch;if($LASTEXITCODE -ne 0){throw 'Bridge build failed'}}finally{Pop-Location}
}
$auto=Join-Path $out 'Windows-AutoTheme'
$null=New-Item -ItemType Directory -Path $auto
Get-ChildItem -LiteralPath (Join-Path $repo 'windows\auto') -File|Copy-Item -Destination $auto
Copy-Item -LiteralPath $source -Destination (Join-Path $auto 'source') -Recurse
$null=New-Item -ItemType Directory -Path (Join-Path $auto 'runtime')
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $auto 'runtime\node.exe')
Copy-Item -LiteralPath $NodeLicense -Destination (Join-Path $auto 'runtime\LICENSE-node.txt')
Copy-Item -LiteralPath $BridgePath -Destination (Join-Path $auto 'bridge.node')
[IO.File]::WriteAllText((Join-Path $auto 'bridge.sha256'),(Get-FileHash -LiteralPath $BridgePath -Algorithm SHA256).Hash)
Copy-Item -LiteralPath (Join-Path $repo 'windows\auto\README.md') -Destination (Join-Path $auto 'README.md') -Force
Compress-Archive -LiteralPath $auto -DestinationPath (Join-Path $out ('SandroneCodex-'+$Version+'-Windows-AutoTheme-x64.zip'))
$sums=Get-ChildItem -LiteralPath $out -Filter '*.zip'|Sort-Object Name|ForEach-Object {((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())+'  '+$_.Name}
[IO.File]::WriteAllLines((Join-Path $out 'SHA256SUMS.txt'),$sums,(New-Object Text.UTF8Encoding($false)))
Write-Output ('Release verified and packaged: '+$out)
