param(
    [string]$Version = "",
    [string]$Notes   = "",
    # Base URL written into latest.json for the installer download.
    # Switch to https://www.origai.fr/releases/tutellia/ once www.origai.fr
    # serves the site over HTTPS (installs download from whatever URL is here).
    [string]$BaseUrl = "https://orig-audit.netlify.app/releases/tutellia/",
    [string]$WebsiteDir = "F:\OrigAI\Orig_website",
    [switch]$Push
)

$ErrorActionPreference = "Stop"

$WebDir      = $PSScriptRoot
$TauriDir    = Join-Path $WebDir "src-tauri"
$KeyPath     = "C:\Users\tdrelangue\.tauri\tutellia.key"
$ReleasesDir = Join-Path $WebsiteDir "releases\tutellia"
$ConfigFile  = Join-Path $WebDir ".release-config.ps1"
$UTF8NoBOM   = New-Object System.Text.UTF8Encoding $false

$SIGNING_PASSWORD = ""
if (Test-Path $ConfigFile) {
    . $ConfigFile
}
if (-not $SIGNING_PASSWORD) {
    $secure = Read-Host "Signing key password" -AsSecureString
    $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $SIGNING_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
}

function ReadFileClean([string]$p) {
    $bytes = [System.IO.File]::ReadAllBytes($p)
    if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $bytes = $bytes[3..($bytes.Length - 1)]
    }
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

$pkgJsonPath = Join-Path $WebDir "package.json"
$raw = ReadFileClean $pkgJsonPath
$currentVersion = [regex]::Match($raw, '"version"\s*:\s*"([^"]+)"').Groups[1].Value

if ($Version -and $Version -ne $currentVersion) {
    Write-Host ("Bumping " + $currentVersion + " to " + $Version)

    $patched = [regex]::Replace($raw, '"version"\s*:\s*"[^"]*"', ('"version": "' + $Version + '"'), 1)
    [System.IO.File]::WriteAllText($pkgJsonPath, $patched, $UTF8NoBOM)

    $tauriConf = Join-Path $TauriDir "tauri.conf.json"
    $raw2 = ReadFileClean $tauriConf
    $patched2 = [regex]::Replace($raw2, '"version"\s*:\s*"[^"]*"', ('"version": "' + $Version + '"'), 1)
    [System.IO.File]::WriteAllText($tauriConf, $patched2, $UTF8NoBOM)

    $cargoPath  = Join-Path $TauriDir "Cargo.toml"
    $cargoLines = [System.IO.File]::ReadAllLines($cargoPath, [System.Text.Encoding]::UTF8)
    $replaced   = $false
    $cargoLines = $cargoLines | ForEach-Object {
        if (-not $replaced -and $_ -match '^version\s*=\s*"') {
            $replaced = $true
            'version = "' + $Version + '"'
        } else { $_ }
    }
    [System.IO.File]::WriteAllLines($cargoPath, $cargoLines, $UTF8NoBOM)

    $currentVersion = $Version
    Write-Host ("Version set to " + $currentVersion)
} else {
    Write-Host ("Building version " + $currentVersion)
}

$env:TAURI_SIGNING_PRIVATE_KEY          = (ReadFileClean $KeyPath).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $SIGNING_PASSWORD
$env:TAURI_SIGNING_PRIVATE_KEY_PATH     = $null

Write-Host ""
Write-Host ("Building Tutellia v" + $currentVersion + " - this takes ~10 minutes...")
Write-Host ""

Set-Location $WebDir
npm run tauri:build
if ($LASTEXITCODE -ne 0) {
    Write-Error ("Build failed with exit code " + $LASTEXITCODE)
    exit 1
}

$nsisDir = Join-Path $TauriDir "target\release\bundle\nsis"
$exeName = "Tutellia_" + $currentVersion + "_x64-setup.exe"
$exePath = Join-Path $nsisDir $exeName
$sigPath = $exePath + ".sig"

if (-not (Test-Path $exePath)) {
    Write-Error ("Installer not found: " + $exePath)
    exit 1
}
Write-Host ("Installer found: " + $exeName)

if (-not (Test-Path $sigPath)) {
    Write-Host "Signing installer..."
    npm run tauri -- signer sign $exePath
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Signing failed"
        exit 1
    }
}

if (-not (Test-Path $sigPath)) {
    Write-Error ("Signature file missing: " + $sigPath)
    exit 1
}

$signature = (ReadFileClean $sigPath).Trim()
Write-Host "Signature ready."

if (-not (Test-Path $ReleasesDir)) {
    New-Item -ItemType Directory -Path $ReleasesDir -Force | Out-Null
}
Copy-Item $exePath (Join-Path $ReleasesDir $exeName) -Force
Write-Host "Copied installer to website."

$latestJsonPath = Join-Path $ReleasesDir "latest.json"
$pubDate        = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
if (-not $BaseUrl.EndsWith("/")) { $BaseUrl += "/" }
$downloadUrl    = $BaseUrl + $exeName
$releaseNotes   = if ($Notes) { $Notes } else { "Tutellia v" + $currentVersion }

$latestObj = [ordered]@{
    version   = $currentVersion
    notes     = $releaseNotes
    pub_date  = $pubDate
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $signature
            url       = $downloadUrl
        }
    }
}
$latestObj | ConvertTo-Json -Depth 5 | ForEach-Object { [System.IO.File]::WriteAllText($latestJsonPath, $_, $UTF8NoBOM) }
Write-Host "Updated latest.json."

if ($Push) {
    Write-Host ""
    Write-Host "Pushing website..."
    Set-Location $WebsiteDir
    $branch = (git branch --show-current).Trim()
    if ($branch -ne "main") {
        Write-Error ("Website repo is on branch '" + $branch + "', not main: Netlify only deploys main. Run 'git switch main' in " + $WebsiteDir + " and retry.")
        exit 1
    }
    git add "releases/tutellia/latest.json"
    git add ("releases/tutellia/" + $exeName)
    git commit -m ("chore(releases): Tutellia v" + $currentVersion)
    git push
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Git push failed"
        exit 1
    }
    Write-Host "Website pushed. Netlify will deploy in ~1 minute."
}

Write-Host ""
Write-Host "========================================"
Write-Host ("  Tutellia v" + $currentVersion + " - DONE")
Write-Host "========================================"
Write-Host ("  Installer : " + $exePath)
Write-Host ("  Website   : " + $latestJsonPath)
Write-Host ""