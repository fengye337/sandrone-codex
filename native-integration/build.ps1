[CmdletBinding()]
param(
    [string]$OfficialMsix,
    [switch]$UseInstalledStorePackage,
    [string]$OutputDirectory,
    [string]$GccPath,
    [string]$MakeAppxPath,
    [string]$NodePath,
    [switch]$RebuildStartupMedia
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'package-common.ps1')
$repoRoot = Split-Path $PSScriptRoot -Parent
$compatibility = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'compatibility.json') -Raw | ConvertFrom-Json
if (!$UseInstalledStorePackage) {
$source = (Get-Item -LiteralPath $OfficialMsix).FullName
$signature = Get-AuthenticodeSignature -LiteralPath $source
if ($signature.Status.ToString() -ne 'Valid') { throw 'The source MSIX must have a valid official signature.' }
}
$gcc = Resolve-SandroneCompiler $GccPath
$makeappx = Resolve-SandroneMakeAppx $MakeAppxPath
if (!$OutputDirectory) { $OutputDirectory = Join-Path $repoRoot ('dist\native-addon\' + [Guid]::NewGuid().ToString('N')) }
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'OutputDirectory must not already exist; builds do not overwrite installed runtimes or previous evidence.' }
foreach ($file in @('runtime\main.cjs', 'runtime\controls.cjs', 'uninstall.ps1', 'install.ps1')) {
    if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot $file))) { throw ('Missing native integration source: ' + $file) }
}
if ($NodePath) { $node = (Get-Item -LiteralPath $NodePath).FullName }
else {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (!$nodeCommand) { throw 'Node.js 24+ is required for startup source validation. Add it to PATH or pass -NodePath.' }
    $node = $nodeCommand.Source
}
$nodeVersion = & $node -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [version]$nodeVersion -lt [version]'24.0.0') { throw 'Startup media build checks require Node.js 24 or later.' }
if ($UseInstalledStorePackage) {

    $officialPackages = @(Get-AppxPackage -Name OpenAI.Codex)
    if ($officialPackages.Count -ne 1) { throw 'Exactly one official Store package must be registered.' }
    $official = $officialPackages[0]
    if ($official.SignatureKind.ToString() -ne 'Store' -or $official.Status.ToString() -ne 'Ok' -or $official.IsDevelopmentMode) {
        throw 'The installed source must be an intact official Store package.'
    }
    $identity = [pscustomobject]@{ Name = $official.Name; Version = $official.Version.ToString(); Publisher = $official.Publisher; ProcessorArchitecture = $official.Architecture.ToString().ToLowerInvariant() }
    $target = Get-SandroneTarget $compatibility $identity
    if ($official.PackageFullName -cne $target.packageFullName) { throw 'Installed source identity does not match the compatibility matrix.' }
    $hashes = [ordered]@{}
    foreach ($property in $target.files.PSObject.Properties) {
        Assert-SandroneRelativePath $property.Name
        $hash = Get-SandroneHash (Join-Path $official.InstallLocation $property.Name)
        if ($hash -cne $property.Value) { throw ('Unsupported installed official file: ' + $property.Name) }
        $hashes[$property.Name] = $hash
    }
    $package = Join-Path $output 'package'
    $native = Join-Path $package ('VFS\ProgramFilesX64\WindowsApps\' + $target.packageFullName + '\app\resources\native')
    $addon = Join-Path $native 'sandrone'
    $null = New-Item -ItemType Directory -Path (Join-Path $addon 'management') -Force
    $original = Join-Path $native 'windows-updater.original.node'
    Copy-Item -LiteralPath (Join-Path $official.InstallLocation 'app\resources\native\windows-updater.node') -Destination $original
    if ((Get-SandroneHash $original) -cne $target.files.'app/resources/native/windows-updater.node') { throw 'Copied official updater digest changed.' }

} else {
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($source)
try {
    $manifestEntry = $archive.GetEntry('AppxManifest.xml')
    if (!$manifestEntry) { throw 'Source archive has no AppxManifest.xml.' }
    $reader = New-Object IO.StreamReader($manifestEntry.Open())
    try { $xml = New-Object Xml.XmlDocument; $xml.XmlResolver = $null; $xml.LoadXml($reader.ReadToEnd()) } finally { $reader.Dispose() }
    $target = Get-SandroneTarget $compatibility $xml.Package.Identity
    if ($signature.SignerCertificate.Subject -cne $target.publisher) { throw 'Source MSIX signer does not match the supported official publisher.' }
    $hashes = [ordered]@{}
    foreach ($property in $target.files.PSObject.Properties) {
        $entry = $archive.GetEntry($property.Name)
        if (!$entry) { throw ('Missing official module: ' + $property.Name) }
        $stream = $entry.Open(); $hasher = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $hasher.Dispose(); $stream.Dispose() }
        if ($hash -cne $property.Value) { throw ('Unsupported official file content: ' + $property.Name) }
        $hashes[$property.Name] = $hash
    }
    $package = Join-Path $output 'package'
    $native = Join-Path $package ('VFS\ProgramFilesX64\WindowsApps\' + $target.packageFullName + '\app\resources\native')
    $addon = Join-Path $native 'sandrone'
    $null = New-Item -ItemType Directory -Path (Join-Path $addon 'management') -Force
    $original = Join-Path $native 'windows-updater.original.node'
    [IO.Compression.ZipFileExtensions]::ExtractToFile($archive.GetEntry('app/resources/native/windows-updater.node'), $original)
} finally { $archive.Dispose() }

}

$renderMode = '--ensure'; if ($RebuildStartupMedia) { $renderMode = '--force' }
& $node (Join-Path $repoRoot 'tools\render-startup.mjs') $renderMode --root $repoRoot
if ($LASTEXITCODE -ne 0) { throw 'Startup media generation/validation failed; no package was created or installed.' }
$startup = Get-Content -LiteralPath (Join-Path $repoRoot 'assets\motion\startup.json') -Raw | ConvertFrom-Json
Copy-SandroneDirectory (Join-Path $PSScriptRoot 'runtime') (Join-Path $addon 'runtime')
foreach ($directory in @('engine', 'vendor', 'themes', 'assets')) {
    Copy-SandroneDirectory (Join-Path $repoRoot $directory) (Join-Path $addon ('theme\' + $directory))
}
foreach ($file in @('LICENSE', 'ASSET-LICENSE.md', 'THIRD-PARTY-NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot $file) -Destination (Join-Path $addon 'theme')
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall.ps1') -Destination (Join-Path $addon 'management')
$addonFullName = '{0}_{1}_x64__{2}' -f $compatibility.addonName, $compatibility.addonVersion, $compatibility.addonPublisherId
$installation = [ordered]@{
    schema = 1
    version = $compatibility.addonVersion
    addonName = $compatibility.addonName
    addonPackageFullName = $addonFullName
    targetPackage = $target.packageFullName
    targetExecutable = 'app/ChatGPT.exe'
    themeRoot = './theme'
    startupSourceFingerprint = $startup.source.fingerprint
}
Write-SandroneJson (Join-Path $addon 'installation.json') $installation
$proxy = Join-Path $native 'windows-updater.node'
& $gcc '-shared' '-O2' '-Wall' '-Wextra' '-Werror' '-Wno-cast-function-type' '-static-libgcc' (Join-Path $PSScriptRoot 'bridge.c') '-o' $proxy *> (Join-Path $output 'compile.log')
if ($LASTEXITCODE -ne 0) { throw ('Native bridge compilation failed. See ' + (Join-Path $output 'compile.log')) }
# Validate the PE machine independently of the compiler executable's name.
$stream = [IO.File]::OpenRead($proxy); $binary = New-Object IO.BinaryReader($stream)
try { $stream.Position = 0x3c; $peOffset = $binary.ReadInt32(); $stream.Position = $peOffset; if ($binary.ReadUInt32() -ne 0x00004550 -or $binary.ReadUInt16() -ne 0x8664) { throw 'The compiled native bridge must be an x64 PE image.' } }
finally { $binary.Dispose(); $stream.Dispose() }
$null = New-Item -ItemType Directory -Path (Join-Path $package 'Assets')
Copy-Item -LiteralPath (Join-Path $repoRoot 'assets\characters\sandrone\round-icon.png') -Destination (Join-Path $package 'Assets\Logo.png')
$packageManifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap4="http://schemas.microsoft.com/appx/manifest/uap/windows10/4" xmlns:uap6="http://schemas.microsoft.com/appx/manifest/uap/windows10/6" xmlns:rescap6="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities/6" IgnorableNamespaces="uap4 uap6 rescap6">
  <Identity Name="$($compatibility.addonName)" Publisher="$($compatibility.addonPublisher)" Version="$($compatibility.addonVersion)" ProcessorArchitecture="x64" />
  <Properties><DisplayName>Sandrone Codex native theme</DisplayName><PublisherDisplayName>Sandrone local build</PublisherDisplayName><Logo>Assets/Logo.png</Logo><uap6:AllowExecution>true</uap6:AllowExecution><rescap6:ModificationPackage>true</rescap6:ModificationPackage></Properties>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.22000.0" MaxVersionTested="10.0.26100.0" /><uap4:MainPackageDependency Name="$($target.name)" Publisher="$($target.publisher)" /></Dependencies>
  <Resources><Resource Language="en-us" /></Resources>
</Package>
"@
[IO.File]::WriteAllText((Join-Path $package 'AppxManifest.xml'), $packageManifest, (New-Object Text.UTF8Encoding($false)))
$msix = Join-Path $output ('SandroneCodex.NativeTheme-' + $compatibility.addonVersion + '.msix')
& $node (Join-Path $repoRoot 'tools\render-startup.mjs') --check --root $repoRoot
if ($LASTEXITCODE -ne 0) { throw 'Startup sources or media changed during packaging; rebuild from a stable checkout.' }
& $node (Join-Path $repoRoot 'tools\render-startup.mjs') --check-package (Join-Path $addon 'theme') --fingerprint $startup.source.fingerprint
if ($LASTEXITCODE -ne 0) { throw 'Packaged startup inputs or media differ from the verified generation; no package was created.' }
& $makeappx pack /d $package /p $msix /o *> (Join-Path $output 'package.log')
if ($LASTEXITCODE -ne 0) { throw ('MSIX packaging failed. See ' + (Join-Path $output 'package.log')) }
$bundle = [ordered]@{
    schema = 1; version = $compatibility.addonVersion; builtAt = [DateTimeOffset]::Now.ToString('o')
    addonName = $compatibility.addonName; addonPackageFullName = $addonFullName
    addonPublisher = $compatibility.addonPublisher
    targetPackage = $target.packageFullName; targetPublisher = $target.publisher
    officialHashes = $hashes; proxySha256 = Get-SandroneHash $proxy
    packageFile = [IO.Path]::GetFileName($msix); packageSha256 = Get-SandroneHash $msix
    sourceMsixSha256 = if ($UseInstalledStorePackage) { $null } else { Get-SandroneHash $source }
    sourceKind = if ($UseInstalledStorePackage) { 'verified-installed-store-package' } else { 'signed-official-msix' }
    sourceStorePackage = $target.packageFullName
    startupSourceFingerprint = $startup.source.fingerprint
}
Write-SandroneJson (Join-Path $output 'bundle.json') $bundle
foreach ($file in @('install.ps1', 'uninstall.ps1', 'package-common.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $output }
[pscustomobject]@{ status = 'built'; outputDirectory = $output; package = $msix; registered = $false } | ConvertTo-Json -Compress
