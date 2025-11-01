# 仓库管理系统

一个功能完整的仓库管理系统，支持物品入库/出库、快速归还、操作追溯、分类管理等功能。

**版本**: 1.2.0 | **技术栈**: Node.js + Express + MySQL | **界面**: 完整图形化界面

---

## 📋 目录

- [快速开始](#快速开始)
- [系统功能](#系统功能)
- [生产部署](#生产部署)
- [端口说明](#端口说明)
- [常见问题](#常见问题)

---

## 快速开始

### 环境要求

- Node.js 14+ （[下载地址](https://nodejs.org/)）
- MySQL 5.7+ （[下载地址](https://dev.mysql.com/downloads/mysql/)）

**验证安装**：
```bash
node --version    # 应该显示 v14.0.0 或更高
mysql --version   # 应该显示 MySQL 5.7 或更高
```

### 安装步骤

#### 1. 创建数据库

```bash
# 登录 MySQL（Windows用户可能需要先启动 MySQL 服务）
mysql -u root -p

# 输入密码后，执行以下命令：
CREATE DATABASE storage_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit

# 导入表结构
mysql -u root -p storage_management < database/schema.sql
```

#### 2. 安装依赖

```bash
cd backend
npm install
```

#### 3. 配置环境变量

```bash
cp .env.example .env
# 用文本编辑器打开 .env 并修改配置
```

**必填配置**：
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=你的MySQL密码        # ⬅️ 修改这里
DB_NAME=storage_management
JWT_SECRET=abc123xyz789          # ⬅️ 随机字符串
```

**可选配置**（邮件提醒功能）：
```env
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=587
EMAIL_USER=your_email@qq.com
EMAIL_PASSWORD=SMTP授权码         # 不是邮箱密码！
```

> **邮件说明**：系统用配置的邮箱发送提醒给借用人填写的邮箱。不配置也能正常运行，只是没有自动提醒。

#### 4. 初始化数据

```bash
npm run init-db
```

成功后会显示：
```
✓ 默认管理员创建成功
  用户名: admin
  密码: admin123
```

#### 5. 启动系统

```bash
# 启动后端（在 backend 目录）
npm start

# 启动前端（新开命令行窗口，在 frontend 目录）
cd ../frontend
python -m http.server 8080
```

#### 6. 访问系统

打开浏览器访问：**http://localhost:8080**

使用默认账户登录：
- 用户名：`admin`
- 密码：`admin123`

**⚠️ 重要**：首次登录后请立即修改密码！

---

## 系统功能

### 1. 用户管理

#### 两种角色
- **管理员**：完全权限，审核用户，管理分类
- **普通用户**：添加物品，借用/归还物品，查看记录

#### 注册流程
1. 新用户注册（填写用户名、邮箱、手机号、密码）
2. 等待管理员审核
3. 审核通过后可以登录

#### 个人信息管理
- 查看个人信息（用户名、角色、状态、注册时间）
- 修改联系方式（邮箱、手机号）
- 修改密码（需验证当前密码，修改后自动退出）

**位置**：侧边栏 → "个人信息"

### 2. 物品管理

#### 添加物品
1. 点击"新增物品"
2. 从下拉列表选择分类
3. 填写物品信息：
   - **物品名称**：如"L30灵巧手"
   - **型号**：如"L30"
   - **唯一编号**（重要）：
     - 格式：`一级分类-次级分类-型号-设备编号`
     - 示例：`机器人-灵巧手-L30-LHT10`
     - 说明：最后的 `LHT10` 是设备出厂编号或实物编号
     - 可堆叠物品（如螺丝）无需唯一编号
   - 规格参数、描述

#### 查看物品
- 列表展示所有物品
- 搜索功能
- 查看详情
- 查看库存和借用状态

### 3. 入库/出库

#### 借用流程
1. 选择要借用的物品
2. 填写借用信息：
   - 借用人姓名
   - 借用人手机号
   - **借用人邮箱**（接收归还提醒）
   - 预计归还日期
3. 确认借用

#### 快速归还（推荐）
1. 点击"快速归还"按钮
2. 系统自动显示你的所有借用记录
3. 勾选要归还的物品（可多选）
4. 点击"确认归还"完成

### 4. 分类管理

#### 查看分类
- 所有用户都可查看分类树
- 树形结构展示，带层级缩进

#### 管理分类（管理员专属）

**新增一级分类**：
1. 点击"新增分类"按钮
2. 填写分类名称、描述、排序顺序
3. 点击"创建"

**添加子分类**：
1. 找到父分类，点击"添加子分类"按钮
2. 填写子分类信息
3. 点击"创建"

**编辑分类**：
1. 点击分类旁的"编辑"按钮
2. 修改名称、描述或排序
3. 点击"保存"

**删除分类**：
1. 点击分类旁的"删除"按钮
2. 确认删除

**限制**：
- 如果分类下有子分类，必须先删除子分类
- 如果分类下有物品，无法删除

**位置**：侧边栏 → "分类管理"

### 5. 自动提醒

系统每天上午9点自动检查：
- 已逾期未归还的物品
- 今天到期的物品
- 3天内即将到期的物品

**提醒方式**：
- 发送邮件到借用人填写的邮箱
- 需要配置邮件服务（见上面的环境变量配置）

### 6. 操作日志

系统自动记录所有操作：
- 谁操作的（用户名）
- 什么时间
- 操作了什么（入库、出库、编辑等）
- 从哪个IP地址
- 完整的操作详情

**位置**：侧边栏 → "操作日志"

---

## 生产部署

### 服务器要求

**推荐配置（20-50人）**：
- CPU：2核
- 内存：8GB
- 存储：80GB SSD
- 带宽：30Mbps

> **说明**：2核/8GB 配置对于 20 人使用有 4-8 倍冗余，完全够用。

### 部署步骤

#### 1. 安装环境（Ubuntu/Debian）

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 MySQL
sudo apt install -y mysql-server

# 安装 Nginx
sudo apt install -y nginx

# 安装 PM2（进程管理器）
sudo npm install -g pm2
```

#### 2. 配置 MySQL

```bash
# 运行安全配置
sudo mysql_secure_installation

# 登录并创建数据库
sudo mysql -u root -p

CREATE DATABASE storage_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'storage_user'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON storage_management.* TO 'storage_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# 应用优化配置
sudo cp deployment/mysql-optimization.cnf /etc/mysql/mysql.conf.d/storage-optimization.cnf
sudo systemctl restart mysql
```

#### 3. 部署代码

```bash
# 上传代码到服务器
cd /var/www
sudo git clone https://your-repo-url/storage-management.git
cd storage-management

# 安装依赖
cd backend
npm install --production

# 配置环境变量
cp .env.example .env
nano .env  # 修改配置

# 导入数据库
mysql -u storage_user -p storage_management < ../database/schema.sql

# 初始化数据
npm run init-db
```

#### 4. 使用 PM2 启动

```bash
cd /var/www/storage-management

# 启动应用
pm2 start deployment/ecosystem.config.js

# 查看状态
pm2 status

# 设置开机自启
pm2 startup
pm2 save
```

#### 5. 配置 Nginx

```bash
# 复制配置
sudo cp deployment/nginx.conf /etc/nginx/sites-available/storage-management

# 修改配置
sudo nano /etc/nginx/sites-available/storage-management
# 修改 server_name 和 root 路径

# 启用配置
sudo ln -s /etc/nginx/sites-available/storage-management /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# 测试并重启
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

#### 6. 配置防火墙

```bash
sudo ufw allow 8081/tcp    # 仓库管理系统（避开80端口）
sudo ufw allow 443/tcp     # HTTPS（可选）
sudo ufw allow 22/tcp      # SSH
sudo ufw enable
```

> **端口说明**：使用 8081 端口，避免与其他服务冲突（如 Dify 占用 80 端口）

#### 7. 访问系统

打开浏览器访问：`http://你的服务器IP:8081`

### 在线升级（零停机）

**方法一：自动升级脚本**

```bash
cd /var/www/storage-management
chmod +x deployment/upgrade.sh
./deployment/upgrade.sh
```

脚本会自动：
- 备份数据库和代码
- 拉取最新代码
- 安装依赖
- 零停机重启
- 健康检查
- 失败自动回滚

**方法二：手动升级**

```bash
cd /var/www/storage-management

# 1. 备份数据库
mysqldump -u storage_user -p storage_management > backup_$(date +%Y%m%d).sql

# 2. 更新代码
git pull origin main

# 3. 安装依赖
cd backend
npm install --production

# 4. 零停机重启（关键！）
pm2 reload ecosystem.config.js --update-env

# 5. 检查状态
pm2 status
```

**零停机原理**：
- PM2 的 `reload` 命令先启动新进程
- 等新进程就绪后再关闭旧进程
- 始终保持有进程在处理请求
- 用户感知不到停机

> **注意**：日常更新都可以零停机升级，只有重大架构变更才需要停机。

---

## 端口说明

### 端口使用表

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端开发服务 | 8080 | 本地开发时使用（`python -m http.server 8080`） |
| Nginx Web服务 | 8081 | 生产环境（避开80端口） |
| 后端 API | 3000 | Node.js 后端（PM2 管理） |
| MySQL 数据库 | 3306 | MySQL 默认端口（内网访问） |

**已避开的端口**：
- 80: Dify 服务
- 8080: 常用开发端口

### 本地开发环境

**启动方式**：
```bash
# 1. 启动后端（在 backend 目录）
npm start
# → 监听: http://localhost:3000

# 2. 启动前端（在 frontend 目录）
python -m http.server 8080
# → 访问: http://localhost:8080
# → API 自动使用: http://localhost:3000/api
```

**API 路径检测**：
- 访问地址：`http://localhost:8080`
- 检测条件：`hostname === 'localhost'`
- API 路径：`http://localhost:3000/api`（绝对路径）

### 生产环境

**访问方式**：
```bash
# 访问地址
http://服务器IP:8081

# API 路径（通过 Nginx 代理）
http://服务器IP:8081/api → http://localhost:3000
```

**API 路径检测**：
- 访问地址：`http://服务器IP:8081`
- 检测条件：`hostname !== 'localhost'`
- API 路径：`/api`（相对路径，由 Nginx 代理到 localhost:3000）

### 修改端口

**如果想改用其他端口（如 8082）**：

1. 修改 Nginx 配置：
   ```bash
   sudo nano /etc/nginx/sites-available/storage-management
   # 将 listen 8081 改为 listen 8082
   ```

2. 重启 Nginx：
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   ```

3. 更新防火墙：
   ```bash
   sudo ufw delete allow 8081/tcp
   sudo ufw allow 8082/tcp
   ```

### 快速验证

**本地开发环境验证**：
1. 启动后端：`cd backend && npm start`
2. 启动前端：`cd frontend && python -m http.server 8080`
3. 访问：`http://localhost:8080`
4. 按 F12 查看 Network：应该是 `http://localhost:3000/api/...`

**生产环境验证**：
1. 部署完成后访问：`http://服务器IP:8081`
2. 按 F12 查看 Network：应该是 `http://服务器IP:8081/api/...`

### 部署检查清单

生产环境部署前请确认：

- [ ] 修改 `.env` 中的数据库密码
- [ ] 修改 `.env` 中的 `JWT_SECRET`
- [ ] 创建数据库并导入 `schema.sql`
- [ ] 执行 `npm run init-db`
- [ ] 启动 PM2: `pm2 start deployment/ecosystem.config.js`
- [ ] 配置 Nginx（端口 8081）
- [ ] 开放防火墙端口 8081: `sudo ufw allow 8081/tcp`
- [ ] 访问 `http://服务器IP:8081` 测试
- [ ] 登录 `admin/admin123` 并立即修改密码

---

## 常见问题

### 使用相关

**Q1: 唯一编号是什么？必须填吗？**

A: 唯一编号用于标识具体的物品。
- **非堆叠物品**（如机器人、电脑）**必须填写**
- **可堆叠物品**（如螺丝、电线）**不需要填写**
- 格式：`一级分类-次级分类-型号-设备编号`
- 例如：`机器人-灵巧手-L30-LHT10`，其中 `LHT10` 是设备出厂编号

**Q2: 如何修改密码？**

A:
1. 登录后，点击侧边栏"个人信息"
2. 在"修改密码"区域填写：
   - 当前密码
   - 新密码（至少6位）
   - 确认密码
3. 点击"修改密码"
4. 成功后会自动退出，用新密码重新登录

**Q3: 如何添加新分类？**

A: （仅管理员）
1. 点击侧边栏"分类管理"
2. 点击"新增分类"按钮（一级分类）
3. 或点击某个分类旁的"添加子分类"按钮（子分类）
4. 填写信息并保存

**Q4: 快速归还和手动归还有什么区别？**

A: 快速归还自动显示借用列表，支持批量操作；手动归还需要知道出库记录ID。推荐使用快速归还。

**Q5: 可堆叠物品和非堆叠物品有什么区别？**

A:
- **非堆叠物品**：每个都有唯一编号，单独管理（如机器人）
- **可堆叠物品**：按数量管理，无需唯一编号（如螺丝）

### 技术相关

**Q6: 邮件配置是必须的吗？**

A: 不是必须的。
- **不配置邮件**：系统正常运行，只是没有自动提醒
- **配置邮件**：系统会自动发送归还提醒

**Q7: 如何获取QQ邮箱的SMTP授权码？**

A:
1. 登录QQ邮箱网页版
2. 设置 → 账户
3. 找到"POP3/IMAP/SMTP服务"
4. 开启"IMAP/SMTP服务"
5. 按提示发送短信，获得授权码
6. 将授权码填入 `.env` 的 `EMAIL_PASSWORD`

**Q8: 启动后端时报错"ER_ACCESS_DENIED_ERROR"**

A: 数据库连接失败，检查：
1. MySQL服务是否启动
2. `.env` 中的数据库密码是否正确
3. 数据库是否已创建

**Q9: 前端访问显示空白页面**

A: 检查：
1. 浏览器控制台是否有错误（按F12查看）
2. 后端是否运行（访问 `http://localhost:3000/health`）
3. 是否启动了前端服务器

**Q10: 升级时需要停机吗？**

A: 不需要！使用 `pm2 reload` 命令可以零停机升级，适用于99%的更新场景。

**Q11: 忘记admin密码怎么办？**

A: 重新执行初始化：
```bash
cd backend
npm run init-db
```
会重置admin密码为 `admin123`。

**Q12: 点击页面提示"获取XXX信息失败"**

A:
1. 按F12打开开发者工具，查看Console标签的错误信息
2. 查看Network标签，检查API请求的响应
3. 检查后端是否正常运行
4. 检查数据库连接是否正常

常见错误：
- `401 Unauthorized` → Token过期，重新登录
- `403 Forbidden` → 权限不足
- `500 Internal Server Error` → 后端错误，查看后端日志
- `Network Error` → 后端未启动或端口错误

**Q13: 20人使用需要什么配置的服务器？**

A:
- **最低配置**：1核CPU + 2GB内存
- **推荐配置**：2核CPU + 8GB内存（可支持50-100人）
- 2核8GB配置有4-8倍冗余,完全够用

**Q14: 为什么使用 8081 端口而不是 80 端口？**

A: 80 端口已被其他服务（如 Dify）占用，使用 8081 端口可以避免冲突。如需使用其他端口，参考"端口说明"章节。

**Q15: 访问时提示 "Failed to fetch" 或连接失败？**

A: 检查以下几点：
1. Nginx 是否启动：`sudo systemctl status nginx`
2. PM2 后端是否运行：`pm2 status`
3. 防火墙是否开放 8081 端口：`sudo ufw status`
4. 浏览器控制台 (F12) 查看具体错误信息
5. 检查 Network 标签中 API 请求的地址是否正确

**Q16: 本地开发时访问不了后端 API？**

A: 确保：
1. 后端正在运行：`npm start`
2. 访问的是 `localhost:8080`，不是其他地址
3. 检查 `backend/.env` 中的 `PORT=3000`
4. 浏览器 F12 → Network，确认请求的是 `http://localhost:3000/api`

**Q17: 从旧版本（v1.1.0）升级到 v1.2.0 需要注意什么？**

A:
1. 拉取最新代码：`git pull origin main`
2. 安装依赖（如有新增）：`cd backend && npm install`
3. 零停机重启：`pm2 reload ecosystem.config.js`
4. 刷新浏览器（清除缓存）
5. 无需数据库迁移

---

## 项目结构

```
storage_management/
├── database/
│   └── schema.sql              # 数据库表结构
├── backend/
│   ├── routes/                 # API路由
│   │   ├── auth.js            # 登录注册
│   │   ├── users.js           # 用户管理（含个人信息修改）
│   │   ├── items.js           # 物品管理
│   │   ├── categories.js      # 分类管理（增删改查）
│   │   ├── inbound.js         # 入库（含批量归还）
│   │   ├── outbound.js        # 出库（含借用列表）
│   │   └── ...
│   ├── jobs/
│   │   └── reminderJob.js     # 定时提醒任务
│   ├── utils/
│   │   └── emailService.js    # 邮件发送服务
│   ├── .env.example           # 配置模板
│   └── server.js              # 入口文件
├── frontend/
│   ├── index.html             # 前端页面（含所有功能）
│   ├── styles.css             # 样式
│   └── app.js                 # 前端逻辑
├── deployment/                # 部署配置
│   ├── mysql-optimization.cnf # MySQL优化
│   ├── ecosystem.config.js    # PM2配置
│   ├── nginx.conf             # Nginx配置
│   └── upgrade.sh             # 升级脚本
└── README.md                  # 本文档
```

---

## 技术支持

**查看日志**：
```bash
# 后端日志
pm2 logs storage-management

# Nginx日志
sudo tail -f /var/log/nginx/storage-management-error.log
```

**常用命令**：
```bash
# PM2管理
pm2 status                     # 查看状态
pm2 restart storage-management # 重启
pm2 reload storage-management  # 零停机重启

# MySQL管理
sudo systemctl status mysql    # 查看状态
sudo systemctl restart mysql   # 重启

# Nginx管理
sudo nginx -t                  # 测试配置
sudo systemctl restart nginx   # 重启
```

---

## 功能特性总结

- ✅ **完整的图形界面**：所有功能都可通过UI操作，无需使用API
- ✅ **个人信息管理**：修改密码、邮箱、手机号
- ✅ **分类管理界面**：管理员可通过UI增删改分类
- ✅ **快速归还**：一键查看并归还借用物品
- ✅ **零停机升级**：在线更新不影响用户使用
- ✅ **自动提醒**：邮件提醒逾期和即将到期的借用
- ✅ **操作追溯**：完整记录所有操作日志
- ✅ **用户审核**：管理员审核新用户注册
- ✅ **权限控制**：管理员/普通用户分级管理

---

**版本**: 1.2.0
**最后更新**: 2025-10-29
**许可证**: MIT
