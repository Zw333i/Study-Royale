# Quick Git Deploy Script for Study Royale
# This script helps you quickly commit and push changes to GitHub

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  Study Royale - Quick Deploy Script"     -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host ""

# Check if in correct directory
if (-not (Test-Path "backend")) {
    Write-Host "ERROR: Please run this script from the Reviewer folder!" -ForegroundColor Red
    Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/4] Checking for changes..." -ForegroundColor Yellow
git status

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
$commitMsg = Read-Host "Enter commit message (or press Enter for default)"

if ([string]::IsNullOrWhiteSpace($commitMsg)) {
    $commitMsg = "Update deployment configuration"
}

Write-Host ""
Write-Host "[2/4] Adding all changes to git..." -ForegroundColor Yellow
git add .

Write-Host ""
Write-Host "[3/4] Committing with message: '$commitMsg'" -ForegroundColor Yellow
git commit -m $commitMsg

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "NOTE: No changes to commit or commit failed." -ForegroundColor Yellow
    Write-Host "This is okay if you haven't made any changes." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host ""
Write-Host "[4/4] Pushing to GitHub..." -ForegroundColor Yellow
git push

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Push failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible reasons:" -ForegroundColor Yellow
    Write-Host "- You haven't set up the GitHub remote yet" -ForegroundColor Yellow
    Write-Host "- You need to authenticate with GitHub" -ForegroundColor Yellow
    Write-Host "- There are conflicts to resolve" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Run this command to set up remote:" -ForegroundColor Cyan
    Write-Host "git remote add origin https://github.com/YOUR_USERNAME/study-royale.git" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "========================================"  -ForegroundColor Green
Write-Host "  SUCCESS! Changes pushed to GitHub"       -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Green
Write-Host ""
Write-Host "Your deployment services will auto-deploy:" -ForegroundColor Cyan
Write-Host "- Render (backend): 3-5 minutes" -ForegroundColor Yellow
Write-Host "- Vercel (frontend): 1-2 minutes" -ForegroundColor Yellow
Write-Host ""
Write-Host "Check deployment status:" -ForegroundColor Cyan
Write-Host "- Render: https://dashboard.render.com/" -ForegroundColor White
Write-Host "- Vercel: https://vercel.com/dashboard" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
