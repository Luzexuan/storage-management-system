#!/bin/bash

# Diagnostic script to check if code updates are deployed correctly

echo "=========================================="
echo "Checking deployment status..."
echo "=========================================="

cd /var/www/storage-management

echo ""
echo "1. Git status and commits:"
echo "----------------------------"
git log --oneline -5
echo ""
echo "Current branch:"
git branch --show-current
echo ""
echo "Remote tracking:"
git remote -v

echo ""
echo "2. File timestamps (last modified):"
echo "----------------------------"
ls -lh --time-style=long-iso backend/routes/items.js backend/routes/logs.js backend/routes/inbound.js backend/routes/outbound.js frontend/app.js | awk '{print $6, $7, $8}'

echo ""
echo "3. Checking specific code changes:"
echo "----------------------------"

echo "✓ Checking items.js for initialStock:"
if grep -q "initialStock" backend/routes/items.js; then
    echo "  FOUND: initialStock parameter"
    grep -n "const { categoryId, itemName" backend/routes/items.js | head -1
else
    echo "  ❌ NOT FOUND: initialStock parameter"
fi

echo ""
echo "✓ Checking app.js for cascading categories:"
if grep -q "setupCascadingCategories" frontend/app.js; then
    echo "  FOUND: setupCascadingCategories function"
    grep -n "function setupCascadingCategories" frontend/app.js | head -1
else
    echo "  ❌ NOT FOUND: setupCascadingCategories function"
fi

echo ""
echo "✓ Checking app.js for item detail view:"
if grep -q "const itemData = await apiRequest" frontend/app.js; then
    echo "  FOUND: Enhanced viewItem function"
    grep -n "async function viewItem" frontend/app.js | head -1
else
    echo "  ❌ NOT FOUND: Enhanced viewItem function"
fi

echo ""
echo "✓ Checking for LIMIT fix in logs.js:"
if grep -q "const finalLimit = Number" backend/routes/logs.js; then
    echo "  FOUND: LIMIT/OFFSET fix"
    grep -n "const finalLimit" backend/routes/logs.js | head -1
else
    echo "  ❌ NOT FOUND: LIMIT/OFFSET fix"
fi

echo ""
echo "4. PM2 process information:"
echo "----------------------------"
pm2 list
echo ""
echo "PM2 uptime and restarts:"
pm2 jlist | jq -r '.[] | "Process: \(.name), Uptime: \(.pm2_env.pm_uptime_format), Restarts: \(.pm2_env.restart_time)"' 2>/dev/null || pm2 list

echo ""
echo "5. Running Node.js processes:"
echo "----------------------------"
ps aux | grep -E "(node|PM2)" | grep -v grep | awk '{print $2, $11, $12, $13, $14, $15}'

echo ""
echo "6. File checksums (MD5):"
echo "----------------------------"
md5sum backend/routes/items.js backend/routes/logs.js frontend/app.js | awk '{print $2 ": " $1}'

echo ""
echo "7. Check if files have UTF-8 issues:"
echo "----------------------------"
echo "Checking for non-ASCII characters in critical files..."
if grep -P "[^\x00-\x7F]" backend/routes/logs.js | head -3; then
    echo "⚠️  WARNING: Non-ASCII characters found in logs.js"
else
    echo "✓ logs.js: Clean (ASCII only)"
fi

if grep -P "[^\x00-\x7F]" backend/routes/items.js | head -3; then
    echo "⚠️  WARNING: Non-ASCII characters found in items.js"
else
    echo "✓ items.js: Clean (ASCII only)"
fi

echo ""
echo "=========================================="
echo "Diagnostic check completed!"
echo "=========================================="
echo ""
echo "If code updates are not found:"
echo "  1. Run: git pull origin main"
echo "  2. Run: ./deployment/full-restart.sh"
echo ""
echo "If PM2 uptime is old (hours/days):"
echo "  1. Run: pm2 kill"
echo "  2. Run: pm2 start deployment/ecosystem.config.js"
echo "=========================================="
