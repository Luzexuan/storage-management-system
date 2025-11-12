// ========== 日历功能 ==========

let currentCalendarDate = new Date();
let calendarEvents = [];

// 初始化日历
function initCalendar() {
  loadCalendar();
}

// 加载日历
async function loadCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  // 更新月份年份显示
  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月',
                      '七月', '八月', '九月', '十月', '十一月', '十二月'];
  document.getElementById('calendar-month-year').textContent =
    `${year}年 ${monthNames[month]}`;

  // 获取当月第一天和最后一天
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay()); // 调整到周日
  const endDate = new Date(lastDay);
  endDate.setDate(endDate.getDate() + (6 - lastDay.getDay())); // 调整到周六

  try {
    // 加载事件
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const data = await apiRequest(`/calendar/events?start=${startStr}&end=${endStr}`);
    calendarEvents = data.events;

    // 渲染日历网格
    renderCalendarGrid(firstDay, lastDay, startDate);

    // 渲染事件列表
    renderEventsList(year, month);
  } catch (error) {
    console.error('加载日历失败:', error);
    showMessage('加载日历失败: ' + error.message, 'error');
  }
}

// 渲染日历网格
function renderCalendarGrid(firstDay, lastDay, startDate) {
  const grid = document.getElementById('calendar-grid');
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  let html = '<div class="calendar-weekdays">';
  weekDays.forEach(day => {
    html += `<div class="calendar-weekday">${day}</div>`;
  });
  html += '</div><div class="calendar-days">';

  const currentDate = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 42; i++) { // 6 weeks max
    const dayEvents = calendarEvents.filter(event => {
      const eventDate = new Date(event.event_date);
      return eventDate.toDateString() === currentDate.toDateString();
    });

    const isCurrentMonth = currentDate.getMonth() === firstDay.getMonth();
    const isToday = currentDate.toDateString() === today.toDateString();
    const hasEvents = dayEvents.length > 0;

    let classes = 'calendar-day';
    if (!isCurrentMonth) classes += ' other-month';
    if (isToday) classes += ' today';
    if (hasEvents) classes += ' has-events';

    html += `<div class="${classes}" onclick="showDayEvents('${currentDate.toISOString().split('T')[0]}')">`;
    html += `<span class="day-number">${currentDate.getDate()}</span>`;
    if (hasEvents) {
      html += `<div class="event-dots">`;
      dayEvents.slice(0, 3).forEach(event => {
        const color = getEventColor(event.event_type);
        html += `<span class="event-dot" style="background-color: ${color}"></span>`;
      });
      if (dayEvents.length > 3) {
        html += `<span class="event-more">+${dayEvents.length - 3}</span>`;
      }
      html += `</div>`;
    }
    html += '</div>';

    currentDate.setDate(currentDate.getDate() + 1);
  }

  html += '</div>';
  grid.innerHTML = html;
}

