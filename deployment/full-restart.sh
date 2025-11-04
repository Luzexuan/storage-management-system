#!/bin/bash

# Full restart script for storage management system
# This script performs a complete cleanup and restart
# Usage: bash deployment/full-restart.sh (no chmod needed!)

set -e

echo "=========================================="
echo "Starting FULL system restart..."
echo "=========================================="

# Change to project directory
cd /var/www/storage-management

# Ensure all deployment scripts have execute permissions
chmod +x deployment/*.sh 2>/dev/null || true

echo ""
echo "Step 1: Stopping all PM2 processes..."
pm2 delete all 2>/dev/null || echo "No PM2 processes to delete"
pm2 kill

echo ""
echo "Step 2: Killing all Node.js processes..."
sudo killall -9 node 2>/dev/null || echo "No Node.js processes to kill"
sudo killall -9 PM2 2>/dev/null || echo "No PM2 processes to kill"

echo ""
echo "Step 3: Waiting for processes to terminate..."
sleep 3

echo ""
echo "Step 4: Verifying no Node.js processes remain..."
if pgrep -x "node" > /dev/null; then
    echo "WARNING: Node.js processes still running!"
    ps aux | grep node | grep -v grep
    echo "Force killing remaining processes..."
    sudo pkill -9 node
    sleep 2
else
    echo "OK: All Node.js processes stopped"
fi

echo ""
echo "Step 5: Clearing PM2 cache and logs..."
rm -rf ~/.pm2/logs/*
rm -rf ~/.pm2/pids/*
rm -rf ~/.pm2/dump.pm2

echo ""
echo "Step 6: Clearing Node.js module cache..."
rm -rf /var/www/storage-management/backend/node_modules/.cache 2>/dev/null || true

echo ""
echo "Step 7: Pulling latest code from Git..."
git fetch origin
git reset --hard origin/main
git pull origin main

echo ""
echo "Step 8: Verifying file updates..."
echo "Latest commit:"
git log --oneline -1
echo ""
echo "Modified files timestamps:"
ls -lh backend/routes/items.js
ls -lh backend/routes/logs.js
ls -lh backend/routes/inbound.js
ls -lh backend/routes/outbound.js
ls -lh frontend/app.js

echo ""
echo "Step 9: Verifying key code changes..."
echo "Checking items.js for initialStock parameter:"
grep -n "initialStock" backend/routes/items.js | head -3 || echo "WARNING: initialStock not found!"

echo ""
echo "Checking app.js for cascading categories:"
grep -n "setupCascadingCategories" frontend/app.js | head -1 || echo "WARNING: setupCascadingCategories not found!"

echo ""
echo "Step 10: Restarting PM2 daemon..."
pm2 start deployment/ecosystem.config.js

echo ""
echo "Step 11: Waiting for application to start..."
sleep 5

echo ""
echo "Step 12: Checking PM2 status..."
pm2 status

echo ""
echo "Step 13: Checking application logs..."
pm2 logs storage-management --lines 20 --nostream

echo ""
echo "=========================================="
echo "Full restart completed!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Clear browser cache (Ctrl+Shift+Delete)"
echo "2. Hard refresh the page (Ctrl+Shift+R)"
echo "3. Test the new features"
echo ""
echo "If issues persist, check logs with:"
echo "  pm2 logs storage-management --lines 50"
echo "=========================================="
