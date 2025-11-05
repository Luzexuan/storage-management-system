// API 基础配置
// 自动检测环境：本地开发使用 localhost，生产环境使用相对路径
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'  // 本地开发
  : '/api';  // 生产环境（通过 Nginx 代理）

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
    case 'approvals':
      loadApprovals();
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

let allItemsLoaded = false;
let currentItems = [];

async function loadItems() {
  // Don't load items automatically - wait for user to click "Show All Items"
  const tbody = document.getElementById('items-tbody');
  if (!allItemsLoaded) {
    tbody.innerHTML = '<tr><td colspan="7">点击"显示所有物品"按钮加载物品列表</td></tr>';
    return;
  }

  try {
    const data = await apiRequest('/items?limit=10000');
    currentItems = data.items;
    applySorting();
  } catch (error) {
    showMessage('加载物品列表失败: ' + error.message, 'error');
  }
}

async function toggleShowAllItems() {
  const btn = document.getElementById('show-all-items-btn');

  if (!allItemsLoaded) {
    // Load items
    allItemsLoaded = true;
    btn.textContent = '隐藏物品列表';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-secondary');

    try {
      const data = await apiRequest('/items?limit=10000');
      currentItems = data.items;
      applySorting();
    } catch (error) {
      showMessage('加载物品列表失败: ' + error.message, 'error');
      allItemsLoaded = false;
      btn.textContent = '显示所有物品';
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-success');
    }
  } else {
    // Hide items
    allItemsLoaded = false;
    currentItems = [];
    btn.textContent = '显示所有物品';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-success');

    const tbody = document.getElementById('items-tbody');
    tbody.innerHTML = '<tr><td colspan="7">点击"显示所有物品"按钮加载物品列表</td></tr>';
  }
}

function sortItems() {
  if (!allItemsLoaded || currentItems.length === 0) {
    return;
  }

  applySorting();
}

