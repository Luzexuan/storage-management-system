const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');
const { generateUniqueCode, getCategoryPath } = require('../utils/codeGenerator');

// Get all items (with pagination and filters)
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

    // Get total count
    const countSql = sql.replace('SELECT i.*, c.category_name', 'SELECT COUNT(*) as total');
    const [countResult] = await db.execute(countSql, params);
    const total = countResult[0].total;

    // Get paginated data
    const finalLimit = Number(limit) || 20;
    const finalOffset = Number(offset) || 0;
    sql += ` ORDER BY i.created_at DESC LIMIT ${finalLimit} OFFSET ${finalOffset}`;

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
    console.error('Failed to get items list:', error);
    res.status(500).json({ error: 'Failed to get items list' });
  }
});

// Get items by category path (descending by category level)
router.get('/by-category-path', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const [items] = await db.execute(`
      SELECT i.*, c.category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.category_id
      ORDER BY c.level DESC, i.category_id, i.unique_code
    `);

    // Add full category path for each item
    for (let item of items) {
      item.categoryPath = await getCategoryPath(item.category_id);
    }

    res.json({ items });
  } catch (error) {
    console.error('Failed to get items by category:', error);
    res.status(500).json({ error: 'Failed to get items by category' });
  }
});

// Get single item details
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
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = items[0];
    item.categoryPath = await getCategoryPath(item.category_id);

    res.json({ item });
  } catch (error) {
    console.error('Failed to get item details:', error);
    res.status(500).json({ error: 'Failed to get item details' });
  }
});

// Create new item
router.post('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { categoryId, itemName, model, specification, isStackable, description, uniqueCode, initialStock } = req.body;

  if (!categoryId || !itemName) {
    return res.status(400).json({ error: 'Category and item name are required' });
  }

  // Non-stackable items must have unique code
  if (!isStackable && !uniqueCode) {
    return res.status(400).json({ error: 'Non-stackable items must have unique code' });
  }

  // Parse initial stock
  const stock = parseInt(initialStock) || 0;

  // Determine initial status based on stock
  let initialStatus = 'out_of_stock';
  if (stock > 0) {
    initialStatus = 'in_stock';
  }

  try {
    // Check if category exists
    const [categories] = await db.execute(
      'SELECT category_id, category_name FROM categories WHERE category_id = ?',
      [categoryId]
    );

    if (categories.length === 0) {
      return res.status(400).json({ error: 'Category not found' });
    }

    // If unique code is provided, check if it already exists
    if (uniqueCode) {
      const [existing] = await db.execute(
        'SELECT item_id FROM items WHERE unique_code = ?',
        [uniqueCode]
      );

      if (existing.length > 0) {
        return res.status(400).json({ error: 'Unique code already exists, please use a different one' });
      }
    }

    const [result] = await db.execute(
      `INSERT INTO items
       (unique_code, category_id, item_name, model, specification, is_stackable, description, status, current_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uniqueCode || null, categoryId, itemName, model || null, specification || null, isStackable || false, description || null, initialStatus, stock]
    );

    // Log operation
    await logOperation({
      operationType: 'edit_item',
      operatorId: req.user.userId,
      targetType: 'item',
      targetId: result.insertId,
      operationDetail: {
        action: 'create',
        itemName,
        uniqueCode: uniqueCode || null,
        categoryId,
        initialStock: stock
      },
      ipAddress: getClientIP(req)
    });

    res.status(201).json({
      message: 'Item created successfully',
      itemId: result.insertId,
      uniqueCode: uniqueCode || null
    });
  } catch (error) {
    console.error('Failed to create item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update item information (admins can modify all fields, regular users can only modify some)
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
      return res.status(400).json({ error: 'No fields to update' });
    }

    sql += updates.join(',') + ' WHERE item_id = ?';
    params.push(itemId);

    await db.execute(sql, params);

    // Log operation
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

    res.json({ message: 'Item updated successfully' });
  } catch (error) {
    console.error('Failed to update item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete item (admin only)
router.delete('/:itemId', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  const { itemId } = req.params;

  try {
    // Get item details for logging
    const [items] = await db.execute(
      'SELECT item_id, item_name, unique_code, current_quantity, status FROM items WHERE item_id = ?',
      [itemId]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = items[0];

    // Admin can delete items with inventory - log the deletion with current quantity
    await db.execute('DELETE FROM items WHERE item_id = ?', [itemId]);

    // Log operation with detailed information
    await logOperation({
      operationType: 'edit_item',
      operatorId: req.user.userId,
      targetType: 'item',
      targetId: parseInt(itemId),
      operationDetail: {
        action: 'delete',
        itemName: item.item_name,
        uniqueCode: item.unique_code || null,
        currentQuantity: item.current_quantity,
        status: item.status,
        note: item.current_quantity > 0 ? `Item deleted with inventory: ${item.current_quantity}` : 'Item deleted with zero inventory'
      },
      ipAddress: getClientIP(req)
    });

    res.json({
      message: 'Item deleted successfully',
      warning: item.current_quantity > 0 ? `Item had inventory of ${item.current_quantity} at deletion` : null
    });
  } catch (error) {
    console.error('Failed to delete item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
