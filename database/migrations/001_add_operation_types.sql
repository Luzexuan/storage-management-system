-- 数据库迁移脚本：添加新的操作类型
-- 版本: 1.2.1
-- 日期: 2025-10-31
-- 说明: 添加 'update_profile' 和 'change_password' 操作类型到 operation_logs 表

-- 修改 operation_logs 表的 operation_type 字段，添加新的枚举值
ALTER TABLE operation_logs
MODIFY COLUMN operation_type ENUM(
    'inbound',
    'outbound',
    'edit_item',
    'edit_category',
    'user_register',
    'user_approve',
    'update_profile',
    'change_password',
    'other'
) NOT NULL;

-- 验证修改
SHOW COLUMNS FROM operation_logs LIKE 'operation_type';
