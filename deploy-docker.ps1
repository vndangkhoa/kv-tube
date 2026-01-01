#!/usr/bin/env pwsh
# deploy-docker.ps1 - Build and push KV-Tube to Docker Hub

$ErrorActionPreference = "Stop"

$DOCKER_USER = "vndangkhoa"
$IMAGE_NAME = "kvtube"
$TAG = "latest"
$FULL_IMAGE = "${DOCKER_USER}/${IMAGE_NAME}:${TAG}"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  KV-Tube Docker Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Docker
Write-Host "[1/4] Checking Docker..." -ForegroundColor Yellow
try {
    docker info | Out-Null
    Write-Host "  ✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Step 2: Build Image
Write-Host ""
Write-Host "[2/4] Building Docker image: $FULL_IMAGE" -ForegroundColor Yellow
docker build --no-cache -t $FULL_IMAGE .
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Build successful" -ForegroundColor Green

# Step 3: Login to Docker Hub
Write-Host ""
Write-Host "[3/4] Logging into Docker Hub..." -ForegroundColor Yellow
docker login
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Login failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Login successful" -ForegroundColor Green

# Step 4: Push Image
Write-Host ""
Write-Host "[4/4] Pushing to Docker Hub..." -ForegroundColor Yellow
docker push $FULL_IMAGE
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Push failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Push successful" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Cyan
Write-Host "  Image: $FULL_IMAGE" -ForegroundColor Cyan
Write-Host "  URL: https://hub.docker.com/r/${DOCKER_USER}/${IMAGE_NAME}" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run: docker run -p 5001:5001 $FULL_IMAGE" -ForegroundColor White
