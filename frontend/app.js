// API 基础配置
const API_BASE_URL = 'http://localhost:3000/api';
let authToken = localStorage.getItem('authToken');
let currentUser = null;

// 工具函数：API请求
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }

    return data;
  } catch (error) {
    console.error('API请求错误:', error);
    throw error;
  }
}

// 显示消息
function showMessage(message, type = 'info') {
  alert(message); // 简单实现，可替换为更好的提示组件
}

// ========== 登录/注册 ==========

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    authToken = data.token;
    localStorage.setItem('authToken', authToken);
    currentUser = data.user;

    showMessage('登录成功！', 'success');
    showMainPage();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const phone = document.getElementById('reg-phone').value;
  const password = document.getElementById('reg-password').value;

  try {
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, phone, password })
    });

    showMessage('注册成功！请等待管理员审核。', 'success');
    showLogin();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

function showLogin() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('login-page').classList.add('active');
}

function showRegister() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('register-page').classList.add('active');
}

function showMainPage() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('main-page').classList.add('active');

  // 设置管理员样式
  if (currentUser.role === 'admin') {
    document.body.classList.add('is-admin');
  }

  document.getElementById('user-info').textContent =
    `欢迎，${currentUser.username} (${currentUser.role === 'admin' ? '管理员' : '用户'})`;

  loadDashboard();
}

function logout() {
  localStorage.removeItem('authToken');
  authToken = null;
  currentUser = null;
  document.body.classList.remove('is-admin');
  showLogin();
}

// ========== 导航 ==========

function showSection(sectionName) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`${sectionName}-section`).classList.add('active');

  document.querySelectorAll('.menu li a').forEach(a => a.classList.remove('active'));
  event.target.classList.add('active');

  // 加载对应数据
  switch(sectionName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'items':
      loadItems();
      break;
    case 'inbound':
      loadInboundRecords();
      break;
    case 'outbound':
      loadOutboundRecords();
      break;
    case 'categories':
      loadCategories();
      break;
    case 'logs':
      loadLogs();
      break;
    case 'users':
      loadUsers();
      break;
    case 'profile':
      loadProfile();
      break;
  }
}

// ========== 仪表盘 ==========

async function loadDashboard() {
  try {
    const data = await apiRequest('/stats/overview');
    const overview = data.overview;

    document.getElementById('stat-total-items').textContent = overview.totalItems;
    document.getElementById('stat-in-stock').textContent = overview.inStockItems;
    document.getElementById('stat-out-stock').textContent = overview.outOfStockItems;
    document.getElementById('stat-unreturned').textContent = overview.unreturnedBorrows;
    document.getElementById('stat-overdue').textContent = overview.overdueBorrows;
    document.getElementById('stat-monthly-in').textContent = overview.monthlyInbound;

    // 加载最近日志
    const logsData = await apiRequest('/logs?limit=10');
    displayRecentLogs(logsData.logs);
  } catch (error) {
    showMessage('加载仪表盘失败: ' + error.message, 'error');
  }
}

