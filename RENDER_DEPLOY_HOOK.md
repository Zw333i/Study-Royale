# 🚀 Render Deploy Hook

Your Render deployment webhook for manual deployments.

---

## 🔗 Deploy Hook URL

```
https://api.render.com/deploy/srv-d643pih4tr6s73a8bfk0?key=tzh1eGSENEE
```

---

## 🎯 How to Use

### Method 1: Manual Trigger via URL (Easiest)

Simply visit this URL in your browser or use curl:

```bash
curl -X POST https://api.render.com/deploy/srv-d643pih4tr6s73a8bfk0?key=tzh1eGSENEE
```

This will immediately trigger a new deployment on Render.

---

### Method 2: GitHub Actions (Automated)

Your deploy hook is already integrated into GitHub Actions!

1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **"Keep Backend Awake"** workflow
4. Click **"Run workflow"** dropdown
5. Check ✅ **"Trigger Render deployment"**
6. Click **"Run workflow"**

This will ping the backend AND trigger a deployment.

---

### Method 3: PowerShell Script (Windows)

Create a quick script to deploy:

```powershell
# deploy.ps1
$hookUrl = "https://api.render.com/deploy/srv-d643pih4tr6s73a8bfk0?key=tzh1eGSENEE"
Invoke-WebRequest -Uri $hookUrl -Method POST
Write-Host "✅ Deployment triggered!" -ForegroundColor Green
```

Run with:
```powershell
.\deploy.ps1
```

---

### Method 4: Add to Git Hook (Auto-deploy on Push)

Add to `.git/hooks/post-push`:

```bash
#!/bin/sh
echo "🚀 Triggering Render deployment..."
curl -X POST https://api.render.com/deploy/srv-d643pih4tr6s73a8bfk0?key=tzh1eGSENEE
echo "✅ Deployment triggered!"
```

---

## 📊 When to Use

**Use the deploy hook when:**
- ✅ You want to redeploy without pushing new code
- ✅ Environment variables changed
- ✅ You need to restart the backend
- ✅ Testing deployment process

**Don't need it when:**
- ❌ Pushing to GitHub (Render auto-deploys)
- ❌ Just pinging the backend (use keep-alive cron)

---

## ⚠️ Security Note

**Keep this URL private!** Anyone with this URL can trigger deployments of your backend.

- ✅ Already added to `.gitignore` in this file's pattern
- ✅ Don't share publicly
- ✅ If compromised, regenerate in Render Dashboard:
  - Settings → Deploy Hook → Regenerate

---

## 🔄 Default Behavior

**Without deploy hook:**
- Render auto-deploys when you `git push` to main branch
- Takes 3-5 minutes

**With deploy hook:**
- Instant deployment trigger
- Same 3-5 minute build time
- Useful for manual/emergency deploys

---

## 📝 Quick Reference

| Action | Command |
|--------|---------|
| **Trigger Deploy** | `curl -X POST https://api.render.com/deploy/srv-d643pih4tr6s73a8bfk0?key=tzh1eGSENEE` |
| **Check Status** | Visit [Render Dashboard](https://dashboard.render.com/) |
| **View Logs** | Dashboard → Your Service → Logs |
| **Regenerate Hook** | Dashboard → Settings → Deploy Hook |

---

**Added**: February 8, 2026  
**Service**: study-royale-backend  
**Platform**: Render.com
