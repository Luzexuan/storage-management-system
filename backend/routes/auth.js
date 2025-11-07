const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { logOperation, getClientIP } = require('../utils/logger');

// 用户注册
router.post('/register',
  [
    body('username').trim().isLength({ min: 3, max: 50 }).withMessage('用户名长度为3-50个字符'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6个字符'),
    body('email').isEmail().withMessage('请输入有效的邮箱地址'),
    body('phone').optional().isMobilePhone('zh-CN').withMessage('请输入有效的手机号')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, email, phone } = req.body;

    try {
      // 检查用户名或邮箱是否已存在
      const [existing] = await db.execute(
        'SELECT user_id, username, email, phone, status FROM users WHERE username = ? OR email = ? OR (phone IS NOT NULL AND phone = ?)',
        [username, email, phone || null]
      );

      // 检查是否存在冲突
      if (existing.length > 0) {
        const existingUser = existing[0];

        // 如果是被拒绝的账户（inactive状态），允许用户重新提交申请
        if (existingUser.status === 'inactive') {
          // 检查是否所有信息都匹配（同一个用户重新申请）
          const isSameUser = existingUser.username === username &&
                            existingUser.email === email &&
                            existingUser.phone === phone;

          if (isSameUser) {
            // 同一个用户重新申请，更新密码并重置状态为pending
            const passwordHash = await bcrypt.hash(password, 10);

            await db.execute(
              `UPDATE users SET password_hash = ?, status = 'pending', updated_at = NOW() WHERE user_id = ?`,
              [passwordHash, existingUser.user_id]
            );

            // 记录日志
            await logOperation({
              operationType: 'user_reapply',
              operatorId: existingUser.user_id,
              targetType: 'user',
              targetId: existingUser.user_id,
              operationDetail: { username, email, action: 'reapply_after_rejection' },
              ipAddress: getClientIP(req)
            });

            return res.status(200).json({
              message: '申请已重新提交，请等待管理员审核',
              userId: existingUser.user_id
            });
          } else {
            // 不同的用户，但某些信息与被拒绝的账户冲突
            // 提供更详细的错误信息
            const conflicts = [];
            if (existingUser.username === username) conflicts.push('用户名');
            if (existingUser.email === email) conflicts.push('邮箱');
            if (existingUser.phone === phone && phone) conflicts.push('手机号');

            return res.status(400).json({
              error: `${conflicts.join('、')}已被其他账户使用（该账户申请已被拒绝），请使用不同的信息注册`
            });
          }
        } else {
          // active 或 pending 状态的用户，不允许重复注册
          const conflicts = [];
          if (existingUser.username === username) conflicts.push('用户名');
          if (existingUser.email === email) conflicts.push('邮箱');
          if (existingUser.phone === phone && phone) conflicts.push('手机号');

          return res.status(400).json({
            error: `${conflicts.join('、')}已被使用`
          });
        }
      }

      // 没有冲突，创建新用户
      // 加密密码
      const passwordHash = await bcrypt.hash(password, 10);

      // 插入新用户（状态为pending，需要管理员审核）
      const [result] = await db.execute(
        `INSERT INTO users (username, password_hash, email, phone, role, status)
         VALUES (?, ?, ?, ?, 'user', 'pending')`,
        [username, passwordHash, email, phone || null]
      );

      // 记录日志
      await logOperation({
        operationType: 'user_register',
        operatorId: result.insertId,
        targetType: 'user',
        targetId: result.insertId,
        operationDetail: { username, email },
        ipAddress: getClientIP(req)
      });

      res.status(201).json({
        message: '注册成功，请等待管理员审核',
        userId: result.insertId
      });
    } catch (error) {
      console.error('注册失败:', error);
      res.status(500).json({ error: '注册失败' });
    }
  }
);

// 用户登录
router.post('/login',
  [
    body('username').trim().notEmpty().withMessage('请输入用户名'),
    body('password').notEmpty().withMessage('请输入密码')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      // 查询用户
      const [users] = await db.execute(
        'SELECT * FROM users WHERE username = ?',
        [username]
      );

      if (users.length === 0) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const user = users[0];

      // 验证密码
      const passwordValid = await bcrypt.compare(password, user.password_hash);
      if (!passwordValid) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      // 检查用户状态
      if (user.status === 'pending') {
        return res.status(403).json({ error: '账户待审核，请联系管理员' });
      }

      if (user.status === 'inactive') {
        return res.status(403).json({ error: '账户已被禁用，请联系管理员' });
      }

      // 生成JWT令牌
      const token = jwt.sign(
        {
          userId: user.user_id,
          username: user.username,
          role: user.role,
          status: user.status
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      res.json({
        message: '登录成功',
        token,
        user: {
          userId: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status
        }
      });
    } catch (error) {
      console.error('登录失败:', error);
      res.status(500).json({ error: '登录失败' });
    }
  }
);

module.exports = router;
