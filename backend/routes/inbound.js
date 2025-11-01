const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');

// Get all inbound records
router.get('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { itemId, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let sql = `
      SELECT ir.*, i.item_name, i.unique_code as item_code, u.username as operator_name
      FROM inbound_records ir
      LEFT JOIN items i ON ir.item_id = i.item_id
      LEFT JOIN users u ON ir.operator_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (itemId) {
      sql += ' AND ir.item_id = ?';
      params.push(itemId);
    }

    // Get total count
    const countSql = sql.replace('SELECT ir.*, i.item_name, i.unique_code as item_code, u.username as operator_name', 'SELECT COUNT(*) as total');
    const [countResult] = await db.execute(countSql, params);
    const total = countResult[0].total;

    // Get paginated data
    sql += ' ORDER BY ir.inbound_time DESC LIMIT ? OFFSET ?';
    params.push(Number(limit) || 20, Number(offset) || 0);

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
    console.error('Failed to get inbound records:', error);
    res.status(500).json({ error: 'Failed to get inbound records' });
  }
});

// Create inbound record (initial or return)
router.post('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { itemId, quantity, inboundType, relatedOutboundId, remarks } = req.body;

  if (!itemId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'Item ID and quantity are required and quantity must be greater than 0' });
  }

  if (!['initial', 'return'].includes(inboundType)) {
    return res.status(400).json({ error: 'Inbound type must be initial or return' });
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

    // If return type, validate related outbound record
    if (inboundType === 'return') {
      if (!relatedOutboundId) {
        await connection.rollback();
        return res.status(400).json({ error: 'Related outbound ID is required for return type' });
      }

      // Check outbound record
      const [outboundRecords] = await connection.execute(
        'SELECT * FROM outbound_records WHERE outbound_id = ?',
        [relatedOutboundId]
      );

      if (outboundRecords.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Related outbound record not found' });
      }

      if (outboundRecords[0].is_returned) {
        await connection.rollback();
        return res.status(400).json({ error: 'This outbound record is already marked as returned' });
      }

      // Update outbound record
      await connection.execute(
        `UPDATE outbound_records
         SET is_returned = TRUE, actual_return_date = CURDATE()
         WHERE outbound_id = ?`,
        [relatedOutboundId]
      );
    }

    // Insert inbound record
    const [result] = await connection.execute(
      `INSERT INTO inbound_records
       (item_id, unique_code, quantity, inbound_type, related_outbound_id, operator_id, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [itemId, item.unique_code, quantity, inboundType, relatedOutboundId || null, req.user.userId, remarks || null]
    );

    // Update item inventory
    const newQuantity = item.current_quantity + quantity;
    const newStatus = newQuantity > 0 ? 'in_stock' : 'out_of_stock';

    await connection.execute(
      `UPDATE items
       SET current_quantity = ?,
           total_in = total_in + ?,
           status = ?
       WHERE item_id = ?`,
      [newQuantity, quantity, newStatus, itemId]
    );

    // Log operation
    await logOperation({
      operationType: 'inbound',
      operatorId: req.user.userId,
      targetType: 'item',
      targetId: itemId,
      operationDetail: {
        inboundId: result.insertId,
        quantity,
        inboundType,
        relatedOutboundId,
        newQuantity
      },
      ipAddress: getClientIP(req)
    });

    await connection.commit();

    res.status(201).json({
      message: 'Inbound successful',
      inboundId: result.insertId,
      newQuantity
    });
  } catch (error) {
    await connection.rollback();
    console.error('Inbound failed:', error);
    res.status(500).json({ error: 'Inbound failed' });
  } finally {
    connection.release();
  }
});

// Get single inbound record details
router.get('/:inboundId', verifyToken, verifyActiveUser, async (req, res) => {
  const { inboundId } = req.params;

  try {
    const [records] = await db.execute(
      `SELECT ir.*, i.item_name, i.unique_code as item_code,
              u.username as operator_name, u.email as operator_email
       FROM inbound_records ir
       LEFT JOIN items i ON ir.item_id = i.item_id
       LEFT JOIN users u ON ir.operator_id = u.user_id
       WHERE ir.inbound_id = ?`,
      [inboundId]
    );

    if (records.length === 0) {
      return res.status(404).json({ error: 'Inbound record not found' });
    }

    res.json({ record: records[0] });
  } catch (error) {
    console.error('Failed to get inbound record details:', error);
    res.status(500).json({ error: 'Failed to get inbound record details' });
  }
});

// Batch return (quick return feature)
router.post('/batch-return', verifyToken, verifyActiveUser, async (req, res) => {
  const { outboundIds, remarks } = req.body;

  if (!outboundIds || !Array.isArray(outboundIds) || outboundIds.length === 0) {
    return res.status(400).json({ error: 'Please select at least one borrowed record to return' });
  }

  const connection = await db.getConnection();
  const results = [];
  const errors = [];

  try {
    await connection.beginTransaction();

    for (const outboundId of outboundIds) {
      try {
        // Get outbound record
        const [outboundRecords] = await connection.execute(
          'SELECT * FROM outbound_records WHERE outbound_id = ? FOR UPDATE',
          [outboundId]
        );

        if (outboundRecords.length === 0) {
          errors.push({ outboundId, error: 'Outbound record not found' });
          continue;
        }

        const outbound = outboundRecords[0];

        // Check if belongs to current user
        if (outbound.operator_id !== req.user.userId) {
          errors.push({ outboundId, error: 'No permission to return this item' });
          continue;
        }

        // Check if already returned
        if (outbound.is_returned) {
          errors.push({ outboundId, error: 'Item already returned' });
          continue;
        }

        // Get item information
        const [items] = await connection.execute(
          'SELECT * FROM items WHERE item_id = ? FOR UPDATE',
          [outbound.item_id]
        );

        if (items.length === 0) {
          errors.push({ outboundId, error: 'Item not found' });
          continue;
        }

        const item = items[0];

        // Insert inbound record
        const [inboundResult] = await connection.execute(
          `INSERT INTO inbound_records
           (item_id, unique_code, quantity, inbound_type, related_outbound_id, operator_id, remarks)
           VALUES (?, ?, ?, 'return', ?, ?, ?)`,
          [item.item_id, item.unique_code, outbound.quantity, outboundId, req.user.userId, remarks || null]
        );

        // Update item inventory
        const newQuantity = item.current_quantity + outbound.quantity;
        const newStatus = newQuantity > 0 ? 'in_stock' : 'out_of_stock';

        await connection.execute(
          `UPDATE items
           SET current_quantity = ?,
               total_in = total_in + ?,
               status = ?
           WHERE item_id = ?`,
          [newQuantity, outbound.quantity, newStatus, item.item_id]
        );

        // Update outbound record
        await connection.execute(
          `UPDATE outbound_records
           SET is_returned = TRUE, actual_return_date = CURDATE()
           WHERE outbound_id = ?`,
          [outboundId]
        );

        // Log operation
        await logOperation({
          operationType: 'inbound',
          operatorId: req.user.userId,
          targetType: 'item',
          targetId: item.item_id,
          operationDetail: {
            inboundId: inboundResult.insertId,
            quantity: outbound.quantity,
            inboundType: 'return',
            relatedOutboundId: outboundId,
            newQuantity,
            batchReturn: true
          },
          ipAddress: getClientIP(req)
        });

        results.push({
          outboundId,
          itemId: item.item_id,
          itemName: item.item_name,
          quantity: outbound.quantity,
          success: true
        });
      } catch (error) {
        console.error(`Failed to process outbound record ${outboundId}:`, error);
        errors.push({ outboundId, error: error.message });
      }
    }

    await connection.commit();

    res.json({
      message: `Successfully returned ${results.length} items${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
      results,
      errors
    });
  } catch (error) {
    await connection.rollback();
    console.error('Batch return failed:', error);
    res.status(500).json({ error: 'Batch return failed' });
  } finally {
    connection.release();
  }
});

module.exports = router;
