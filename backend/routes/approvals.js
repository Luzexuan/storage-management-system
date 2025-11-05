const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');

// Get all approval requests (admin only - see all, regular users - see own)
router.get('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { status, requestType } = req.query;
  const isAdmin = req.user.role === 'admin';

  try {
    let sql = `
      SELECT ar.*,
        u1.username as requester_name,
        u2.username as reviewer_name
      FROM approval_requests ar
      LEFT JOIN users u1 ON ar.requester_id = u1.user_id
      LEFT JOIN users u2 ON ar.reviewer_id = u2.user_id
      WHERE 1=1
    `;
    const params = [];

    // Regular users can only see their own requests
    if (!isAdmin) {
      sql += ' AND ar.requester_id = ?';
      params.push(req.user.userId);
    }

    if (status) {
      sql += ' AND ar.status = ?';
      params.push(status);
    }

    if (requestType) {
      sql += ' AND ar.request_type = ?';
      params.push(requestType);
    }

    sql += ' ORDER BY ar.created_at DESC';

    const [requests] = await db.execute(sql, params);

    // Parse JSON data
    requests.forEach(req => {
      if (req.request_data) {
        req.request_data = JSON.parse(req.request_data);
      }
    });

    res.json({ requests });
  } catch (error) {
    console.error('Failed to get approval requests:', error);
    res.status(500).json({ error: 'Failed to get approval requests' });
  }
});

// Create approval request
router.post('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { requestType, requestData } = req.body;

  if (!['inbound', 'outbound'].includes(requestType)) {
    return res.status(400).json({ error: 'Request type must be inbound or outbound' });
  }

  if (!requestData) {
    return res.status(400).json({ error: 'Request data is required' });
  }

  try {
    // Admins don't need approval - they can directly create records
    if (req.user.role === 'admin') {
      return res.status(400).json({ error: 'Admins can directly create records without approval' });
    }

    const [result] = await db.execute(
      `INSERT INTO approval_requests (request_type, requester_id, request_data)
       VALUES (?, ?, ?)`,
      [requestType, req.user.userId, JSON.stringify(requestData)]
    );

    // Log operation
    await logOperation({
      operationType: 'other',
      operatorId: req.user.userId,
      targetType: 'approval_request',
      targetId: result.insertId,
      operationDetail: {
        action: 'create_request',
        requestType,
        requestData
      },
      ipAddress: getClientIP(req)
    });

    res.status(201).json({
      message: 'Approval request created successfully',
      requestId: result.insertId
    });
  } catch (error) {
    console.error('Failed to create approval request:', error);
    res.status(500).json({ error: 'Failed to create approval request' });
  }
});

