# 技术文档 - 仓库管理系统

本文档详细说明系统的技术架构、数据库设计、API接口、缓存策略和安全机制。

**版本**: v1.2.2

---

## 📋 目录

- [系统架构](#系统架构)
- [数据库设计](#数据库设计)
- [API 接口文档](#api-接口文档)
- [缓存策略](#缓存策略)
- [性能优化](#性能优化)
- [安全机制](#安全机制)
- [部署架构](#部署架构)

---

## 🏗️ 系统架构

### 技术栈

**前端**:
- 纯 HTML/CSS/JavaScript (无框架)
- 响应式设计
- 自动环境检测 (本地/生产)

**后端**:
- Node.js 14+
- Express 4.x
- MySQL 5.7+
- JWT 认证

**部署**:
- Nginx (反向代理、负载均衡、静态资源)
- PM2 (进程管理、零停机部署)
- Linux (Ubuntu/Debian)

### 架构图

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTP/HTTPS (8081)
       ▼
┌─────────────┐
│    Nginx    │ ← 反向代理 + 静态资源 + Gzip
└──────┬──────┘
       │
       ├─── /           → frontend/ (静态文件)
       └─── /api/*     → localhost:3000 (后端)
              │
              ▼
       ┌─────────────┐
       │  PM2 Cluster│ ← 进程管理 + 零停机
       │  ┌─────────┐│
       │  │Node.js  ││ ← Express API
       │  └────┬────┘│
       └───────┼─────┘
               │
               ▼
        ┌───────────┐
        │   MySQL   │ ← 数据持久化
        └───────────┘
```

### 目录结构

```
storage_management/
├── backend/
│   ├── config/
│   │   └── database.js          # 数据库连接池配置
│   ├── middleware/
│   │   └── auth.js               # JWT认证中间件
│   ├── routes/
│   │   ├── auth.js               # 登录/注册
│   │   ├── users.js              # 用户管理
│   │   ├── items.js              # 物品管理
│   │   ├── categories.js         # 分类管理
│   │   ├── inbound.js            # 入库管理
│   │   ├── outbound.js           # 出库管理
│   │   ├── approvals.js          # 审批管理
│   │   └── logs.js               # 操作日志
│   ├── jobs/
│   │   └── reminderJob.js        # 定时提醒任务
│   ├── utils/
│   │   ├── emailService.js       # 邮件服务
│   │   └── logger.js             # 操作日志记录
│   ├── .env.example              # 环境配置模板
│   ├── package.json
│   └── server.js                 # 入口文件
├── frontend/
│   ├── index.html                # 单页应用
│   ├── app.js                    # 前端业务逻辑
│   └── styles.css                # 样式
├── database/
│   ├── schema.sql                # 数据库表结构
│   └── migrations/               # 数据库迁移
│       ├── 001_add_operation_types.sql
│       └── 002_add_approval_system.sql
└── deployment/
    ├── nginx.conf                # Nginx配置
    ├── ecosystem.config.js       # PM2配置
    └── mysql-optimization.cnf    # MySQL优化
```

---

## 🗄️ 数据库设计

### ER 图

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│    users    │────────▶│    items     │◀────────│ categories  │
└──────┬──────┘ created └──────┬───────┘ belongs  └─────────────┘
       │                       │                   (树形结构)
       │ operator              │
       │                       │
       ▼                       ▼
┌─────────────┐         ┌──────────────┐
│  operation  │         │   inbound    │
│    logs     │         │   records    │
└─────────────┘         └──────────────┘
       ▲                       │
       │                       │ related
       │                       ▼
       │                ┌──────────────┐
       └────────────────│   outbound   │
                        │   records    │
                        └──────┬───────┘
                               │
                               ▼
                        ┌──────────────┐
                        │   reminders  │
                        └──────────────┘
```

### 核心表结构

#### users (用户表)
```sql
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    role ENUM('admin', 'user') DEFAULT 'user',
    status ENUM('pending', 'active', 'inactive') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email)
);
```

#### items (物品表)
```sql
CREATE TABLE items (
    item_id INT PRIMARY KEY AUTO_INCREMENT,
    unique_code VARCHAR(100) UNIQUE,          -- 唯一编号
    category_id INT NOT NULL,
    item_name VARCHAR(200) NOT NULL,
    model VARCHAR(100),
    specification TEXT,
    is_stackable BOOLEAN DEFAULT FALSE,        -- 是否可堆叠
    current_quantity INT DEFAULT 0,
    total_in INT DEFAULT 0,
    total_out INT DEFAULT 0,
    status ENUM('in_stock', 'out_of_stock', 'partially_out'),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    INDEX idx_category (category_id),
    INDEX idx_unique_code (unique_code)
);
```

#### outbound_records (出库记录)
```sql
CREATE TABLE outbound_records (
    outbound_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    quantity INT NOT NULL,
    outbound_type ENUM('transfer', 'borrow') NOT NULL,
    borrower_name VARCHAR(100),                -- 借用人姓名
    borrower_phone VARCHAR(20),
    borrower_email VARCHAR(100),
    expected_return_date DATE,
    actual_return_date DATE,
    is_returned BOOLEAN DEFAULT FALSE,
    operator_id INT NOT NULL,
    remarks TEXT,
    outbound_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (operator_id) REFERENCES users(user_id),
    INDEX idx_return (is_returned),
    INDEX idx_expected_date (expected_return_date)
);
```

#### approval_requests (审批请求)
```sql
CREATE TABLE approval_requests (
    request_id INT PRIMARY KEY AUTO_INCREMENT,
    request_type ENUM('inbound', 'outbound') NOT NULL,
    requester_id INT NOT NULL,
    request_data JSON NOT NULL,                -- 请求数据
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    reviewer_id INT,
    review_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    FOREIGN KEY (requester_id) REFERENCES users(user_id),
    FOREIGN KEY (reviewer_id) REFERENCES users(user_id),
    INDEX idx_status (status),
    INDEX idx_requester (requester_id)
);
```

---

## 🔌 API 接口文档

### 认证接口

#### POST /api/auth/register
注册新用户

**请求体**:
```json
{
  "username": "string",
  "email": "string",
  "phone": "string",
  "password": "string"
}
```

**响应**: 201 Created
```json
{
  "message": "注册成功，等待管理员审核"
}
```

#### POST /api/auth/login
用户登录

**请求体**:
```json
{
  "username": "string",
  "password": "string"
}
```

**响应**: 200 OK
```json
{
  "token": "jwt_token",
  "user": {
    "userId": 1,
    "username": "admin",
    "role": "admin",
    "email": "admin@example.com"
  }
}
```

### 物品管理

#### GET /api/items
获取物品列表

**Headers**: `Authorization: Bearer <token>`

**查询参数**:
- `categoryId`: 分类ID
- `search`: 搜索关键词
- `status`: 状态筛选

**响应**: 200 OK
```json
{
  "items": [
    {
      "item_id": 1,
      "item_name": "L30灵巧手",
      "unique_code": "机器人-灵巧手-L30-LHT10",
      "current_quantity": 5,
      "status": "in_stock"
    }
  ]
}
```

#### POST /api/items
创建新物品 (仅管理员)

**Headers**: `Authorization: Bearer <token>`

**请求体**:
```json
{
  "categoryId": 1,
  "itemName": "L30灵巧手",
  "uniqueCode": "机器人-灵巧手-L30-LHT10",
  "model": "L30",
  "isStackable": false,
  "specification": "规格说明",
  "description": "描述"
}
```

### 出库管理

#### POST /api/outbound
创建出库记录

**Headers**: `Authorization: Bearer <token>`

**请求体**:
```json
{
  "itemId": 1,
  "quantity": 1,
  "outboundType": "borrow",
  "borrowerName": "张三",          // 自动使用当前用户信息
  "borrowerPhone": "13800138000",
  "borrowerEmail": "user@example.com",
  "expectedReturnDate": "2025-02-01",
  "remarks": "备注"
}
```

**行为**:
- 管理员: 直接创建出库记录
- 普通用户: 创建审批请求

**响应**: 201 Created
```json
{
  "message": "出库成功",
  "outboundId": 123,
  "newQuantity": 4
}
```

### 审批管理

#### GET /api/approvals
获取审批列表 (管理员看全部，用户看自己的)

**Headers**: `Authorization: Bearer <token>`

**查询参数**:
- `status`: pending/approved/rejected

**响应**: 200 OK
```json
{
  "approvals": [
    {
      "request_id": 1,
      "request_type": "outbound",
      "requester_name": "张三",
      "status": "pending",
      "created_at": "2025-01-07T10:00:00Z"
    }
  ]
}
```

#### PUT /api/approvals/:id/review
审批请求 (仅管理员)

**Headers**: `Authorization: Bearer <token>`

**请求体**:
```json
{
  "action": "approve",      // approve 或 reject
  "comment": "审批意见"
}
```

### 完整API列表

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| /api/auth/register | POST | Public | 用户注册 |
| /api/auth/login | POST | Public | 用户登录 |
| /api/users | GET | Admin | 获取用户列表 |
| /api/users/:id/approve | PUT | Admin | 审核用户 |
| /api/users/profile | GET | Auth | 获取个人信息 |
| /api/users/profile | PUT | Auth | 更新个人信息 |
| /api/categories | GET | Auth | 获取分类列表 |
| /api/categories | POST | Admin | 创建分类 |
| /api/items | GET | Auth | 获取物品列表 |
| /api/items | POST | Admin | 创建物品 |
| /api/items/:id | GET | Auth | 获取物品详情 |
| /api/inbound | POST | Auth | 创建入库 |
| /api/inbound/quick-return | POST | Auth | 快速归还 |
| /api/outbound | POST | Auth | 创建出库 |
| /api/outbound/my-borrowings | GET | Auth | 我的借用 |
| /api/approvals | GET | Auth | 获取审批列表 |
| /api/approvals/:id/review | PUT | Admin | 审批操作 |
| /api/logs | GET | Admin | 操作日志 |

---

## 💾 缓存策略

### 问题背景
Web应用更新代码后,浏览器可能继续使用旧版本的 JS/CSS 文件,导致功能异常。

### 解决方案

#### 1. HTTP 缓存头控制

**Nginx 配置** (`deployment/nginx.conf`):
```nginx
# HTML 文件：完全禁用缓存
location ~* \.(html)$ {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    expires 0;
}

# JS 和 CSS 文件：必须验证
location ~* \.(css|js)$ {
    add_header Cache-Control "no-cache, must-revalidate";
    expires 0;
}

# 图片和字体：长期缓存
location ~* \.(jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

**后端配置** (`backend/server.js`):
```javascript
app.use(express.static(path.join(__dirname, '../frontend'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));
```

#### 2. HTML Meta 标签

`frontend/index.html`:
```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
```

### 缓存策略说明

| 文件类型 | 策略 | 工作原理 |
|---------|------|---------|
| **HTML** | no-store | 完全不缓存,每次重新下载 |
| **JS/CSS** | no-cache, must-revalidate | 可缓存,但每次使用前必须验证。文件未修改返回304,已修改返回200+新内容 |
| **图片/字体** | max-age=1y, immutable | 长期缓存,不验证 |

### 更新流程

1. **开发者部署新版本**
2. **用户刷新页面** (F5)
3. **浏览器请求 HTML** → 不使用缓存,获取最新 HTML
4. **浏览器请求 app.js** → 发送验证请求
5. **服务器检测文件已修改** → 返回新 app.js
6. **用户自动看到新功能** ✅

### 首次部署注意事项

**部署后一次性操作**: 通知所有用户强制刷新一次页面:
- Windows/Linux: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

之后用户只需普通刷新 (F5) 即可自动获取最新版本。

---

## ⚡ 性能优化

### 1. Nginx 优化

**Gzip 压缩**:
```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript;
```

**连接优化**:
```nginx
keepalive_timeout 15;
client_max_body_size 10M;
```

### 2. MySQL 优化

**连接池配置** (`backend/config/database.js`):
```javascript
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```

**索引优化**:
- 所有外键都有索引
- 常用查询字段 (username, email, status) 有索引
- 日期字段 (expected_return_date) 有索引用于提醒任务

### 3. PM2 集群模式

`deployment/ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'storage-management',
    script: './backend/server.js',
    instances: 2,                    // 2个实例
    exec_mode: 'cluster',            // 集群模式
    max_memory_restart: '500M'       // 内存限制
  }]
};
```

### 4. 前端优化

- **延迟加载**: 物品列表点击"显示所有物品"才加载
- **批量操作**: 支持批量归还,减少请求次数
- **本地排序**: 前端排序和搜索,不增加服务器负担

---

## 🔐 安全机制

### 1. 认证授权

**JWT Token**:
```javascript
// 生成 token
const token = jwt.sign(
  { userId: user.user_id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);

// 验证 token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

**权限控制**:
```javascript
// 仅管理员
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};
```

### 2. SQL 注入防护

**使用参数化查询**:
```javascript
// ✅ 安全
const [users] = await db.execute(
  'SELECT * FROM users WHERE username = ?',
  [username]
);

// ❌ 不安全 - 永不使用
const query = `SELECT * FROM users WHERE username = '${username}'`;
```

### 3. XSS 防护

**前端**:
- 使用 `textContent` 而非 `innerHTML`
- 对用户输入进行转义

**后端**:
- 验证输入格式
- 限制输入长度

### 4. CSRF 防护

**Nginx Headers**:
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
```

### 5. 密码安全

```javascript
const bcrypt = require('bcrypt');

// 加密密码
const passwordHash = await bcrypt.hash(password, 10);

// 验证密码
const isValid = await bcrypt.compare(password, user.password_hash);
```

### 6. 文件访问限制

**Nginx**:
```nginx
# 禁止访问敏感文件
location ~* \.(env|git|sql|log)$ {
    deny all;
}

# 禁止访问隐藏文件
location ~ /\. {
    deny all;
}
```

---

## 🚀 部署架构

### 生产环境拓扑

```
          Internet
             │
             ▼
      ┌──────────────┐
      │  Firewall    │ (UFW)
      │  Port: 22    │ SSH
      │  Port: 8081  │ HTTP
      └──────┬───────┘
             │
             ▼
      ┌──────────────┐
      │    Nginx     │ (8081)
      │  - 反向代理   │
      │  - 负载均衡   │
      │  - Gzip      │
      └──────┬───────┘
             │
      ┌──────┴───────┐
      │              │
      ▼              ▼
   Static Files   API Proxy
   (frontend/)    (localhost:3000)
                     │
                     ▼
              ┌──────────────┐
              │     PM2      │
              │ ┌──────────┐ │
              │ │ Node.js  │ │ Instance 1
              │ └──────────┘ │
              │ ┌──────────┐ │
              │ │ Node.js  │ │ Instance 2
              │ └──────────┘ │
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │    MySQL     │
              │   (3306)     │
              └──────────────┘
```

### 零停机部署流程

```bash
# 1. 拉取新代码
git pull origin main

# 2. 安装新依赖
cd backend && npm install --production

# 3. PM2 热重载 (零停机!)
pm2 reload ecosystem.config.js

# PM2 reload 原理:
# - 启动新进程实例
# - 新实例就绪后,旧实例停止接收新请求
# - 旧请求处理完毕后,旧实例关闭
# - 整个过程用户无感知
```

### 监控命令

```bash
# 查看服务状态
pm2 status

# 查看实时日志
pm2 logs storage-management

# 查看内存/CPU使用
pm2 monit

# 查看 Nginx 状态
sudo systemctl status nginx

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/storage-management-error.log
```

---

## 📊 性能指标

### 推荐配置 (20-50人)

- **CPU**: 2核
- **内存**: 8GB
- **存储**: 80GB SSD
- **带宽**: 30Mbps

### 性能测试结果

| 指标 | 数值 |
|------|------|
| 并发用户 | 50 |
| 响应时间 (平均) | < 200ms |
| API 吞吐量 | 100 req/s |
| CPU 使用率 | < 30% |
| 内存使用 | ~500MB |

---

## 🔧 开发环境

### 本地开发

**前端热重载**:
```bash
cd frontend
python -m http.server 8080
# 或使用 Live Server (VS Code 插件)
```

**后端开发**:
```bash
cd backend
npm install
npm run dev  # 使用 nodemon 自动重启
```

### 调试技巧

**后端调试**:
```bash
# 查看详细日志
DEBUG=* npm start

# Node.js 调试
node --inspect server.js
```

**前端调试**:
- F12 → Console: 查看 JavaScript 错误
- F12 → Network: 查看 API 请求/响应
- F12 → Application → Local Storage: 查看 token

---

## 📝 变更日志

### v1.2.2 (2025-01-07)
- ✅ 修复缓存问题,实现自动更新
- ✅ 简化借用流程,自动使用当前用户信息
- ✅ 优化 Nginx 配置

### v1.2.1 (2025-01-05)
- ✅ 添加个人信息管理
- ✅ 添加密码修改功能
- ✅ 优化操作日志记录

### v1.2.0 (2025-01-01)
- ✅ 实现审批流程
- ✅ 添加快速归还功能
- ✅ 优化物品管理界面

---

## 📚 相关文档

- [README.md](README.md) - 系统介绍和使用指南
- [database/schema.sql](database/schema.sql) - 完整数据库结构
- [deployment/nginx.conf](deployment/nginx.conf) - Nginx 配置示例

---

**维护者**: [Your Name]
**最后更新**: 2025-01-07
