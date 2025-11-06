-- 仓库管理系统数据库设计
-- Database: storage_management

-- 用户表
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 仓库分类表(支持多级分类)
CREATE TABLE categories (
    category_id INT PRIMARY KEY AUTO_INCREMENT,
    category_name VARCHAR(100) NOT NULL,
    parent_id INT DEFAULT NULL,
    level INT NOT NULL,
    sort_order INT DEFAULT 0,
    is_stackable BOOLEAN DEFAULT FALSE COMMENT '该分类下的物品是否可堆叠',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(category_id) ON DELETE CASCADE,
    INDEX idx_parent (parent_id),
    INDEX idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 物品表
CREATE TABLE items (
    item_id INT PRIMARY KEY AUTO_INCREMENT,
    unique_code VARCHAR(100) UNIQUE,  -- 唯一编号(通用配件可为空)
    category_id INT NOT NULL,
    item_name VARCHAR(200) NOT NULL,
    model VARCHAR(100),  -- 型号
    specification TEXT,  -- 规格说明
    is_stackable BOOLEAN DEFAULT FALSE,  -- 是否可堆叠(通用配件为true)
    current_quantity INT DEFAULT 0,  -- 当前数量
    total_in INT DEFAULT 0,  -- 总入库数
    total_out INT DEFAULT 0,  -- 总出库数
    status ENUM('in_stock', 'out_of_stock', 'partially_out') DEFAULT 'out_of_stock',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    INDEX idx_category (category_id),
    INDEX idx_status (status),
    INDEX idx_unique_code (unique_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 出库记录表(移到入库记录之前,因为入库记录会引用它)
CREATE TABLE outbound_records (
    outbound_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    unique_code VARCHAR(100),  -- 物品唯一编号
    quantity INT NOT NULL DEFAULT 1,
    outbound_type ENUM('transfer', 'borrow') NOT NULL,  -- 永久转移、暂时借用
    borrower_name VARCHAR(100),  -- 借用人姓名
    borrower_phone VARCHAR(20),  -- 借用人电话
    borrower_email VARCHAR(100),  -- 借用人邮箱
    expected_return_date DATE,  -- 预计归还日期
    actual_return_date DATE,  -- 实际归还日期
    is_returned BOOLEAN DEFAULT FALSE,  -- 是否已归还
    operator_id INT NOT NULL,
    remarks TEXT,
    outbound_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (operator_id) REFERENCES users(user_id),
    INDEX idx_item (item_id),
    INDEX idx_operator (operator_id),
    INDEX idx_return (is_returned),
    INDEX idx_expected_date (expected_return_date),
    INDEX idx_time (outbound_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 入库记录表
CREATE TABLE inbound_records (
    inbound_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    unique_code VARCHAR(100),  -- 物品唯一编号
    quantity INT NOT NULL DEFAULT 1,
    inbound_type ENUM('initial', 'return') NOT NULL,  -- 初次入库、归还
    related_outbound_id INT,  -- 关联的出库记录(归还时使用)
    operator_id INT NOT NULL,
    remarks TEXT,
    inbound_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (operator_id) REFERENCES users(user_id),
    FOREIGN KEY (related_outbound_id) REFERENCES outbound_records(outbound_id),
    INDEX idx_item (item_id),
    INDEX idx_operator (operator_id),
    INDEX idx_time (inbound_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 操作日志表(追溯所有操作)
CREATE TABLE operation_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    operation_type ENUM('inbound', 'outbound', 'edit_item', 'edit_category', 'user_register', 'user_approve', 'update_profile', 'change_password', 'other') NOT NULL,
    operator_id INT NOT NULL,
    target_type VARCHAR(50),  -- 操作对象类型: item, category, user等
    target_id INT,  -- 操作对象ID
    operation_detail TEXT,  -- 操作详情(JSON格式)
    ip_address VARCHAR(50),
    operation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (operator_id) REFERENCES users(user_id),
    INDEX idx_operator (operator_id),
    INDEX idx_type (operation_type),
    INDEX idx_time (operation_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 提醒记录表
CREATE TABLE reminders (
    reminder_id INT PRIMARY KEY AUTO_INCREMENT,
    outbound_id INT NOT NULL,
    reminder_type ENUM('sms', 'email') NOT NULL,
    recipient VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    is_sent BOOLEAN DEFAULT FALSE,
    send_time TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outbound_id) REFERENCES outbound_records(outbound_id),
    INDEX idx_outbound (outbound_id),
    INDEX idx_sent (is_sent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 初始化三个一级分类
INSERT INTO categories (category_name, parent_id, level, sort_order, description) VALUES
('机器人', NULL, 1, 1, '各类机器人设备'),
('办公用电子产品', NULL, 1, 2, '办公使用的电子产品'),
('通用配件与工具', NULL, 1, 3, '通用配件和工具,按数量堆叠');
