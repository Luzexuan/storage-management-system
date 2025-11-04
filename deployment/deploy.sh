#!/bin/bash

# Quick deployment script - handles permissions automatically
# Usage: bash deployment/deploy.sh

set -e

echo "=========================================="
echo "Quick Deploy Script"
echo "=========================================="

cd /var/www/storage-management

echo ""
echo "Step 1: Pulling latest code..."
git fetch origin
git reset --hard origin/main
git pull origin main

echo ""
echo "Step 2: Setting script permissions..."
chmod +x deployment/*.sh

echo ""
echo "Step 3: Running full restart..."
./deployment/full-restart.sh

echo ""
echo "=========================================="
echo "Deployment completed!"
echo "=========================================="
