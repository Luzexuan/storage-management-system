const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');

// 获取所有用户（仅管理员）
router.get('/', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT user_id, username, email, phone, role, status, created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );

    res.json({ users });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 获取待审核用户（仅管理员）
router.get('/pending', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT user_id, username, email, phone, created_at
       FROM users WHERE status = 'pending' ORDER BY created_at ASC`
    );

    res.json({ users });
  } catch (error) {
    console.error('获取待审核用户失败:', error);
    res.status(500).json({ error: '获取待审核用户失败' });
  }
});

// 审核用户（仅管理员）
router.put('/:userId/approve', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  const { userId } = req.params;
  const { approve } = req.body; // true: 通过, false: 拒绝

  try {
    const newStatus = approve ? 'active' : 'inactive';

    await db.execute(
      'UPDATE users SET status = ? WHERE user_id = ?',
      [newStatus, userId]
    );

    // 记录日志
    await logOperation({
      operationType: 'user_approve',
      operatorId: req.user.userId,
      targetType: 'user',
      targetId: parseInt(userId),
      operationDetail: { action: approve ? 'approved' : 'rejected' },
      ipAddress: getClientIP(req)
    });

    res.json({
      message: approve ? '用户已批准' : '用户已拒绝',
      userId,
      status: newStatus
    });
  } catch (error) {
    console.error('审核用户失败:', error);
    res.status(500).json({ error: '审核用户失败' });
  }
});

// 修改用户角色（仅管理员）
router.put('/:userId/role', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: '无效的角色' });
  }

  try {
    await db.execute(
      'UPDATE users SET role = ? WHERE user_id = ?',
      [role, userId]
    );

    // 记录日志
    await logOperation({
      operationType: 'edit_item',
      operatorId: req.user.userId,
      targetType: 'user',
      targetId: parseInt(userId),
      operationDetail: { field: 'role', newValue: role },
      ipAddress: getClientIP(req)
    });

    res.json({ message: '角色已更新', userId, role });
  } catch (error) {
    console.error('更新角色失败:', error);
    res.status(500).json({ error: '更新角色失败' });
  }
});

// 获取当前用户信息
router.get('/me', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT user_id, username, email, phone, role, status, created_at
       FROM users WHERE user_id = ?`,
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = users[0];
    // Convert to camelCase for consistency with login response
    res.json({
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 更新当前用户信息
router.put('/me', verifyToken, verifyActiveUser, async (req, res) => {
  const { email, phone } = req.body;

  try {
    const updates = [];
    const params = [];

    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }

    params.push(req.user.userId);

    await db.execute(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE user_id = ?`,
      params
    );

    // 记录日志
    await logOperation({
      operationType: 'update_profile',
      operatorId: req.user.userId,
      targetType: 'user',
      targetId: req.user.userId,
      operationDetail: { email, phone },
      ipAddress: getClientIP(req)
    });

    res.json({ message: '个人信息已更新' });
  } catch (error) {
    console.error('更新个人信息失败:', error);
    res.status(500).json({ error: '更新个人信息失败' });
  }
});

// 修改密码
router.put('/me/password', verifyToken, verifyActiveUser, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: '当前密码和新密码不能为空' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: '新密码长度至少为6个字符' });
  }

  try {
    // 获取用户当前密码哈希
    const [users] = await db.execute(
      'SELECT password_hash FROM users WHERE user_id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 验证当前密码
    const bcrypt = require('bcrypt');
    const isValid = await bcrypt.compare(currentPassword, users[0].password_hash);

    if (!isValid) {
      return res.status(401).json({ error: '当前密码不正确' });
    }

    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await db.execute(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE user_id = ?',
      [newPasswordHash, req.user.userId]
    );

    // 记录日志
    await logOperation({
      operationType: 'change_password',
      operatorId: req.user.userId,
      targetType: 'user',
      targetId: req.user.userId,
      operationDetail: { action: 'password_changed' },
      ipAddress: getClientIP(req)
    });

    res.json({ message: '密码已成功修改' });
  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({ error: '修改密码失败' });
  }
});

module.exports = router;
