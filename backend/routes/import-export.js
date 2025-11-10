const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');

// ========== 导出功能 ==========

// 导出分类信息
router.get('/export/categories', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { categoryId } = req.query;

    let categories;
    if (categoryId) {
      // 导出特定分类及其子分类
      categories = await exportCategoryTree(parseInt(categoryId));
    } else {
      // 导出所有分类
      const [allCategories] = await db.execute(
        'SELECT * FROM categories ORDER BY sort_order, category_id'
      );
      categories = allCategories;
    }

    // 记录导出操作
    await logOperation({
      operationType: 'export_data',
      operatorId: req.user.userId,
      targetType: 'categories',
      targetId: categoryId ? parseInt(categoryId) : null,
      operationDetail: { count: categories.length },
      ipAddress: getClientIP(req)
    });

    res.json({
      exportType: 'categories',
      exportDate: new Date().toISOString(),
      data: categories
    });
  } catch (error) {
    console.error('导出分类失败:', error);
    res.status(500).json({ error: '导出分类失败' });
  }
});

// 递归导出分类树
async function exportCategoryTree(categoryId) {
  const [category] = await db.execute(
    'SELECT * FROM categories WHERE category_id = ?',
    [categoryId]
  );

  if (category.length === 0) return [];

  const result = [category[0]];

  // 获取所有子分类
  const [children] = await db.execute(
    'SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order, category_id',
    [categoryId]
  );

  for (const child of children) {
    const subtree = await exportCategoryTree(child.category_id);
    result.push(...subtree);
  }

  return result;
}

// 导出物品信息
router.get('/export/items', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { categoryId } = req.query;

    let query = `
      SELECT i.*, c.category_name, c.parent_id
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.category_id
    `;
    let params = [];

    if (categoryId) {
      // 获取该分类及所有子分类的ID
      const categoryIds = await getAllCategoryIds(parseInt(categoryId));
      query += ' WHERE i.category_id IN (' + categoryIds.map(() => '?').join(',') + ')';
      params = categoryIds;
    }

    query += ' ORDER BY i.item_id';

    const [items] = await db.execute(query, params);

    // 记录导出操作
    await logOperation({
      operationType: 'export_data',
      operatorId: req.user.userId,
      targetType: 'items',
      targetId: categoryId ? parseInt(categoryId) : null,
      operationDetail: { count: items.length },
      ipAddress: getClientIP(req)
    });

    res.json({
      exportType: 'items',
      exportDate: new Date().toISOString(),
      data: items
    });
  } catch (error) {
    console.error('导出物品失败:', error);
    res.status(500).json({ error: '导出物品失败' });
  }
});

// 获取分类及其所有子分类的ID
async function getAllCategoryIds(categoryId) {
  const ids = [categoryId];
  const [children] = await db.execute(
    'SELECT category_id FROM categories WHERE parent_id = ?',
    [categoryId]
  );

  for (const child of children) {
    const childIds = await getAllCategoryIds(child.category_id);
    ids.push(...childIds);
  }

  return ids;
}

// 导出用户信息
router.get('/export/users', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.query;

    let query = 'SELECT user_id, username, email, phone, role, status, created_at, updated_at FROM users';
    let params = [];

    if (userId) {
      query += ' WHERE user_id = ?';
      params = [parseInt(userId)];
    }

    query += ' ORDER BY user_id';

    const [users] = await db.execute(query, params);

    // 记录导出操作
    await logOperation({
      operationType: 'export_data',
      operatorId: req.user.userId,
      targetType: 'users',
      targetId: userId ? parseInt(userId) : null,
      operationDetail: { count: users.length },
      ipAddress: getClientIP(req)
    });

    res.json({
      exportType: 'users',
      exportDate: new Date().toISOString(),
      data: users
    });
  } catch (error) {
    console.error('导出用户失败:', error);
    res.status(500).json({ error: '导出用户失败' });
  }
});

