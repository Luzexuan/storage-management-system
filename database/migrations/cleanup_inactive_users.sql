-- 清理 inactive 状态的用户记录
-- 这个脚本用于解决从旧版本升级到新版本后的遗留问题
-- 新版本中，拒绝用户时会直接删除记录，不再使用 inactive 状态

-- 步骤1：查看当前 inactive 状态的用户
SELECT user_id, username, email, phone, status, created_at
FROM users
WHERE status = 'inactive';

-- 步骤2：查看这些用户相关的操作日志
SELECT ol.log_id, ol.operator_id, ol.operation_type, ol.created_at, u.username
FROM operation_logs ol
LEFT JOIN users u ON ol.operator_id = u.user_id
WHERE u.status = 'inactive';

-- 步骤3：删除 inactive 用户的操作日志（解除外键约束）
-- 取消下面这行的注释来执行删除操作
-- DELETE FROM operation_logs WHERE operator_id IN (SELECT user_id FROM users WHERE status = 'inactive');

-- 步骤4：删除所有 inactive 状态的用户
-- 取消下面这行的注释来执行删除操作
-- DELETE FROM users WHERE status = 'inactive';
