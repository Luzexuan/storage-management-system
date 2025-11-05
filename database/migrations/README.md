# Database Migrations

This directory contains database migration scripts for the storage management system.

## How to Run Migrations

### Migration 002: Approval System

This migration adds the approval system for inbound and outbound operations submitted by regular users.

**To run this migration:**

```bash
# Connect to MySQL
mysql -u your_username -p storage_management

# Run the migration
source database/migrations/002_add_approval_system.sql

# Or if you're in a different directory:
mysql -u your_username -p storage_management < database/migrations/002_add_approval_system.sql
```

**What this migration does:**
- Creates `approval_requests` table to store inbound/outbound approval requests
- Regular users can submit requests that require admin approval
- Admins can approve or reject requests
- Approved requests automatically create the corresponding inbound/outbound records

## Migration History

1. `001_add_operation_types.sql` - Initial operation types setup
2. `002_add_approval_system.sql` - Add approval system for regular user requests
