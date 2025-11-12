// ========== 导入/导出功能 ==========

// 加载导入/导出页面
async function loadImportExportPage() {
  try {
    // 加载分类选择器
    const categories = await loadCategoriesForSelect();
    const categorySelect = document.getElementById('export-category-select');
    const itemsCategorySelect = document.getElementById('export-items-category-select');

    if (!categorySelect || !itemsCategorySelect) {
      console.error('无法找到分类选择器元素');
      return;
    }

    categorySelect.innerHTML = '<option value="">请选择分类</option>';
    itemsCategorySelect.innerHTML = '<option value="">请选择分类</option>';

    if (!categories || categories.length === 0) {
      console.warn('没有加载到分类数据');
      categorySelect.innerHTML += '<option value="" disabled>暂无分类</option>';
      itemsCategorySelect.innerHTML += '<option value="" disabled>暂无分类</option>';
    } else {
      categories.forEach(cat => {
        const indent = '　'.repeat(Math.max(0, cat.level - 1));
        const option1 = document.createElement('option');
        option1.value = cat.category_id;
        option1.textContent = indent + cat.category_name;
        categorySelect.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = cat.category_id;
        option2.textContent = indent + cat.category_name;
        itemsCategorySelect.appendChild(option2);
      });
      console.log(`已加载 ${categories.length} 个分类到选择器`);
    }

    // 加载用户选择器
    const usersData = await apiRequest('/users');
    const userSelect = document.getElementById('export-logs-user');
    if (userSelect) {
      userSelect.innerHTML = '<option value="">全部用户</option>';
      usersData.users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.user_id;
        option.textContent = user.username;
        userSelect.appendChild(option);
      });
      console.log(`已加载 ${usersData.users.length} 个用户到选择器`);
    }

    // 设置文件输入监听器
    setupFileInputListeners();
  } catch (error) {
    console.error('加载导入/导出页面失败:', error);
    showMessage('加载导入/导出页面失败: ' + error.message, 'error');
  }
}

// 设置文件输入监听器
function setupFileInputListeners() {
  document.getElementById('import-categories-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      document.querySelector('#import-categories-file + button').textContent = file.name;
    }
  });

  document.getElementById('import-items-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      document.querySelector('#import-items-file + button').textContent = file.name;
    }
  });

  document.getElementById('import-users-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      document.querySelector('#import-users-file + button').textContent = file.name;
    }
  });
}

// 导出数据
async function exportData(type, mode, params = {}) {
  try {
    let url = `/export/${type}`;
    const queryParams = new URLSearchParams(params).toString();
    if (queryParams) {
      url += '?' + queryParams;
    }

    const data = await apiRequest(url);

    // 下载JSON文件
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().split('T')[0];
    link.download = `${type}_${timestamp}.json`;
    link.click();

    showMessage(`${type} 导出成功`, 'success');
  } catch (error) {
    showMessage('导出失败: ' + error.message, 'error');
  }
}

// 导出选中分类
function exportSelectedCategory() {
  const categoryId = document.getElementById('export-category-select').value;
  if (!categoryId) {
    showMessage('请选择要导出的分类', 'error');
    return;
  }
  exportData('categories', 'selected', { categoryId });
}

// 按分类导出物品
function exportItemsByCategory() {
  const categoryId = document.getElementById('export-items-category-select').value;
  if (!categoryId) {
    showMessage('请选择要导出的分类', 'error');
    return;
  }
  exportData('items', 'selected', { categoryId });
}

// 导出日志
function exportLogs() {
  const startDate = document.getElementById('export-logs-start').value;
  const endDate = document.getElementById('export-logs-end').value;
  const userId = document.getElementById('export-logs-user').value;

  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (userId) params.userId = userId;

  exportData('logs', 'filtered', params);
}

// 导入数据
async function importData(type) {
  try {
    const fileInput = document.getElementById(`import-${type}-file`);
    const mode = document.getElementById(`import-${type}-mode`).value;

    if (!fileInput.files || fileInput.files.length === 0) {
      showMessage('请先选择要导入的文件', 'error');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async function(e) {
      try {
        const jsonData = JSON.parse(e.target.result);

        // 验证数据格式
        if (!jsonData.data || !Array.isArray(jsonData.data)) {
          showMessage('文件格式错误：缺少 data 数组', 'error');
          return;
        }

        // 确认操作
        const confirmMessage = mode === 'replace'
          ? `确定要完全替换现有的 ${type} 数据吗？此操作不可撤销！`
          : `确定要导入 ${jsonData.data.length} 条 ${type} 数据吗？`;

        if (!confirm(confirmMessage)) {
          return;
        }

        // 调用导入API
        const result = await apiRequest(`/import/${type}`, {
          method: 'POST',
          body: JSON.stringify({
            data: jsonData.data,
            mode: mode
          })
        });

        showMessage(result.message + ` (导入: ${result.imported}, 跳过: ${result.skipped})`, 'success');

        // 清空文件选择
        fileInput.value = '';
        document.querySelector(`#import-${type}-file + button`).textContent = '选择文件';

        // 刷新相关页面
        if (type === 'categories') {
          loadCategories();
        } else if (type === 'items') {
          loadItems();
        } else if (type === 'users') {
          loadUsers();
        }
      } catch (error) {
        showMessage('导入失败: ' + error.message, 'error');
      }
    };

    reader.onerror = function() {
      showMessage('文件读取失败', 'error');
    };

    reader.readAsText(file);
  } catch (error) {
    showMessage('导入失败: ' + error.message, 'error');
  }
}
