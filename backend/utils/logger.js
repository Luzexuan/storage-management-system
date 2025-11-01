const db = require('../config/database');

/**
 * 记录操作日志
 * @param {Object} logData - 日志数据
 * @param {string} logData.operationType - 操作类型
 * @param {number} logData.operatorId - 操作人ID
 * @param {string} logData.targetType - 目标类型
 * @param {number} logData.targetId - 目标ID
 * @param {Object} logData.operationDetail - 操作详情
 * @param {string} logData.ipAddress - IP地址
 */
async function logOperation(logData) {
  const {
    operationType,
    operatorId,
    targetType = null,
    targetId = null,
    operationDetail = {},
    ipAddress = null
  } = logData;

  try {
    const sql = `
      INSERT INTO operation_logs
      (operation_type, operator_id, target_type, target_id, operation_detail, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    await db.execute(sql, [
      operationType,
      operatorId,
      targetType,
      targetId,
      JSON.stringify(operationDetail),
      ipAddress
    ]);

    console.log(`操作日志已记录: ${operationType} by user ${operatorId}`);
  } catch (error) {
    console.error('记录操作日志失败:', error);
    // 不抛出错误，避免影响主业务流程
  }
}

/**
 * 获取客户端IP地址
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress;
}

module.exports = {
  logOperation,
  getClientIP
};
