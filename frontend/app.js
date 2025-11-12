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
      // 处理表单验证错误（express-validator返回的errors数组）
      if (data.errors && Array.isArray(data.errors)) {
        const errorMessages = data.errors.map(err => err.msg).join('; ');
        throw new Error(errorMessages);
      }
      // 处理普通错误
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
      loadMyBorrowedItems();
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
    case 'import-export':
      loadImportExportPage();
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

    // Load recent logs - for regular users, only show their own operations
    const isAdmin = currentUser.role === 'admin';
    const logsEndpoint = isAdmin ? '/logs?limit=10' : `/logs?operatorId=${currentUser.userId}&limit=10`;
    const logsData = await apiRequest(logsEndpoint);
    displayRecentLogs(logsData.logs);

    // Load calendar
    if (typeof initCalendar === 'function') {
      initCalendar();
    }
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

// Load user's borrowed items
async function loadMyBorrowedItems() {
  const tbody = document.getElementById('my-borrowed-tbody');

  try {
    const data = await apiRequest('/outbound/my-borrowings');
    const borrowedItems = data.borrowings || [];

    if (borrowedItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-muted">您当前没有借用的物品</td></tr>';
      return;
    }

    tbody.innerHTML = borrowedItems.map(record => {
      const borrowDate = new Date(record.outbound_time).toLocaleDateString();
      const expectedReturn = record.expected_return_date
        ? new Date(record.expected_return_date).toLocaleDateString()
        : '未设置';

      const today = new Date();
      const returnDate = record.expected_return_date ? new Date(record.expected_return_date) : null;
      const isOverdue = returnDate && returnDate < today;
      const statusClass = isOverdue ? 'text-danger' : '';
      const statusText = isOverdue ? '逾期未归还' : '借用中';

      return `
        <tr>
          <td>${record.item_name || '未知物品'}</td>
          <td>${record.unique_code || 'N/A'}</td>
          <td>${record.quantity}</td>
          <td>${borrowDate}</td>
          <td>${expectedReturn}</td>
          <td class="${statusClass}">${statusText}</td>
          <td>
            <button class="btn btn-sm btn-success" onclick="returnBorrowedItem(${record.outbound_id}, ${record.item_id}, ${record.quantity})">归还</button>
            <button class="btn btn-sm btn-secondary" onclick="convertToTransferFromItems(${record.outbound_id}, ${record.item_id})">转为永久转移</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-danger">加载借用记录失败</td></tr>';
    console.error('Failed to load borrowed items:', error);
  }
}

// Return a borrowed item from the items management section
async function returnBorrowedItem(outboundId, itemId, quantity) {
  if (!confirm('确定要归还此物品吗？')) {
    return;
  }

  try {
    const isAdmin = currentUser.role === 'admin';

    if (isAdmin) {
      // Admin directly creates return inbound record
      await apiRequest('/inbound', {
        method: 'POST',
        body: JSON.stringify({
          itemId: itemId,
          quantity: quantity,
          inboundType: 'return',
          relatedOutboundId: outboundId,
          remarks: '归还'
        })
      });
      showMessage('归还成功！', 'success');
    } else {
      // Regular user creates approval request
      await apiRequest('/approvals', {
        method: 'POST',
        body: JSON.stringify({
          requestType: 'inbound',
          requestData: {
            mode: 'update_stackable',
            itemId: itemId,
            quantity: quantity,
            inboundType: 'return',
            relatedOutboundId: outboundId,
            remarks: '归还'
          }
        })
      });
      showMessage('归还申请已提交，等待管理员审批', 'success');
    }

    // Reload the borrowed items list
    loadMyBorrowedItems();
    loadDashboard();
  } catch (error) {
    showMessage('归还失败: ' + error.message, 'error');
  }
}

// Convert borrowed item to transfer from items management section
async function convertToTransferFromItems(outboundId, itemId) {
  if (!confirm('确定要将此借用转为永久转移吗？转移后该物品将不再计入您的借用记录。')) {
    return;
  }

  try {
    await apiRequest(`/outbound/${outboundId}`, {
      method: 'PUT',
      body: JSON.stringify({
        outboundType: 'transfer',
        isReturned: null  // Clear return status for transfer
      })
    });

    showMessage('已转为永久转移', 'success');

    // Reload the borrowed items list
    loadMyBorrowedItems();
    loadDashboard();
  } catch (error) {
    showMessage('转换失败: ' + error.message, 'error');
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
                <label>物品名称</label>
                <input type="text" id="item-name" placeholder="可选，未填写则使用完整索引（分类路径-唯一编号）">
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
                <label>唯一编号 * <small>（物品出厂编号或标签，如：LHT3000。系统会自动生成完整索引：分类路径-唯一编号）</small></label>
                <input type="text" id="item-unique-code" required placeholder="例如：LHT3000">
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
    return data.children || [];
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

  // Helper function to update form fields based on stackable state
  function updateFormFieldsForStackable(isStackable) {
    const uniqueCodeRow = document.getElementById('unique-code-row');
    const uniqueCodeInput = document.getElementById('item-unique-code');
    const stockInputRow = document.getElementById('stock-input-row');
    const stockInput = document.getElementById('item-initial-stock');
    const inStockRow = document.getElementById('in-stock-row');
    const inStockCheckbox = document.getElementById('item-in-stock');
    const stockLabel = document.getElementById('stock-input-label');

    if (isStackable) {
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
  }

  // Setup stackable checkbox change handler
  const stackableCheckbox = document.getElementById('item-stackable');
  stackableCheckbox.addEventListener('change', (e) => {
    updateFormFieldsForStackable(e.target.checked);
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
      // Directly update form fields
      updateFormFieldsForStackable(true);
    } else if (categoryName === '机器人与办公用电子产品') {
      // Robots/Electronics: force non-stackable and hide checkbox
      stackableCheckbox.checked = false;
      stackableCheckbox.disabled = true;
      stackableGroup.style.display = 'none';
      // Directly update form fields
      updateFormFieldsForStackable(false);
    } else {
      // Other categories: default to non-stackable but allow user to change
      // Reset to unchecked (unique code) when switching to other categories
      stackableCheckbox.checked = false;
      stackableCheckbox.disabled = false;
      stackableGroup.style.display = 'block';
      // Update form fields to show unique code input
      updateFormFieldsForStackable(false);
    }
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
  const isStackable = document.getElementById('item-stackable').checked;
  const uniqueCode = document.getElementById('item-unique-code').value;
  const initialStock = document.getElementById('item-initial-stock').value;
  const inStock = document.getElementById('item-in-stock').checked;
  const specification = document.getElementById('item-specification').value;
  const description = document.getElementById('item-description').value;

  if (!categoryId) {
    showMessage('请选择分类', 'error');
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
        itemName: itemName || null,  // 后端会自动生成完整索引
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

// 归还模态框
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
            <h2>归还 - 我的借用</h2>
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

  // Load top-level categories
  let topCategories;
  try {
    const data = await apiRequest('/categories/top-level');
    topCategories = data.categories || [];
  } catch (error) {
    showMessage('Failed to load categories: ' + error.message, 'error');
    return;
  }

  const categoryOptions = topCategories.map(cat =>
    `<option value="${cat.category_id}" data-name="${cat.category_name}">${cat.category_name}</option>`
  ).join('');

  const modalHTML = `
    <div id="inbound-modal" class="modal active">
      <div class="modal-content">
        <h2>新增入库</h2>
        <form id="inbound-form">
          <!-- Cascading Category Selection -->
          <div class="form-group">
            <label>一级分类 *</label>
            <select id="inbound-category-level1" required>
              <option value="">请选择一级分类</option>
              ${categoryOptions}
            </select>
          </div>

          <div class="form-group" id="inbound-category-level2-group" style="display: none;">
            <label>次级分类 *</label>
            <select id="inbound-category-level2">
              <option value="">请选择次级分类</option>
            </select>
          </div>

          <div class="form-group" id="inbound-category-level3-group" style="display: none;">
            <label>三级分类 *</label>
            <select id="inbound-category-level3">
              <option value="">请选择三级分类</option>
            </select>
          </div>

          <!-- Mode 1: Unique Code Input (for non-stackable items) -->
          <div id="unique-code-mode" style="display: none;">
            <div class="form-group">
              <label>唯一编号 *</label>
              <input type="text" id="inbound-unique-code" placeholder="例如: Computer-A-12345">
              <small>为该物品分配一个唯一的编号</small>
            </div>

            <div class="form-group">
              <label>物品名称</label>
              <input type="text" id="inbound-item-name" placeholder="可选，未填写则使用完整索引">
            </div>

            <div class="form-group">
              <label>规格说明</label>
              <textarea id="inbound-item-spec" rows="2" placeholder="例如: i7-10750H, 16GB RAM, 512GB SSD"></textarea>
            </div>
          </div>

          <!-- Mode 2: Item Selection (for stackable items) -->
          <div id="item-selection-mode" style="display: none;">
            <div class="form-group">
              <label>选择物品 *</label>
              <select id="inbound-existing-item">
                <option value="">请先选择分类</option>
              </select>
              <small>从该分类下已有的物品中选择</small>
            </div>

            <div class="form-group">
              <label>入库数量 *</label>
              <input type="number" id="inbound-quantity" min="1" value="1">
            </div>
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

  // Setup cascading category selection for inbound
  setupInboundCascadingCategories();

  document.getElementById('inbound-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitInbound();
  });
}

// Setup cascading category selection for inbound modal
function setupInboundCascadingCategories() {
  const level1Select = document.getElementById('inbound-category-level1');
  const level2Group = document.getElementById('inbound-category-level2-group');
  const level2Select = document.getElementById('inbound-category-level2');
  const level3Group = document.getElementById('inbound-category-level3-group');
  const level3Select = document.getElementById('inbound-category-level3');

  const uniqueCodeMode = document.getElementById('unique-code-mode');
  const itemSelectionMode = document.getElementById('item-selection-mode');
  const existingItemSelect = document.getElementById('inbound-existing-item');

  let selectedCategoryId = null;
  let isStackable = false;

  // Level 1 change handler
  level1Select.addEventListener('change', async (e) => {
    const categoryId = e.target.value;

    // Reset downstream selections
    level2Select.innerHTML = '<option value="">请选择次级分类</option>';
    level3Select.innerHTML = '<option value="">请选择三级分类</option>';
    level2Group.style.display = 'none';
    level3Group.style.display = 'none';
    uniqueCodeMode.style.display = 'none';
    itemSelectionMode.style.display = 'none';
    existingItemSelect.innerHTML = '<option value="">请先选择完整分类路径</option>';

    if (!categoryId) return;

    // Load level 2 categories
    try {
      const data = await apiRequest(`/categories/${categoryId}/children`);
      if (data.children && data.children.length > 0) {
        data.children.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.category_id;
          option.textContent = cat.category_name;
          option.dataset.name = cat.category_name;
          level2Select.appendChild(option);
        });
        level2Group.style.display = 'block';
      } else {
        // No children - this is the final category
        await handleFinalCategorySelection(categoryId);
      }
    } catch (error) {
      showMessage('加载次级分类失败: ' + error.message, 'error');
    }
  });

  // Level 2 change handler
  level2Select.addEventListener('change', async (e) => {
    const categoryId = e.target.value;

    // Reset downstream selections
    level3Select.innerHTML = '<option value="">请选择三级分类</option>';
    level3Group.style.display = 'none';
    uniqueCodeMode.style.display = 'none';
    itemSelectionMode.style.display = 'none';
    existingItemSelect.innerHTML = '<option value="">请先选择完整分类路径</option>';

    if (!categoryId) return;

    // Load level 3 categories
    try {
      const data = await apiRequest(`/categories/${categoryId}/children`);
      if (data.children && data.children.length > 0) {
        data.children.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.category_id;
          option.textContent = cat.category_name;
          option.dataset.name = cat.category_name;
          level3Select.appendChild(option);
        });
        level3Group.style.display = 'block';
      } else {
        // No children - this is the final category
        await handleFinalCategorySelection(categoryId);
      }
    } catch (error) {
      showMessage('加载三级分类失败: ' + error.message, 'error');
    }
  });

  // Level 3 change handler
  level3Select.addEventListener('change', async (e) => {
    const categoryId = e.target.value;

    uniqueCodeMode.style.display = 'none';
    itemSelectionMode.style.display = 'none';
    existingItemSelect.innerHTML = '<option value="">请先选择完整分类路径</option>';

    if (!categoryId) return;

    await handleFinalCategorySelection(categoryId);
  });

  // Handle final category selection - determine mode and load items
  async function handleFinalCategorySelection(categoryId) {
    selectedCategoryId = categoryId;

    try {
      // Get category details to check if stackable
      const categoryData = await apiRequest(`/categories/${categoryId}/details`);
      isStackable = categoryData.category.is_stackable === 1;

      if (isStackable) {
        // Stackable items: Show item selection mode
        itemSelectionMode.style.display = 'block';
        uniqueCodeMode.style.display = 'none';

        // Load existing items in this category
        const itemsData = await apiRequest(`/items?categoryId=${categoryId}`);
        existingItemSelect.innerHTML = '<option value="">请选择物品</option>';

        if (itemsData.items && itemsData.items.length > 0) {
          itemsData.items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.item_id;
            option.textContent = `${item.item_name}${item.model ? ' - ' + item.model : ''} (当前库存: ${item.quantity})`;
            existingItemSelect.appendChild(option);
          });
        } else {
          existingItemSelect.innerHTML = '<option value="">该分类下暂无物品</option>';
        }
      } else {
        // Non-stackable items: Show unique code input mode
        uniqueCodeMode.style.display = 'block';
        itemSelectionMode.style.display = 'none';
      }
    } catch (error) {
      showMessage('加载分类信息失败: ' + error.message, 'error');
    }
  }
}