// 渲染事件列表
function renderEventsList(year, month) {
  const eventsList = document.getElementById('calendar-events');
  const monthEvents = calendarEvents.filter(event => {
    const eventDate = new Date(event.event_date);
    return eventDate.getFullYear() === year && eventDate.getMonth() === month;
  });

  if (monthEvents.length === 0) {
    eventsList.innerHTML = '<p class="text-muted">本月暂无事件</p>';
    return;
  }

  // 按日期排序
  monthEvents.sort((a, b) => {
    const dateA = new Date(a.event_date + ' ' + (a.event_time || '00:00:00'));
    const dateB = new Date(b.event_date + ' ' + (b.event_time || '00:00:00'));
    return dateA - dateB;
  });

  let html = '<div class="events-list">';
  monthEvents.forEach(event => {
    const eventDate = new Date(event.event_date);
    const color = getEventColor(event.event_type);
    const isAdmin = currentUser && currentUser.role === 'admin';

    html += `<div class="event-item" style="border-left: 3px solid ${color}">`;
    html += `<div class="event-date">${eventDate.getMonth() + 1}月${eventDate.getDate()}日`;
    if (event.event_time) {
      html += ` ${event.event_time.slice(0, 5)}`;
    }
    html += `</div>`;
    html += `<div class="event-title">${escapeHtml(event.title)}</div>`;
    if (event.description) {
      html += `<div class="event-description">${escapeHtml(event.description)}</div>`;
    }
    html += `<div class="event-meta">`;
    html += `<span class="event-type">${getEventTypeName(event.event_type)}</span>`;
    html += `<span class="event-creator">创建人: ${escapeHtml(event.creator_name || '未知')}</span>`;
    if (isAdmin) {
      html += `<div class="event-actions">`;
      html += `<button class="btn-icon" onclick="showEditEventModal(${event.event_id})" title="编辑"><i class="icon-edit">✏️</i></button>`;
      html += `<button class="btn-icon" onclick="deleteEvent(${event.event_id})" title="删除"><i class="icon-delete">🗑️</i></button>`;
      html += `</div>`;
    }
    html += `</div></div>`;
  });
  html += '</div>';

  eventsList.innerHTML = html;
}

// 显示某一天的事件
function showDayEvents(dateStr) {
  const dayEvents = calendarEvents.filter(event => event.event_date === dateStr);

  if (dayEvents.length === 0) {
    return;
  }

  const date = new Date(dateStr);
  const dateDisplay = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;

  let html = `<h3>${dateDisplay} 的事件</h3>`;
  html += '<div class="events-list">';

  dayEvents.forEach(event => {
    const color = getEventColor(event.event_type);
    html += `<div class="event-item" style="border-left: 3px solid ${color}">`;
    html += `<div class="event-title">${escapeHtml(event.title)}</div>`;
    if (event.event_time) {
      html += `<div class="event-time">时间: ${event.event_time.slice(0, 5)}</div>`;
    }
    if (event.description) {
      html += `<div class="event-description">${escapeHtml(event.description)}</div>`;
    }
    html += `<div class="event-meta">`;
    html += `<span class="event-type">${getEventTypeName(event.event_type)}</span>`;
    html += `</div></div>`;
  });

  html += '</div>';

  showModal(html);
}

// 上一个月
function previousMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  loadCalendar();
}

// 下一个月
function nextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  loadCalendar();
}

// 显示添加事件模态框
function showAddEventModal() {
  const html = `
    <h2>添加事件</h2>
    <form onsubmit="submitAddEvent(event)">
      <div class="form-group">
        <label>事件标题 *</label>
        <input type="text" id="event-title" required maxlength="200">
      </div>
      <div class="form-group">
        <label>事件日期 *</label>
        <input type="date" id="event-date" required>
      </div>
      <div class="form-group">
        <label>事件时间</label>
        <input type="time" id="event-time">
      </div>
      <div class="form-group">
        <label>事件类型</label>
        <select id="event-type">
          <option value="general">一般事件</option>
          <option value="maintenance">维护</option>
          <option value="inventory">盘点</option>
          <option value="meeting">会议</option>
          <option value="deadline">截止日期</option>
          <option value="other">其他</option>
        </select>
      </div>
      <div class="form-group">
        <label>事件描述</label>
        <textarea id="event-description" rows="3"></textarea>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">添加</button>
        <button type="button" class="btn" onclick="closeModal()">取消</button>
      </div>
    </form>
  `;
  showModal(html);
}

// 提交添加事件
async function submitAddEvent(e) {
  e.preventDefault();

  const title = document.getElementById('event-title').value.trim();
  const eventDate = document.getElementById('event-date').value;
  const eventTime = document.getElementById('event-time').value;
  const eventType = document.getElementById('event-type').value;
  const description = document.getElementById('event-description').value.trim();

  try {
    await apiRequest('/calendar/events', {
      method: 'POST',
      body: JSON.stringify({
        title,
        eventDate,
        eventTime: eventTime || null,
        eventType,
        description: description || null
      })
    });

    showMessage('事件添加成功', 'success');
    closeModal();
    loadCalendar();
  } catch (error) {
    showMessage('添加事件失败: ' + error.message, 'error');
  }
}