function applySorting() {
  const sortBy = document.getElementById('sort-by').value;

  if (!sortBy) {
    displayItems(currentItems);
    return;
  }

  const sorted = [...currentItems];

  switch (sortBy) {
    case 'name-asc':
      sorted.sort((a, b) => a.item_name.localeCompare(b.item_name));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.item_name.localeCompare(a.item_name));
      break;
    case 'quantity-asc':
      sorted.sort((a, b) => a.current_quantity - b.current_quantity);
      break;
    case 'quantity-desc':
      sorted.sort((a, b) => b.current_quantity - a.current_quantity);
      break;
    case 'created-asc':
      sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case 'created-desc':
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
  }

  displayItems(sorted);
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
  if (!allItemsLoaded) {
    showMessage('请先点击"显示所有物品"按钮', 'info');
    return;
  }

  const search = document.getElementById('item-search').value;

  if (!search) {
    applySorting();
    return;
  }

  try {
    const data = await apiRequest(`/items?search=${encodeURIComponent(search)}&limit=10000`);
    currentItems = data.items;
    applySorting();
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

// ========== 审批管理 ==========

async function loadApprovals(status = null) {
  if (currentUser.role !== 'admin') return;

  try {
    let url = '/approvals';
    if (status) {
      url += `?status=${status}`;
    }

    const data = await apiRequest(url);
    displayApprovals(data.requests || []);
  } catch (error) {
    showMessage('Failed to load approval requests: ' + error.message, 'error');
  }
}

async function displayApprovals(requests) {
  const tbody = document.getElementById('approvals-tbody');

  if (requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">No approval requests</td></tr>';
    return;
  }

  // Fetch item information for all requests
  const itemIds = [...new Set(requests.map(r => r.request_data.itemId))];
  const itemsMap = {};

  try {
    await Promise.all(itemIds.map(async (itemId) => {
      const itemData = await apiRequest(`/items/${itemId}`);
      itemsMap[itemId] = itemData.item;
    }));
  } catch (error) {
    console.error('Failed to load item details:', error);
  }

  let html = '';
  requests.forEach(req => {
    const item = itemsMap[req.request_data.itemId];
    const itemInfo = item ? `${item.item_name} (${item.unique_code || 'ID:' + item.item_id})` : `Item ID: ${req.request_data.itemId}`;
    const requestTypeLabel = req.request_type === 'inbound' ? '入库' : '出库';
    const statusBadge = getApprovalStatusBadge(req.status);

    html += `<tr>
      <td>${requestTypeLabel}</td>
      <td>${req.requester_name}</td>
      <td>${itemInfo}</td>
      <td>${req.request_data.quantity}</td>
      <td>${statusBadge}</td>
      <td>${new Date(req.created_at).toLocaleString()}</td>
      <td>
        ${req.status === 'pending' ? `
          <button class="btn btn-sm btn-success" onclick="reviewApproval(${req.request_id}, true)">通过</button>
          <button class="btn btn-sm btn-danger" onclick="reviewApproval(${req.request_id}, false)">拒绝</button>
          <button class="btn btn-sm btn-secondary" onclick="viewApprovalDetail(${req.request_id})">详情</button>
        ` : `
          <button class="btn btn-sm btn-secondary" onclick="viewApprovalDetail(${req.request_id})">详情</button>
        `}
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

function getApprovalStatusBadge(status) {
  const badges = {
    'pending': '<span class="badge badge-warning">待审批</span>',
    'approved': '<span class="badge badge-success">已通过</span>',
    'rejected': '<span class="badge badge-danger">已拒绝</span>'
  };
  return badges[status] || status;
}

async function reviewApproval(requestId, approved) {
  const comment = prompt(approved ? '审批意见（可选）：' : '拒绝原因（可选）：');

  try {
    await apiRequest(`/approvals/${requestId}/review`, {
      method: 'PUT',
      body: JSON.stringify({
        approved,
        comment: comment || ''
      })
    });

    showMessage(approved ? '申请已通过' : '申请已拒绝', 'success');
    loadApprovals('pending');
  } catch (error) {
    showMessage('操作失败: ' + error.message, 'error');
  }
}

async function viewApprovalDetail(requestId) {
  try {
    const data = await apiRequest('/approvals');
    const request = data.requests.find(r => r.request_id === requestId);

    if (!request) {
      showMessage('Request not found', 'error');
      return;
    }

    const itemData = await apiRequest(`/items/${request.request_data.itemId}`);
    const item = itemData.item;

    const requestTypeLabel = request.request_type === 'inbound' ? '入库申请' : '出库申请';
    const statusBadge = getApprovalStatusBadge(request.status);

    let detailHTML = `
      <div class="detail-table">
        <table>
          <tr><td><strong>申请类型:</strong></td><td>${requestTypeLabel}</td></tr>
          <tr><td><strong>申请人:</strong></td><td>${request.requester_name}</td></tr>
          <tr><td><strong>申请时间:</strong></td><td>${new Date(request.created_at).toLocaleString()}</td></tr>
          <tr><td><strong>状态:</strong></td><td>${statusBadge}</td></tr>
          ${request.reviewer_name ? `<tr><td><strong>审批人:</strong></td><td>${request.reviewer_name}</td></tr>` : ''}
          ${request.reviewed_at ? `<tr><td><strong>审批时间:</strong></td><td>${new Date(request.reviewed_at).toLocaleString()}</td></tr>` : ''}
          ${request.review_comment ? `<tr><td><strong>审批意见:</strong></td><td>${request.review_comment}</td></tr>` : ''}
        </table>
      </div>

      <h4>申请详情</h4>
      <div class="detail-table">
        <table>
          <tr><td><strong>物品名称:</strong></td><td>${item.item_name}</td></tr>
          <tr><td><strong>唯一编号:</strong></td><td>${item.unique_code || 'N/A'}</td></tr>
          <tr><td><strong>数量:</strong></td><td>${request.request_data.quantity}</td></tr>
    `;

    if (request.request_type === 'inbound') {
      detailHTML += `
        <tr><td><strong>入库类型:</strong></td><td>${request.request_data.inboundType === 'initial' ? '初次入库' : '归还入库'}</td></tr>
        ${request.request_data.relatedOutboundId ? `<tr><td><strong>关联出库ID:</strong></td><td>${request.request_data.relatedOutboundId}</td></tr>` : ''}
      `;
    } else if (request.request_type === 'outbound') {
      detailHTML += `
        <tr><td><strong>出库类型:</strong></td><td>${request.request_data.outboundType === 'transfer' ? '永久转移' : '暂时借用'}</td></tr>
        ${request.request_data.borrowerName ? `<tr><td><strong>借用人:</strong></td><td>${request.request_data.borrowerName}</td></tr>` : ''}
        ${request.request_data.borrowerPhone ? `<tr><td><strong>借用人电话:</strong></td><td>${request.request_data.borrowerPhone}</td></tr>` : ''}
        ${request.request_data.borrowerEmail ? `<tr><td><strong>借用人邮箱:</strong></td><td>${request.request_data.borrowerEmail}</td></tr>` : ''}
        ${request.request_data.expectedReturnDate ? `<tr><td><strong>预计归还日期:</strong></td><td>${request.request_data.expectedReturnDate}</td></tr>` : ''}
      `;
    }

    detailHTML += `
          ${request.request_data.remarks ? `<tr><td><strong>备注:</strong></td><td>${request.request_data.remarks}</td></tr>` : ''}
        </table>
      </div>
    `;

    const modalHTML = `
      <div id="approval-detail-modal" class="modal active">
        <div class="modal-content">
          <h2>审批详情</h2>
          ${detailHTML}
          <div class="form-actions">
            <button class="btn btn-secondary" onclick="closeModal('approval-detail-modal')">关闭</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  } catch (error) {
    showMessage('Failed to load approval details: ' + error.message, 'error');
  }
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
    'out_of_stock': '不在库',
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
  // Load top-level categories for cascading selection
  const topCategories = await loadTopLevelCategories();

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
                <label>一级分类 *</label>
                <select id="item-category-level1" required>
                  <option value="">请选择一级分类</option>
                  ${topCategories.map(cat => `<option value="${cat.category_id}" data-name="${cat.category_name}">${cat.category_name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" id="category-level2-group" style="display: none;">
                <label>次级分类</label>
                <select id="item-category-level2">
                  <option value="">请选择次级分类</option>
                </select>
              </div>
            </div>
            <div class="form-row" id="category-level3-row" style="display: none;">
              <div class="form-group" id="category-level3-group">
                <label>三级分类</label>
                <select id="item-category-level3">
                  <option value="">请选择三级分类</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>物品名称 *</label>
                <input type="text" id="item-name" required>
              </div>
              <div class="form-group">
                <label>型号</label>
                <input type="text" id="item-model">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" id="stackable-checkbox-group">
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
            <div class="form-row full" id="stock-input-row" style="display: none;">
              <div class="form-group">
                <label id="stock-input-label">初始库存数量 *</label>
                <input type="number" id="item-initial-stock" min="0" value="0">
              </div>
            </div>
            <div class="form-row full" id="in-stock-row">
              <div class="form-group">
                <label>
                  <input type="checkbox" id="item-in-stock" checked> 物品在库
                </label>
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

  // Setup cascading category selection and stackable logic together
  setupCascadingCategoriesAndStackable();
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

// Load top-level categories
async function loadTopLevelCategories() {
  try {
    const data = await apiRequest('/categories/top-level');
    return data.categories;
  } catch (error) {
    showMessage('加载一级分类失败: ' + error.message, 'error');
    return [];
  }
}

// Load child categories
async function loadChildCategories(parentId) {
  try {
    const data = await apiRequest(`/categories/${parentId}/children`);
    return data.categories;
  } catch (error) {
    showMessage('加载子分类失败: ' + error.message, 'error');
    return [];
  }
}

// Setup cascading category selection and stackable checkbox logic
function setupCascadingCategoriesAndStackable() {
  const level1Select = document.getElementById('item-category-level1');
  const level2Select = document.getElementById('item-category-level2');
  const level3Select = document.getElementById('item-category-level3');
  const level2Group = document.getElementById('category-level2-group');
  const level3Row = document.getElementById('category-level3-row');

  // First, setup stackable checkbox change handler
  const stackableCheckbox = document.getElementById('item-stackable');
  stackableCheckbox.addEventListener('change', (e) => {
    const uniqueCodeRow = document.getElementById('unique-code-row');
    const uniqueCodeInput = document.getElementById('item-unique-code');
    const stockInputRow = document.getElementById('stock-input-row');
    const stockInput = document.getElementById('item-initial-stock');
    const inStockRow = document.getElementById('in-stock-row');
    const inStockCheckbox = document.getElementById('item-in-stock');
    const stockLabel = document.getElementById('stock-input-label');

    if (e.target.checked) {
      // Stackable items: show quantity input, hide unique code and in-stock checkbox
      uniqueCodeRow.style.display = 'none';
      uniqueCodeInput.required = false;
      stockInputRow.style.display = 'block';
      stockInput.required = true;
      inStockRow.style.display = 'none';
      inStockCheckbox.checked = true; // Auto check
      stockLabel.textContent = '初始库存数量 *';
    } else {
      // Non-stackable items: show unique code and in-stock checkbox, hide quantity
      uniqueCodeRow.style.display = 'block';
      uniqueCodeInput.required = true;
      stockInputRow.style.display = 'none';
      stockInput.required = false;
      inStockRow.style.display = 'block';
      stockLabel.textContent = '初始库存数量';
    }
  });

  // Level 1 change - load level 2 AND auto-set stackable
  level1Select.addEventListener('change', async (e) => {
    const categoryId = e.target.value;
    const categoryName = e.target.options[e.target.selectedIndex]?.dataset.name || '';

    // Reset level 2 and 3
    level2Select.innerHTML = '<option value="">请选择次级分类</option>';
    level3Select.innerHTML = '<option value="">请选择三级分类</option>';
    level2Group.style.display = 'none';
    level3Row.style.display = 'none';

    if (categoryId) {
      // Load children
      const children = await loadChildCategories(categoryId);
      if (children.length > 0) {
        children.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.category_id;
          option.textContent = cat.category_name;
          level2Select.appendChild(option);
        });
        level2Group.style.display = 'block';
      }
    }

    // Auto-set stackable based on category
    const stackableGroup = document.getElementById('stackable-checkbox-group');

    if (categoryName === '通用配件与工具') {
      // General parts: auto-check and show checkbox
      stackableCheckbox.checked = true;
      stackableCheckbox.disabled = false;
      stackableGroup.style.display = 'block';
    } else if (categoryName === '机器人与办公用电子产品') {
      // Robots/Electronics: force non-stackable and hide checkbox
      stackableCheckbox.checked = false;
      stackableCheckbox.disabled = true;
      stackableGroup.style.display = 'none';
    } else {
      // Other categories: show checkbox and let user choose
      stackableCheckbox.disabled = false;
      stackableGroup.style.display = 'block';
    }

    // Trigger stackable change handler to update UI
    stackableCheckbox.dispatchEvent(new Event('change'));
  });

  // Level 2 change - load level 3
  level2Select.addEventListener('change', async (e) => {
    const categoryId = e.target.value;

    // Reset level 3
    level3Select.innerHTML = '<option value="">请选择三级分类</option>';
    level3Row.style.display = 'none';

    if (categoryId) {
      // Load children
      const children = await loadChildCategories(categoryId);
      if (children.length > 0) {
        children.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.category_id;
          option.textContent = cat.category_name;
          level3Select.appendChild(option);
        });
        level3Row.style.display = 'block';
      }
    }
  });
}

async function submitAddItem() {
  // Get the deepest selected category
  const level3 = document.getElementById('item-category-level3').value;
  const level2 = document.getElementById('item-category-level2').value;
  const level1 = document.getElementById('item-category-level1').value;
  const categoryId = level3 || level2 || level1;

  const itemName = document.getElementById('item-name').value;
  const model = document.getElementById('item-model').value;
  const isStackable = document.getElementById('item-stackable').checked;
  const uniqueCode = document.getElementById('item-unique-code').value;
  const initialStock = document.getElementById('item-initial-stock').value;
  const inStock = document.getElementById('item-in-stock').checked;
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

  if (isStackable && (!initialStock || parseInt(initialStock) < 0)) {
    showMessage('可堆叠物品必须提供初始库存数量', 'error');
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
        initialStock: isStackable ? parseInt(initialStock) : (inStock ? 1 : 0),
        specification: specification || null,
        description: description || null
      })
    });

    showMessage('物品创建成功！', 'success');
    closeModal('add-item-modal');

    // Fix: Wait a bit before removing to ensure modal is closed
    setTimeout(() => {
      const modal = document.getElementById('add-item-modal');
      if (modal) {
        modal.remove();
      }
    }, 300);

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

async function showInboundModal() {
  const isAdmin = currentUser.role === 'admin';

  // Load all items for selection
  let itemsData;
  try {
    itemsData = await apiRequest('/items?limit=1000');
  } catch (error) {
    showMessage('Failed to load items: ' + error.message, 'error');
    return;
  }

  const items = itemsData.items || [];
  const itemOptions = items.map(item =>
    `<option value="${item.item_id}" data-stackable="${item.is_stackable}">${item.item_name} (${item.unique_code || 'ID:' + item.item_id})</option>`
  ).join('');

  const modalHTML = `
    <div id="inbound-modal" class="modal active">
      <div class="modal-content">
        <h2>新增入库</h2>
        <form id="inbound-form">
          <div class="form-group">
            <label>选择物品 *</label>
            <select id="inbound-item" required>
              <option value="">请选择物品</option>
              ${itemOptions}
            </select>
          </div>

          <div class="form-group">
            <label>入库数量 *</label>
            <input type="number" id="inbound-quantity" min="1" value="1" required>
          </div>

          <div class="form-group">
            <label>入库类型 *</label>
            <select id="inbound-type" required>
              <option value="initial">初次入库</option>
              <option value="return">归还入库</option>
            </select>
          </div>

          <div class="form-group" id="related-outbound-group" style="display: none;">
            <label>关联出库记录ID</label>
            <input type="number" id="related-outbound-id" min="1">
            <small>如果是归还，请输入相关的出库记录ID</small>
          </div>

          <div class="form-group">
            <label>备注</label>
            <textarea id="inbound-remarks" rows="3"></textarea>
          </div>

          ${!isAdmin ? '<p class="text-warning">注意：您的入库请求需要管理员审批后才会生效</p>' : ''}

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${isAdmin ? '确认入库' : '提交申请'}</button>
            <button type="button" class="btn btn-secondary" onclick="closeModal('inbound-modal')">取消</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Event listeners
  document.getElementById('inbound-type').addEventListener('change', (e) => {
    const relatedGroup = document.getElementById('related-outbound-group');
    relatedGroup.style.display = e.target.value === 'return' ? 'block' : 'none';
  });

  document.getElementById('inbound-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitInbound();
  });
}

async function submitInbound() {
  const isAdmin = currentUser.role === 'admin';
  const itemId = document.getElementById('inbound-item').value;
  const quantity = parseInt(document.getElementById('inbound-quantity').value);
  const inboundType = document.getElementById('inbound-type').value;
  const relatedOutboundId = document.getElementById('related-outbound-id').value;
  const remarks = document.getElementById('inbound-remarks').value;

  if (!itemId || !quantity || !inboundType) {
    showMessage('Please fill in all required fields', 'error');
    return;
  }

  try {
    if (isAdmin) {
      // Admin directly creates inbound record
      await apiRequest('/inbound', {
        method: 'POST',
        body: JSON.stringify({
          itemId: parseInt(itemId),
          quantity,
          inboundType,
          relatedOutboundId: relatedOutboundId ? parseInt(relatedOutboundId) : null,
          remarks
        })
      });
      showMessage('入库成功！', 'success');
    } else {
      // Regular user creates approval request
      await apiRequest('/approvals', {
        method: 'POST',
        body: JSON.stringify({
          requestType: 'inbound',
          requestData: {
            itemId: parseInt(itemId),
            quantity,
            inboundType,
            relatedOutboundId: relatedOutboundId ? parseInt(relatedOutboundId) : null,
            remarks
          }
        })
      });
      showMessage('入库申请已提交，等待管理员审批', 'success');
    }

    closeModal('inbound-modal');
    setTimeout(() => {
      const modal = document.getElementById('inbound-modal');
      if (modal) modal.remove();
    }, 300);

    loadInboundRecords();
    loadDashboard();
  } catch (error) {
    showMessage('操作失败: ' + error.message, 'error');
  }
}

async function showOutboundModal() {
  const isAdmin = currentUser.role === 'admin';

  // Load all items for selection
  let itemsData;
  try {
    itemsData = await apiRequest('/items?limit=1000');
  } catch (error) {
    showMessage('Failed to load items: ' + error.message, 'error');
    return;
  }

  const items = itemsData.items || [];
  const itemOptions = items.map(item =>
    `<option value="${item.item_id}" data-quantity="${item.current_quantity}">${item.item_name} (库存: ${item.current_quantity})</option>`
  ).join('');

  const modalHTML = `
    <div id="outbound-modal" class="modal active">
      <div class="modal-content">
        <h2>新增出库</h2>
        <form id="outbound-form">
          <div class="form-group">
            <label>选择物品 *</label>
            <select id="outbound-item" required>
              <option value="">请选择物品</option>
              ${itemOptions}
            </select>
          </div>

          <div class="form-group">
            <label>出库数量 *</label>
            <input type="number" id="outbound-quantity" min="1" value="1" required>
            <small id="available-quantity"></small>
          </div>

          <div class="form-group">
            <label>出库类型 *</label>
            <select id="outbound-type" required>
              <option value="transfer">永久转移</option>
              <option value="borrow">暂时借用</option>
            </select>
          </div>

          <div id="borrow-fields" style="display: none;">
            <div class="form-group">
              <label>借用人姓名 *</label>
              <input type="text" id="borrower-name">
            </div>

            <div class="form-group">
              <label>借用人电话 *</label>
              <input type="tel" id="borrower-phone">
            </div>

            <div class="form-group">
              <label>借用人邮箱 *</label>
              <input type="email" id="borrower-email">
            </div>

            <div class="form-group">
              <label>预计归还日期 *</label>
              <input type="date" id="expected-return-date">
            </div>
          </div>

          <div class="form-group">
            <label>备注</label>
            <textarea id="outbound-remarks" rows="3"></textarea>
          </div>

          ${!isAdmin ? '<p class="text-warning">注意：您的出库请求需要管理员审批后才会生效</p>' : ''}

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${isAdmin ? '确认出库' : '提交申请'}</button>
            <button type="button" class="btn btn-secondary" onclick="closeModal('outbound-modal')">取消</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Event listeners
  document.getElementById('outbound-item').addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const quantity = selectedOption.dataset.quantity || 0;
    const quantityDisplay = document.getElementById('available-quantity');
    quantityDisplay.textContent = `可用库存: ${quantity}`;
  });

  document.getElementById('outbound-type').addEventListener('change', (e) => {
    const borrowFields = document.getElementById('borrow-fields');
    const isBorrow = e.target.value === 'borrow';
    borrowFields.style.display = isBorrow ? 'block' : 'none';

    // Set required attribute
    ['borrower-name', 'borrower-phone', 'borrower-email', 'expected-return-date'].forEach(id => {
      const field = document.getElementById(id);
      if (field) {
        field.required = isBorrow;
      }
    });
  });

  document.getElementById('outbound-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitOutbound();
  });
}

async function submitOutbound() {
  const isAdmin = currentUser.role === 'admin';
  const itemId = document.getElementById('outbound-item').value;
  const quantity = parseInt(document.getElementById('outbound-quantity').value);
  const outboundType = document.getElementById('outbound-type').value;
  const remarks = document.getElementById('outbound-remarks').value;

  if (!itemId || !quantity || !outboundType) {
    showMessage('Please fill in all required fields', 'error');
    return;
  }

  const requestData = {
    itemId: parseInt(itemId),
    quantity,
    outboundType,
    remarks
  };

  if (outboundType === 'borrow') {
    const borrowerName = document.getElementById('borrower-name').value;
    const borrowerPhone = document.getElementById('borrower-phone').value;
    const borrowerEmail = document.getElementById('borrower-email').value;
    const expectedReturnDate = document.getElementById('expected-return-date').value;

    if (!borrowerName || !borrowerPhone || !borrowerEmail || !expectedReturnDate) {
      showMessage('Please fill in all borrower information', 'error');
      return;
    }

    requestData.borrowerName = borrowerName;
    requestData.borrowerPhone = borrowerPhone;
    requestData.borrowerEmail = borrowerEmail;
    requestData.expectedReturnDate = expectedReturnDate;
  }

  try {
    if (isAdmin) {
      // Admin directly creates outbound record
      await apiRequest('/outbound', {
        method: 'POST',
        body: JSON.stringify(requestData)
      });
      showMessage('出库成功！', 'success');
    } else {
      // Regular user creates approval request
      await apiRequest('/approvals', {
        method: 'POST',
        body: JSON.stringify({
          requestType: 'outbound',
          requestData
        })
      });
      showMessage('出库申请已提交，等待管理员审批', 'success');
    }

    closeModal('outbound-modal');
    setTimeout(() => {
      const modal = document.getElementById('outbound-modal');
      if (modal) modal.remove();
    }, 300);

    loadOutboundRecords();
    loadDashboard();
  } catch (error) {
    showMessage('操作失败: ' + error.message, 'error');
  }
}

function showAddCategoryModal() {
  showMessage('仅管理员可通过API创建分类', 'info');
}

async function viewItem(itemId) {
  try {
    // Fetch item details
    const itemData = await apiRequest(`/items/${itemId}`);
    const item = itemData.item;

    // Fetch item history (inbound and outbound records)
    const inboundData = await apiRequest(`/inbound?itemId=${itemId}`);
    const outboundData = await apiRequest(`/outbound?itemId=${itemId}`);
    const logsData = await apiRequest(`/logs/target/item/${itemId}`);

    const inboundRecords = inboundData.records || [];
    const outboundRecords = outboundData.records || [];
    const operationLogs = logsData.logs || [];

    // Combine and sort all events by time
    const allEvents = [
      ...inboundRecords.map(r => ({
        type: 'inbound',
        time: r.inbound_time,
        quantity: r.quantity,
        operator: r.operator_name,
        remarks: r.remarks
      })),
      ...outboundRecords.map(r => ({
        type: r.outbound_type === 'borrow' ? 'borrow' : 'outbound',
        time: r.outbound_time,
        quantity: r.quantity,
        operator: r.operator_name,
        borrower: r.borrower_name,
        expectedReturn: r.expected_return_date,
        returned: r.is_returned,
        remarks: r.remarks
      })),
      ...operationLogs.map(r => ({
        type: 'operation',
        time: r.operation_time,
        operationType: r.operation_type,
        operator: r.operator_name,
        detail: r.operation_detail
      }))
    ];

    allEvents.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Generate events HTML
    let eventsHTML = '';
    if (allEvents.length === 0) {
      eventsHTML = '<tr><td colspan="5">暂无历史记录</td></tr>';
    } else {
      eventsHTML = allEvents.map(event => {
        let eventDesc = '';
        let eventDetails = '';

        if (event.type === 'inbound') {
          eventDesc = `<span class="badge badge-success">入库</span>`;
          eventDetails = `数量: ${event.quantity}`;
        } else if (event.type === 'borrow') {
          eventDesc = `<span class="badge badge-warning">借用</span>`;
          eventDetails = `数量: ${event.quantity}<br>借用人: ${event.borrower || 'N/A'}<br>预计归还: ${event.expectedReturn ? new Date(event.expectedReturn).toLocaleDateString() : 'N/A'}<br>状态: ${event.returned ? '已归还' : '未归还'}`;
        } else if (event.type === 'outbound') {
          eventDesc = `<span class="badge badge-danger">出库</span>`;
          eventDetails = `数量: ${event.quantity}`;
        } else if (event.type === 'operation') {
          eventDesc = `<span class="badge badge-secondary">操作</span>`;
          eventDetails = getOperationTypeName(event.operationType);
        }

        return `
          <tr>
            <td>${new Date(event.time).toLocaleString()}</td>
            <td>${eventDesc}</td>
            <td>${eventDetails}</td>
            <td>${event.operator || 'N/A'}</td>
            <td>${event.remarks || '-'}</td>
          </tr>
        `;
      }).join('');
    }

    const modalHTML = `
      <div id="view-item-modal" class="modal active">
        <div class="modal-content" style="max-width: 1000px;">
          <div class="modal-header">
            <h2>物品详情</h2>
            <button class="modal-close" onclick="closeModal('view-item-modal')">&times;</button>
          </div>
          <div class="modal-body">
            <div class="item-detail-section">
              <h3>基本信息</h3>
              <table class="detail-table">
                <tr><td><strong>物品名称:</strong></td><td>${item.item_name}</td></tr>
                <tr><td><strong>唯一编号:</strong></td><td>${item.unique_code || 'N/A'}</td></tr>
                <tr><td><strong>分类:</strong></td><td>${item.categoryPath || item.category_name}</td></tr>
                <tr><td><strong>型号:</strong></td><td>${item.model || '-'}</td></tr>
                <tr><td><strong>规格:</strong></td><td>${item.specification || '-'}</td></tr>
                <tr><td><strong>描述:</strong></td><td>${item.description || '-'}</td></tr>
                <tr><td><strong>可堆叠:</strong></td><td>${item.is_stackable ? '是' : '否'}</td></tr>
                <tr><td><strong>当前库存:</strong></td><td>${item.current_quantity}</td></tr>
                <tr><td><strong>总入库:</strong></td><td>${item.total_in || 0}</td></tr>
                <tr><td><strong>总出库:</strong></td><td>${item.total_out || 0}</td></tr>
                <tr><td><strong>状态:</strong></td><td><span class="badge ${getStatusBadgeClass(item.status)}">${getStatusName(item.status)}</span></td></tr>
                <tr><td><strong>创建时间:</strong></td><td>${new Date(item.created_at).toLocaleString()}</td></tr>
              </table>
            </div>

            <div class="item-detail-section">
              <h3>历史记录</h3>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>事件类型</th>
                    <th>详情</th>
                    <th>操作员</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  ${eventsHTML}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal('view-item-modal'); document.getElementById('view-item-modal').remove();">关闭</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  } catch (error) {
    showMessage('Failed to load item details: ' + error.message, 'error');
  }
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
