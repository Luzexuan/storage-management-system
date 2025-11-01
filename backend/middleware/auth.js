const jwt = require('jsonwebtoken');

// 验证JWT令牌
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: '未提供访问令牌' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: '无效或过期的令牌' });
  }
};

// 验证管理员权限
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
};

// 验证用户状态
const verifyActiveUser = (req, res, next) => {
  if (req.user.status !== 'active') {
    return res.status(403).json({ error: '账户未激活或已被禁用' });
  }
  next();
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyActiveUser
};
