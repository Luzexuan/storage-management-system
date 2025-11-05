const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');

// Get all outbound records
router.get('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { itemId, isReturned, borrower, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let sql = `
      SELECT obr.*, i.item_name, i.unique_code, u.username as operator_name
      FROM outbound_records obr
      LEFT JOIN items i ON obr.item_id = i.item_id
      LEFT JOIN users u ON obr.operator_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (itemId) {
      sql += ' AND obr.item_id = ?';
      params.push(itemId);
    }

    if (isReturned !== undefined) {
      sql += ' AND obr.is_returned = ?';
      params.push(isReturned === 'true' ? 1 : 0);
    }

    if (borrower) {
      sql += ' AND obr.borrower_name = ?';
      params.push(borrower);
    }

    // Get total count
    const countSql = sql.replace('SELECT obr.*, i.item_name, i.unique_code as item_code, u.username as operator_name', 'SELECT COUNT(*) as total');
    const [countResult] = await db.execute(countSql, params);
    const total = countResult[0].total;

    // Get paginated data
    const finalLimit = Number(limit) || 20;
    const finalOffset = Number(offset) || 0;
    sql += ` ORDER BY obr.outbound_time DESC LIMIT ${finalLimit} OFFSET ${finalOffset}`;

    const [records] = await db.execute(sql, params);

    res.json({
      records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Failed to get outbound records:', error);
    res.status(500).json({ error: 'Failed to get outbound records' });
  }
});

// Get unreturned borrowing records (for reminders)
router.get('/unreturned/list', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const [records] = await db.execute(`
      SELECT obr.*, i.item_name, i.unique_code as item_code, u.username as operator_name
      FROM outbound_records obr
      LEFT JOIN items i ON obr.item_id = i.item_id
      LEFT JOIN users u ON obr.operator_id = u.user_id
      WHERE obr.outbound_type = 'borrow'
        AND obr.is_returned = FALSE
      ORDER BY obr.expected_return_date ASC
    `);

    res.json({ records });
  } catch (error) {
    console.error('Failed to get unreturned records:', error);
    res.status(500).json({ error: 'Failed to get unreturned records' });
  }
});

// Get current user's borrowing records (for quick return)
router.get('/my-borrowings', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const [records] = await db.execute(`
      SELECT
        obr.outbound_id,
        obr.item_id,
        obr.quantity,
        obr.outbound_time,
        obr.expected_return_date,
        obr.borrower_name,
        i.item_name,
        i.unique_code,
        i.model,
        c.category_name
      FROM outbound_records obr
      LEFT JOIN items i ON obr.item_id = i.item_id
      LEFT JOIN categories c ON i.category_id = c.category_id
      WHERE obr.operator_id = ?
        AND obr.outbound_type = 'borrow'
        AND obr.is_returned = FALSE
      ORDER BY obr.expected_return_date ASC
    `, [req.user.userId]);

    res.json({ borrowings: records });
  } catch (error) {
    console.error('Failed to get my borrowing records:', error);
    res.status(500).json({ error: 'Failed to get my borrowing records' });
  }
});

