const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');

// 获取所有分类（树形结构）
router.get('/', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const [categories] = await db.execute(
      'SELECT * FROM categories ORDER BY level, sort_order, category_id'
    );

    // 构建树形结构
    const categoryTree = buildCategoryTree(categories);

    res.json({ categories: categoryTree });
  } catch (error) {
    console.error('获取分类失败:', error);
    res.status(500).json({ error: '获取分类失败' });
  }
});

// 获取一级分类
router.get('/top-level', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const [categories] = await db.execute(
      'SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order'
    );

    res.json({ categories });
  } catch (error) {
    console.error('获取一级分类失败:', error);
    res.status(500).json({ error: '获取一级分类失败' });
  }
});

// 获取子分类
router.get('/:categoryId/children', verifyToken, verifyActiveUser, async (req, res) => {
  const { categoryId } = req.params;

  try {
    const [categories] = await db.execute(
      'SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order',
      [categoryId]
    );

    res.json({ categories });
  } catch (error) {
    console.error('获取子分类失败:', error);
    res.status(500).json({ error: '获取子分类失败' });
  }
});

// 获取所有分类（扁平列表，用于下拉选择）
router.get('/all/flat', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const [categories] = await db.execute(
      'SELECT category_id, category_name, parent_id, level FROM categories ORDER BY level, sort_order'
    );

    // 为每个分类生成显示名称（包含层级缩进）
    const categoriesWithPath = categories.map(cat => {
      const indent = '  '.repeat(cat.level - 1);
      return {
        ...cat,
        displayName: `${indent}${cat.category_name}`
      };
    });

    res.json({ categories: categoriesWithPath });
  } catch (error) {
    console.error('获取分类列表失败:', error);
    res.status(500).json({ error: '获取分类列表失败' });
  }
});

// 创建新分类（仅管理员）
router.post('/', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  const { categoryName, parentId, description, sortOrder } = req.body;

  if (!categoryName) {
    return res.status(400).json({ error: '分类名称不能为空' });
  }

  try {
    // 确定层级
    let level = 1;
    if (parentId) {
      const [parent] = await db.execute(
        'SELECT level FROM categories WHERE category_id = ?',
        [parentId]
      );
      if (parent.length === 0) {
        return res.status(400).json({ error: '父分类不存在' });
      }
      level = parent[0].level + 1;
    }

    const [result] = await db.execute(
      `INSERT INTO categories (category_name, parent_id, level, sort_order, description)
       VALUES (?, ?, ?, ?, ?)`,
      [categoryName, parentId || null, level, sortOrder || 0, description || null]
    );

    // 记录日志
    await logOperation({
      operationType: 'edit_category',
      operatorId: req.user.userId,
      targetType: 'category',
      targetId: result.insertId,
      operationDetail: { action: 'create', categoryName, parentId, level },
      ipAddress: getClientIP(req)
    });

    res.status(201).json({
      message: '分类创建成功',
      categoryId: result.insertId
    });
  } catch (error) {
    console.error('创建分类失败:', error);
    res.status(500).json({ error: '创建分类失败' });
  }
});

// 更新分类（仅管理员）
router.put('/:categoryId', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  const { categoryId } = req.params;
  const { categoryName, description, sortOrder } = req.body;

  try {
    await db.execute(
      `UPDATE categories
       SET category_name = COALESCE(?, category_name),
           description = COALESCE(?, description),
           sort_order = COALESCE(?, sort_order)
       WHERE category_id = ?`,
      [categoryName, description, sortOrder, categoryId]
    );

    // 记录日志
    await logOperation({
      operationType: 'edit_category',
      operatorId: req.user.userId,
      targetType: 'category',
      targetId: parseInt(categoryId),
      operationDetail: { action: 'update', categoryName, description, sortOrder },
      ipAddress: getClientIP(req)
    });

    res.json({ message: '分类更新成功' });
  } catch (error) {
    console.error('更新分类失败:', error);
    res.status(500).json({ error: '更新分类失败' });
  }
});

// 删除分类（仅管理员）
router.delete('/:categoryId', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  const { categoryId } = req.params;

  try {
    // 检查是否有子分类
    const [children] = await db.execute(
      'SELECT COUNT(*) as count FROM categories WHERE parent_id = ?',
      [categoryId]
    );

    if (children[0].count > 0) {
      return res.status(400).json({ error: '请先删除子分类' });
    }

    // 检查是否有物品
    const [items] = await db.execute(
      'SELECT COUNT(*) as count FROM items WHERE category_id = ?',
      [categoryId]
    );

    if (items[0].count > 0) {
      return res.status(400).json({ error: '该分类下还有物品，无法删除' });
    }

    await db.execute('DELETE FROM categories WHERE category_id = ?', [categoryId]);

    // 记录日志
    await logOperation({
      operationType: 'edit_category',
      operatorId: req.user.userId,
      targetType: 'category',
      targetId: parseInt(categoryId),
      operationDetail: { action: 'delete' },
      ipAddress: getClientIP(req)
    });

    res.json({ message: '分类删除成功' });
  } catch (error) {
    console.error('删除分类失败:', error);
    res.status(500).json({ error: '删除分类失败' });
  }
});

// 辅助函数：构建树形结构
function buildCategoryTree(categories, parentId = null) {
  return categories
    .filter(cat => cat.parent_id === parentId)
    .map(cat => ({
      ...cat,
      children: buildCategoryTree(categories, cat.category_id)
    }));
}

module.exports = router;
