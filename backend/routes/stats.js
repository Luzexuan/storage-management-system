const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyActiveUser } = require('../middleware/auth');

// 获取总览统计
router.get('/overview', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    // 物品总数
    const [itemCount] = await db.execute('SELECT COUNT(*) as count FROM items');

    // 在库物品数
    const [inStockCount] = await db.execute(
      "SELECT COUNT(*) as count FROM items WHERE status IN ('in_stock', 'partially_out')"
    );

    // 缺货物品数
    const [outOfStockCount] = await db.execute(
      "SELECT COUNT(*) as count FROM items WHERE status = 'out_of_stock'"
    );

    // 未归还借用数
    const [unreturnedCount] = await db.execute(
      "SELECT COUNT(*) as count FROM outbound_records WHERE outbound_type = 'borrow' AND is_returned = FALSE"
    );

    // 逾期未归还数
    const [overdueCount] = await db.execute(
      `SELECT COUNT(*) as count FROM outbound_records
       WHERE outbound_type = 'borrow'
         AND is_returned = FALSE
         AND expected_return_date < CURDATE()`
    );

    // 总库存价值（如果有价格字段的话）
    const [totalQuantity] = await db.execute(
      'SELECT SUM(current_quantity) as total FROM items'
    );

    // 本月入库/出库统计
    const [monthlyStats] = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM inbound_records WHERE MONTH(inbound_time) = MONTH(CURDATE())) as monthly_inbound,
        (SELECT COUNT(*) FROM outbound_records WHERE MONTH(outbound_time) = MONTH(CURDATE())) as monthly_outbound
    `);

    res.json({
      overview: {
        totalItems: itemCount[0].count,
        inStockItems: inStockCount[0].count,
        outOfStockItems: outOfStockCount[0].count,
        unreturnedBorrows: unreturnedCount[0].count,
        overdueBorrows: overdueCount[0].count,
        totalQuantity: totalQuantity[0].total || 0,
        monthlyInbound: monthlyStats[0].monthly_inbound,
        monthlyOutbound: monthlyStats[0].monthly_outbound
      }
    });
  } catch (error) {
    console.error('获取总览统计失败:', error);
    res.status(500).json({ error: '获取总览统计失败' });
  }
});

// 获取分类统计
router.get('/by-category', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const [stats] = await db.execute(`
      SELECT
        c.category_id,
        c.category_name,
        c.level,
        COUNT(i.item_id) as item_count,
        SUM(i.current_quantity) as total_quantity,
        SUM(CASE WHEN i.status = 'in_stock' THEN 1 ELSE 0 END) as in_stock_count,
        SUM(CASE WHEN i.status = 'out_of_stock' THEN 1 ELSE 0 END) as out_of_stock_count
      FROM categories c
      LEFT JOIN items i ON c.category_id = i.category_id
      GROUP BY c.category_id, c.category_name, c.level
      ORDER BY c.level, c.sort_order
    `);

    res.json({ statistics: stats });
  } catch (error) {
    console.error('获取分类统计失败:', error);
    res.status(500).json({ error: '获取分类统计失败' });
  }
});

// 获取入库/出库趋势（最近30天）
router.get('/trends', verifyToken, verifyActiveUser, async (req, res) => {
  const { days = 30 } = req.query;

  try {
    const [inboundTrend] = await db.execute(`
      SELECT DATE(inbound_time) as date, COUNT(*) as count, SUM(quantity) as quantity
      FROM inbound_records
      WHERE inbound_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(inbound_time)
      ORDER BY date
    `, [days]);

    const [outboundTrend] = await db.execute(`
      SELECT DATE(outbound_time) as date, COUNT(*) as count, SUM(quantity) as quantity
      FROM outbound_records
      WHERE outbound_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(outbound_time)
      ORDER BY date
    `, [days]);

    res.json({
      trends: {
        inbound: inboundTrend,
        outbound: outboundTrend
      }
    });
  } catch (error) {
    console.error('获取趋势统计失败:', error);
    res.status(500).json({ error: '获取趋势统计失败' });
  }
});

// 获取热门物品（出入库频次最高）
router.get('/popular-items', verifyToken, verifyActiveUser, async (req, res) => {
  const { limit = 10 } = req.query;

  try {
    const [items] = await db.execute(`
      SELECT
        i.item_id,
        i.item_name,
        i.unique_code,
        c.category_name,
        (i.total_in + i.total_out) as total_operations,
        i.total_in,
        i.total_out,
        i.current_quantity
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.category_id
      WHERE (i.total_in + i.total_out) > 0
      ORDER BY total_operations DESC
      LIMIT ?
    `, [parseInt(limit)]);

    res.json({ items });
  } catch (error) {
    console.error('获取热门物品失败:', error);
    res.status(500).json({ error: '获取热门物品失败' });
  }
});

module.exports = router;
