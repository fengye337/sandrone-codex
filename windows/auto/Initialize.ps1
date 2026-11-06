$ErrorActionPreference='Stop'
$node=Join-Path $PSScriptRoot 'runtime\node.exe'
$bridge=Join-Path $PSScriptRoot 'bridge.node'
$signature=Get-AuthenticodeSignature -LiteralPath $node
if($signature.Status.ToString() -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'OpenJS'){throw 'Node signature verification failed.'}
$expected=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'bridge.sha256') -Raw).Trim()
if((Get-FileHash -LiteralPath $bridge -Algorithm SHA256).Hash -ine $expected){throw 'Bridge digest mismatch.'}
$makeappx=Get-Command makeappx.exe -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Source -First 1
if(!$makeappx){$kits=Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin';$makeappx=Get-ChildItem -LiteralPath $kits -Directory -ErrorAction SilentlyContinue|Where-Object Name -match '^\d+\.\d+\.\d+\.\d+$'|Sort-Object {[version]$_.Name} -Descending|ForEach-Object {Join-Path $_.FullName 'x64\makeappx.exe'}|Where-Object {Test-Path -LiteralPath $_}|Select-Object -First 1}
if(!$makeappx){throw 'Install Windows SDK (Signing Tools) once from https://developer.microsoft.com/windows/downloads/windows-sdk/ ; alternatively use the portable release.'}
$sdkSignature=Get-AuthenticodeSignature -LiteralPath $makeappx
if($sdkSignature.Status.ToString() -ne 'Valid' -or $sdkSignature.SignerCertificate.Subject -notmatch 'Microsoft'){throw 'Windows SDK signature verification failed.'}
$config=@{schema=1;node=$node;makeappx=$makeappx;bridgeSha256=$expected.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'tools.json'),($config|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
