# 仓库管理系统

一个功能完整的仓库管理系统，支持物品入库/出库、借用归还、自动提醒、审批管理等功能。

**版本**: 1.2.2 | **技术栈**: Node.js + Express + MySQL + Nginx | **界面**: 完整图形化界面

---

## 📋 快速导航

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [生产部署](#生产部署)
- [系统使用](#系统使用)
- [常见问题](#常见问题)
- [技术文档](#技术文档)

---

## ✨ 功能特性

### 核心功能
- ✅ **物品管理**：支持分类管理、唯一编号、库存追踪
- ✅ **入库/出库**：借用、转移、归还，支持批量操作
- ✅ **审批流程**：普通用户提交申请，管理员审批
- ✅ **自动提醒**：每日自动发送到期/逾期邮件提醒
- ✅ **操作日志**：完整记录所有操作，可追溯
- ✅ **用户管理**：管理员/普通用户角色，注册审核

### 技术特性
- ✅ **零停机部署**：使用 PM2 实现热重载
- ✅ **智能缓存**：自动更新，用户无需手动清除缓存
- ✅ **性能优化**：Nginx 代理，Gzip 压缩，连接池
- ✅ **安全可靠**：JWT 认证，SQL 注入防护，XSS 防护

---

## 🚀 快速开始

### 环境要求

- Node.js 14+ ([下载](https://nodejs.org/))
- MySQL 5.7+ ([下载](https://dev.mysql.com/downloads/mysql/))
- Git

### 本地开发（5分钟）

#### 1. 克隆项目
```bash
git clone <your-repo-url>
cd storage_management
```

#### 2. 初始化数据库
```bash
# 登录 MySQL
mysql -u root -p

# 创建数据库
CREATE DATABASE storage_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;

# 导入表结构
mysql -u root -p storage_management < database/schema.sql
```

#### 3. 配置并启动后端
```bash
cd backend

# 安装依赖
npm install

# 复制配置文件
cp .env.example .env

# 编辑 .env 文件，修改以下配置：
# DB_PASSWORD=你的MySQL密码
# JWT_SECRET=随机字符串（例如：abc123xyz789）

# 初始化默认管理员
npm run init-db

# 启动后端
npm start
```

#### 4. 启动前端（新终端）
```bash
cd frontend
python -m http.server 8080
```

#### 5. 访问系统
打开浏览器访问：http://localhost:8080

**默认账户**：
- 用户名：`admin`
- 密码：`admin123`

> ⚠️ **重要**：首次登录后请立即修改密码！

---

## 🌐 生产部署

### 服务器要求

**推荐配置（20-50人使用）**：
- CPU: 2核
- 内存: 8GB
- 存储: 80GB SSD
- 系统: Ubuntu 20.04+ / Debian 11+

### 一键部署脚本

```bash
# 1. 安装基础环境
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt update && sudo apt install -y nodejs mysql-server nginx git
sudo npm install -g pm2

# 2. 克隆项目
cd /var/www
sudo git clone <your-repo-url> storage-management
cd storage-management
sudo chown -R $USER:$USER .

# 3. 配置数据库
sudo mysql_secure_installation
sudo mysql -u root -p << EOF
CREATE DATABASE storage_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'storage_user'@'localhost' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON storage_management.* TO 'storage_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
EOF

mysql -u storage_user -p storage_management < database/schema.sql

# 4. 配置后端
cd backend
npm install --production
cp .env.example .env
# 编辑 .env 文件配置数据库和JWT密钥
npm run init-db

# 5. 配置 Nginx
sudo cp /var/www/storage-management/deployment/nginx.conf /etc/nginx/sites-available/storage-management
sudo ln -s /etc/nginx/sites-available/storage-management /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# 6. 启动服务
cd /var/www/storage-management
pm2 start deployment/ecosystem.config.js
pm2 startup
pm2 save

# 7. 配置防火墙
sudo ufw allow 22/tcp
sudo ufw allow 8081/tcp
sudo ufw enable
```

### 访问系统

浏览器访问：http://服务器IP:8081

---

## 📱 系统使用

### 用户注册流程
1. 访问系统，点击"注册"
2. 填写用户名、邮箱、手机号、密码
3. 等待管理员审核
4. 审核通过后即可登录

### 借用物品（普通用户）
1. 侧边栏 → "出库管理" → "新增出库"
2. 选择物品分类和具体物品
3. 选择"暂时借用"
4. **填写预计归还日期**（借用人信息自动使用账号信息）
5. 提交申请，等待管理员审批

### 归还物品（推荐）
1. 侧边栏 → "入库管理" → "快速归还"
2. 系统自动显示您的所有借用记录
3. 勾选要归还的物品（可多选）
4. 点击"确认归还"

### 审批管理（管理员）
1. 侧边栏 → "审批管理"
2. 点击"待审批"查看待处理申请
3. 查看申请详情，选择"通过"或"拒绝"
4. 通过后系统自动创建入库/出库记录

### 自动提醒

系统每天上午 9:00 自动检查并发送邮件：
- 已逾期的借用
- 今天到期的借用
- 3天内即将到期的借用

> 需要在 `.env` 中配置邮件服务才能使用此功能

---

## 🔄 更新部署

### 零停机更新（推荐）

```bash
cd /var/www/storage-management

# 1. 拉取最新代码
git pull origin main

# 2. 安装新依赖（如有）
cd backend
npm install --production

# 3. 更新 Nginx 配置（如有变更）
sudo cp /var/www/storage-management/deployment/nginx.conf /etc/nginx/sites-available/storage-management
sudo nginx -t && sudo systemctl reload nginx

# 4. 零停机重启后端
cd /var/www/storage-management
pm2 reload deployment/ecosystem.config.js
```

### 首次部署后用户操作（仅一次）

通知所有用户强制刷新一次页面以清除旧缓存：
- Windows/Linux: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

之后用户只需普通刷新 (F5) 即可自动获取最新版本。

---

## ❓ 常见问题

### 使用相关

**Q: 借用物品需要填写什么信息？**
A: 只需选择物品和填写预计归还日期。系统会自动使用您的账号信息（用户名、邮箱、手机号）作为借用人信息。

**Q: 如何修改密码？**
A: 登录后，点击侧边栏"个人信息" → 填写当前密码和新密码 → 修改密码。修改后会自动退出，需要用新密码重新登录。

**Q: 申请提交后没有反应？**
A: 普通用户的借用/归还申请需要管理员审批，请耐心等待。

**Q: 没有收到到期提醒邮件？**
A: 请检查：1) 管理员是否配置了邮件服务 2) 借用时填写的邮箱是否正确 3) 查看垃圾邮件箱

### 技术相关

**Q: 更新代码后用户看不到新功能？**
A: 系统已配置自动缓存更新。首次部署后通知用户强制刷新一次（Ctrl+Shift+R），之后会自动获取最新版本。

**Q: 如何查看系统日志？**
A:
```bash
pm2 logs storage-management          # 查看后端日志
sudo tail -f /var/log/nginx/storage-management-error.log  # Nginx 错误日志
```

**Q: 如何备份数据库？**
A:
```bash
mysqldump -u storage_user -p storage_management > backup_$(date +%Y%m%d).sql
```

**Q: 忘记 admin 密码怎么办？**
A:
```bash
cd backend
npm run init-db  # 会重置 admin 密码为 admin123
```

**Q: 端口被占用怎么办？**
A: 修改 `deployment/nginx.conf` 中的 `listen 8081` 为其他端口，然后重载 Nginx 并更新防火墙规则。

---

## 📚 技术文档

详细技术说明请查看 [TECHNICAL.md](TECHNICAL.md)，包含：
- 系统架构
- 数据库设计
- API 接口文档
- 缓存策略
- 性能优化
- 安全机制

---

## 📂 项目结构

```
storage_management/
├── backend/                 # 后端服务
│   ├── routes/             # API 路由
│   ├── middleware/         # 中间件（认证、日志）
│   ├── jobs/               # 定时任务（提醒）
│   ├── utils/              # 工具函数
│   ├── config/             # 配置文件
│   └── server.js           # 入口文件
├── frontend/               # 前端页面
│   ├── index.html          # 主页面
│   ├── app.js              # 前端逻辑
│   └── styles.css          # 样式文件
├── database/               # 数据库
│   ├── schema.sql          # 表结构
│   └── migrations/         # 迁移脚本
├── deployment/             # 部署配置
│   ├── nginx.conf          # Nginx 配置
│   ├── ecosystem.config.js # PM2 配置
│   └── mysql-optimization.cnf  # MySQL 优化
└── README.md               # 本文档
```

---

## 🔧 配置说明

### 后端配置 (.env)

**必填项**：
```env
DB_HOST=localhost
DB_USER=storage_user
DB_PASSWORD=你的数据库密码
DB_NAME=storage_management
JWT_SECRET=随机字符串（建议使用 openssl rand -base64 32 生成）
PORT=3000
```

**可选项（邮件提醒）**：
```env
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=587
EMAIL_USER=your_email@qq.com
EMAIL_PASSWORD=SMTP授权码
EMAIL_FROM=仓库管理系统 <noreply@storage.com>
```

### 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端开发 | 8080 | 本地开发使用 |
| Nginx | 8081 | 生产环境访问端口 |
| 后端 API | 3000 | 后端服务端口 |
| MySQL | 3306 | 数据库端口 |

---

## 🛡️ 安全建议

1. ✅ 首次登录后立即修改 admin 默认密码
2. ✅ 使用强随机字符串作为 JWT_SECRET
3. ✅ 定期备份数据库
4. ✅ 限制数据库用户权限（不使用 root）
5. ✅ 配置防火墙，只开放必要端口
6. ✅ 定期更新系统和依赖包

---

## 📞 技术支持

如遇到问题：
1. 查看 [常见问题](#常见问题) 部分
2. 检查系统日志：`pm2 logs storage-management`
3. 查看技术文档：[TECHNICAL.md](TECHNICAL.md)
4. 提交 Issue 或联系管理员

---

## 📄 许可证

MIT License

---

**版本**: v1.2.2
**最后更新**: 2025-01-07
**维护者**: [Your Name]
