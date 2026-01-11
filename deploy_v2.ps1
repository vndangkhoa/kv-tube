# deploy_v2.ps1 - Deploy KV-Tube v2.0

Write-Host "--- KV-Tube v2.0 Deployment ---" -ForegroundColor Cyan

# 1. Check Git Remote
Write-Host "1. Pushing to Git..." -ForegroundColor Yellow
# Note: Ensure 'origin' is the correct writable remote, not a mirror.
git push -u origin main --tags

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Git push failed. Verify that 'origin' is not a read-only mirror." -ForegroundColor Red
    # Continue anyway to try Docker?
}

# 2. Build Docker Image
Write-Host "2. Building Docker Image (linux/amd64)..." -ForegroundColor Yellow
# Requires Docker Desktop to be running
docker build --platform linux/amd64 -t kv-tube:v2.0 .

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Docker image 'kv-tube:v2.0' built." -ForegroundColor Green
} else {
    Write-Host "Error: Docker build failed. Is Docker Desktop running?" -ForegroundColor Red
}

Write-Host "Done." -ForegroundColor Cyan
pause