// Review approval request (admin only)
router.put('/:requestId/review', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  const { requestId } = req.params;
  const { approved, comment } = req.body;

  if (typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'Approved status is required' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Get request details
    const [requests] = await connection.execute(
      'SELECT * FROM approval_requests WHERE request_id = ? FOR UPDATE',
      [requestId]
    );

    if (requests.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const request = requests[0];

    if (request.status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ error: 'Request has already been reviewed' });
    }

    const requestData = JSON.parse(request.request_data);
    const newStatus = approved ? 'approved' : 'rejected';

    // Update request status
    await connection.execute(
      `UPDATE approval_requests
       SET status = ?, reviewer_id = ?, review_comment = ?, reviewed_at = NOW()
       WHERE request_id = ?`,
      [newStatus, req.user.userId, comment || null, requestId]
    );

    // If approved, create the actual inbound/outbound record
    if (approved) {
      if (request.request_type === 'inbound') {
        // Check if this is a "create_unique" mode (new unique code item)
        if (requestData.mode === 'create_unique') {
          // Create new item with unique code
          const [itemResult] = await connection.execute(
            `INSERT INTO items
             (unique_code, item_name, category_id, model, specification, is_stackable, current_quantity, total_in, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              requestData.uniqueCode,
              requestData.itemName,
              requestData.categoryId,
              requestData.model || null,
              requestData.specification || null,
              requestData.isStackable ? 1 : 0,
              requestData.initialStock || 1,
              requestData.initialStock || 1,
              'in_stock'
            ]
          );

          const newItemId = itemResult.insertId;

          // Create inbound record for the new item
          const [inboundResult] = await connection.execute(
            `INSERT INTO inbound_records (item_id, quantity, inbound_type, operator_id, remarks)
             VALUES (?, ?, ?, ?, ?)`,
            [
              newItemId,
              requestData.initialStock || 1,
              'initial',
              request.requester_id,
              requestData.remarks || null
            ]
          );

          // Log operation
          await logOperation({
            operationType: 'inbound',
            operatorId: req.user.userId,
            targetType: 'item',
            targetId: newItemId,
            operationDetail: {
              action: 'approved_create_unique_item',
              itemId: newItemId,
              uniqueCode: requestData.uniqueCode,
              inboundId: inboundResult.insertId,
              quantity: requestData.initialStock || 1,
              requestId: parseInt(requestId)
            },
            ipAddress: getClientIP(req)
          });
        } else if (requestData.mode === 'update_stackable') {
          // Update existing stackable item
          const [inboundResult] = await connection.execute(
            `INSERT INTO inbound_records (item_id, quantity, inbound_type, related_outbound_id, operator_id, remarks)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              requestData.itemId,
              requestData.quantity,
              requestData.inboundType,
              requestData.relatedOutboundId || null,
              request.requester_id,  // Original requester as operator
              requestData.remarks || null
            ]
          );

          // Update item quantity and status
          await connection.execute(
            `UPDATE items
             SET current_quantity = current_quantity + ?,
                 total_in = total_in + ?,
                 status = CASE
                   WHEN current_quantity + ? > 0 THEN 'in_stock'
                   ELSE status
                 END
             WHERE item_id = ?`,
            [requestData.quantity, requestData.quantity, requestData.quantity, requestData.itemId]
          );

          // If it's a return, update outbound record
          if (requestData.inboundType === 'return' && requestData.relatedOutboundId) {
            await connection.execute(
              `UPDATE outbound_records
               SET is_returned = TRUE, actual_return_date = CURDATE()
               WHERE outbound_id = ?`,
              [requestData.relatedOutboundId]
            );
          }

          // Log operation
          await logOperation({
            operationType: 'inbound',
            operatorId: req.user.userId,
            targetType: 'item',
            targetId: requestData.itemId,
            operationDetail: {
              action: 'approved_inbound',
              inboundId: inboundResult.insertId,
              quantity: requestData.quantity,
              inboundType: requestData.inboundType,
              requestId: parseInt(requestId)
            },
            ipAddress: getClientIP(req)
          });
        } else {
          // Legacy mode: direct item update (backward compatibility)
          const [inboundResult] = await connection.execute(
            `INSERT INTO inbound_records (item_id, quantity, inbound_type, related_outbound_id, operator_id, remarks)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              requestData.itemId,
              requestData.quantity,
              requestData.inboundType,
              requestData.relatedOutboundId || null,
              request.requester_id,
              requestData.remarks || null
            ]
          );

          await connection.execute(
            `UPDATE items
             SET current_quantity = current_quantity + ?,
                 total_in = total_in + ?,
                 status = CASE
                   WHEN current_quantity + ? > 0 THEN 'in_stock'
                   ELSE status
                 END
             WHERE item_id = ?`,
            [requestData.quantity, requestData.quantity, requestData.quantity, requestData.itemId]
          );

          if (requestData.inboundType === 'return' && requestData.relatedOutboundId) {
            await connection.execute(
              `UPDATE outbound_records
               SET is_returned = TRUE, actual_return_date = CURDATE()
               WHERE outbound_id = ?`,
              [requestData.relatedOutboundId]
            );
          }

          await logOperation({
            operationType: 'inbound',
            operatorId: req.user.userId,
            targetType: 'item',
            targetId: requestData.itemId,
            operationDetail: {
              action: 'approved_inbound',
              inboundId: inboundResult.insertId,
              quantity: requestData.quantity,
              inboundType: requestData.inboundType,
              requestId: parseInt(requestId)
            },
            ipAddress: getClientIP(req)
          });
        }
      } else if (request.request_type === 'outbound') {
        // Create outbound record
        const [outboundResult] = await connection.execute(
          `INSERT INTO outbound_records
           (item_id, quantity, outbound_type, borrower_name, borrower_phone, borrower_email,
            expected_return_date, operator_id, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            requestData.itemId,
            requestData.quantity,
            requestData.outboundType,
            requestData.borrowerName || null,
            requestData.borrowerPhone || null,
            requestData.borrowerEmail || null,
            requestData.expectedReturnDate || null,
            request.requester_id,  // Original requester as operator
            requestData.remarks || null
          ]
        );

        // Update item quantity and status
        await connection.execute(
          `UPDATE items
           SET current_quantity = current_quantity - ?,
               total_out = total_out + ?,
               status = CASE
                 WHEN current_quantity - ? <= 0 THEN 'out_of_stock'
                 WHEN current_quantity - ? < current_quantity THEN 'partially_out'
                 ELSE status
               END
           WHERE item_id = ?`,
          [requestData.quantity, requestData.quantity, requestData.quantity, requestData.quantity, requestData.itemId]
        );

        // Log operation
        await logOperation({
          operationType: 'outbound',
          operatorId: req.user.userId,
          targetType: 'item',
          targetId: requestData.itemId,
          operationDetail: {
            action: 'approved_outbound',
            outboundId: outboundResult.insertId,
            quantity: requestData.quantity,
            outboundType: requestData.outboundType,
            requestId: parseInt(requestId)
          },
          ipAddress: getClientIP(req)
        });
      }
    }

    await connection.commit();

    res.json({
      message: approved ? 'Request approved and processed successfully' : 'Request rejected',
      status: newStatus
    });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to review approval request:', error);
    res.status(500).json({ error: 'Failed to review approval request' });
  } finally {
    connection.release();
  }
});

// Get pending approval count (for badge/notification)
router.get('/pending/count', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const [result] = await db.execute(
      'SELECT COUNT(*) as count FROM approval_requests WHERE status = ?',
      ['pending']
    );

    res.json({ count: result[0].count });
  } catch (error) {
    console.error('Failed to get pending approval count:', error);
    res.status(500).json({ error: 'Failed to get pending approval count' });
  }
});

module.exports = router;