// 显示编辑事件模态框
async function showEditEventModal(eventId) {
  const event = calendarEvents.find(e => e.event_id === eventId);

  if (!event) {
    showMessage('事件不存在', 'error');
    return;
  }

  const html = `
    <h2>编辑事件</h2>
    <form onsubmit="submitEditEvent(event, ${eventId})">
      <div class="form-group">
        <label>事件标题 *</label>
        <input type="text" id="event-title" value="${escapeHtml(event.title)}" required maxlength="200">
      </div>
      <div class="form-group">
        <label>事件日期 *</label>
        <input type="date" id="event-date" value="${event.event_date}" required>
      </div>
      <div class="form-group">
        <label>事件时间</label>
        <input type="time" id="event-time" value="${event.event_time || ''}">
      </div>
      <div class="form-group">
        <label>事件类型</label>
        <select id="event-type">
          <option value="general" ${event.event_type === 'general' ? 'selected' : ''}>一般事件</option>
          <option value="maintenance" ${event.event_type === 'maintenance' ? 'selected' : ''}>维护</option>
          <option value="inventory" ${event.event_type === 'inventory' ? 'selected' : ''}>盘点</option>
          <option value="meeting" ${event.event_type === 'meeting' ? 'selected' : ''}>会议</option>
          <option value="deadline" ${event.event_type === 'deadline' ? 'selected' : ''}>截止日期</option>
          <option value="other" ${event.event_type === 'other' ? 'selected' : ''}>其他</option>
        </select>
      </div>
      <div class="form-group">
        <label>事件描述</label>
        <textarea id="event-description" rows="3">${escapeHtml(event.description || '')}</textarea>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">保存</button>
        <button type="button" class="btn" onclick="closeModal()">取消</button>
      </div>
    </form>
  `;
  showModal(html);
}

// 提交编辑事件
async function submitEditEvent(e, eventId) {
  e.preventDefault();

  const title = document.getElementById('event-title').value.trim();
  const eventDate = document.getElementById('event-date').value;
  const eventTime = document.getElementById('event-time').value;
  const eventType = document.getElementById('event-type').value;
  const description = document.getElementById('event-description').value.trim();

  try {
    await apiRequest(`/calendar/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title,
        eventDate,
        eventTime: eventTime || null,
        eventType,
        description: description || null
      })
    });

    showMessage('事件更新成功', 'success');
    closeModal();
    loadCalendar();
  } catch (error) {
    showMessage('更新事件失败: ' + error.message, 'error');
  }
}

// 删除事件
async function deleteEvent(eventId) {
  if (!confirm('确定要删除这个事件吗？')) {
    return;
  }

  try {
    await apiRequest(`/calendar/events/${eventId}`, {
      method: 'DELETE'
    });

    showMessage('事件删除成功', 'success');
    loadCalendar();
  } catch (error) {
    showMessage('删除事件失败: ' + error.message, 'error');
  }
}

// 获取事件类型名称
function getEventTypeName(type) {
  const typeNames = {
    'general': '一般事件',
    'maintenance': '维护',
    'inventory': '盘点',
    'meeting': '会议',
    'deadline': '截止日期',
    'other': '其他'
  };
  return typeNames[type] || '未知';
}

// 获取事件颜色
function getEventColor(type) {
  const colors = {
    'general': '#007bff',
    'maintenance': '#ffc107',
    'inventory': '#17a2b8',
    'meeting': '#28a745',
    'deadline': '#dc3545',
    'other': '#6c757d'
  };
  return colors[type] || '#6c757d';
}

// HTML转义
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
