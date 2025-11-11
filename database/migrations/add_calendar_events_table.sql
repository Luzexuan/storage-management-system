-- 添加日历事件表

CREATE TABLE IF NOT EXISTS calendar_events (
    event_id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL COMMENT '事件标题',
    description TEXT COMMENT '事件描述',
    event_date DATE NOT NULL COMMENT '事件日期',
    event_time TIME COMMENT '事件时间（可选）',
    event_type ENUM('general', 'maintenance', 'inventory', 'meeting', 'deadline', 'other') DEFAULT 'general' COMMENT '事件类型',
    created_by INT NOT NULL COMMENT '创建人',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_event_date (event_date),
    INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日历事件表';
