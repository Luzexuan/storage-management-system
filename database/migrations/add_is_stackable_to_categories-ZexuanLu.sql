-- 添加 is_stackable 字段到 categories 表
ALTER TABLE categories
ADD COLUMN is_stackable BOOLEAN DEFAULT FALSE COMMENT '该分类下的物品是否可堆叠';

-- 为"通用配件与工具"分类设置为可堆叠
-- 注意：需要根据实际数据库中的分类名称和ID进行调整
UPDATE categories
SET is_stackable = TRUE
WHERE category_name LIKE '%通用%配件%' OR category_name LIKE '%配件%工具%';

-- 为所有"通用配件与工具"的子分类也设置为可堆叠
UPDATE categories c1
JOIN categories c2 ON c1.parent_id = c2.category_id
SET c1.is_stackable = TRUE
WHERE c2.is_stackable = TRUE;

-- 如果有三级分类，也需要更新
UPDATE categories c1
JOIN categories c2 ON c1.parent_id = c2.category_id
JOIN categories c3 ON c2.parent_id = c3.category_id
SET c1.is_stackable = TRUE
WHERE c3.is_stackable = TRUE;
