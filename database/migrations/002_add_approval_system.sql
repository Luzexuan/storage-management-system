-- Add approval system for inbound and outbound operations
-- This allows regular users to submit requests that require admin approval

CREATE TABLE approval_requests (
    request_id INT PRIMARY KEY AUTO_INCREMENT,
    request_type ENUM('inbound', 'outbound') NOT NULL,
    requester_id INT NOT NULL,
    request_data JSON NOT NULL,  -- Store the request details as JSON
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    reviewer_id INT,  -- Admin who reviewed the request
    review_comment TEXT,  -- Optional comment from admin
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    FOREIGN KEY (requester_id) REFERENCES users(user_id),
    FOREIGN KEY (reviewer_id) REFERENCES users(user_id),
    INDEX idx_requester (requester_id),
    INDEX idx_status (status),
    INDEX idx_type (request_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
