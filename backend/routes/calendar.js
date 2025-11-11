const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin, verifyActiveUser } = require('../middleware/auth');
const { logOperation, getClientIP } = require('../utils/logger');

// 获取所有日历事件
router.get('/events', verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const { start, end } = req.query;

    let query = `
      SELECT e.*, u.username as creator_name
      FROM calendar_events e
      LEFT JOIN users u ON e.created_by = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (start) {
      query += ' AND e.event_date >= ?';
      params.push(start);
    }

    if (end) {
      query += ' AND e.event_date <= ?';
      params.push(end);
    }

    query += ' ORDER BY e.event_date ASC, e.event_time ASC';

    const [events] = await db.execute(query, params);

    res.json({ events });
  } catch (error) {
    console.error('获取日历事件失败:', error);
    res.status(500).json({ error: '获取日历事件失败' });
  }
});

// 创建日历事件（仅管理员）
router.post('/events', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { title, description, eventDate, eventTime, eventType } = req.body;

    if (!title || !eventDate) {
      return res.status(400).json({ error: '标题和日期不能为空' });
    }

    const [result] = await db.execute(
      `INSERT INTO calendar_events (title, description, event_date, event_time, event_type, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description, eventDate, eventTime, eventType || 'general', req.user.userId]
    );

    // 记录日志
    await logOperation({
      operationType: 'create_event',
      operatorId: req.user.userId,
      targetType: 'calendar_event',
      targetId: result.insertId,
      operationDetail: { title, eventDate },
      ipAddress: getClientIP(req)
    });

    res.status(201).json({
      message: '事件创建成功',
      eventId: result.insertId
    });
  } catch (error) {
    console.error('创建日历事件失败:', error);
    res.status(500).json({ error: '创建日历事件失败' });
  }
});

// 更新日历事件（仅管理员）
router.put('/events/:eventId', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { title, description, eventDate, eventTime, eventType } = req.body;

    if (!title || !eventDate) {
      return res.status(400).json({ error: '标题和日期不能为空' });
    }

    await db.execute(
      `UPDATE calendar_events
       SET title = ?, description = ?, event_date = ?, event_time = ?, event_type = ?
       WHERE event_id = ?`,
      [title, description, eventDate, eventTime, eventType || 'general', eventId]
    );

    // 记录日志
    await logOperation({
      operationType: 'edit_item',
      operatorId: req.user.userId,
      targetType: 'calendar_event',
      targetId: parseInt(eventId),
      operationDetail: { title, eventDate },
      ipAddress: getClientIP(req)
    });

    res.json({ message: '事件更新成功' });
  } catch (error) {
    console.error('更新日历事件失败:', error);
    res.status(500).json({ error: '更新日历事件失败' });
  }
});

// 删除日历事件（仅管理员）
router.delete('/events/:eventId', verifyToken, verifyActiveUser, verifyAdmin, async (req, res) => {
  try {
    const { eventId } = req.params;

    // 获取事件信息用于日志
    const [events] = await db.execute(
      'SELECT title FROM calendar_events WHERE event_id = ?',
      [eventId]
    );

    if (events.length === 0) {
      return res.status(404).json({ error: '事件不存在' });
    }

    await db.execute('DELETE FROM calendar_events WHERE event_id = ?', [eventId]);

    // 记录日志
    await logOperation({
      operationType: 'delete_item',
      operatorId: req.user.userId,
      targetType: 'calendar_event',
      targetId: parseInt(eventId),
      operationDetail: { title: events[0].title },
      ipAddress: getClientIP(req)
    });

    res.json({ message: '事件删除成功' });
  } catch (error) {
    console.error('删除日历事件失败:', error);
    res.status(500).json({ error: '删除日历事件失败' });
  }
});

module.exports = router;
