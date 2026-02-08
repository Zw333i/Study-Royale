@echo off
REM Quick Git Deploy Script for Study Royale
REM This script helps you quickly commit and push changes to GitHub

echo.
echo ========================================
echo   Study Royale - Quick Deploy Script
echo ========================================
echo.

REM Check if in correct directory
if not exist "backend" (
    echo ERROR: Please run this script from the Reviewer folder!
    echo Current directory: %CD%
    pause
    exit /b 1
)

echo [1/4] Checking for changes...
git status

echo.
echo ========================================
set /p COMMIT_MSG="Enter commit message (or press Enter for default): "

if "%COMMIT_MSG%"=="" (
    set COMMIT_MSG=Update deployment configuration
)

echo.
echo [2/4] Adding all changes to git...
git add .

echo.
echo [3/4] Committing with message: "%COMMIT_MSG%"
git commit -m "%COMMIT_MSG%"

if errorlevel 1 (
    echo.
    echo NOTE: No changes to commit or commit failed.
    echo This is okay if you haven't made any changes.
    echo.
    pause
    exit /b 0
)

echo.
echo [4/4] Pushing to GitHub...
git push

if errorlevel 1 (
    echo.
    echo ERROR: Push failed!
    echo.
    echo Possible reasons:
    echo - You haven't set up the GitHub remote yet
    echo - You need to authenticate with GitHub
    echo - There are conflicts to resolve
    echo.
    echo Run this command to set up remote:
    echo git remote add origin https://github.com/YOUR_USERNAME/study-royale.git
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   SUCCESS! Changes pushed to GitHub
echo ========================================
echo.
echo Your deployment services will auto-deploy:
echo - Render (backend): 3-5 minutes
echo - Vercel (frontend): 1-2 minutes
echo.
echo Check deployment status:
echo - Render: https://dashboard.render.com/
echo - Vercel: https://vercel.com/dashboard
echo.
pause
