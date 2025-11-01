# 仓库管理系统

一个功能完整的仓库管理系统，支持物品入库/出库、快速归还、操作追溯、分类管理等功能。

**版本**: 1.2.1 | **技术栈**: Node.js + Express + MySQL | **界面**: 完整图形化界面

---

## 📋 目录

- [端口说明](#端口说明)
- [本地开发](#本地开发)
- [生产部署](#生产部署)
- [系统功能](#系统功能)
- [常见问题](#常见问题)

---

## 端口说明

### 端口使用表

| 服务 | 端口 | 使用场景 |
|------|------|----------|
| 前端开发服务 | 8080 | 本地开发 |
| Nginx Web服务 | 8081 | 生产环境 |
| 后端 API | 3000 | 本地开发 + 生产环境 |
| MySQL 数据库 | 3306 | 本地开发 + 生产环境 |

**端口选择说明**：
- **8081**（生产环境 Web 端口）：避开 80 端口（已被 Dify 等服务占用）
- **8080**（本地开发端口）：常用开发端口，便于本地测试

### API 路径自动检测

前端代码会自动检测运行环境：

**本地开发**：
- 访问地址：`http://localhost:8080`
- API 路径：`http://localhost:3000/api`（绝对路径）

**生产环境**：
- 访问地址：`http://服务器IP:8081`
- API 路径：`/api`（相对路径，由 Nginx 代理到后端）

---

## 本地开发

### 环境要求

- **Node.js 14+** （[下载地址](https://nodejs.org/)）
- **MySQL 5.7+** （[下载地址](https://dev.mysql.com/downloads/mysql/)）

**验证安装**：
```bash
node --version    # 应显示 v14.0.0 或更高
mysql --version   # 应显示 MySQL 5.7 或更高
```

### 快速启动（5步）

#### 步骤1：创建数据库

```bash
# 登录 MySQL（Windows 用户可能需要先启动 MySQL 服务）
mysql -u root -p

# 在 MySQL 命令行中执行：
CREATE DATABASE storage_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

#### 步骤2：导入表结构

```bash
# 在项目根目录执行
mysql -u root -p storage_management < database/schema.sql
```

#### 步骤3：配置后端

```bash
# 进入后端目录
cd backend

# 安装依赖
npm install

# 复制配置文件
cp .env.example .env

# 用文本编辑器打开 .env，修改以下配置：
```

**.env 必填配置**：
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=你的MySQL密码        # ⬅️ 改成你的 MySQL root 密码
DB_NAME=storage_management
JWT_SECRET=请改成随机字符串       # ⬅️ 例如：abc123xyz789qwerty
PORT=3000
```

**.env 可选配置**（邮件提醒功能）：
```env
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=587
EMAIL_USER=your_email@qq.com
EMAIL_PASSWORD=SMTP授权码         # 不是邮箱密码！是 SMTP 授权码
```

> **邮件说明**：不配置也能正常使用，只是没有自动邮件提醒功能。

#### 步骤4：初始化数据

```bash
# 在 backend 目录执行
npm run init-db
```

成功后会显示：
```
✓ 默认管理员创建成功
  用户名: admin
  密码: admin123
```

#### 步骤5：启动服务

**终端1 - 启动后端**：
```bash
# 在 backend 目录
npm start

# 看到以下输出表示成功：
# 后端服务运行在 http://localhost:3000
```

**终端2 - 启动前端**：
```bash
# 在 frontend 目录
cd ../frontend
python -m http.server 8080

# 看到以下输出表示成功：
# Serving HTTP on 0.0.0.0 port 8080
```

### 访问系统

打开浏览器访问：**http://localhost:8080**

**默认账户**：
- 用户名：`admin`
- 密码：`admin123`

**⚠️ 重要**：首次登录后请立即到"个人信息"修改密码！

### 验证运行

1. 访问 `http://localhost:8080`，应该看到登录页面
2. 登录后，按 `F12` 打开开发者工具
3. 切换到 `Network` 标签
4. 点击任意菜单，查看网络请求
5. 确认请求地址为：`http://localhost:3000/api/...`

---

## 生产部署

### 服务器要求

**推荐配置（20-50人使用）**：
- CPU：2核
- 内存：8GB
- 存储：80GB SSD
- 带宽：30Mbps
- 系统：Ubuntu 20.04 / 22.04 或 Debian 11+

> **说明**：2核/8GB 配置对于 20 人使用有 4-8 倍冗余，完全够用。

### 部署步骤（7步）

#### 步骤1：安装基础环境

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

# 验证安装
node --version   # 应显示 v18.x
mysql --version  # 应显示 MySQL 版本
nginx -v         # 应显示 Nginx 版本
pm2 --version    # 应显示 PM2 版本
```

#### 步骤2：配置 MySQL

```bash
# 运行 MySQL 安全配置向导
sudo mysql_secure_installation
# 按提示设置 root 密码，其他选项建议都选 Y

# 登录 MySQL
sudo mysql -u root -p
```

在 MySQL 命令行中执行：
```sql
-- 创建数据库
CREATE DATABASE storage_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建专用用户（请修改密码）
CREATE USER 'storage_user'@'localhost' IDENTIFIED BY 'StrongPassword123!';

-- 授权
GRANT ALL PRIVILEGES ON storage_management.* TO 'storage_user'@'localhost';
FLUSH PRIVILEGES;

-- 退出
EXIT;
```

#### 步骤3：下载代码

```bash
# 进入部署目录
cd /var/www

# 克隆代码（替换成你的仓库地址）
sudo git clone https://your-repo-url/storage-management.git

# 设置权限
sudo chown -R $USER:$USER storage-management
cd storage-management
```

#### 步骤4：配置优化 MySQL（可选）

```bash
# 应用性能优化配置
sudo cp deployment/mysql-optimization.cnf /etc/mysql/mysql.conf.d/storage-optimization.cnf

# 重启 MySQL
sudo systemctl restart mysql

# 验证 MySQL 运行
sudo systemctl status mysql
```

#### 步骤5：配置并启动后端

```bash
# 进入后端目录
cd /var/www/storage-management/backend

# 安装依赖（生产模式）
npm install --production

# 复制配置文件
cp .env.example .env

# 编辑配置
nano .env
```

**生产环境 .env 配置**：
```env
# 数据库配置（使用步骤2创建的用户）
DB_HOST=localhost
DB_USER=storage_user
DB_PASSWORD=StrongPassword123!      # ⬅️ 改成步骤2设置的密码
DB_NAME=storage_management

# JWT 密钥（必须改成随机字符串）
JWT_SECRET=生产环境请用强随机字符串    # ⬅️ 例如：openssl rand -base64 32

# 后端端口
PORT=3000

# 邮件配置（可选）
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=587
EMAIL_USER=your_email@qq.com
EMAIL_PASSWORD=SMTP授权码
```

**导入数据库结构**：
```bash
# 在 backend 目录
cd /var/www/storage-management
mysql -u storage_user -p storage_management < database/schema.sql

# 初始化默认数据
cd backend
npm run init-db
```

**使用 PM2 启动后端**：
```bash
# 返回项目根目录
cd /var/www/storage-management

# 启动后端服务
pm2 start deployment/ecosystem.config.js

# 查看运行状态
pm2 status

# 设置开机自启
pm2 startup
pm2 save

# 查看日志（确认启动成功）
pm2 logs storage-management
```

#### 步骤6：配置 Nginx

```bash
# 复制配置文件
sudo cp /var/www/storage-management/deployment/nginx.conf /etc/nginx/sites-available/storage-management

# 编辑配置（可选：修改 server_name）
sudo nano /etc/nginx/sites-available/storage-management
# 如果有域名，可以把 server_name localhost 改成你的域名

# 启用站点
sudo ln -s /etc/nginx/sites-available/storage-management /etc/nginx/sites-enabled/

# 禁用默认站点（避免冲突）
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 应该看到：
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# 重启 Nginx
sudo systemctl restart nginx

# 设置开机自启
sudo systemctl enable nginx

# 验证运行
sudo systemctl status nginx
```

#### 步骤7：配置防火墙

```bash
# 允许 SSH（重要！）
sudo ufw allow 22/tcp

# 允许 Web 访问（8081 端口）
sudo ufw allow 8081/tcp

# 可选：允许 HTTPS
sudo ufw allow 443/tcp

# 启用防火墙
sudo ufw enable

# 查看防火墙状态
sudo ufw status

# 应该看到：
# 22/tcp    ALLOW    Anywhere
# 8081/tcp  ALLOW    Anywhere
```

### 访问系统

打开浏览器访问：**http://你的服务器IP:8081**

例如：`http://192.168.1.100:8081`

**默认账户**：
- 用户名：`admin`
- 密码：`admin123`

**⚠️ 重要**：登录后立即到"个人信息"修改密码！

### 验证部署

1. 访问 `http://服务器IP:8081`
2. 成功显示登录页面
3. 登录后按 `F12`，查看 `Network` 标签
4. 确认 API 请求地址为：`http://服务器IP:8081/api/...`

### 部署检查清单

- [ ] MySQL 已安装并运行
- [ ] 数据库 `storage_management` 已创建
- [ ] 数据库用户 `storage_user` 已创建并授权
- [ ] 数据库表结构已导入（schema.sql）
- [ ] 默认管理员已初始化（npm run init-db）
- [ ] `.env` 配置已修改（数据库密码、JWT_SECRET）
- [ ] PM2 后端服务已启动（pm2 status 显示 online）
- [ ] PM2 已设置开机自启（pm2 startup && pm2 save）
- [ ] Nginx 已配置并启动（systemctl status nginx 显示 active）
- [ ] 防火墙已开放 8081 端口（ufw status 显示 ALLOW）
- [ ] 浏览器可以访问 `http://服务器IP:8081`
- [ ] 已用新密码替换 admin 默认密码

---

## 在线升级（零停机）

### 方法一：自动升级脚本

```bash
cd /var/www/storage-management
chmod +x deployment/upgrade.sh
./deployment/upgrade.sh
```

脚本会自动执行：
1. 备份数据库和代码
2. 拉取最新代码
3. 安装新依赖
4. 零停机重启服务
5. 健康检查
6. 失败时自动回滚

### 方法二：手动升级

```bash
# 1. 进入项目目录
cd /var/www/storage-management

# 2. 备份数据库
mysqldump -u storage_user -p storage_management > backup_$(date +%Y%m%d_%H%M%S).sql

# 3. 拉取最新代码
git pull origin main

# 4. 安装依赖
cd backend
npm install --production

# 5. 零停机重启（关键！）
cd ..
pm2 reload deployment/ecosystem.config.js --update-env

# 6. 验证状态
pm2 status
pm2 logs storage-management --lines 50
```

**零停机原理**：
- PM2 `reload` 命令先启动新进程
- 新进程就绪后再关闭旧进程
- 确保始终有进程处理请求
- 用户无感知

---

## 系统功能

### 1. 用户管理

**两种角色**：
- **管理员**：完全权限，审核用户，管理分类
- **普通用户**：添加物品，借用/归还物品，查看记录

**注册流程**：
1. 新用户注册（填写用户名、邮箱、手机号、密码）
2. 等待管理员审核
3. 审核通过后可以登录

**个人信息管理**：
- 查看个人信息（用户名、角色、状态、注册时间）
- 修改联系方式（邮箱、手机号）
- 修改密码（需验证当前密码，修改后自动退出重新登录）

📍 **位置**：侧边栏 → "个人信息"

### 2. 物品管理

**添加物品**：
1. 点击"新增物品"
2. 从下拉列表选择分类
3. 填写物品信息：
   - **物品名称**：如 "L30灵巧手"
   - **型号**：如 "L30"
   - **唯一编号**（重要）：
     - 格式：`一级分类-次级分类1-次级分类2-...-设备编号`
     - 示例：`机器人-灵巧手-L30-LHT10`
     - 说明：最后的 `LHT10` 是设备出厂编号或实物标签编号
     - 可堆叠物品（如螺丝、电线）无需填写唯一编号
   - 规格参数、描述

**查看物品**：
- 列表展示所有物品
- 搜索功能
- 查看详情
- 查看库存和借用状态

### 3. 入库/出库

**借用流程**：
1. 选择要借用的物品
2. 填写借用信息：
   - 借用人姓名
   - 借用人手机号
   - **借用人邮箱**（接收归还提醒邮件）
   - 预计归还日期
3. 确认借用

**快速归还**（推荐）：
1. 点击"快速归还"按钮
2. 系统自动显示你的所有借用记录
3. 勾选要归还的物品（支持批量多选）
4. 点击"确认归还"完成

### 4. 分类管理

**查看分类**：
- 所有用户都可查看分类树
- 树形结构展示，带层级缩进

**管理分类**（管理员专属）：

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

**删除限制**：
- 分类下有子分类时，必须先删除子分类
- 分类下有物品时，无法删除

📍 **位置**：侧边栏 → "分类管理"

### 5. 自动提醒

系统每天上午 9:00 自动检查并发送邮件提醒：
- 已逾期未归还的物品
- 今天到期的物品
- 3天内即将到期的物品

**提醒方式**：发送邮件到借用人填写的邮箱

**前提**：需要在 `.env` 中配置邮件服务

### 6. 操作日志

系统自动记录所有操作：
- 操作人（用户名）
- 操作时间
- 操作类型（入库、出库、编辑等）
- 操作详情
- 来源 IP 地址

📍 **位置**：侧边栏 → "操作日志"

---

## 常见问题

### 使用相关

**Q1: 唯一编号是什么？必须填吗？**

A: 唯一编号用于标识具体的物品。
- **非堆叠物品**（如机器人、电脑）**必须填写**
- **可堆叠物品**（如螺丝、电线）**不需要填写**
- 格式：`一级分类-次级分类1-次级分类2-...-设备编号`
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
2. 点击"新增分类"按钮（添加一级分类）
3. 或点击某个分类旁的"添加子分类"按钮（添加子分类）
4. 填写信息并保存

**Q4: 快速归还和手动归还有什么区别？**

A: 快速归还自动显示借用列表，支持批量操作；手动归还需要知道出库记录ID。**推荐使用快速归还**。

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
1. 登录 QQ 邮箱网页版
2. 设置 → 账户
3. 找到"POP3/IMAP/SMTP服务"
4. 开启"IMAP/SMTP服务"
5. 按提示发送短信，获得授权码
6. 将授权码填入 `.env` 的 `EMAIL_PASSWORD`

**Q8: 启动后端时报错 "ER_ACCESS_DENIED_ERROR"**

A: 数据库连接失败，检查：
1. MySQL 服务是否启动：`sudo systemctl status mysql`
2. `.env` 中的数据库用户名和密码是否正确
3. 数据库 `storage_management` 是否已创建
4. 数据库用户是否已授权

**Q9: 前端访问显示空白页面**

A: 检查：
1. 浏览器控制台是否有错误（按 F12 → Console）
2. 后端是否运行（访问 `http://localhost:3000/health`）
3. 是否启动了前端服务器
4. 查看 Network 标签，检查 API 请求是否成功

**Q10: 升级时需要停机吗？**

A: **不需要**！使用 `pm2 reload` 命令可以零停机升级，适用于 99% 的更新场景。

**Q11: 忘记 admin 密码怎么办？**

A: 重新执行初始化：
```bash
cd backend
npm run init-db
```
会重置 admin 密码为 `admin123`。

**Q12: 点击页面提示 "获取XXX信息失败"**

A:
1. 按 F12 打开开发者工具，查看 Console 标签的错误信息
2. 查看 Network 标签，检查 API 请求的响应
3. 检查后端是否正常运行：`pm2 status`
4. 检查数据库连接是否正常

常见错误：
- `401 Unauthorized` → Token 过期，重新登录
- `403 Forbidden` → 权限不足
- `500 Internal Server Error` → 后端错误，查看后端日志：`pm2 logs storage-management`
- `Network Error` → 后端未启动或端口错误

**Q13: 20人使用需要什么配置的服务器？**

A:
- **最低配置**：1核 CPU + 2GB 内存
- **推荐配置**：2核 CPU + 8GB 内存（可支持 50-100 人）
- 2核8GB 配置有 4-8 倍冗余，完全够用

**Q14: 为什么使用 8081 端口而不是 80 端口？**

A: 80 端口已被其他服务（如 Dify）占用，使用 8081 端口可以避免冲突。如需使用其他端口，可以修改 `deployment/nginx.conf` 中的 `listen` 配置。

**Q15: 访问时提示 "Failed to fetch" 或连接失败？**

A: 检查以下几点：
1. Nginx 是否启动：`sudo systemctl status nginx`
2. PM2 后端是否运行：`pm2 status`
3. 防火墙是否开放 8081 端口：`sudo ufw status`
4. 浏览器控制台 (F12) 查看具体错误信息
5. 检查 Network 标签中 API 请求的地址是否正确

**Q16: 本地开发时访问不了后端 API？**

A: 确保：
1. 后端正在运行：`cd backend && npm start`
2. 访问的是 `localhost:8080`（本地开发端口），不是 8081
3. 检查 `backend/.env` 中的 `PORT=3000`
4. 浏览器 F12 → Network，确认请求的是 `http://localhost:3000/api`

**Q17: 如何修改 Web 访问端口（例如改成 8082）？**

A:
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

**Q18: 从旧版本升级需要注意什么？**

A:

**从 v1.2.0 升级到 v1.2.1**（⚠️ 需要数据库迁移）：

1. 拉取最新代码：
   ```bash
   cd /var/www/storage-management
   git pull origin main
   ```

2. **执行数据库迁移**（必须！）：
   ```bash
   mysql -u storage_user -p storage_management < database/migrations/001_add_operation_types.sql
   ```

   输入数据库密码后，应该看到：
   ```
   Query OK, 0 rows affected
   ```

3. 零停机重启后端：
   ```bash
   pm2 reload ecosystem.config.js
   ```

4. 刷新浏览器（清除缓存）

**从 v1.1.0 升级到 v1.2.0**：
1. 拉取最新代码：`git pull origin main`
2. 安装依赖（如有新增）：`cd backend && npm install`
3. 零停机重启：`pm2 reload ecosystem.config.js`
4. 刷新浏览器（清除缓存）
5. 无需数据库迁移

**Q19: 如何查看数据库迁移历史？**

A: 查看 `database/migrations/` 目录：
```bash
ls -la database/migrations/
```

当前迁移记录：
- `001_add_operation_types.sql` - 添加 update_profile 和 change_password 操作类型（v1.2.1）

---

## 技术支持

### 查看日志

```bash
# 后端日志
pm2 logs storage-management

# 只看最近 100 行
pm2 logs storage-management --lines 100

# Nginx 访问日志
sudo tail -f /var/log/nginx/access.log

# Nginx 错误日志
sudo tail -f /var/log/nginx/storage-management-error.log
```

### 常用命令

```bash
# PM2 管理
pm2 status                     # 查看状态
pm2 restart storage-management # 重启
pm2 reload storage-management  # 零停机重启
pm2 stop storage-management    # 停止
pm2 delete storage-management  # 删除

# MySQL 管理
sudo systemctl status mysql    # 查看状态
sudo systemctl restart mysql   # 重启
sudo systemctl stop mysql      # 停止
sudo systemctl start mysql     # 启动

# Nginx 管理
sudo nginx -t                  # 测试配置
sudo systemctl status nginx    # 查看状态
sudo systemctl restart nginx   # 重启
sudo systemctl reload nginx    # 重载配置（不中断服务）
```

---

## 项目结构

```
storage_management/
├── database/
│   ├── schema.sql              # 数据库表结构
│   └── migrations/             # 数据库迁移脚本
│       └── 001_add_operation_types.sql
├── backend/
│   ├── routes/                 # API 路由
│   │   ├── auth.js            # 登录注册
│   │   ├── users.js           # 用户管理（含个人信息修改）
│   │   ├── items.js           # 物品管理
│   │   ├── categories.js      # 分类管理（增删改查）
│   │   ├── inbound.js         # 入库（含批量归还）
│   │   ├── outbound.js        # 出库（含借用列表）
│   │   └── logs.js            # 操作日志
│   ├── middleware/
│   │   └── auth.js            # JWT 认证中间件
│   ├── jobs/
│   │   └── reminderJob.js     # 定时提醒任务
│   ├── utils/
│   │   └── emailService.js    # 邮件发送服务
│   ├── .env.example           # 配置模板
│   └── server.js              # 入口文件
├── frontend/
│   ├── index.html             # 前端页面（含所有功能）
│   ├── styles.css             # 样式
│   └── app.js                 # 前端逻辑（含 API 路径自动检测）
├── deployment/                # 部署配置
│   ├── mysql-optimization.cnf # MySQL 优化配置
│   ├── ecosystem.config.js    # PM2 配置
│   ├── nginx.conf             # Nginx 配置（8081 端口）
│   └── upgrade.sh             # 升级脚本
├── README.md                  # 本文档
└── CHANGELOG.txt              # 版本更新日志
```

---

## 功能特性总结

- ✅ **完整的图形界面**：所有功能都可通过 UI 操作，无需使用 API
- ✅ **个人信息管理**：修改密码、邮箱、手机号
- ✅ **分类管理界面**：管理员可通过 UI 增删改分类
- ✅ **快速归还**：一键查看并归还借用物品
- ✅ **零停机升级**：在线更新不影响用户使用
- ✅ **自动提醒**：邮件提醒逾期和即将到期的借用
- ✅ **操作追溯**：完整记录所有操作日志
- ✅ **用户审核**：管理员审核新用户注册
- ✅ **权限控制**：管理员/普通用户分级管理
- ✅ **环境自适应**：API 路径自动检测本地/生产环境

---

**版本**: 1.2.1
**最后更新**: 2025-10-31
**许可证**: MIT