// Create outbound record (permanent transfer or temporary borrow)
router.post('/', verifyToken, verifyActiveUser, async (req, res) => {
  const {
    itemId,
    quantity,
    outboundType,
    borrowerName,
    borrowerPhone,
    borrowerEmail,
    expectedReturnDate,
    remarks
  } = req.body;

  if (!itemId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'Item ID and quantity are required and quantity must be greater than 0' });
  }

  if (!['transfer', 'borrow'].includes(outboundType)) {
    return res.status(400).json({ error: 'Outbound type must be transfer or borrow' });
  }

  // Borrowing requires borrower information and expected return date
  if (outboundType === 'borrow') {
    if (!borrowerName || !borrowerPhone || !borrowerEmail || !expectedReturnDate) {
      return res.status(400).json({
        error: 'Borrowing requires borrower name, phone, email and expected return date'
      });
    }
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Get item information
    const [items] = await connection.execute(
      'SELECT * FROM items WHERE item_id = ? FOR UPDATE',
      [itemId]
    );

    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = items[0];

    // Check inventory
    if (item.current_quantity < quantity) {
      await connection.rollback();
      return res.status(400).json({
        error: `Insufficient inventory, current stock: ${item.current_quantity}, requested: ${quantity}`
      });
    }

    // Insert outbound record
    const [result] = await connection.execute(
      `INSERT INTO outbound_records
       (item_id, unique_code, quantity, outbound_type, borrower_name, borrower_phone,
        borrower_email, expected_return_date, operator_id, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        item.unique_code,
        quantity,
        outboundType,
        borrowerName || null,
        borrowerPhone || null,
        borrowerEmail || null,
        expectedReturnDate || null,
        req.user.userId,
        remarks || null
      ]
    );

    // Update item inventory
    const newQuantity = item.current_quantity - quantity;
    let newStatus = 'in_stock';
    if (newQuantity === 0) {
      newStatus = 'out_of_stock';
    } else if (newQuantity < item.current_quantity) {
      newStatus = 'partially_out';
    }

    await connection.execute(
      `UPDATE items
       SET current_quantity = ?,
           total_out = total_out + ?,
           status = ?
       WHERE item_id = ?`,
      [newQuantity, quantity, newStatus, itemId]
    );

    // Log operation
    await logOperation({
      operationType: 'outbound',
      operatorId: req.user.userId,
      targetType: 'item',
      targetId: itemId,
      operationDetail: {
        outboundId: result.insertId,
        quantity,
        outboundType,
        borrowerName,
        expectedReturnDate,
        newQuantity
      },
      ipAddress: getClientIP(req)
    });

    await connection.commit();

    res.status(201).json({
      message: 'Outbound successful',
      outboundId: result.insertId,
      newQuantity
    });
  } catch (error) {
    await connection.rollback();
    console.error('Outbound failed:', error);
    res.status(500).json({ error: 'Outbound failed' });
  } finally {
    connection.release();
  }
});

// Get single outbound record details
router.get('/:outboundId', verifyToken, verifyActiveUser, async (req, res) => {
  const { outboundId } = req.params;

  try {
    const [records] = await db.execute(
      `SELECT obr.*, i.item_name, i.unique_code as item_code,
              u.username as operator_name, u.email as operator_email
       FROM outbound_records obr
       LEFT JOIN items i ON obr.item_id = i.item_id
       LEFT JOIN users u ON obr.operator_id = u.user_id
       WHERE obr.outbound_id = ?`,
      [outboundId]
    );

    if (records.length === 0) {
      return res.status(404).json({ error: 'Outbound record not found' });
    }

    res.json({ record: records[0] });
  } catch (error) {
    console.error('Failed to get outbound record details:', error);
    res.status(500).json({ error: 'Failed to get outbound record details' });
  }
});

// Update outbound record (e.g., convert borrow to transfer)
router.put('/:outboundId', verifyToken, verifyActiveUser, async (req, res) => {
  const { outboundId } = req.params;
  const { outboundType, isReturned } = req.body;

  try {
    // Get the outbound record to verify ownership
    const [records] = await db.execute(
      'SELECT * FROM outbound_records WHERE outbound_id = ?',
      [outboundId]
    );

    if (records.length === 0) {
      return res.status(404).json({ error: 'Outbound record not found' });
    }

    const record = records[0];

    // Verify that the user is either the operator or an admin
    const isAdmin = req.user.role === 'admin';
    const isOperator = record.operator_id === req.user.userId;

    if (!isAdmin && !isOperator) {
      return res.status(403).json({ error: 'You do not have permission to update this outbound record' });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (outboundType !== undefined) {
      updates.push('outbound_type = ?');
      params.push(outboundType);
    }

    if (isReturned !== undefined) {
      updates.push('is_returned = ?');
      params.push(isReturned);

      // If marking as returned, set actual return date
      if (isReturned) {
        updates.push('actual_return_date = CURDATE()');
      } else {
        updates.push('actual_return_date = NULL');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(outboundId);

    await db.execute(
      `UPDATE outbound_records SET ${updates.join(', ')} WHERE outbound_id = ?`,
      params
    );

    // Log operation
    await logOperation({
      operationType: 'outbound',
      operatorId: req.user.userId,
      targetType: 'outbound_record',
      targetId: parseInt(outboundId),
      operationDetail: {
        action: 'update_outbound',
        updates: { outboundType, isReturned }
      },
      ipAddress: getClientIP(req)
    });

    res.json({ message: 'Outbound record updated successfully' });
  } catch (error) {
    console.error('Failed to update outbound record:', error);
    res.status(500).json({ error: 'Failed to update outbound record' });
  }
});

module.exports = router;
