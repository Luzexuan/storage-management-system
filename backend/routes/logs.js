const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyActiveUser } = require('../middleware/auth');

// Get operation logs (with filters)
router.get('/', verifyToken, verifyActiveUser, async (req, res) => {
  const {
    operationType,
    operatorId,
    targetType,
    startDate,
    endDate,
    page = 1,
    limit = 50
  } = req.query;

  const offset = (page - 1) * limit;

  try {
    let sql = `
      SELECT ol.*, u.username as operator_name
      FROM operation_logs ol
      LEFT JOIN users u ON ol.operator_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (operationType) {
      sql += ' AND ol.operation_type = ?';
      params.push(operationType);
    }

    if (operatorId) {
      sql += ' AND ol.operator_id = ?';
      params.push(operatorId);
    }

    if (targetType) {
      sql += ' AND ol.target_type = ?';
      params.push(targetType);
    }

    if (startDate) {
      sql += ' AND ol.operation_time >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND ol.operation_time <= ?';
      params.push(endDate + ' 23:59:59');
    }

    // Get total count
    const countSql = sql.replace('SELECT ol.*, u.username as operator_name', 'SELECT COUNT(*) as total');
    const [countResult] = await db.execute(countSql, params);
    const total = countResult[0].total;

    // Get paginated data
    sql += ' ORDER BY ol.operation_time DESC LIMIT ? OFFSET ?';
    params.push(Number(limit) || 50, Number(offset) || 0);

    const [logs] = await db.execute(sql, params);

    // Parse JSON fields
    const parsedLogs = logs.map(log => ({
      ...log,
      operation_detail: JSON.parse(log.operation_detail || '{}')
    }));

    res.json({
      logs: parsedLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Failed to get operation logs:', error);
    res.status(500).json({ error: 'Failed to get operation logs' });
  }
});

// Get operation history for a specific target
router.get('/target/:targetType/:targetId', verifyToken, verifyActiveUser, async (req, res) => {
  const { targetType, targetId } = req.params;

  try {
    const [logs] = await db.execute(
      `SELECT ol.*, u.username as operator_name
       FROM operation_logs ol
       LEFT JOIN users u ON ol.operator_id = u.user_id
       WHERE ol.target_type = ? AND ol.target_id = ?
       ORDER BY ol.operation_time DESC`,
      [targetType, targetId]
    );

    const parsedLogs = logs.map(log => ({
      ...log,
      operation_detail: JSON.parse(log.operation_detail || '{}')
    }));

    res.json({ logs: parsedLogs });
  } catch (error) {
    console.error('Failed to get target operation history:', error);
    res.status(500).json({ error: 'Failed to get target operation history' });
  }
});

// Get operation statistics
router.get('/statistics', verifyToken, verifyActiveUser, async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    let sql = `
      SELECT
        operation_type,
        COUNT(*) as count,
        DATE(operation_time) as date
      FROM operation_logs
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      sql += ' AND operation_time >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND operation_time <= ?';
      params.push(endDate + ' 23:59:59');
    }

    sql += ' GROUP BY operation_type, DATE(operation_time) ORDER BY date DESC';

    const [stats] = await db.execute(sql, params);

    res.json({ statistics: stats });
  } catch (error) {
    console.error('Failed to get operation statistics:', error);
    res.status(500).json({ error: 'Failed to get operation statistics' });
  }
});

module.exports = router;
