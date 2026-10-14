# Teşhis motorunu çalıştıran PowerShell betiği
# Kullanım: .\diagnostics\run_diagnostic.ps1

$ErrorActionPreference = "Stop"

Write-Host "Sistem teşhisi başlatılıyor..." -ForegroundColor Cyan

# Python ortamının yüklü olduğunu varsayıyoruz
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} else {
    Write-Error "Python bulunamadı. Lütfen PATH değişkenini kontrol edin."
    exit 1
}

# Proje kök dizininden çalıştırılmalıdır
$scriptPath = Join-Path $PSScriptRoot "..\research\diagnostic_engine.py"

Write-Host "Teşhis motoru çalıştırılıyor: $scriptPath" -ForegroundColor Gray

try {
    # Doğrudan scripti çalıştır
    & $pythonCmd $scriptPath
    Write-Host "Teşhis başarıyla tamamlandı." -ForegroundColor Green
} catch {
    Write-Error "Teşhis sırasında bir hata oluştu: $_"
    exit 1
}
