# Ouvre le studio Métiers & Transition dans le navigateur, en le démarrant s'il ne répond pas.
# Avec -Serveur : fenêtre réduite du studio ; la fermer arrête le studio (et l'analyse en cours).
param([switch]$Serveur)

$adresse = 'http://127.0.0.1:5180'
$projet = Split-Path -Parent $PSScriptRoot
$journal = Join-Path $env:TEMP 'studio-metiers-transition.log'

if ($Serveur) {
  $Host.UI.RawUI.WindowTitle = 'Studio M&T — ne pas fermer'
  Set-Location -LiteralPath $projet
  # Par cmd : la sortie d'erreur de node va dans le journal sans devenir une erreur PowerShell.
  cmd /c 'npm run validation 2>&1' | Tee-Object -FilePath $journal
  exit
}

function Test-Studio {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $client.Connect('127.0.0.1', 5180)
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

if (-not (Test-Studio)) {
  Remove-Item -LiteralPath $journal -ErrorAction SilentlyContinue
  $processus = Start-Process powershell.exe -WindowStyle Minimized -PassThru -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Serveur')
  $limite = (Get-Date).AddSeconds(30)
  while (-not (Test-Studio)) {
    if ($processus.HasExited -or (Get-Date) -gt $limite) {
      if (-not $processus.HasExited) { taskkill /PID $processus.Id /T /F | Out-Null }
      Add-Type -AssemblyName PresentationFramework
      $fin = (Get-Content -LiteralPath $journal -Tail 15 -ErrorAction SilentlyContinue) -join "`n"
      if (-not $fin) { $fin = '(journal vide)' }
      [System.Windows.MessageBox]::Show("Le studio n'a pas démarré.`n`n$fin", 'Métiers & Transition', 'OK', 'Error') | Out-Null
      exit 1
    }
    Start-Sleep -Milliseconds 500
  }
}
Start-Process $adresse
