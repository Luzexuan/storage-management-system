const cron = require('node-cron');
const db = require('../config/database');
const { sendReminderEmail } = require('../utils/emailService');

/**
 * 定时任务：检查未归还的借用记录并发送提醒
 * 每天上午9点执行
 */
cron.schedule('0 9 * * *', async () => {
  console.log('执行归还提醒任务...');

  try {
    // 查询即将到期（3天内）或已逾期的未归还借用
    const [records] = await db.execute(`
      SELECT
        obr.*,
        i.item_name,
        i.unique_code,
        u.username as operator_name,
        u.email as operator_email
      FROM outbound_records obr
      LEFT JOIN items i ON obr.item_id = i.item_id
      LEFT JOIN users u ON obr.operator_id = u.user_id
      WHERE obr.outbound_type = 'borrow'
        AND obr.is_returned = FALSE
        AND obr.expected_return_date <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)
    `);

    console.log(`找到 ${records.length} 条需要提醒的记录`);

    for (const record of records) {
      const daysUntilDue = Math.ceil(
        (new Date(record.expected_return_date) - new Date()) / (1000 * 60 * 60 * 24)
      );

      let subject, message;

      if (daysUntilDue < 0) {
        // 已逾期
        subject = `【逾期提醒】物品归还提醒 - ${record.item_name}`;
        message = `
          您好 ${record.borrower_name}，

          您借用的物品已逾期 ${Math.abs(daysUntilDue)} 天未归还：

          物品名称: ${record.item_name}
          物品编号: ${record.unique_code || 'N/A'}
          借用数量: ${record.quantity}
          预计归还日期: ${record.expected_return_date}

          请尽快归还，谢谢！

          如有疑问，请联系管理员。

          ---
          仓库管理系统
        `;
      } else if (daysUntilDue === 0) {
        // 今天到期
        subject = `【到期提醒】物品归还提醒 - ${record.item_name}`;
        message = `
          您好 ${record.borrower_name}，

          您借用的物品今天到期，请及时归还：

          物品名称: ${record.item_name}
          物品编号: ${record.unique_code || 'N/A'}
          借用数量: ${record.quantity}
          预计归还日期: ${record.expected_return_date}

          谢谢配合！

          ---
          仓库管理系统
        `;
      } else {
        // 即将到期
        subject = `【即将到期】物品归还提醒 - ${record.item_name}`;
        message = `
          您好 ${record.borrower_name}，

          您借用的物品将在 ${daysUntilDue} 天后到期：

          物品名称: ${record.item_name}
          物品编号: ${record.unique_code || 'N/A'}
          借用数量: ${record.quantity}
          预计归还日期: ${record.expected_return_date}

          请提前安排归还事宜，谢谢！

          ---
          仓库管理系统
        `;
      }

      // 发送邮件提醒
      if (record.borrower_email) {
        try {
          await sendReminderEmail(record.borrower_email, subject, message);

          // 记录提醒
          await db.execute(
            `INSERT INTO reminders (outbound_id, reminder_type, recipient, content, is_sent, send_time)
             VALUES (?, 'email', ?, ?, TRUE, NOW())`,
            [record.outbound_id, record.borrower_email, message]
          );

          console.log(`已发送邮件提醒给 ${record.borrower_name} (${record.borrower_email})`);
        } catch (error) {
          console.error(`发送邮件失败 (${record.borrower_email}):`, error);

          // 记录失败的提醒
          await db.execute(
            `INSERT INTO reminders (outbound_id, reminder_type, recipient, content, is_sent)
             VALUES (?, 'email', ?, ?, FALSE)`,
            [record.outbound_id, record.borrower_email, message]
          );
        }
      }

      // TODO: 如果配置了短信服务，也可以发送短信提醒
      // if (record.borrower_phone) {
      //   await sendReminderSMS(record.borrower_phone, message);
      // }
    }

    console.log('归还提醒任务执行完成');
  } catch (error) {
    console.error('归还提醒任务执行失败:', error);
  }
});

console.log('归还提醒定时任务已启动（每天上午9点执行）');