async function submitInbound() {
  const isAdmin = currentUser.role === 'admin';
  const remarks = document.getElementById('inbound-remarks').value;

  // Determine which mode is active
  const uniqueCodeMode = document.getElementById('unique-code-mode');
  const itemSelectionMode = document.getElementById('item-selection-mode');

  const isUniqueCodeMode = uniqueCodeMode && uniqueCodeMode.style.display !== 'none';
  const isItemSelectionMode = itemSelectionMode && itemSelectionMode.style.display !== 'none';

  if (!isUniqueCodeMode && !isItemSelectionMode) {
    showMessage('请先选择完整的分类路径', 'error');
    return;
  }

  try {
    if (isUniqueCodeMode) {
      // Unique code mode: Create new item with initial inbound
      const uniqueCode = document.getElementById('inbound-unique-code').value.trim();
      const itemName = document.getElementById('inbound-item-name').value.trim();
      const specification = document.getElementById('inbound-item-spec').value.trim();

      if (!uniqueCode) {
        showMessage('请填写唯一编号', 'error');
        return;
      }

      // Get selected category ID
      const level3Select = document.getElementById('inbound-category-level3');
      const level2Select = document.getElementById('inbound-category-level2');
      const level1Select = document.getElementById('inbound-category-level1');

      const categoryId = level3Select.value || level2Select.value || level1Select.value;

      if (!categoryId) {
        showMessage('请选择分类', 'error');
        return;
      }

      if (isAdmin) {
        // Admin directly creates item with initial inbound
        await apiRequest('/items', {
          method: 'POST',
          body: JSON.stringify({
            uniqueCode,
            itemName: itemName || null,  // 后端会自动生成完整索引
            categoryId: parseInt(categoryId),
            specification,
            isStackable: false,
            initialStock: 1, // Unique code items always have quantity 1
            remarks
          })
        });
        showMessage('物品创建并入库成功！', 'success');
      } else {
        // Regular user creates approval request for new item creation
        await apiRequest('/approvals', {
          method: 'POST',
          body: JSON.stringify({
            requestType: 'inbound',
            requestData: {
              mode: 'create_unique',
              uniqueCode,
              itemName: itemName || null,  // 后端会自动生成完整索引
              categoryId: parseInt(categoryId),
              specification,
              isStackable: false,
              initialStock: 1,
              remarks
            }
          })
        });
        showMessage('入库申请已提交，等待管理员审批', 'success');
      }
    } else if (isItemSelectionMode) {
      // Item selection mode: Update existing stackable item
      const itemId = document.getElementById('inbound-existing-item').value;
      const quantity = parseInt(document.getElementById('inbound-quantity').value);

      if (!itemId || !quantity || quantity < 1) {
        showMessage('请选择物品并填写有效数量', 'error');
        return;
      }

      if (isAdmin) {
        // Admin directly creates inbound record
        await apiRequest('/inbound', {
          method: 'POST',
          body: JSON.stringify({
            itemId: parseInt(itemId),
            quantity,
            inboundType: 'initial',
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
              mode: 'update_stackable',
              itemId: parseInt(itemId),
              quantity,
              inboundType: 'initial',
              remarks
            }
          })
        });
        showMessage('入库申请已提交，等待管理员审批', 'success');
      }
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

  // Load top-level categories
  let topCategories;
  try {
    const data = await apiRequest('/categories/top-level');
    topCategories = data.categories || [];
  } catch (error) {
    showMessage('Failed to load categories: ' + error.message, 'error');
    return;
  }

  // Load user's borrowed items
  let borrowedItems = [];
  try {
    const borrowingsData = await apiRequest('/outbound/my-borrowings');
    borrowedItems = borrowingsData.borrowings || [];
  } catch (error) {
    console.warn('Failed to load borrowed items:', error);
  }

  const categoryOptions = topCategories.map(cat =>
    `<option value="${cat.category_id}" data-name="${cat.category_name}">${cat.category_name}</option>`
  ).join('');

  const borrowedItemsHTML = borrowedItems.length > 0 ? borrowedItems.map(record => `
    <div class="borrowed-item-card" data-outbound-id="${record.outbound_id}" data-item-id="${record.item_id}">
      <div class="borrowed-item-info">
        <h4>${record.item_name || '未知物品'}</h4>
        <p>唯一编号: ${record.unique_code || 'N/A'}</p>
        <p>借用数量: ${record.quantity}</p>
        <p>借出时间: ${new Date(record.outbound_date).toLocaleDateString()}</p>
        <p>预计归还: ${record.expected_return_date ? new Date(record.expected_return_date).toLocaleDateString() : '未设置'}</p>
      </div>
      <div class="borrowed-item-actions">
        <button type="button" class="btn btn-sm btn-success" onclick="convertToTransfer(${record.outbound_id}, ${record.item_id})">转为永久转移</button>
      </div>
    </div>
  `).join('') : '<p class="text-muted">您当前没有借用的物品</p>';

  const modalHTML = `
    <div id="outbound-modal" class="modal active">
      <div class="modal-content modal-large">
        <h2>新增出库</h2>

        <!-- Tab Navigation -->
        <div class="tab-nav">
          <button class="tab-btn active" onclick="switchOutboundTab('new-outbound')">新增出库</button>
          <button class="tab-btn" onclick="switchOutboundTab('my-borrowed')">我的借用</button>
        </div>

        <!-- Tab 1: New Outbound -->
        <div id="tab-new-outbound" class="tab-content active">
          <form id="outbound-form">
            <!-- Cascading Category Selection -->
            <div class="form-group">
              <label>一级分类 *</label>
              <select id="outbound-category-level1" required>
                <option value="">请选择一级分类</option>
                ${categoryOptions}
              </select>
            </div>

            <div class="form-group" id="outbound-category-level2-group" style="display: none;">
              <label>次级分类 *</label>
              <select id="outbound-category-level2">
                <option value="">请选择次级分类</option>
              </select>
            </div>

            <div class="form-group" id="outbound-category-level3-group" style="display: none;">
              <label>三级分类 *</label>
              <select id="outbound-category-level3">
                <option value="">请选择三级分类</option>
              </select>
            </div>

            <!-- Item Selection (shown after category is selected) -->
            <div id="item-selection" style="display: none;">
              <div class="form-group">
                <label>选择物品 *</label>
                <select id="outbound-item">
                  <option value="">请先选择完整分类路径</option>
                </select>
              </div>

              <div class="form-group">
                <label>出库数量 *</label>
                <input type="number" id="outbound-quantity" min="1" value="1">
                <small id="available-quantity"></small>
              </div>

              <div class="form-group">
                <label>出库类型 *</label>
                <select id="outbound-type">
                  <option value="transfer">永久转移</option>
                  <option value="borrow">暂时借用</option>
                </select>
              </div>

              <div id="borrow-fields" style="display: none;">
                <div class="form-group">
                  <label>归还期限 *</label>
                  <div style="display: flex; gap: 10px; align-items: center;">
                    <select id="return-date-mode" style="flex: 0 0 120px;">
                      <option value="date">指定日期</option>
                      <option value="long-term">长期借用</option>
                    </select>
                    <input type="date" id="expected-return-date" style="flex: 1;">
                  </div>
                  <small id="long-term-hint" style="display: none; color: #666;">长期借用无需归还日期，适用于长期使用的物品</small>
                </div>
                <p class="text-info" style="margin-top: 10px; font-size: 14px;">
                  借用人信息将自动使用您的账号信息（姓名、邮箱、手机号）
                </p>
              </div>

              <div class="form-group">
                <label>备注</label>
                <textarea id="outbound-remarks" rows="3"></textarea>
              </div>
            </div>

            ${!isAdmin ? '<p class="text-warning">注意：您的出库请求需要管理员审批后才会生效</p>' : ''}

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">${isAdmin ? '确认出库' : '提交申请'}</button>
              <button type="button" class="btn btn-secondary" onclick="closeModal('outbound-modal')">取消</button>
            </div>
          </form>
        </div>

        <!-- Tab 2: My Borrowed Items -->
        <div id="tab-my-borrowed" class="tab-content">
          <div class="borrowed-items-container">
            ${borrowedItemsHTML}
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal('outbound-modal')">关闭</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Setup cascading categories and event listeners
  setupOutboundCascadingCategories();

  document.getElementById('outbound-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitOutbound();
  });
}

// Setup cascading category selection for outbound modal
function setupOutboundCascadingCategories() {
  const level1Select = document.getElementById('outbound-category-level1');
  const level2Group = document.getElementById('outbound-category-level2-group');
  const level2Select = document.getElementById('outbound-category-level2');
  const level3Group = document.getElementById('outbound-category-level3-group');
  const level3Select = document.getElementById('outbound-category-level3');

  const itemSelection = document.getElementById('item-selection');
  const outboundItemSelect = document.getElementById('outbound-item');
  const quantityDisplay = document.getElementById('available-quantity');
  const outboundTypeSelect = document.getElementById('outbound-type');
  const borrowFields = document.getElementById('borrow-fields');

  // Level 1 change handler
  level1Select.addEventListener('change', async (e) => {
    const categoryId = e.target.value;

    // Reset downstream selections
    level2Select.innerHTML = '<option value="">请选择次级分类</option>';
    level3Select.innerHTML = '<option value="">请选择三级分类</option>';
    level2Group.style.display = 'none';
    level3Group.style.display = 'none';
    itemSelection.style.display = 'none';
    outboundItemSelect.innerHTML = '<option value="">请先选择完整分类路径</option>';

    if (!categoryId) return;

    // Load level 2 categories
    try {
      const data = await apiRequest(`/categories/${categoryId}/children`);
      if (data.children && data.children.length > 0) {
        data.children.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.category_id;
          option.textContent = cat.category_name;
          level2Select.appendChild(option);
        });
        level2Group.style.display = 'block';
      } else {
        // No children - load items
        await loadOutboundItems(categoryId);
      }
    } catch (error) {
      showMessage('加载次级分类失败: ' + error.message, 'error');
    }
  });

  // Level 2 change handler
  level2Select.addEventListener('change', async (e) => {
    const categoryId = e.target.value;

    // Reset downstream selections
    level3Select.innerHTML = '<option value="">请选择三级分类</option>';
    level3Group.style.display = 'none';
    itemSelection.style.display = 'none';
    outboundItemSelect.innerHTML = '<option value="">请先选择完整分类路径</option>';

    if (!categoryId) return;

    // Load level 3 categories
    try {
      const data = await apiRequest(`/categories/${categoryId}/children`);
      if (data.children && data.children.length > 0) {
        data.children.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.category_id;
          option.textContent = cat.category_name;
          level3Select.appendChild(option);
        });
        level3Group.style.display = 'block';
      } else {
        // No children - load items
        await loadOutboundItems(categoryId);
      }
    } catch (error) {
      showMessage('加载三级分类失败: ' + error.message, 'error');
    }
  });

  // Level 3 change handler
  level3Select.addEventListener('change', async (e) => {
    const categoryId = e.target.value;

    itemSelection.style.display = 'none';
    outboundItemSelect.innerHTML = '<option value="">请先选择完整分类路径</option>';

    if (!categoryId) return;

    await loadOutboundItems(categoryId);
  });

  // Load items for selected category
  async function loadOutboundItems(categoryId) {
    try {
      const itemsData = await apiRequest(`/items?categoryId=${categoryId}`);
      outboundItemSelect.innerHTML = '<option value="">请选择物品</option>';

      if (itemsData.items && itemsData.items.length > 0) {
        itemsData.items.forEach(item => {
          const option = document.createElement('option');
          option.value = item.item_id;
          option.dataset.quantity = item.current_quantity;
          option.textContent = `${item.item_name}${item.unique_code ? ' - ' + item.unique_code : ''}${item.model ? ' - ' + item.model : ''} (库存: ${item.current_quantity})`;
          outboundItemSelect.appendChild(option);
        });
        itemSelection.style.display = 'block';
      } else {
        outboundItemSelect.innerHTML = '<option value="">该分类下暂无物品</option>';
        itemSelection.style.display = 'block';
      }
    } catch (error) {
      showMessage('加载物品失败: ' + error.message, 'error');
    }
  }

  // Item selection handler - show available quantity
  outboundItemSelect.addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const quantity = selectedOption.dataset.quantity || 0;
    quantityDisplay.textContent = `可用库存: ${quantity}`;
  });

  // Outbound type change handler
  outboundTypeSelect.addEventListener('change', (e) => {
    const isBorrow = e.target.value === 'borrow';
    borrowFields.style.display = isBorrow ? 'block' : 'none';
  });

  // Return date mode change handler
  const returnDateModeSelect = document.getElementById('return-date-mode');
  const expectedReturnDateInput = document.getElementById('expected-return-date');
  const longTermHint = document.getElementById('long-term-hint');

  if (returnDateModeSelect && expectedReturnDateInput && longTermHint) {
    returnDateModeSelect.addEventListener('change', (e) => {
      const isLongTerm = e.target.value === 'long-term';

      if (isLongTerm) {
        expectedReturnDateInput.style.display = 'none';
        expectedReturnDateInput.required = false;
        expectedReturnDateInput.value = '';
        longTermHint.style.display = 'block';
      } else {
        expectedReturnDateInput.style.display = 'block';
        expectedReturnDateInput.required = true;
        longTermHint.style.display = 'none';
      }
    });
  }
}

// Switch between tabs in outbound modal
function switchOutboundTab(tabName) {
  const tabs = document.querySelectorAll('#outbound-modal .tab-content');
  const buttons = document.querySelectorAll('#outbound-modal .tab-btn');

  tabs.forEach(tab => {
    tab.classList.remove('active');
  });

  buttons.forEach(btn => {
    btn.classList.remove('active');
  });

  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) {
    targetTab.classList.add('active');
  }

  // Find and activate the corresponding button
  buttons.forEach(btn => {
    if (btn.textContent.includes(tabName === 'new-outbound' ? '新增出库' : '我的借用')) {
      btn.classList.add('active');
    }
  });
}

// Convert borrowed item to permanent transfer
async function convertToTransfer(outboundId, itemId) {
  if (!confirm('确定要将此借用转为永久转移吗？转移后该物品将不再计入您的借用记录。')) {
    return;
  }

  try {
    await apiRequest(`/outbound/${outboundId}`, {
      method: 'PUT',
      body: JSON.stringify({
        outboundType: 'transfer',
        isReturned: null  // Clear return status for transfer
      })
    });

    showMessage('已转为永久转移', 'success');

    // Remove the card from the UI
    const card = document.querySelector(`.borrowed-item-card[data-outbound-id="${outboundId}"]`);
    if (card) {
      card.remove();
    }

    // Check if no more borrowed items
    const container = document.querySelector('.borrowed-items-container');
    if (container && container.querySelectorAll('.borrowed-item-card').length === 0) {
      container.innerHTML = '<p class="text-muted">您当前没有借用的物品</p>';
    }

    loadDashboard();
  } catch (error) {
    showMessage('转换失败: ' + error.message, 'error');
  }
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
    const returnDateMode = document.getElementById('return-date-mode').value;
    const expectedReturnDate = document.getElementById('expected-return-date').value;

    // 验证归还日期（非长期借用时必填）
    if (returnDateMode === 'date' && !expectedReturnDate) {
      showMessage('请填写预计归还日期', 'error');
      return;
    }

    // Use current user's information as borrower
    requestData.borrowerName = currentUser.username;
    requestData.borrowerPhone = currentUser.phone || '';
    requestData.borrowerEmail = currentUser.email;

    // 长期借用时不设置归还日期（设为null）
    requestData.expectedReturnDate = returnDateMode === 'long-term' ? null : expectedReturnDate;
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
    document.getElementById('profile-created').textContent = new Date(user.createdAt).toLocaleString('zh-CN');
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

    // 恢复之前保存的展开/收起状态
    restoreCategoryToggleStates();
  } catch (error) {
    showMessage('获取分类失败：' + error.message, 'error');
  }
}

// 恢复分类展开/收起状态
function restoreCategoryToggleStates() {
  try {
    const collapsedCategories = JSON.parse(localStorage.getItem('collapsedCategories') || '{}');

    // 遍历所有需要收起的分类
    for (const childrenId in collapsedCategories) {
      if (collapsedCategories[childrenId]) {
        const childrenElement = document.getElementById(childrenId);
        const toggleBtn = document.querySelector(`[onclick*="${childrenId}"]`);

        if (childrenElement && toggleBtn) {
          childrenElement.style.display = 'none';
          toggleBtn.textContent = '▷';
          toggleBtn.classList.add('collapsed');
        }
      }
    }
  } catch (error) {
    console.error('恢复分类状态失败:', error);
  }
}

// 构建分类树HTML（带操作按钮和展开/收起功能）
function buildCategoryTreeHTML(categories, level = 0) {
  let html = '<ul class="category-tree">';

  for (const cat of categories) {
    const indent = level * 20;
    const isAdmin = currentUser && currentUser.role === 'admin';
    const hasChildren = cat.children && cat.children.length > 0;

    // 为每个分类生成唯一ID
    const categoryDomId = `category-${cat.category_id}`;
    const childrenDomId = `children-${cat.category_id}`;

    // 默认收起子分类（除了一级分类）
    const defaultCollapsed = level > 0;
    const toggleBtnText = defaultCollapsed ? '▷' : '▽';
    const toggleBtnClass = defaultCollapsed ? 'collapsed' : '';
    const childrenStyle = defaultCollapsed ? 'style="display: none;"' : '';

    html += `
      <li style="padding-left: ${indent}px">
        <div class="category-item">
          ${hasChildren ? `
            <span class="toggle-btn ${toggleBtnClass}" onclick="toggleCategory('${childrenDomId}', this)">${toggleBtnText}</span>
          ` : `
            <span class="toggle-btn-placeholder"></span>
          `}
          <span class="category-name">${cat.category_name}</span>
          ${cat.description ? `<span class="category-desc">(${cat.description})</span>` : ''}
          ${isAdmin ? `
            <div class="category-actions">
              <button class="btn btn-sm" onclick="showEditCategoryModal(${cat.category_id}, '${cat.category_name.replace(/'/g, "\\'")}', '${(cat.description || '').replace(/'/g, "\\'")}', ${cat.sort_order || 0})">编辑</button>
              <button class="btn btn-sm btn-danger" onclick="deleteCategory(${cat.category_id}, '${cat.category_name.replace(/'/g, "\\'")}')">删除</button>
              <button class="btn btn-sm btn-secondary" onclick="showAddSubcategoryModal(${cat.category_id}, '${cat.category_name.replace(/'/g, "\\'")}')">添加子分类</button>
            </div>
          ` : ''}
        </div>
        ${hasChildren ? `<div id="${childrenDomId}" class="category-children" ${childrenStyle}>${buildCategoryTreeHTML(cat.children, level + 1)}</div>` : ''}
      </li>
    `;
  }

  html += '</ul>';
  return html;
}

// 切换分类展开/收起状态
function toggleCategory(childrenId, toggleBtn) {
  const childrenElement = document.getElementById(childrenId);
  if (!childrenElement) return;

  const isCollapsed = childrenElement.style.display === 'none';

  if (isCollapsed) {
    // 展开
    childrenElement.style.display = 'block';
    toggleBtn.textContent = '▽';
    toggleBtn.classList.remove('collapsed');
  } else {
    // 收起
    childrenElement.style.display = 'none';
    toggleBtn.textContent = '▷';
    toggleBtn.classList.add('collapsed');
  }

  // 保存展开/收起状态到 localStorage
  saveCategoryToggleState(childrenId, !isCollapsed);
}

// 保存分类展开/收起状态
function saveCategoryToggleState(childrenId, isCollapsed) {
  try {
    let collapsedCategories = JSON.parse(localStorage.getItem('collapsedCategories') || '{}');
    if (isCollapsed) {
      collapsedCategories[childrenId] = true;
    } else {
      delete collapsedCategories[childrenId];
    }
    localStorage.setItem('collapsedCategories', JSON.stringify(collapsedCategories));
  } catch (error) {
    console.error('保存分类状态失败:', error);
  }
}

// 获取分类展开/收起状态
function getCategoryToggleState(childrenId) {
  try {
    const collapsedCategories = JSON.parse(localStorage.getItem('collapsedCategories') || '{}');
    return collapsedCategories[childrenId] === true;
  } catch (error) {
    console.error('读取分类状态失败:', error);
    return false;
  }
}

// 确保分类展开（用于新增子分类后保持父分类展开）
function ensureCategoryExpanded(childrenId) {
  try {
    let collapsedCategories = JSON.parse(localStorage.getItem('collapsedCategories') || '{}');
    // 从收起列表中删除该分类，确保其展开
    delete collapsedCategories[childrenId];
    localStorage.setItem('collapsedCategories', JSON.stringify(collapsedCategories));
  } catch (error) {
    console.error('设置分类展开状态失败:', error);
  }
}

// 确保从根节点到指定分类的整个路径都展开
async function ensureCategoryPathExpanded(categoryId) {
  try {
    // 获取所有分类数据以便查找父级链
    const data = await apiRequest('/categories');
    const categories = data.categories;

    // 构建分类ID到分类对象的映射（扁平化所有分类）
    const categoryMap = {};
    function flattenCategories(cats) {
      cats.forEach(cat => {
        categoryMap[cat.category_id] = cat;
        if (cat.children && cat.children.length > 0) {
          flattenCategories(cat.children);
        }
      });
    }
    flattenCategories(categories);

    // 从当前分类向上查找所有父分类
    const pathIds = [];
    let currentId = categoryId;
    while (currentId && categoryMap[currentId]) {
      pathIds.push(currentId);
      currentId = categoryMap[currentId].parent_id;
    }

    // 展开整个路径上的所有分类
    pathIds.forEach(id => {
      ensureCategoryExpanded(`children-${id}`);
    });
  } catch (error) {
    console.error('设置分类路径展开失败:', error);
    // 如果失败，至少展开直接父分类
    ensureCategoryExpanded(`children-${categoryId}`);
  }
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

    // 确保父分类及其所有祖先分类在重新加载后保持展开状态
    await ensureCategoryPathExpanded(parseInt(parentId));

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
      loadMyBorrowedItems();
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
