param(
  [int]$StartPort = 8000,
  [int]$EndPort = 8100,
  [string]$BindAddress = "127.0.0.1"
)

function Test-PortAvailable {
  param(
    [string]$Address,
    [int]$Port
  )

  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($Address), $Port)
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    $listener.Stop()
  }
}

function Get-FreePort {
  param(
    [string]$Address,
    [int]$FromPort,
    [int]$ToPort
  )

  foreach ($port in $FromPort..$ToPort) {
    if (Test-PortAvailable -Address $Address -Port $port) {
      return $port
    }
  }

  throw "空いているポートが見つかりませんでした。範囲: $FromPort-$ToPort"
}

$port = Get-FreePort -Address $BindAddress -FromPort $StartPort -ToPort $EndPort
$url = "http://localhost:$port"
$altUrl = "http://127.0.0.1:$port"

Write-Host ""
Write-Host "Catlog を起動します" -ForegroundColor Cyan
Write-Host "URL: $url" -ForegroundColor Green
Write-Host ""
Write-Host "Google Cloud Console の承認済み JavaScript 生成元に次を追加してください:" -ForegroundColor Yellow
Write-Host "  $url"
Write-Host "  $altUrl"
Write-Host ""
Write-Host "停止するには Ctrl+C を押してください。" -ForegroundColor DarkGray
Write-Host ""

python -m http.server $port --bind $BindAddress
