@echo off
REM deploy-docker.bat - Build and push KV-Tube to Docker Hub

set DOCKER_USER=vndangkhoa
set IMAGE_NAME=kvtube
set TAG=latest
set FULL_IMAGE=%DOCKER_USER%/%IMAGE_NAME%:%TAG%

echo ========================================
echo   KV-Tube Docker Deployment Script
echo ========================================
echo.

REM Step 1: Check Docker
echo [1/4] Checking Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo   X Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)
echo   OK Docker is running

REM Step 2: Build Image
echo.
echo [2/4] Building Docker image: %FULL_IMAGE%
docker build --no-cache -t %FULL_IMAGE% .
if %errorlevel% neq 0 (
    echo   X Build failed!
    pause
    exit /b 1
)
echo   OK Build successful

REM Step 3: Login to Docker Hub
echo.
echo [3/4] Logging into Docker Hub...
docker login
if %errorlevel% neq 0 (
    echo   X Login failed!
    pause
    exit /b 1
)
echo   OK Login successful

REM Step 4: Push Image
echo.
echo [4/4] Pushing to Docker Hub...
docker push %FULL_IMAGE%
if %errorlevel% neq 0 (
    echo   X Push failed!
    pause
    exit /b 1
)
echo   OK Push successful

echo.
echo ========================================
echo   Deployment Complete!
echo   Image: %FULL_IMAGE%
echo   URL: https://hub.docker.com/r/%DOCKER_USER%/%IMAGE_NAME%
echo ========================================
echo.
echo To run: docker run -p 5001:5001 %FULL_IMAGE%
echo.
pause