// 导出操作日志
router.get('/export/logs', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { startDate, endDate, userId, itemId } = req.query;

    let query = `
      SELECT ol.*, u.username as operator_name
      FROM operation_logs ol
      LEFT JOIN users u ON ol.operator_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND ol.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND ol.created_at <= ?';
      params.push(endDate);
    }

    if (userId) {
      query += ' AND ol.operator_id = ?';
      params.push(parseInt(userId));
    }

    if (itemId) {
      query += ' AND ol.target_type = ? AND ol.target_id = ?';
      params.push('item', parseInt(itemId));
    }

    query += ' ORDER BY ol.created_at DESC';

    const [logs] = await db.execute(query, params);

    // 记录导出操作
    await logOperation({
      operationType: 'export_data',
      operatorId: req.user.userId,
      targetType: 'logs',
      targetId: null,
      operationDetail: { count: logs.length, filters: { startDate, endDate, userId, itemId } },
      ipAddress: getClientIP(req)
    });

    res.json({
      exportType: 'logs',
      exportDate: new Date().toISOString(),
      filters: { startDate, endDate, userId, itemId },
      data: logs
    });
  } catch (error) {
    console.error('导出日志失败:', error);
    res.status(500).json({ error: '导出日志失败' });
  }
});

// ========== 导入功能 ==========

// 导入分类信息
router.post('/import/categories', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { data, mode } = req.body; // mode: 'replace' 或 'merge'

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: '无效的数据格式' });
    }

    if (mode === 'replace') {
      // 完全替换：先删除所有现有分类
      await db.execute('DELETE FROM categories');
    }

    // 导入分类
    let imported = 0;
    let skipped = 0;

    for (const category of data) {
      try {
        if (mode === 'merge') {
          // 合并模式：检查是否已存在相同名称和父ID的分类
          const [existing] = await db.execute(
            'SELECT category_id FROM categories WHERE category_name = ? AND parent_id <=> ?',
            [category.category_name, category.parent_id]
          );

          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        await db.execute(
          `INSERT INTO categories (category_name, parent_id, level, sort_order, is_stackable, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            category.category_name,
            category.parent_id,
            category.level,
            category.sort_order || 0,
            category.is_stackable || false,
            category.description
          ]
        );
        imported++;
      } catch (error) {
        console.error('导入分类失败:', category, error);
        skipped++;
      }
    }

    // 记录导入操作
    await logOperation({
      operationType: 'import_data',
      operatorId: req.user.userId,
      targetType: 'categories',
      targetId: null,
      operationDetail: { mode, total: data.length, imported, skipped },
      ipAddress: getClientIP(req)
    });

    res.json({
      message: '分类导入完成',
      total: data.length,
      imported,
      skipped
    });
  } catch (error) {
    console.error('导入分类失败:', error);
    res.status(500).json({ error: '导入分类失败: ' + error.message });
  }
});

// 导入物品信息
router.post('/import/items', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { data, mode } = req.body; // mode: 'replace' 或 'merge'

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: '无效的数据格式' });
    }

    if (mode === 'replace') {
      // 完全替换：先删除所有现有物品
      await db.execute('DELETE FROM items');
    }

    // 导入物品
    let imported = 0;
    let skipped = 0;

    for (const item of data) {
      try {
        if (mode === 'merge') {
          // 合并模式：检查唯一编号是否已存在
          if (item.unique_code) {
            const [existing] = await db.execute(
              'SELECT item_id FROM items WHERE unique_code = ?',
              [item.unique_code]
            );

            if (existing.length > 0) {
              skipped++;
              continue;
            }
          }
        }

        await db.execute(
          `INSERT INTO items (unique_code, category_id, item_name, model, specification, is_stackable,
           current_quantity, total_in, total_out, status, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.unique_code,
            item.category_id,
            item.item_name,
            item.model,
            item.specification,
            item.is_stackable || false,
            item.current_quantity || 0,
            item.total_in || 0,
            item.total_out || 0,
            item.status || 'out_of_stock',
            item.description
          ]
        );
        imported++;
      } catch (error) {
        console.error('导入物品失败:', item, error);
        skipped++;
      }
    }

    // 记录导入操作
    await logOperation({
      operationType: 'import_data',
      operatorId: req.user.userId,
      targetType: 'items',
      targetId: null,
      operationDetail: { mode, total: data.length, imported, skipped },
      ipAddress: getClientIP(req)
    });

    res.json({
      message: '物品导入完成',
      total: data.length,
      imported,
      skipped
    });
  } catch (error) {
    console.error('导入物品失败:', error);
    res.status(500).json({ error: '导入物品失败: ' + error.message });
  }
});

// 导入用户信息
router.post('/import/users', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { data, mode } = req.body; // mode: 'replace' 或 'merge'

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: '无效的数据格式' });
    }

    if (mode === 'replace') {
      // 完全替换：删除除当前管理员外的所有用户
      await db.execute('DELETE FROM users WHERE user_id != ?', [req.user.userId]);
    }

    // 导入用户
    let imported = 0;
    let skipped = 0;

    for (const user of data) {
      try {
        // 跳过当前操作的管理员
        if (user.user_id === req.user.userId) {
          skipped++;
          continue;
        }

        if (mode === 'merge') {
          // 合并模式：检查用户名或邮箱是否已存在
          const [existing] = await db.execute(
            'SELECT user_id FROM users WHERE username = ? OR email = ?',
            [user.username, user.email]
          );

          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        // 注意：导入的用户需要重置密码，这里设置一个默认密码
        const bcrypt = require('bcrypt');
        const defaultPassword = await bcrypt.hash('123456', 10);

        await db.execute(
          `INSERT INTO users (username, password_hash, email, phone, role, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            user.username,
            defaultPassword, // 使用默认密码
            user.email,
            user.phone,
            user.role || 'user',
            user.status || 'pending'
          ]
        );
        imported++;
      } catch (error) {
        console.error('导入用户失败:', user, error);
        skipped++;
      }
    }

    // 记录导入操作
    await logOperation({
      operationType: 'import_data',
      operatorId: req.user.userId,
      targetType: 'users',
      targetId: null,
      operationDetail: { mode, total: data.length, imported, skipped },
      ipAddress: getClientIP(req)
    });

    res.json({
      message: '用户导入完成（默认密码：123456）',
      total: data.length,
      imported,
      skipped
    });
  } catch (error) {
    console.error('导入用户失败:', error);
    res.status(500).json({ error: '导入用户失败: ' + error.message });
  }
});

module.exports = router;
