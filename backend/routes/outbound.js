const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');

// 获取所有出库记录
router.get('/', verifyToken, verifyActiveUser, async (req, res) => {
  const { itemId, isReturned, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let sql = `
      SELECT obr.*, i.item_name, i.unique_code as item_code, u.username as operator_name
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

    // Get total count
    const countSql = sql.replace('SELECT obr.*, i.item_name, i.unique_code as item_code, u.username as operator_name', 'SELECT COUNT(*) as total');
    const [countResult] = await db.execute(countSql, params);
    const total = countResult[0].total;

    // Get paginated data
    sql += ' ORDER BY obr.outbound_time DESC LIMIT ? OFFSET ?';
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
    console.error('获取出库记录失败:', error);
    res.status(500).json({ error: '获取出库记录失败' });
  }
});

// 获取未归还的借用记录（用于提醒）
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
    console.error('获取未归还记录失败:', error);
    res.status(500).json({ error: '获取未归还记录失败' });
  }
});

// 获取当前用户可归还的借用记录（用于快速归还）
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
    console.error('获取我的借用记录失败:', error);
    res.status(500).json({ error: '获取我的借用记录失败' });
  }
});

// 创建出库记录（永久转移或暂时借用）
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
    return res.status(400).json({ error: '物品ID和数量必须提供且数量大于0' });
  }

  if (!['transfer', 'borrow'].includes(outboundType)) {
    return res.status(400).json({ error: '出库类型必须是transfer或borrow' });
  }

  // 借用时需要借用人信息和预计归还日期
  if (outboundType === 'borrow') {
    if (!borrowerName || !borrowerPhone || !borrowerEmail || !expectedReturnDate) {
      return res.status(400).json({
        error: '借用时必须提供借用人姓名、电话、邮箱和预计归还日期'
      });
    }
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

    // 检查库存
    if (item.current_quantity < quantity) {
      await connection.rollback();
      return res.status(400).json({
        error: `库存不足，当前库存: ${item.current_quantity}，需要出库: ${quantity}`
      });
    }

    // 插入出库记录
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

    // 更新物品库存
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

    // 记录日志
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
      message: '出库成功',
      outboundId: result.insertId,
      newQuantity
    });
  } catch (error) {
    await connection.rollback();
    console.error('出库失败:', error);
    res.status(500).json({ error: '出库失败' });
  } finally {
    connection.release();
  }
});

// 获取单条出库记录详情
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
      return res.status(404).json({ error: '出库记录不存在' });
    }

    res.json({ record: records[0] });
  } catch (error) {
    console.error('获取出库记录详情失败:', error);
    res.status(500).json({ error: '获取出库记录详情失败' });
  }
});

module.exports = router;
