# PsicoFinance — Arranca backend (FastAPI) y frontend (Next.js) en background.
# Se ejecuta automáticamente al iniciar sesión via la carpeta Startup.

$base    = "C:\Users\nicol\OneDrive\Documentos\NICO\psicofinance-app"
$uvicorn = "$base\psicofinance-backend\venv\Scripts\uvicorn.exe"
$node    = "C:\Program Files\nodejs\node.exe"
$logs    = "$env:TEMP\psicofinance_logs"
New-Item -ItemType Directory -Path $logs -Force | Out-Null

# ── 1. Backend ────────────────────────────────────────────────────────────────
$procBack = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue
if (-not $procBack) {
    Start-Process -FilePath $uvicorn `
      -ArgumentList "main:app","--host","127.0.0.1","--port","8001" `
      -WorkingDirectory "$base\psicofinance-backend" `
      -RedirectStandardOutput "$logs\backend_out.log" `
      -RedirectStandardError  "$logs\backend_err.log" `
      -WindowStyle Hidden
}

# ── 2. Frontend ───────────────────────────────────────────────────────────────
$procFront = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if (-not $procFront) {
    Start-Process -FilePath $node `
      -ArgumentList "node_modules\next\dist\bin\next","dev","-p","5173" `
      -WorkingDirectory "$base\psicofinance-frontend" `
      -RedirectStandardOutput "$logs\frontend_out.log" `
      -RedirectStandardError  "$logs\frontend_err.log" `
      -WindowStyle Hidden
}
