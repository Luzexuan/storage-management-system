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

### Migration 003: Add is_stackable to Categories

This migration adds the `is_stackable` field to the `categories` table to determine at the category level whether items should be stackable.

**To run this migration:**

```bash
# Connect to MySQL
mysql -u your_username -p storage_management

# Run the migration
source database/migrations/add_is_stackable_to_categories.sql

# Or if you're in a different directory:
mysql -u your_username -p storage_management < database/migrations/add_is_stackable_to_categories.sql
```

**What this migration does:**
- Adds `is_stackable` BOOLEAN field to `categories` table
- Sets `is_stackable = TRUE` for "通用配件与工具" category and all its subcategories
- Enables the inbound system to automatically determine whether to show unique code input or item selection

**Verification:**

```sql
-- Check if the field was added
DESCRIBE categories;

-- See which categories are marked as stackable
SELECT category_id, category_name, level, is_stackable
FROM categories
WHERE is_stackable = TRUE;
```

**Rollback (if needed):**

```sql
ALTER TABLE categories DROP COLUMN is_stackable;
```

## Migration History

1. `001_add_operation_types.sql` - Initial operation types setup
2. `002_add_approval_system.sql` - Add approval system for regular user requests
3. `add_is_stackable_to_categories.sql` - Add is_stackable field to categories table
