// PM2 进程管理配置
// 适用于 2核 CPU，8GB 内存服务器，20人使用规模
//
// 部署方法：
// 1. 全局安装 PM2: npm install -g pm2
// 2. 启动应用: pm2 start ecosystem.config.js
// 3. 设置开机自启: pm2 startup && pm2 save
// 4. 查看状态: pm2 status
// 5. 查看日志: pm2 logs storage-management

module.exports = {
  apps: [{
    // 应用基本配置
    name: 'storage-management',
    script: './server.js',
    cwd: './backend',

    // ========== 进程配置 ==========

    // 实例数量 - 使用 2 个实例（对应 2 核 CPU）
    instances: 2,

    // 执行模式 - cluster 模式实现负载均衡
    exec_mode: 'cluster',

    // ========== 资源限制 ==========

    // 内存限制 - 单个实例超过 1GB 内存自动重启
    max_memory_restart: '1G',

    // ========== 自动重启配置 ==========

    // 监听文件变化自动重启（生产环境建议关闭）
    watch: false,

    // 忽略监听的文件/目录
    ignore_watch: [
      'node_modules',
      'logs',
      '.git',
      '*.log'
    ],

    // 自动重启条件
    autorestart: true,

    // 最大重启次数（防止无限重启）
    max_restarts: 10,

    // 最小运行时间（低于此时间重启视为异常）
    min_uptime: '10s',

    // ========== 日志配置 ==========

    // 日志文件路径
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',

    // 日志时间格式
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

    // 合并日志（所有实例的日志写入同一文件）
    merge_logs: true,

    // ========== 环境变量 ==========

    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },

    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },

    // ========== 优雅关闭 ==========

    // 关闭信号超时时间
    kill_timeout: 5000,

    // 等待就绪信号
    wait_ready: true,

    // 监听 ready 信号超时时间
    listen_timeout: 10000,

    // ========== 其他配置 ==========

    // 实例启动间隔（避免同时启动造成资源竞争）
    instance_var: 'INSTANCE_ID',

    // Cron 重启（可选，例如每天凌晨 3 点重启）
    // cron_restart: '0 3 * * *',

    // 进程崩溃后延迟重启时间
    restart_delay: 4000,

    // ========== 健康检查 ==========

    // 启用健康检查
    // 如果服务器提供 /health 端点，PM2 可以定期检查
  }],

  // ========== 部署配置（可选）==========

  deploy: {
    production: {
      // SSH 用户
      user: 'deploy',

      // 服务器地址
      host: 'your-server-ip',

      // SSH 端口
      port: 22,

      // Git 仓库地址
      repo: 'git@github.com:yourname/storage-management.git',

      // 部署分支
      ref: 'origin/main',

      // 服务器上的部署路径
      path: '/var/www/storage-management',

      // 部署前执行的命令
      'pre-deploy': 'git fetch --all',

      // 部署后执行的命令
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',

      // 环境变量
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
