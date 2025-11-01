const db = require('../config/database');

/**
 * 生成物品唯一编号（已弃用 - 现在由用户手动输入）
 * 格式: 一级分类-次级分类1-次级分类2-...-唯一编号
 * 例如: 机器人-灵巧手-L30-LHT10
 * 注：最后的唯一编号是物品在物理世界中自带的编号
 */
async function generateUniqueCode(categoryId, model = '') {
  try {
    // 获取完整分类路径
    const categoryPath = await getCategoryPath(categoryId);

    // 获取该分类下的最大序号
    const [rows] = await db.execute(
      `SELECT unique_code FROM items
       WHERE category_id = ? AND unique_code IS NOT NULL
       ORDER BY unique_code DESC LIMIT 1`,
      [categoryId]
    );

    let nextNumber = 1;
    if (rows.length > 0) {
      // 从最后一个编号中提取序号并+1
      const lastCode = rows[0].unique_code;
      const match = lastCode.match(/-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    // 生成新编号
    const numberStr = String(nextNumber).padStart(3, '0');
    const parts = [...categoryPath];
    if (model) {
      parts.push(model);
    }
    parts.push(numberStr);

    return parts.join('-');
  } catch (error) {
    console.error('生成唯一编号失败:', error);
    throw error;
  }
}

/**
 * 获取分类路径
 */
async function getCategoryPath(categoryId) {
  const path = [];
  let currentId = categoryId;

  while (currentId) {
    const [rows] = await db.execute(
      'SELECT category_name, parent_id FROM categories WHERE category_id = ?',
      [currentId]
    );

    if (rows.length === 0) break;

    path.unshift(rows[0].category_name);
    currentId = rows[0].parent_id;
  }

  return path;
}

/**
 * 检查编号是否唯一
 */
async function isCodeUnique(code) {
  const [rows] = await db.execute(
    'SELECT COUNT(*) as count FROM items WHERE unique_code = ?',
    [code]
  );
  return rows[0].count === 0;
}

module.exports = {
  generateUniqueCode,
  getCategoryPath,
  isCodeUnique
};
