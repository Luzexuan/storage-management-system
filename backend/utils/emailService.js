const nodemailer = require('nodemailer');
require('dotenv').config();

// 创建邮件传输器
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * 发送归还提醒邮件
 * @param {string} to - 收件人邮箱
 * @param {string} subject - 邮件主题
 * @param {string} text - 邮件内容
 */
async function sendReminderEmail(to, subject, text) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '仓库管理系统 <noreply@storage.com>',
      to,
      subject,
      text
    });

    console.log('邮件发送成功:', info.messageId);
    return info;
  } catch (error) {
    console.error('发送邮件失败:', error);
    throw error;
  }
}

/**
 * 发送用户注册审核通知（给管理员）
 */
async function sendUserRegistrationNotification(adminEmail, username, userEmail) {
  const subject = '【新用户注册】待审核';
  const text = `
    有新用户注册，请及时审核：

    用户名: ${username}
    邮箱: ${userEmail}

    请登录系统进行审核。

    ---
    仓库管理系统
  `;

  return sendReminderEmail(adminEmail, subject, text);
}

/**
 * 发送审核结果通知（给用户）
 */
async function sendApprovalNotification(userEmail, approved) {
  const subject = approved ? '【账户已激活】' : '【账户审核未通过】';
  const text = approved
    ? `
      您的账户已通过审核并激活，现在可以登录系统了。

      ---
      仓库管理系统
    `
    : `
      很抱歉，您的账户审核未通过。

      如有疑问，请联系管理员。

      ---
      仓库管理系统
    `;

  return sendReminderEmail(userEmail, subject, text);
}

module.exports = {
  sendReminderEmail,
  sendUserRegistrationNotification,
  sendApprovalNotification
};
