/**
 * 数据库初始化脚本
 * 用于创建默认管理员账户
 */

const bcrypt = require('bcrypt');
const db = require('../config/database');

async function initDatabase() {
  try {
    console.log('开始初始化数据库...');

    // 创建默认管理员账户
    const adminUsername = 'admin';
    const adminPassword = 'admin123';
    const adminEmail = 'admin@storage.com';

    // 检查管理员是否已存在
    const [existing] = await db.execute(
      'SELECT user_id FROM users WHERE username = ?',
      [adminUsername]
    );

    if (existing.length > 0) {
      console.log('管理员账户已存在，跳过创建');
    } else {
      // 加密密码
      const passwordHash = await bcrypt.hash(adminPassword, 10);

      // 创建管理员
      await db.execute(
        `INSERT INTO users (username, password_hash, email, role, status)
         VALUES (?, ?, ?, 'admin', 'active')`,
        [adminUsername, passwordHash, adminEmail]
      );

      console.log('默认管理员账户创建成功');
      console.log(`用户名: ${adminUsername}`);
      console.log(`密码: ${adminPassword}`);
      console.log('请登录后立即修改默认密码！');
    }

    // 检查是否已有分类
    const [categories] = await db.execute('SELECT COUNT(*) as count FROM categories');

    if (categories[0].count === 0) {
      console.log('创建默认分类...');
      // 分类已在 schema.sql 中定义，这里可以添加子分类
      const [robotCategory] = await db.execute(
        "SELECT category_id FROM categories WHERE category_name = '机器人'"
      );

      if (robotCategory.length > 0) {
        // 添加机器人子分类
        await db.execute(
          `INSERT INTO categories (category_name, parent_id, level, sort_order, description) VALUES
           ('灵巧手', ?, 2, 1, '各型号灵巧手设备'),
           ('移动机器人', ?, 2, 2, '移动式机器人设备')`,
          [robotCategory[0].category_id, robotCategory[0].category_id]
        );

        console.log('默认子分类创建成功');
      }
    } else {
      console.log('分类已存在，跳过创建');
    }

    console.log('\n数据库初始化完成！');
    console.log('\n请配置 .env 文件后启动服务器:');
    console.log('1. 复制 .env.example 为 .env');
    console.log('2. 修改数据库和邮件配置');
    console.log('3. 运行 npm start 启动服务器');

    process.exit(0);
  } catch (error) {
    console.error('数据库初始化失败:', error);
    process.exit(1);
  }
}

initDatabase();
