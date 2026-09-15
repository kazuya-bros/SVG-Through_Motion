param([int]$Port = 8765, [string]$Python = 'I:\python\python.exe', [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath $Python)) { $Python = 'python' }
& $Python -c 'import fastapi,uvicorn,psd_tools,vtracer,PIL,numpy,scipy,multipart,httpx'
if ($LASTEXITCODE -ne 0) { throw 'Python dependencies are missing. See README.md.' }
Write-Host "SVG-Through Motion: http://127.0.0.1:$Port"
$studioArgs = @('-m', 'studio.run', '--port', "$Port")
if (-not $NoBrowser) { $studioArgs += '--open-browser' }
& $Python @studioArgs
