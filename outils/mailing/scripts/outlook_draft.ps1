<#
Cree un brouillon Outlook (Outlook classique, via COM) a partir du dossier build/ genere par build_mail.py.
Les images sont jointes en pieces jointes "inline" (Content-ID) : elles s'affichent directement
dans le corps du mail, sans hebergement ni clic sur "Telecharger les images".

Usage :
  pwsh outlook_draft.ps1 -BuildDir "<comm>\build" [-To "a@x.fr;b@y.fr"] [-Cc ...] [-Bcc ...] [-SaveMsg] [-NoDisplay]
#>
param(
    [Parameter(Mandatory = $true)][string]$BuildDir,
    [string]$To,
    [string]$Cc,
    [string]$Bcc,
    [switch]$SaveMsg,
    [switch]$NoDisplay
)

$ErrorActionPreference = 'Stop'
$BuildDir = (Resolve-Path $BuildDir).Path
$manifest = Get-Content (Join-Path $BuildDir 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$html = Get-Content (Join-Path $BuildDir $manifest.html) -Raw -Encoding UTF8

$PR_ATTACH_CONTENT_ID = 'http://schemas.microsoft.com/mapi/proptag/0x3712001F'
$PR_ATTACH_MIME_TAG   = 'http://schemas.microsoft.com/mapi/proptag/0x370E001F'
$PR_ATTACHMENT_HIDDEN = 'http://schemas.microsoft.com/mapi/proptag/0x7FFE000B'
$mime = @{ '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif' }

$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)   # olMailItem
$mail.Subject = $manifest.subject
if ($To  -or $manifest.to)  { $mail.To  = $(if ($To)  { $To }  else { $manifest.to }) }
if ($Cc  -or $manifest.cc)  { $mail.CC  = $(if ($Cc)  { $Cc }  else { $manifest.cc }) }
if ($Bcc -or $manifest.bcc) { $mail.BCC = $(if ($Bcc) { $Bcc } else { $manifest.bcc }) }

foreach ($img in $manifest.images) {
    $path = Join-Path $BuildDir $img.file
    $att = $mail.Attachments.Add($path, 1, 0, [IO.Path]::GetFileName($path))   # 1 = olByValue
    $pa = $att.PropertyAccessor
    $pa.SetProperty($PR_ATTACH_CONTENT_ID, $img.cid)
    $pa.SetProperty($PR_ATTACH_MIME_TAG, $mime[[IO.Path]::GetExtension($path).ToLower()])
    $pa.SetProperty($PR_ATTACHMENT_HIDDEN, $true)
}

# Le corps est pose APRES les pieces jointes et AVANT Display() : pas de signature auto inseree.
$mail.HTMLBody = $html
$mail.Save()   # enregistre dans Brouillons

if ($SaveMsg) {
    $msg = Join-Path (Split-Path $BuildDir -Parent) ("{0}.msg" -f ($manifest.subject -replace '[\\/:*?"<>|]', '_'))
    $mail.SaveAs($msg, 3)   # 3 = olMSG
    Write-Output "Fichier .msg : $msg"
}
if (-not $NoDisplay) { $mail.Display($false) }

Write-Output ("Brouillon Outlook cree : '{0}' ({1} images inline)" -f $manifest.subject, @($manifest.images).Count)
