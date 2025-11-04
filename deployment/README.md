# Deployment Scripts

This directory contains scripts for deploying and managing the storage management system.

## Quick Start (Recommended)

**No need to manually set permissions!** Just use `bash` to run scripts:

```bash
cd /var/www/storage-management
git pull origin main
bash deployment/full-restart.sh
```

Or use the deploy shortcut:

```bash
cd /var/www/storage-management
bash deployment/deploy.sh
```

## Scripts Overview

### 0. `deploy.sh` (Quick Deploy - RECOMMENDED)
One-command deployment that handles everything automatically.

**What it does:**
- Pulls latest code from Git
- Automatically sets script permissions
- Runs full restart

**Usage:**
```bash
cd /var/www/storage-management
bash deployment/deploy.sh
```

**No chmod needed!** The script handles permissions automatically.

### 1. `full-restart.sh` (Linux/Ubuntu Server)
Complete system restart script that ensures all caches are cleared and code is updated.

**What it does:**
- Auto-sets permissions for all deployment scripts
- Stops all PM2 processes
- Kills all Node.js processes
- Clears PM2 cache and logs
- Clears Node.js module cache
- Pulls latest code from Git
- Verifies file updates
- Restarts PM2 with fresh processes
- Displays diagnostic information

**Usage (Method 1 - No chmod needed):**
```bash
cd /var/www/storage-management
bash deployment/full-restart.sh
```

**Usage (Method 2 - Traditional):**
```bash
cd /var/www/storage-management
chmod +x deployment/full-restart.sh
./deployment/full-restart.sh
```

### 2. `check-updates.sh` (Linux/Ubuntu Server)
Diagnostic script to verify if code updates are properly deployed.

**What it checks:**
- Git commit history
- File modification timestamps
- Specific code changes (initialStock, cascading categories, etc.)
- PM2 process status and uptime
- File checksums (MD5)
- UTF-8 encoding issues

**Usage (No chmod needed):**
```bash
cd /var/www/storage-management
bash deployment/check-updates.sh
```

### 3. `full-restart.bat` (Windows, for local testing)
Windows version of the full restart script.

**Usage:**
```cmd
cd C:\Users\17700\OneDrive\文档\work\linkerbot\storage_management
deployment\full-restart.bat
```

## Common Deployment Issues and Solutions

### Issue 1: Code updates not reflected after git pull
**Symptoms:**
- Git shows latest commit, but website shows old code
- PM2 logs show old error messages

**Solution:**
```bash
# Use the full restart script
./deployment/full-restart.sh

# If that doesn't work, manually verify:
./deployment/check-updates.sh

# Then check PM2 logs
pm2 logs storage-management --lines 50
```

### Issue 2: PM2 cache not clearing
**Symptoms:**
- File contents are correct, but PM2 executes old code
- Error line numbers don't match actual file

**Solution:**
```bash
# Nuclear option - complete PM2 reset
pm2 kill
rm -rf ~/.pm2
pm2 start deployment/ecosystem.config.js
```

### Issue 3: Browser shows old frontend code
**Symptoms:**
- Backend updated but frontend still old
- Form fields missing or wrong

**Solution:**
1. Hard refresh browser: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
2. Clear browser cache: `Ctrl + Shift + Delete`
3. Try incognito/private window
4. Check if Nginx is caching:
   ```bash
   sudo nginx -s reload
   ```

### Issue 4: UTF-8 encoding corruption
**Symptoms:**
- Chinese characters show as `M-hM-^N` in logs
- JavaScript parsing errors

**Solution:**
```bash
# Check for encoding issues
./deployment/check-updates.sh

# If found, ensure files are ASCII-only (already done in latest commits)
# Or use the English-only versions we created
```

## Best Practices

### After Every Code Update:
1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Description"
   git push origin main
   ```

2. **Deploy to Server:**
   ```bash
   ssh your-server
   cd /var/www/storage-management
   ./deployment/full-restart.sh
   ```

3. **Clear Browser Cache:**
   - Press `Ctrl + Shift + R` to hard refresh
   - Or clear cache in DevTools (F12)

4. **Verify Deployment:**
   ```bash
   ./deployment/check-updates.sh
   pm2 logs storage-management --lines 20
   ```

### Debugging Steps:
1. Check if code is updated: `./deployment/check-updates.sh`
2. Check PM2 status: `pm2 status`
3. Check application logs: `pm2 logs storage-management --lines 50`
4. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
5. Check system logs: `journalctl -u pm2-lighthouse -n 50`

## Files Modified in Latest Update

### Frontend Changes:
- `frontend/app.js`:
  - Added cascading category selection
  - Enhanced viewItem() function
  - Added initialStock handling
  - Fixed modal remove error

- `frontend/styles.css`:
  - Added item detail view styles
  - Added detail-table styles

### Backend Changes:
- `backend/routes/items.js`:
  - Added initialStock parameter
  - Auto-set status based on stock
  - Fixed LIMIT/OFFSET issue

- `backend/routes/logs.js`:
  - Fixed LIMIT/OFFSET prepared statement error
  - Changed to string interpolation

- `backend/routes/inbound.js`:
  - Fixed LIMIT/OFFSET prepared statement error

- `backend/routes/outbound.js`:
  - Fixed LIMIT/OFFSET prepared statement error

## Environment Information

**Production Server:**
- OS: Ubuntu (2核 8GB RAM)
- Node.js: Latest LTS
- PM2: Cluster mode (2 instances)
- Nginx: Port 8081
- MySQL: Port 3306
- Project Path: `/var/www/storage-management`

**Local Development:**
- OS: Windows
- Node.js: Latest LTS
- PM2: Development mode
- MySQL: Local instance

## Emergency Procedures

### If System is Completely Broken:
```bash
# 1. Stop everything
pm2 kill
sudo killall -9 node

# 2. Backup database (if needed)
mysqldump -u root -p storage_system > backup_$(date +%Y%m%d_%H%M%S).sql

# 3. Fresh git clone
cd /var/www
sudo mv storage-management storage-management.backup
sudo git clone https://github.com/Luzexuan/storage-management-system.git storage-management
cd storage-management

# 4. Install dependencies
cd backend
npm install
cd ..

# 5. Configure environment
# Copy .env file from backup or recreate

# 6. Start fresh
pm2 start deployment/ecosystem.config.js

# 7. Verify
pm2 logs storage-management --lines 20
```

### If Database Schema Changed:
```bash
# Run migration scripts
mysql -u root -p storage_system < database/migrations/xxx.sql

# Or manually apply schema changes
mysql -u root -p storage_system
# Run ALTER TABLE commands
```

## Contact and Support

For issues or questions:
1. Check PM2 logs: `pm2 logs storage-management`
2. Check this README
3. Review commit history: `git log --oneline -10`
4. Check GitHub issues

## Version History

- **v1.2.3** (Latest): UI/UX improvements + LIMIT/OFFSET fix
  - Cascading category selection
  - Enhanced item detail view
  - Initial stock input
  - Fixed MySQL prepared statement errors

- **v1.2.2**: UTF-8 encoding fixes
  - Removed all Chinese characters from route files
  - Fixed JavaScript parsing errors

- **v1.2.1**: Parameter handling fixes
  - Changed parseInt() to Number()
  - Added default values for pagination

- **v1.0.0**: Initial release
