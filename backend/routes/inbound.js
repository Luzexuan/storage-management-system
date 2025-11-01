const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');

// 获取所有入库记录
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

    // 获取总数
    const countSql = sql.replace('SELECT ir.*, i.item_name, i.unique_code as item_code, u.username as operator_name', 'SELECT COUNT(*) as total');
    const [countResult] = await db.execute(countSql, params);
    const total = countResult[0].total;

    // 获取分页数据
    sql += ' ORDER BY ir.inbound_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

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
    console.error('获取入库记录失败:', error);
    res.status(500).json({ error: '获取入库记录失败' });
  }
});

// 创建入库记录（初次入库或归还）
router.post('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { itemId, quantity, inboundType, relatedOutboundId, remarks } = req.body;

  if (!itemId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: '物品ID和数量必须提供且数量大于0' });
  }

  if (!['initial', 'return'].includes(inboundType)) {
    return res.status(400).json({ error: '入库类型必须是initial或return' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 获取物品信息
    const [items] = await connection.execute(
      'SELECT * FROM items WHERE item_id = ? FOR UPDATE',
      [itemId]
    );

    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '物品不存在' });
    }

    const item = items[0];

    // 如果是归还，需要验证关联的出库记录
    if (inboundType === 'return') {
      if (!relatedOutboundId) {
        await connection.rollback();
        return res.status(400).json({ error: '归还时必须提供关联的出库记录ID' });
      }

      // 检查出库记录
      const [outboundRecords] = await connection.execute(
        'SELECT * FROM outbound_records WHERE outbound_id = ?',
        [relatedOutboundId]
      );

      if (outboundRecords.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: '关联的出库记录不存在' });
      }

      if (outboundRecords[0].is_returned) {
        await connection.rollback();
        return res.status(400).json({ error: '该出库记录已标记为归还' });
      }

      // 更新出库记录
      await connection.execute(
        `UPDATE outbound_records
         SET is_returned = TRUE, actual_return_date = CURDATE()
         WHERE outbound_id = ?`,
        [relatedOutboundId]
      );
    }

    // 插入入库记录
    const [result] = await connection.execute(
      `INSERT INTO inbound_records
       (item_id, unique_code, quantity, inbound_type, related_outbound_id, operator_id, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [itemId, item.unique_code, quantity, inboundType, relatedOutboundId || null, req.user.userId, remarks || null]
    );

    // 更新物品库存
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

    // 记录日志
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
      message: '入库成功',
      inboundId: result.insertId,
      newQuantity
    });
  } catch (error) {
    await connection.rollback();
    console.error('入库失败:', error);
    res.status(500).json({ error: '入库失败' });
  } finally {
    connection.release();
  }
});

// 获取单条入库记录详情
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
      return res.status(404).json({ error: '入库记录不存在' });
    }

    res.json({ record: records[0] });
  } catch (error) {
    console.error('获取入库记录详情失败:', error);
    res.status(500).json({ error: '获取入库记录详情失败' });
  }
});

// 批量归还（快速归还功能）
router.post('/batch-return', verifyToken, verifyActiveUser, async (req, res) => {
  const { outboundIds, remarks } = req.body;

  if (!outboundIds || !Array.isArray(outboundIds) || outboundIds.length === 0) {
    return res.status(400).json({ error: '请至少选择一个借用记录进行归还' });
  }

  const connection = await db.getConnection();
  const results = [];
  const errors = [];

  try {
    await connection.beginTransaction();

    for (const outboundId of outboundIds) {
      try {
        // 获取出库记录
        const [outboundRecords] = await connection.execute(
          'SELECT * FROM outbound_records WHERE outbound_id = ? FOR UPDATE',
          [outboundId]
        );

        if (outboundRecords.length === 0) {
          errors.push({ outboundId, error: '出库记录不存在' });
          continue;
        }

        const outbound = outboundRecords[0];

        // 检查是否属于当前用户
        if (outbound.operator_id !== req.user.userId) {
          errors.push({ outboundId, error: '无权归还此物品' });
          continue;
        }

        // 检查是否已归还
        if (outbound.is_returned) {
          errors.push({ outboundId, error: '该物品已归还' });
          continue;
        }

        // 获取物品信息
        const [items] = await connection.execute(
          'SELECT * FROM items WHERE item_id = ? FOR UPDATE',
          [outbound.item_id]
        );

        if (items.length === 0) {
          errors.push({ outboundId, error: '物品不存在' });
          continue;
        }

        const item = items[0];

        // 插入入库记录
        const [inboundResult] = await connection.execute(
          `INSERT INTO inbound_records
           (item_id, unique_code, quantity, inbound_type, related_outbound_id, operator_id, remarks)
           VALUES (?, ?, ?, 'return', ?, ?, ?)`,
          [item.item_id, item.unique_code, outbound.quantity, outboundId, req.user.userId, remarks || null]
        );

        // 更新物品库存
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

        // 更新出库记录
        await connection.execute(
          `UPDATE outbound_records
           SET is_returned = TRUE, actual_return_date = CURDATE()
           WHERE outbound_id = ?`,
          [outboundId]
        );

        // 记录日志
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
        console.error(`处理出库记录 ${outboundId} 失败:`, error);
        errors.push({ outboundId, error: error.message });
      }
    }

    await connection.commit();

    res.json({
      message: `成功归还 ${results.length} 件物品${errors.length > 0 ? `，${errors.length} 件失败` : ''}`,
      results,
      errors
    });
  } catch (error) {
    await connection.rollback();
    console.error('批量归还失败:', error);
    res.status(500).json({ error: '批量归还失败' });
  } finally {
    connection.release();
  }
});

module.exports = router;
