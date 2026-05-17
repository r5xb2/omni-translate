Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host '[INFO] Baseline verification started.' -ForegroundColor Cyan

Write-Host '[STEP] Run unit tests' -ForegroundColor Yellow
npm test
if ($LASTEXITCODE -ne 0) {
  Write-Host '[FAIL] npm test failed.' -ForegroundColor Red
  exit 1
}

Write-Host '[STEP] Run build' -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host '[FAIL] npm run build failed.' -ForegroundColor Red
  exit 1
}

Write-Host '[PASS] Baseline verification completed (tests + build).' -ForegroundColor Green
