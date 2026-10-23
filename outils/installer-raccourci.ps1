# Crée sur le bureau le raccourci « Métiers & Transition » vers le lanceur du studio. À lancer une fois :
#   powershell -ExecutionPolicy Bypass -File outils\installer-raccourci.ps1
$projet = Split-Path -Parent $PSScriptRoot
$bureau = [Environment]::GetFolderPath('Desktop')
$chemin = Join-Path $bureau 'Métiers & Transition.lnk'

$raccourci = (New-Object -ComObject WScript.Shell).CreateShortcut($chemin)
$raccourci.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$raccourci.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$projet\outils\lanceur.ps1`""
$raccourci.WorkingDirectory = $projet
$raccourci.IconLocation = "$projet\outils\metiers-transition.ico,0"
$raccourci.WindowStyle = 7  # réduite : la console du lanceur ne fait que passer
$raccourci.Save()
Write-Host "Raccourci créé : $chemin"
