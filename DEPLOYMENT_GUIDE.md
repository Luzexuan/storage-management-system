# Deployment Guide for Latest Updates

This guide explains how to deploy the latest improvements to the storage management system.

## Changes Summary

### 1. Admin Delete with Inventory
- Admins can now delete items even if they have inventory
- All deletions are logged with detailed information including quantity at deletion

### 2. Fixed User Management Display Issue
- User management content no longer appears in all pages
- Fixed CSS selector for `.admin-only` class

### 3. Inbound Management GUI
- Replaced API-only message with full graphical interface
- Admins can directly create inbound records
- Regular users submit requests that require admin approval
- Support for both "initial" and "return" inbound types

### 4. Outbound Management GUI
- Replaced API-only message with full graphical interface
- Admins can directly create outbound records
- Regular users submit requests that require admin approval
- Support for both "transfer" (permanent) and "borrow" (temporary) types
- Borrowing requires borrower information and expected return date

### 5. Hide "Add Item" Button for Regular Users
- "Add Item" button now has `admin-only` class
- Only visible to administrators

### 6. Item Management Improvements
- Added "Show All Items" button to prevent page lag
- Items only load when button is clicked
- Added sorting functionality:
  - Name (ascending/descending)
  - Quantity (ascending/descending)
  - Created time (ascending/descending)
- Search now works with loaded items

## Deployment Steps

### Step 1: Run Database Migration

```bash
# Connect to MySQL
mysql -u root -p storage_management

# Run the approval system migration
source database/migrations/002_add_approval_system.sql

# Or use this command:
mysql -u root -p storage_management < database/migrations/002_add_approval_system.sql
```

### Step 2: Deploy Code to Server

```bash
# Navigate to project directory
cd /var/www/storage-management

# Pull latest changes
git pull origin main

# Use the deployment script (no chmod needed)
bash deployment/deploy.sh
```

### Step 3: Verify Deployment

```bash
# Check the deployment
bash deployment/check-updates.sh
```

## Post-Deployment Testing

### For Administrators:

1. **Test Item Deletion with Inventory**
   - Go to Item Management → Create item with initial stock
   - Try to delete it → Should succeed with warning message
   - Check operation logs to verify deletion was logged

2. **Test Approval Management**
   - Have a regular user submit an inbound/outbound request
   - Go to Approval Management (new menu item)
   - Click "待审批" to see pending requests
   - Review and approve/reject a request
   - Verify the inbound/outbound record was created

3. **Test Item Management UI**
   - Go to Item Management
   - Click "显示所有物品" → Items should load
   - Try different sorting options
   - Click "隐藏物品列表" → Items should hide

### For Regular Users:

1. **Test Inbound Request**
   - Go to Inbound Management → Click "新增入库"
   - Fill in form → Should see message "需要管理员审批"
   - Wait for admin approval

2. **Test Outbound Request**
   - Go to Outbound Management → Click "新增出库"
   - Fill in form (try both transfer and borrow types)
   - Should see message "需要管理员审批"
   - Wait for admin approval

3. **Verify Hidden Features**
   - "Add Item" button should NOT be visible in Item Management
   - "Approval Management" menu should NOT be visible

## API Endpoints Added

- `GET /api/approvals` - Get all approval requests (filtered by user role)
- `GET /api/approvals?status=pending` - Get requests by status
- `POST /api/approvals` - Create approval request
- `PUT /api/approvals/:id/review` - Review approval request (admin only)
- `GET /api/approvals/pending/count` - Get pending approval count (admin only)

## Database Schema Changes

New table: `approval_requests`
- `request_id` - Primary key
- `request_type` - 'inbound' or 'outbound'
- `requester_id` - User who made the request
- `request_data` - JSON with request details
- `status` - 'pending', 'approved', or 'rejected'
- `reviewer_id` - Admin who reviewed
- `review_comment` - Optional comment
- `created_at` - Request creation time
- `reviewed_at` - Review time

## Rollback Instructions

If you need to rollback:

```bash
# 1. Revert code changes
git reset --hard <previous-commit-hash>
bash deployment/full-restart.sh

# 2. Remove approval requests table (if needed)
mysql -u root -p storage_management
DROP TABLE IF EXISTS approval_requests;
```

## Troubleshooting

### Issue: "Admin-only features still visible to regular users"
**Solution:** Hard refresh browser (Ctrl+Shift+R) to clear cached CSS

### Issue: "Approval requests not appearing"
**Solution:** Check database migration was applied:
```sql
SHOW TABLES LIKE 'approval_requests';
```

### Issue: "Items not loading"
**Solution:** Click the "显示所有物品" button first

### Issue: "API returns 500 error"
**Solution:** Check PM2 logs:
```bash
pm2 logs storage-management
```

## Support

If you encounter issues, please check:
1. PM2 process is running: `pm2 status`
2. Database migration was applied: Check `approval_requests` table exists
3. Browser console for JavaScript errors
4. Server logs: `pm2 logs`
