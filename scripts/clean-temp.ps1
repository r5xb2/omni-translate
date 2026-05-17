param(
  [string]$TempPath = ".\temp"
)

$resolved = Resolve-Path -LiteralPath $TempPath -ErrorAction Stop
$targetPath = $resolved.Path

if ([System.IO.Path]::GetFileName($targetPath) -ne "temp") {
  throw "安全檢查失敗：目標不是 temp 資料夾。實際路徑：$targetPath"
}

$keepers = @(".gitkeep", "README.md")

Get-ChildItem -LiteralPath $targetPath -Force |
  Where-Object { $keepers -notcontains $_.Name } |
  Remove-Item -Recurse -Force

Write-Host "已清理 temp 資料夾：$targetPath"