function displayRecentLogs(logs) {
  const container = document.getElementById('recent-logs');
  if (logs.length === 0) {
    container.innerHTML = '<p>暂无操作记录</p>';
    return;
  }

  let html = '<table class="data-table"><thead><tr><th>时间</th><th>操作</th><th>操作人</th></tr></thead><tbody>';
  logs.forEach(log => {
    html += `<tr>
      <td>${new Date(log.operation_time).toLocaleString()}</td>
      <td>${getOperationTypeName(log.operation_type)}</td>
      <td>${log.operator_name}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ========== 物品管理 ==========

async function loadItems() {
  try {
    const data = await apiRequest('/items');
    displayItems(data.items);
  } catch (error) {
    showMessage('加载物品列表失败: ' + error.message, 'error');
  }
}

function displayItems(items) {
  const tbody = document.getElementById('items-tbody');
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">暂无物品</td></tr>';
    return;
  }

  let html = '';
  items.forEach(item => {
    html += `<tr>
      <td>${item.unique_code || 'N/A'}</td>
      <td>${item.item_name}</td>
      <td>${item.category_name}</td>
      <td>${item.model || '-'}</td>
      <td>${item.current_quantity}</td>
      <td><span class="badge ${getStatusBadgeClass(item.status)}">${getStatusName(item.status)}</span></td>
      <td>
        <button class="btn btn-sm" onclick="viewItem(${item.item_id})">查看</button>
        ${currentUser.role === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="deleteItem(${item.item_id})">删除</button>` : ''}
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

async function searchItems() {
  const search = document.getElementById('item-search').value;
  try {
    const data = await apiRequest(`/items?search=${encodeURIComponent(search)}`);
    displayItems(data.items);
  } catch (error) {
    showMessage('搜索失败: ' + error.message, 'error');
  }
}

// ========== 入库管理 ==========

async function loadInboundRecords() {
  try {
    const data = await apiRequest('/inbound');
    displayInboundRecords(data.records);
  } catch (error) {
    showMessage('加载入库记录失败: ' + error.message, 'error');
  }
}

function displayInboundRecords(records) {
  const tbody = document.getElementById('inbound-tbody');
  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">暂无入库记录</td></tr>';
    return;
  }

  let html = '';
  records.forEach(record => {
    html += `<tr>
      <td>${new Date(record.inbound_time).toLocaleString()}</td>
      <td>${record.item_name}</td>
      <td>${record.quantity}</td>
      <td>${record.inbound_type === 'initial' ? '初次入库' : '归还'}</td>
      <td>${record.operator_name}</td>
      <td>${record.remarks || '-'}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ========== 出库管理 ==========

async function loadOutboundRecords() {
  try {
    const data = await apiRequest('/outbound');
    displayOutboundRecords(data.records);
  } catch (error) {
    showMessage('加载出库记录失败: ' + error.message, 'error');
  }
}

function displayOutboundRecords(records) {
  const tbody = document.getElementById('outbound-tbody');
  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">暂无出库记录</td></tr>';
    return;
  }

  let html = '';
  records.forEach(record => {
    html += `<tr>
      <td>${new Date(record.outbound_time).toLocaleString()}</td>
      <td>${record.item_name}</td>
      <td>${record.quantity}</td>
      <td>${record.outbound_type === 'transfer' ? '永久转移' : '暂时借用'}</td>
      <td>${record.borrower_name || '-'}</td>
      <td>${record.expected_return_date || '-'}</td>
      <td><span class="badge ${record.is_returned ? 'badge-success' : 'badge-warning'}">${record.is_returned ? '已归还' : '未归还'}</span></td>
      <td>${record.operator_name}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

async function loadUnreturnedItems() {
  try {
    const data = await apiRequest('/outbound/unreturned/list');
    displayOutboundRecords(data.records);
  } catch (error) {
    showMessage('加载未归还记录失败: ' + error.message, 'error');
  }
}

// ========== 分类管理 ==========

// loadCategories 函数已在文件末尾重新实现，包含完整的增删改功能

// ========== 操作日志 ==========

async function loadLogs() {
  try {
    const data = await apiRequest('/logs');
    displayLogs(data.logs);
  } catch (error) {
    showMessage('加载日志失败: ' + error.message, 'error');
  }
}

function displayLogs(logs) {
  const tbody = document.getElementById('logs-tbody');
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">暂无日志</td></tr>';
    return;
  }

  let html = '';
  logs.forEach(log => {
    html += `<tr>
      <td>${new Date(log.operation_time).toLocaleString()}</td>
      <td>${getOperationTypeName(log.operation_type)}</td>
      <td>${log.operator_name}</td>
      <td>${log.target_type || '-'}</td>
      <td>${JSON.stringify(log.operation_detail)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ========== 用户管理 ==========

async function loadUsers() {
  if (currentUser.role !== 'admin') return;

  try {
    const [pendingData, allData] = await Promise.all([
      apiRequest('/users/pending'),
      apiRequest('/users')
    ]);

    displayPendingUsers(pendingData.users);
    displayAllUsers(allData.users);
  } catch (error) {
    showMessage('加载用户列表失败: ' + error.message, 'error');
  }
}

function displayPendingUsers(users) {
  const tbody = document.getElementById('pending-users-tbody');
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">暂无待审核用户</td></tr>';
    return;
  }

  let html = '';
  users.forEach(user => {
    html += `<tr>
      <td>${user.username}</td>
      <td>${user.email}</td>
      <td>${user.phone || '-'}</td>
      <td>${new Date(user.created_at).toLocaleString()}</td>
      <td>
        <button class="btn btn-sm btn-success" onclick="approveUser(${user.user_id}, true)">通过</button>
        <button class="btn btn-sm btn-danger" onclick="approveUser(${user.user_id}, false)">拒绝</button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

function displayAllUsers(users) {
  const tbody = document.getElementById('all-users-tbody');
  let html = '';
  users.forEach(user => {
    html += `<tr>
      <td>${user.username}</td>
      <td>${user.email}</td>
      <td>${user.role === 'admin' ? '管理员' : '普通用户'}</td>
      <td><span class="badge ${user.status === 'active' ? 'badge-success' : 'badge-secondary'}">${getStatusName(user.status)}</span></td>
      <td>${new Date(user.created_at).toLocaleString()}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

async function approveUser(userId, approve) {
  try {
    await apiRequest(`/users/${userId}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ approve })
    });

    showMessage(approve ? '用户已通过审核' : '用户已拒绝', 'success');
    loadUsers();
  } catch (error) {
    showMessage('操作失败: ' + error.message, 'error');
  }
}

// ========== 辅助函数 ==========

function getOperationTypeName(type) {
  const names = {
    'inbound': '入库',
    'outbound': '出库',
    'edit_item': '编辑物品',
    'edit_category': '编辑分类',
    'user_register': '用户注册',
    'user_approve': '用户审核',
    'other': '其他'
  };
  return names[type] || type;
}

function getStatusName(status) {
  const names = {
    'in_stock': '在库',
    'out_of_stock': '缺货',
    'partially_out': '部分出库',
    'active': '激活',
    'pending': '待审核',
    'inactive': '禁用'
  };
  return names[status] || status;
}

function getStatusBadgeClass(status) {
  const classes = {
    'in_stock': 'badge-success',
    'out_of_stock': 'badge-danger',
    'partially_out': 'badge-warning'
  };
  return classes[status] || 'badge-secondary';
}

// ========== 模态框管理 ==========

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// 新建物品模态框
async function showAddItemModal() {
  const categories = await loadCategoriesForSelect();

  const modalHTML = `
    <div id="add-item-modal" class="modal active">
      <div class="modal-content">
        <div class="modal-header">
          <h2>新增物品</h2>
          <button class="modal-close" onclick="closeModal('add-item-modal')">&times;</button>
        </div>
        <div class="modal-body">
          <form id="add-item-form">
            <div class="form-row">
              <div class="form-group">
                <label>分类 *</label>
                <select id="item-category" required>
                  <option value="">请选择分类</option>
                  ${categories.map(cat => `<option value="${cat.category_id}">${cat.displayName}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>物品名称 *</label>
                <input type="text" id="item-name" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>型号</label>
                <input type="text" id="item-model">
              </div>
              <div class="form-group">
                <label>
                  <input type="checkbox" id="item-stackable"> 可堆叠物品（通用配件）
                </label>
              </div>
            </div>
            <div class="form-row full" id="unique-code-row">
              <div class="form-group">
                <label>唯一编号 * <small>（格式：一级分类-次级分类-型号-唯一编号，如：机器人-灵巧手-L30-LHT10，最后的唯一编号是物品在物理世界中自带的编号）</small></label>
                <input type="text" id="item-unique-code" required placeholder="例如：机器人-灵巧手-L30-LHT10">
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>规格说明</label>
                <textarea id="item-specification" rows="2"></textarea>
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>描述</label>
                <textarea id="item-description" rows="3"></textarea>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('add-item-modal')">取消</button>
          <button class="btn btn-primary" onclick="submitAddItem()">创建</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // 监听可堆叠复选框变化
  document.getElementById('item-stackable').addEventListener('change', (e) => {
    const uniqueCodeRow = document.getElementById('unique-code-row');
    const uniqueCodeInput = document.getElementById('item-unique-code');
    if (e.target.checked) {
      uniqueCodeRow.style.display = 'none';
      uniqueCodeInput.required = false;
    } else {
      uniqueCodeRow.style.display = 'block';
      uniqueCodeInput.required = true;
    }
  });
}

async function loadCategoriesForSelect() {
  try {
    const data = await apiRequest('/categories/all/flat');
    return data.categories;
  } catch (error) {
    showMessage('加载分类失败: ' + error.message, 'error');
    return [];
  }
}

async function submitAddItem() {
  const categoryId = document.getElementById('item-category').value;
  const itemName = document.getElementById('item-name').value;
  const model = document.getElementById('item-model').value;
  const isStackable = document.getElementById('item-stackable').checked;
  const uniqueCode = document.getElementById('item-unique-code').value;
  const specification = document.getElementById('item-specification').value;
  const description = document.getElementById('item-description').value;

  if (!categoryId || !itemName) {
    showMessage('请填写必填项', 'error');
    return;
  }

  if (!isStackable && !uniqueCode) {
    showMessage('非堆叠物品必须提供唯一编号', 'error');
    return;
  }

  try {
    await apiRequest('/items', {
      method: 'POST',
      body: JSON.stringify({
        categoryId: parseInt(categoryId),
        itemName,
        model: model || null,
        isStackable,
        uniqueCode: isStackable ? null : uniqueCode,
        specification: specification || null,
        description: description || null
      })
    });

    showMessage('物品创建成功！', 'success');
    closeModal('add-item-modal');
    document.getElementById('add-item-modal').remove();
    loadItems();
  } catch (error) {
    showMessage('创建失败: ' + error.message, 'error');
  }
}

// 快速归还模态框
async function showQuickReturnModal() {
  try {
    const data = await apiRequest('/outbound/my-borrowings');
    const borrowings = data.borrowings;

    if (borrowings.length === 0) {
      showMessage('您当前没有未归还的借用物品', 'info');
      return;
    }

    const modalHTML = `
      <div id="quick-return-modal" class="modal active">
        <div class="modal-content">
          <div class="modal-header">
            <h2>快速归还 - 我的借用</h2>
            <button class="modal-close" onclick="closeModal('quick-return-modal')">&times;</button>
          </div>
          <div class="modal-body">
            <p>请选择要归还的物品：</p>
            <div class="checkbox-list">
              ${borrowings.map(item => `
                <label class="checkbox-item">
                  <input type="checkbox" value="${item.outbound_id}" class="return-checkbox">
                  <div class="checkbox-item-info">
                    <div class="checkbox-item-title">${item.item_name}${item.unique_code ? ` (${item.unique_code})` : ''}</div>
                    <div class="checkbox-item-meta">
                      分类: ${item.category_name} |
                      数量: ${item.quantity} |
                      借用时间: ${new Date(item.outbound_time).toLocaleDateString()} |
                      预计归还: ${item.expected_return_date || '未设定'}
                      ${item.borrower_name ? ` | 借用人: ${item.borrower_name}` : ''}
                    </div>
                  </div>
                </label>
              `).join('')}
            </div>
            <div class="form-group" style="margin-top: 1rem;">
              <label>备注</label>
              <textarea id="return-remarks" rows="2" placeholder="选填"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal('quick-return-modal')">取消</button>
            <button class="btn btn-success" onclick="submitQuickReturn()">确认归还</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  } catch (error) {
    showMessage('加载借用记录失败: ' + error.message, 'error');
  }
}

async function submitQuickReturn() {
  const checkboxes = document.querySelectorAll('.return-checkbox:checked');
  if (checkboxes.length === 0) {
    showMessage('请至少选择一个物品归还', 'error');
    return;
  }

  const outboundIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const remarks = document.getElementById('return-remarks').value;

  try {
    const data = await apiRequest('/inbound/batch-return', {
      method: 'POST',
      body: JSON.stringify({ outboundIds, remarks: remarks || null })
    });

    let message = data.message;
    if (data.errors && data.errors.length > 0) {
      message += '\n失败项: ' + data.errors.map(e => e.error).join(', ');
    }

    showMessage(message, 'success');
    closeModal('quick-return-modal');
    document.getElementById('quick-return-modal').remove();

    // 刷新相关页面
    loadInboundRecords();
    loadOutboundRecords();
    loadDashboard();
  } catch (error) {
    showMessage('归还失败: ' + error.message, 'error');
  }
}

function showInboundModal() {
  showMessage('请使用快速归还功能或通过API操作', 'info');
}

function showOutboundModal() {
  showMessage('请通过API实现此功能', 'info');
}

function showAddCategoryModal() {
  showMessage('仅管理员可通过API创建分类', 'info');
}

function viewItem(itemId) {
  showMessage(`查看物品 ID: ${itemId}`, 'info');
}

function deleteItem(itemId) {
  if (confirm('确定要删除此物品吗？')) {
    apiRequest(`/items/${itemId}`, { method: 'DELETE' })
      .then(() => {
        showMessage('删除成功', 'success');
        loadItems();
      })
      .catch(error => showMessage('删除失败: ' + error.message, 'error'));
  }
}

// ========== 初始化 ==========

window.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    // 验证token并加载用户信息
    apiRequest('/users/me')
      .then(data => {
        currentUser = data.user;
        showMainPage();
      })
      .catch(() => {
        localStorage.removeItem('authToken');
        authToken = null;
        showLogin();
      });
  } else {
    showLogin();
  }
});
// ==================================================
// 这个文件包含需要添加到 app.js 的新功能
// 请将以下代码添加到 app.js 文件末尾
// ==================================================

// ========== 个人信息管理 ==========

async function loadProfile() {
  try {
    const data = await apiRequest('/users/me');
    const user = data.user;

    document.getElementById('profile-username').textContent = user.username;
    document.getElementById('profile-role').textContent = user.role === 'admin' ? '管理员' : '普通用户';
    document.getElementById('profile-status').textContent = user.status === 'active' ? '已激活' : user.status;
    document.getElementById('profile-created').textContent = new Date(user.created_at).toLocaleString('zh-CN');
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-phone').value = user.phone || '';
  } catch (error) {
    console.error('加载个人信息失败:', error);
  }
}

// 更新个人信息
document.getElementById('update-info-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('profile-email').value;
  const phone = document.getElementById('profile-phone').value;

  try {
    await apiRequest('/users/me', {
      method: 'PUT',
      body: JSON.stringify({ email, phone })
    });
    showMessage('个人信息已更新！', 'success');
  } catch (error) {
    showMessage('更新失败：' + error.message, 'error');
  }
});

// 修改密码
document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (newPassword !== confirmPassword) {
    showMessage('两次输入的新密码不一致！', 'error');
    return;
  }

  if (newPassword.length < 6) {
    showMessage('新密码长度至少为6个字符！', 'error');
    return;
  }

  try {
    await apiRequest('/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });

    showMessage('密码修改成功！请重新登录。', 'success');

    // 清空表单
    document.getElementById('change-password-form').reset();

    // 3秒后自动退出登录
    setTimeout(() => {
      logout();
    }, 3000);
  } catch (error) {
    showMessage('修改失败：' + error.message, 'error');
  }
});

// ========== 分类管理增强功能 ==========

// 显示分类树（带编辑和删除按钮）
async function loadCategories() {
  try {
    const data = await apiRequest('/categories');
    const categories = data.categories;

    const container = document.getElementById('categories-tree');
    container.innerHTML = '';

    if (categories.length === 0) {
      container.innerHTML = '<p class="empty-message">暂无分类</p>';
      return;
    }

    const tree = buildCategoryTreeHTML(categories);
    container.innerHTML = tree;
  } catch (error) {
    showMessage('获取分类失败：' + error.message, 'error');
  }
}

// 构建分类树HTML（带操作按钮）
function buildCategoryTreeHTML(categories, level = 0) {
  let html = '<ul class="category-tree">';

  for (const cat of categories) {
    const indent = level * 20;
    const isAdmin = currentUser && currentUser.role === 'admin';

    html += `
      <li style="padding-left: ${indent}px">
        <div class="category-item">
          <span class="category-name">${cat.category_name}</span>
          ${cat.description ? `<span class="category-desc">(${cat.description})</span>` : ''}
          ${isAdmin ? `
            <div class="category-actions">
              <button class="btn btn-sm" onclick="showEditCategoryModal(${cat.category_id}, '${cat.category_name}', '${cat.description || ''}', ${cat.sort_order || 0})">编辑</button>
              <button class="btn btn-sm btn-danger" onclick="deleteCategory(${cat.category_id}, '${cat.category_name}')">删除</button>
              <button class="btn btn-sm btn-secondary" onclick="showAddSubcategoryModal(${cat.category_id}, '${cat.category_name}')">添加子分类</button>
            </div>
          ` : ''}
        </div>
        ${cat.children && cat.children.length > 0 ? buildCategoryTreeHTML(cat.children, level + 1) : ''}
      </li>
    `;
  }

  html += '</ul>';
  return html;
}

// 显示添加分类模态框
async function showAddCategoryModal() {
  const modalHTML = `
    <div id="add-category-modal" class="modal active">
      <div class="modal-content">
        <div class="modal-header">
          <h2>新增一级分类</h2>
          <button class="modal-close" onclick="closeModal('add-category-modal')">&times;</button>
        </div>
        <div class="modal-body">
          <form id="add-category-form">
            <div class="form-group">
              <label>分类名称 *</label>
              <input type="text" id="cat-name" required>
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea id="cat-description" rows="3"></textarea>
            </div>
            <div class="form-group">
              <label>排序顺序</label>
              <input type="number" id="cat-sort" value="0" min="0">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('add-category-modal')">取消</button>
          <button class="btn btn-primary" onclick="submitAddCategory()">创建</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-container').innerHTML = modalHTML;
}

// 显示添加子分类模态框
async function showAddSubcategoryModal(parentId, parentName) {
  const modalHTML = `
    <div id="add-subcategory-modal" class="modal active">
      <div class="modal-content">
        <div class="modal-header">
          <h2>为 "${parentName}" 添加子分类</h2>
          <button class="modal-close" onclick="closeModal('add-subcategory-modal')">&times;</button>
        </div>
        <div class="modal-body">
          <form id="add-subcategory-form">
            <input type="hidden" id="subcat-parent-id" value="${parentId}">
            <div class="form-group">
              <label>分类名称 *</label>
              <input type="text" id="subcat-name" required>
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea id="subcat-description" rows="3"></textarea>
            </div>
            <div class="form-group">
              <label>排序顺序</label>
              <input type="number" id="subcat-sort" value="0" min="0">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('add-subcategory-modal')">取消</button>
          <button class="btn btn-primary" onclick="submitAddSubcategory()">创建</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-container').innerHTML = modalHTML;
}

// 提交新建分类
async function submitAddCategory() {
  const name = document.getElementById('cat-name').value;
  const description = document.getElementById('cat-description').value;
  const sortOrder = document.getElementById('cat-sort').value;

  try {
    await apiRequest('/categories', {
      method: 'POST',
      body: JSON.stringify({
        categoryName: name,
        description: description || null,
        sortOrder: parseInt(sortOrder) || 0
      })
    });

    showMessage('分类创建成功！', 'success');
    closeModal('add-category-modal');
    loadCategories();
  } catch (error) {
    showMessage('创建失败：' + error.message, 'error');
  }
}

// 提交新建子分类
async function submitAddSubcategory() {
  const parentId = document.getElementById('subcat-parent-id').value;
  const name = document.getElementById('subcat-name').value;
  const description = document.getElementById('subcat-description').value;
  const sortOrder = document.getElementById('subcat-sort').value;

  try {
    await apiRequest('/categories', {
      method: 'POST',
      body: JSON.stringify({
        categoryName: name,
        parentId: parseInt(parentId),
        description: description || null,
        sortOrder: parseInt(sortOrder) || 0
      })
    });

    showMessage('子分类创建成功！', 'success');
    closeModal('add-subcategory-modal');
    loadCategories();
  } catch (error) {
    showMessage('创建失败：' + error.message, 'error');
  }
}

// 显示编辑分类模态框
function showEditCategoryModal(categoryId, name, description, sortOrder) {
  const modalHTML = `
    <div id="edit-category-modal" class="modal active">
      <div class="modal-content">
        <div class="modal-header">
          <h2>编辑分类</h2>
          <button class="modal-close" onclick="closeModal('edit-category-modal')">&times;</button>
        </div>
        <div class="modal-body">
          <form id="edit-category-form">
            <input type="hidden" id="edit-cat-id" value="${categoryId}">
            <div class="form-group">
              <label>分类名称 *</label>
              <input type="text" id="edit-cat-name" value="${name}" required>
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea id="edit-cat-description" rows="3">${description}</textarea>
            </div>
            <div class="form-group">
              <label>排序顺序</label>
              <input type="number" id="edit-cat-sort" value="${sortOrder}" min="0">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('edit-category-modal')">取消</button>
          <button class="btn btn-primary" onclick="submitEditCategory()">保存</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-container').innerHTML = modalHTML;
}

// 提交编辑分类
async function submitEditCategory() {
  const categoryId = document.getElementById('edit-cat-id').value;
  const name = document.getElementById('edit-cat-name').value;
  const description = document.getElementById('edit-cat-description').value;
  const sortOrder = document.getElementById('edit-cat-sort').value;

  try {
    await apiRequest(`/categories/${categoryId}`, {
      method: 'PUT',
      body: JSON.stringify({
        categoryName: name,
        description: description || null,
        sortOrder: parseInt(sortOrder) || 0
      })
    });

    showMessage('分类已更新！', 'success');
    closeModal('edit-category-modal');
    loadCategories();
  } catch (error) {
    showMessage('更新失败：' + error.message, 'error');
  }
}

// 删除分类
async function deleteCategory(categoryId, categoryName) {
  if (!confirm(`确定要删除分类 "${categoryName}" 吗？\n\n注意：如果该分类下有子分类或物品，将无法删除。`)) {
    return;
  }

  try {
    await apiRequest(`/categories/${categoryId}`, {
      method: 'DELETE'
    });

    showMessage('分类已删除！', 'success');
    loadCategories();
  } catch (error) {
    showMessage('删除失败：' + error.message, 'error');
  }
}

// ========== 修改 showSection 函数，添加 profile 分支 ==========
// 在原有的 showSection 函数的 switch 语句中添加：
//
// case 'profile':
//   loadProfile();
//   break;
//
// 完整的 showSection 函数应该是：
/*
function showSection(sectionName) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`${sectionName}-section`).classList.add('active');

  document.querySelectorAll('.menu li a').forEach(a => a.classList.remove('active'));
  event.target.classList.add('active');

  // 加载对应数据
  switch(sectionName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'items':
      loadItems();
      break;
    case 'inbound':
      loadInboundRecords();
      break;
    case 'outbound':
      loadOutboundRecords();
      break;
    case 'categories':
      loadCategories();
      break;
    case 'logs':
      loadLogs();
      break;
    case 'users':
      loadUsers();
      break;
    case 'profile':  // <- 添加这个
      loadProfile();
      break;
  }
}
*/

// ========== 关闭模态框函数 ==========
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.remove();
  }
}
