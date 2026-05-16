param(
  [string]$BaseUrl = 'http://localhost:5173',
  [string]$Model = 'gpt-realtime-whisper'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-JsonSafe {
  param([string]$Text)
  try { return $Text | ConvertFrom-Json } catch { return $null }
}

function Invoke-JsonRequest {
  param(
    [string]$Uri,
    [string]$Method = 'POST',
    [hashtable]$Headers,
    [string]$Body
  )

  try {
    $resp = Invoke-WebRequest -Uri $Uri -Method $Method -ContentType 'application/json' -Headers $Headers -Body $Body

    return [pscustomobject]@{
      StatusCode = [int]$resp.StatusCode
      Content = [string]$resp.Content
      ExceptionMessage = $null
    }
  } catch {
    $ex = $_.Exception
    $hasResponse = $null -ne $ex -and $ex.PSObject.Properties.Name -contains 'Response' -and $null -ne $ex.Response
    if ($hasResponse) {
      $status = 0
      try { $status = [int]$ex.Response.StatusCode } catch { $status = 0 }

      $content = ''
      try {
        $stream = $ex.Response.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $content = $reader.ReadToEnd()
          $reader.Close()
        }
      } catch {
        $content = ''
      }

      return [pscustomobject]@{
        StatusCode = $status
        Content = $content
        ExceptionMessage = $ex.Message
      }
    }

    return [pscustomobject]@{
      StatusCode = 0
      Content = ''
      ExceptionMessage = $ex.Message
    }
  }
}

function Get-ApiKey {
  if ($env:OPENAI_API_KEY) {
    return $env:OPENAI_API_KEY
  }

  Write-Host '[INFO] OPENAI_API_KEY not found; prompt for secure input.' -ForegroundColor Yellow
  $secure = Read-Host 'Enter OpenAI API Key (input hidden)' -AsSecureString
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

if (-not $BaseUrl.StartsWith('http')) {
  Write-Host '[FAIL] BaseUrl must start with http/https.' -ForegroundColor Red
  exit 1
}

$apiKey = Get-ApiKey

Write-Host "[INFO] BaseUrl=$BaseUrl, Model=$Model"

# Test 1: Direct OpenAI client_secrets call (ground truth)
$test1Passed = $false
$openAiBody = @{ session = @{ type = 'transcription' } } | ConvertTo-Json -Depth 10
$openAiResp = Invoke-JsonRequest -Uri 'https://api.openai.com/v1/realtime/client_secrets' -Method 'POST' -Headers @{ Authorization = "Bearer $apiKey" } -Body $openAiBody
Write-Host "[TEST1] OpenAI /realtime/client_secrets => HTTP $($openAiResp.StatusCode)"
$openAiJson = Read-JsonSafe -Text $openAiResp.Content
if ($openAiResp.StatusCode -eq 200 -and $openAiJson -and $openAiJson.value) {
  $test1Passed = $true
  Write-Host '[PASS] OpenAI direct call succeeded and returned client secret value.' -ForegroundColor Green
} else {
  $msg = $null
  if ($openAiJson -and $openAiJson.error) { $msg = $openAiJson.error.message }
  if (-not $msg) { $msg = $openAiResp.Content }
  if (-not $msg) { $msg = $openAiResp.ExceptionMessage }
  Write-Host "[FAIL] OpenAI direct call failed: $msg" -ForegroundColor Red
}

# Test 2: Local proxy endpoint call
$test2Passed = $false
$proxyBody = @{ apiKey = $apiKey; model = $Model } | ConvertTo-Json -Depth 10
$proxyResp = Invoke-JsonRequest -Uri "$BaseUrl/realtime-token" -Method 'POST' -Headers @{} -Body $proxyBody
Write-Host "[TEST2] $BaseUrl/realtime-token => HTTP $($proxyResp.StatusCode)"
$proxyJson = Read-JsonSafe -Text $proxyResp.Content
if ($proxyResp.StatusCode -eq 200 -and $proxyJson -and ($proxyJson.value -or $proxyJson.client_secret.value)) {
  $test2Passed = $true
  Write-Host '[PASS] Local realtime-token call succeeded.' -ForegroundColor Green
} else {
  $msg = $null
  if ($proxyJson -and $proxyJson.error) {
    if ($proxyJson.error.message) {
      $msg = $proxyJson.error.message
    } else {
      $msg = [string]$proxyJson.error
    }
  }
  if (-not $msg) { $msg = $proxyResp.Content }
  if (-not $msg) { $msg = $proxyResp.ExceptionMessage }
  Write-Host "[FAIL] Local realtime-token failed: $msg" -ForegroundColor Red
}

if ($test1Passed -and $test2Passed) {
  Write-Host '[SUMMARY] End-to-end token flow is healthy.' -ForegroundColor Green
  exit 0
}

Write-Host '[SUMMARY] End-to-end token flow still failing. See FAIL lines above.' -ForegroundColor Yellow
exit 2
