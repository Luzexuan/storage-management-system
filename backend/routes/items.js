const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');
const { generateUniqueCode, getCategoryPath } = require('../utils/codeGenerator');

// 获取所有物品（支持分页和筛选）
router.get('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { categoryId, status, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let sql = `
      SELECT i.*, c.category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.category_id
      WHERE 1=1
    `;
    const params = [];

    if (categoryId) {
      sql += ' AND i.category_id = ?';
      params.push(categoryId);
    }

    if (status) {
      sql += ' AND i.status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (i.item_name LIKE ? OR i.unique_code LIKE ? OR i.model LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // 获取总数
    const countSql = sql.replace('SELECT i.*, c.category_name', 'SELECT COUNT(*) as total');
    const [countResult] = await db.execute(countSql, params);
    const total = countResult[0].total;

    // 获取分页数据
    sql += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit) || 20, Number(offset) || 0);

    const [items] = await db.execute(sql, params);

    res.json({
      items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取物品列表失败:', error);
    res.status(500).json({ error: '获取物品列表失败' });
  }
});

// 根据分类路径获取物品（按分类降序索引）
router.get('/by-category-path', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const [items] = await db.execute(`
      SELECT i.*, c.category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.category_id
      ORDER BY c.level DESC, i.category_id, i.unique_code
    `);

    // 为每个物品添加完整分类路径
    for (let item of items) {
      item.categoryPath = await getCategoryPath(item.category_id);
    }

    res.json({ items });
  } catch (error) {
    console.error('按分类获取物品失败:', error);
    res.status(500).json({ error: '按分类获取物品失败' });
  }
});

// 获取单个物品详情
router.get('/:itemId', verifyToken, verifyActiveUser, async (req, res) => {
  const { itemId } = req.params;

  try {
    const [items] = await db.execute(
      `SELECT i.*, c.category_name
       FROM items i
       LEFT JOIN categories c ON i.category_id = c.category_id
       WHERE i.item_id = ?`,
      [itemId]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: '物品不存在' });
    }

    const item = items[0];
    item.categoryPath = await getCategoryPath(item.category_id);

    res.json({ item });
  } catch (error) {
    console.error('获取物品详情失败:', error);
    res.status(500).json({ error: '获取物品详情失败' });
  }
});

// 创建新物品
router.post('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { categoryId, itemName, model, specification, isStackable, description, uniqueCode } = req.body;

  if (!categoryId || !itemName) {
    return res.status(400).json({ error: '分类和物品名称不能为空' });
  }

  // 如果不是可堆叠物品，必须提供唯一编号
  if (!isStackable && !uniqueCode) {
    return res.status(400).json({ error: '非堆叠物品必须提供唯一编号' });
  }

  try {
    // 检查分类是否存在
    const [categories] = await db.execute(
      'SELECT category_id, category_name FROM categories WHERE category_id = ?',
      [categoryId]
    );

    if (categories.length === 0) {
      return res.status(400).json({ error: '分类不存在' });
    }

    // 如果提供了唯一编号，检查是否已存在
    if (uniqueCode) {
      const [existing] = await db.execute(
        'SELECT item_id FROM items WHERE unique_code = ?',
        [uniqueCode]
      );

      if (existing.length > 0) {
        return res.status(400).json({ error: '唯一编号已存在，请使用其他编号' });
      }
    }

    const [result] = await db.execute(
      `INSERT INTO items
       (unique_code, category_id, item_name, model, specification, is_stackable, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'out_of_stock')`,
      [uniqueCode || null, categoryId, itemName, model || null, specification || null, isStackable || false, description || null]
    );

    // 记录日志
    await logOperation({
      operationType: 'edit_item',
      operatorId: req.user.userId,
      targetType: 'item',
      targetId: result.insertId,
      operationDetail: {
        action: 'create',
        itemName,
        uniqueCode: uniqueCode || null,
        categoryId
      },
      ipAddress: getClientIP(req)
    });

    res.status(201).json({
      message: '物品创建成功',
      itemId: result.insertId,
      uniqueCode: uniqueCode || null
    });
  } catch (error) {
    console.error('创建物品失败:', error);
    res.status(500).json({ error: '创建物品失败' });
  }
});

// 更新物品信息（管理员可修改所有字段，普通用户仅可修改部分字段）
router.put('/:itemId', verifyToken, verifyActiveUser, async (req, res) => {
  const { itemId } = req.params;
  const { itemName, model, specification, description } = req.body;
  const isAdmin = req.user.role === 'admin';

  try {
    let sql = `UPDATE items SET`;
    const params = [];
    const updates = [];

    if (itemName !== undefined) {
      updates.push(' item_name = ?');
      params.push(itemName);
    }
    if (model !== undefined) {
      updates.push(' model = ?');
      params.push(model);
    }
    if (specification !== undefined) {
      updates.push(' specification = ?');
      params.push(specification);
    }
    if (description !== undefined) {
      updates.push(' description = ?');
      params.push(description);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有可更新的字段' });
    }

    sql += updates.join(',') + ' WHERE item_id = ?';
    params.push(itemId);

    await db.execute(sql, params);

    // 记录日志
    await logOperation({
      operationType: 'edit_item',
      operatorId: req.user.userId,
      targetType: 'item',
      targetId: parseInt(itemId),
      operationDetail: {
        action: 'update',
        updates: { itemName, model, specification, description }
      },
      ipAddress: getClientIP(req)
    });

    res.json({ message: '物品更新成功' });
  } catch (error) {
    console.error('更新物品失败:', error);
    res.status(500).json({ error: '更新物品失败' });
  }
});

// 删除物品（仅管理员）
router.delete('/:itemId', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  const { itemId } = req.params;

  try {
    // 检查是否有库存
    const [items] = await db.execute(
      'SELECT current_quantity FROM items WHERE item_id = ?',
      [itemId]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: '物品不存在' });
    }

    if (items[0].current_quantity > 0) {
      return res.status(400).json({ error: '物品还有库存，无法删除' });
    }

    await db.execute('DELETE FROM items WHERE item_id = ?', [itemId]);

    // 记录日志
    await logOperation({
      operationType: 'edit_item',
      operatorId: req.user.userId,
      targetType: 'item',
      targetId: parseInt(itemId),
      operationDetail: { action: 'delete' },
      ipAddress: getClientIP(req)
    });

    res.json({ message: '物品删除成功' });
  } catch (error) {
    console.error('删除物品失败:', error);
    res.status(500).json({ error: '删除物品失败' });
  }
});

module.exports = router;
