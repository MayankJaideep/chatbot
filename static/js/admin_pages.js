// ── Admin Pages ──

async function renderAdminDashboard(el) {
  el.innerHTML = `<div class="page-header"><div><h2>Analytics Dashboard</h2><p>Company-wide overview</p></div></div><div class="stat-grid" id="adm-stats"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="section-card"><div class="section-title"><i class="fa-solid fa-chart-line"></i>Attendance (7 Days)</div><canvas id="att-chart" height="180"></canvas></div>
    <div class="section-card"><div class="section-title"><i class="fa-solid fa-chart-pie"></i>Leave Status</div><canvas id="leave-chart" height="180"></canvas></div>
  </div>`;
  try {
    const d = await API.adminDashboard();
    document.getElementById('adm-stats').innerHTML = `
      <div class="stat-card"><div class="stat-icon si-purple"><i class="fa-solid fa-users"></i></div><div class="stat-info"><div class="stat-val">${d.total_employees}</div><div class="stat-label">Total Employees</div></div></div>
      <div class="stat-card"><div class="stat-icon si-teal"><i class="fa-solid fa-calendar-check"></i></div><div class="stat-info"><div class="stat-val">${d.present_today}</div><div class="stat-label">Present Today</div></div></div>
      <div class="stat-card"><div class="stat-icon si-amber"><i class="fa-solid fa-file-circle-check"></i></div><div class="stat-info"><div class="stat-val">${d.pending_leaves}</div><div class="stat-label">Pending Leaves</div></div></div>
      <div class="stat-card"><div class="stat-icon si-red"><i class="fa-solid fa-ticket"></i></div><div class="stat-info"><div class="stat-val">${d.open_tickets}</div><div class="stat-label">Open Tickets</div></div></div>
      <div class="stat-card"><div class="stat-icon si-green"><i class="fa-solid fa-list-check"></i></div><div class="stat-info"><div class="stat-val">${d.pending_tasks}</div><div class="stat-label">Pending Tasks</div></div></div>`;
    drawBarChart('att-chart', d.attendance_chart.map(a => a.date.slice(5)), d.attendance_chart.map(a => a.count));
    drawDonut('leave-chart', ['Approved', 'Rejected', 'Pending'], [d.leave_stats.approved, d.leave_stats.rejected, d.leave_stats.pending]);
  } catch (e) { toast(e.message, 'error'); }
}

function drawBarChart(id, labels, data) {
  const c = document.getElementById(id);
  if (!c) return;
  const ctx = c.getContext('2d');
  const max = Math.max(...data, 1);
  const w = c.width = c.offsetWidth; const h = c.height = 180;
  ctx.clearRect(0, 0, w, h);
  const pad = 30; const bw = (w - pad * 2) / labels.length - 8;
  ctx.fillStyle = '#475569'; ctx.font = '500 10px Inter'; ctx.textAlign = 'center';
  labels.forEach((lbl, i) => {
    const x = pad + i * ((w - pad * 2) / labels.length) + bw / 2;
    const bh = ((data[i] || 0) / max) * (h - 50);
    const y = h - bh - 25;
    const grad = ctx.createLinearGradient(0, y, 0, h - 25);
    grad.addColorStop(0, '#2563eb'); grad.addColorStop(1, '#93c5fd');
    ctx.fillStyle = grad; ctx.beginPath();
    ctx.roundRect(x - bw / 2, y, bw, bh, 6); ctx.fill();
    ctx.fillStyle = '#475569'; ctx.font = '500 10px Inter'; ctx.fillText(lbl, x, h - 6);
    if (data[i] !== undefined) { 
      ctx.fillStyle = '#0f172a'; 
      ctx.font = 'bold 11px Inter';
      ctx.fillText(data[i], x, y - 6); 
    }
  });
}

function drawDonut(id, labels, data) {
  const c = document.getElementById(id);
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width = c.offsetWidth; const h = c.height = 180;
  const cx = w / 2 - 40; const cy = h / 2; const r = 60; const ri = 38;
  const colors = ['#16a34a', '#dc2626', '#d97706'];
  const total = data.reduce((a, b) => a + b, 0) || 0;
  let start = -Math.PI / 2;
  data.forEach((v, i) => {
    const angle = total > 0 ? (v / total) * Math.PI * 2 : 0;
    if (angle > 0) {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath(); ctx.fillStyle = colors[i]; ctx.fill();
      start += angle;
    }
  });
  if (total === 0) {
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath(); ctx.fillStyle = '#e2e8f0'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(cx, cy, ri, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill(); // Match pure-white card background
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 18px Inter'; ctx.textAlign = 'center';
  ctx.fillText(total, cx, cy + 6);
  ctx.font = '500 10px Inter'; ctx.fillStyle = '#475569'; ctx.fillText('Total', cx, cy + 20);
  const lx = w / 2 + 30; let ly = h / 2 - 25;
  labels.forEach((l, i) => {
    ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.roundRect(lx, ly, 12, 12, 3); ctx.fill();
    ctx.fillStyle = '#475569'; ctx.font = '500 11px Inter'; ctx.textAlign = 'left';
    ctx.fillText(`${l}: ${data[i]}`, lx + 18, ly + 10);
    ly += 22;
  });
}

// ── Admin: Employees ──
async function renderEmployees(el) {
  el.innerHTML = `<div class="page-header"><div><h2>Employees</h2><p>Manage your workforce</p></div><button class="btn btn-primary" onclick="showAddEmpForm()"><i class="fa-solid fa-plus"></i> Add Employee</button></div><div class="section-card"><div class="tbl-wrap" id="emp-table">Loading…</div></div>`;
  await loadEmployees();
}

async function loadEmployees() {
  try {
    const d = await API.getEmployees();
    const rows = d.employees.map(e => `<tr>
      <td><div style="display:flex;align-items:center;gap:10px"><div class="avatar-sm" style="width:32px;height:32px;font-size:12px">${e.name[0]}</div><div><div style="font-weight:600">${e.name}</div><div class="text-muted" style="font-size:11px">${e.email}</div></div></div></td>
      <td><span class="badge badge-${e.employee_id.toLowerCase()}">${e.employee_id}</span></td>
      <td>${e.department}</td><td>${e.designation}</td>
      <td>${e.manager_name || '<span class="text-muted">—</span>'}</td>
      <td>${badge(e.is_active ? 'active' : 'inactive')}</td>
      <td>${e.leave_balance}</td>
      <td><button class="btn btn-sm btn-outline" onclick="editEmp(${e.id},'${e.name}',${e.leave_balance},${e.manager_id || 'null'})">Edit</button></td>
    </tr>`).join('');
    document.getElementById('emp-table').innerHTML = `<table><thead><tr><th>Employee</th><th>ID</th><th>Department</th><th>Designation</th><th>Manager</th><th>Status</th><th>Leave Bal.</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="text-center text-muted" style="padding:24px">No employees found</td></tr>'}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function showAddEmpForm() {
  modal(`<div class="modal-header"><h3>Add Employee</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="form-row"><div class="form-group"><label>Full Name</label><input class="form-control" id="ne-name" placeholder="John Doe"/></div><div class="form-group"><label>Email</label><input class="form-control" id="ne-email" type="email" placeholder="john@company.com"/></div></div>
    <div class="form-row"><div class="form-group"><label>Department</label><input class="form-control" id="ne-dept" placeholder="Engineering"/></div><div class="form-group"><label>Designation</label><input class="form-control" id="ne-desig" placeholder="Software Engineer"/></div></div>
    <div class="form-row"><div class="form-group"><label>Phone</label><input class="form-control" id="ne-phone" placeholder="+91 …"/></div><div class="form-group"><label>Password</label><input class="form-control" id="ne-pw" type="password" placeholder="Default: Welcome@123"/></div></div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="addEmployee()">Create</button></div>`);
}

async function addEmployee() {
  const b = { name: document.getElementById('ne-name').value, email: document.getElementById('ne-email').value, department: document.getElementById('ne-dept').value, designation: document.getElementById('ne-desig').value, phone: document.getElementById('ne-phone').value, password: document.getElementById('ne-pw').value || 'Welcome@123' };
  if (!b.name || !b.email) { toast('Name and email required', 'warning'); return; }
  try { await API.createEmployee(b); closeModal(); toast('Employee created!', 'success'); await loadEmployees(); }
  catch (e) { toast(e.message, 'error'); }
}

async function editEmp(id, name, bal, managerId) {
  let managers = [];
  try {
    const res = await API.getPotentialManagers();
    managers = res.managers || [];
  } catch (e) {
    console.error("Failed to load potential managers:", e);
  }
  
  const mOpts = managers.map(m => {
    if (m.id === id) return '';
    return `<option value="${m.id}" ${m.id === managerId ? 'selected' : ''}>${m.name} (${m.designation})</option>`;
  }).join('');

  modal(`<div class="modal-header"><h3>Edit Employee</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="form-group"><label>Name</label><input class="form-control" id="ue-name" value="${name}"/></div>
    <div class="form-group"><label>Leave Balance</label><input class="form-control" id="ue-bal" type="number" value="${bal}"/></div>
    <div class="form-group">
      <label>Reporting Manager</label>
      <select class="form-control" id="ue-manager">
        <option value="null">— None (Fallback to Admins) —</option>
        ${mOpts}
      </select>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveEmp(${id})">Save</button></div>`);
}

async function saveEmp(id) {
  const managerVal = document.getElementById('ue-manager').value;
  const managerId = managerVal === 'null' ? null : parseInt(managerVal);
  try { 
    await API.updateEmployee(id, { 
      name: document.getElementById('ue-name').value, 
      leave_balance: parseInt(document.getElementById('ue-bal').value),
      manager_id: managerId
    }); 
    closeModal(); 
    toast('Updated!', 'success'); 
    await loadEmployees(); 
  }
  catch (e) { toast(e.message, 'error'); }
}

// ── Admin: Leaves ──
window.currentAdminCalendarDate = new Date();
window.cachedAdminApprovedLeaves = [];
window.allAdminLeaves = [];

async function renderAdminLeaves(el) {
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Leave Requests</h2>
      </div>
      <select class="form-control" style="width:140px" onchange="loadAdminLeaves(this.value)" id="lv-filter">
        <option value="">All</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
    </div>
    
    <div class="section-card">
      <div class="tbl-wrap" id="adm-leave-table">Loading…</div>
    </div>

    <div class="section-card" style="margin-top: 24px;">
      <div class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span><i class="fa-solid fa-calendar-days"></i> Approved Leaves Calendar</span>
        <div class="calendar-nav" style="display:flex; gap:8px; align-items:center;">
          <button class="btn btn-sm btn-outline" id="adm-cal-prev-btn" onclick="changeAdminCalendarMonth(-1)"><i class="fa-solid fa-chevron-left"></i></button>
          <span id="adm-cal-month-title" style="font-weight:600; font-size:13px; min-width:120px; text-align:center;">—</span>
          <button class="btn btn-sm btn-outline" id="adm-cal-next-btn" onclick="changeAdminCalendarMonth(1)"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </div>
      <div id="admin-calendar-grid-container" style="padding-top:12px;">Loading Calendar…</div>
    </div>
  `;

  await Promise.all([
    loadAdminLeaves(''),
    loadApprovedLeavesAndRenderAdminCalendar()
  ]);
}

async function loadAdminLeaves(status) {
  try {
    const d = await API.getAllLeaves(status);
    window.allAdminLeaves = d.leaves || [];
    const rows = window.allAdminLeaves.map(l => {
      const attachBtn = l.attachment_name 
        ? `<button class="btn btn-sm btn-outline" style="padding: 4px 8px; font-size: 11px; display:inline-flex; align-items:center; gap:4px;" onclick="viewLeaveAttachment(${l.id})"><i class="fa-solid fa-paperclip"></i> View</button>`
        : '<span class="text-muted">—</span>';
      
      return `<tr>
        <td><div style="font-weight:600">${l.employee_name}</div></td>
        <td>${badge(l.leave_type)}</td>
        <td>${fmtDate(l.from_date)}</td>
        <td>${fmtDate(l.to_date)}</td>
        <td>${l.days}</td>
        <td>${l.reason}</td>
        <td>${attachBtn}</td>
        <td>${badge(l.status)}</td>
        <td>${l.status === 'pending' ? `<div style="display:flex;gap:6px"><button class="btn btn-sm btn-success" onclick="reviewLeave(${l.id},'approve')" title="Approve">✓</button><button class="btn btn-sm btn-danger" onclick="reviewLeave(${l.id},'reject')" title="Reject">✗</button></div>` : '—'}</td>
      </tr>`;
    }).join('');
    
    document.getElementById('adm-leave-table').innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Type</th>
            <th>From</th>
            <th>To</th>
            <th>Days</th>
            <th>Reason</th>
            <th>Attachment</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" class="text-center text-muted" style="padding:24px">No records</td></tr>'}
        </tbody>
      </table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function reviewLeave(id, action) {
  const comment = action === 'reject' ? prompt('Rejection reason (optional):') || '' : '';
  try { 
    await API.reviewLeave(id, { action, comment }); 
    toast(`Leave ${action}d!`, action === 'approve' ? 'success' : 'warning'); 
    await loadAdminLeaves(document.getElementById('lv-filter')?.value || ''); 
    await loadApprovedLeavesAndRenderAdminCalendar();
  }
  catch (e) { toast(e.message, 'error'); }
}

window.viewLeaveAttachment = function(id) {
  const leave = (window.allAdminLeaves || []).find(l => l.id === id);
  if (!leave || !leave.attachment_data) {
    toast('No attachment found', 'warning');
    return;
  }
  
  const filename = leave.attachment_name || 'attachment';
  const data = leave.attachment_data;
  
  let contentHtml = '';
  if (data.startsWith('data:image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
    contentHtml = `<div style="text-align:center;"><img src="${data}" style="max-width:100%; max-height:60vh; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1); border:1px solid var(--border);" alt="${filename}"/></div>`;
  } else if (data.startsWith('data:application/pdf') || filename.endsWith('.pdf')) {
    contentHtml = `
      <div style="text-align:center; padding: 16px 0;">
        <i class="fa-solid fa-file-pdf" style="font-size: 56px; color: #ef4444; margin-bottom: 12px; display:block;"></i>
        <p style="font-weight:600; margin-bottom: 16px; font-size:13px; color:var(--text);">${filename}</p>
        <div style="display:flex; gap:12px; justify-content:center;">
          <a class="btn btn-primary btn-sm" href="${data}" download="${filename}"><i class="fa-solid fa-download"></i> Download PDF</a>
          <button class="btn btn-outline btn-sm" onclick="previewPdfInNewTab('${data}')"><i class="fa-solid fa-square-arrow-up-right"></i> Open PDF</button>
        </div>
      </div>
    `;
  } else {
    contentHtml = `
      <div style="text-align:center; padding: 16px 0;">
        <i class="fa-solid fa-file-invoice" style="font-size: 56px; color: var(--primary); margin-bottom: 12px; display:block;"></i>
        <p style="font-weight:600; margin-bottom: 16px; font-size:13px; color:var(--text);">${filename}</p>
        <a class="btn btn-primary btn-sm" href="${data}" download="${filename}"><i class="fa-solid fa-download"></i> Download File</a>
      </div>
    `;
  }
  
  modal(`
    <div class="modal-header">
      <h3><i class="fa-solid fa-paperclip" style="color:var(--primary)"></i> Attachment: ${filename}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="padding: 12px 0;">
      ${contentHtml}
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal()">Close</button>
    </div>
  `);
};

window.previewPdfInNewTab = function(dataUrl) {
  const win = window.open();
  if (win) {
    win.document.write(`<iframe src="${dataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
  } else {
    toast('Popup blocked! Please allow popups or download the PDF.', 'warning');
  }
};

window.changeAdminCalendarMonth = function(offset) {
  if (!window.currentAdminCalendarDate) {
    window.currentAdminCalendarDate = new Date();
  }
  window.currentAdminCalendarDate.setMonth(window.currentAdminCalendarDate.getMonth() + offset);
  renderAdminCalendarGrid();
};

async function loadApprovedLeavesAndRenderAdminCalendar() {
  try {
    const res = await API.getApprovedLeaves();
    window.cachedAdminApprovedLeaves = res.leaves || [];
    renderAdminCalendarGrid();
  } catch (e) {
    console.error("Failed to load approved leaves:", e);
    const container = document.getElementById('admin-calendar-grid-container');
    if (container) {
      container.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text3)">Error loading calendar: ${e.message}</div>`;
    }
  }
}

function renderAdminCalendarGrid() {
  const container = document.getElementById('admin-calendar-grid-container');
  const monthTitle = document.getElementById('adm-cal-month-title');
  if (!container || !monthTitle) return;

  if (!window.currentAdminCalendarDate) {
    window.currentAdminCalendarDate = new Date();
  }

  const year = window.currentAdminCalendarDate.getFullYear();
  const month = window.currentAdminCalendarDate.getMonth();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  monthTitle.innerText = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  let html = `<div style="display:grid; grid-template-columns: repeat(7, 1fr); border: 1px solid var(--border); border-radius: var(--radius); overflow:hidden; background: var(--bg2);">`;

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  daysOfWeek.forEach(day => {
    html += `<div style="background: var(--bg3); padding: 8px 4px; text-align: center; font-weight: 600; color: var(--text2); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); font-size: 11px;">${day}</div>`;
  });

  for (let i = 0; i < firstDay; i++) {
    html += `<div style="background: var(--bg); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); min-height: 80px;"></div>`;
  }

  const leaves = window.cachedAdminApprovedLeaves || [];
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  for (let day = 1; day <= totalDays; day++) {
    const isToday = isCurrentMonth && today.getDate() === day;
    const cellDate = new Date(year, month, day);

    const overlapping = leaves.filter(l => {
      const from = new Date(l.from_date);
      const to = new Date(l.to_date);
      from.setHours(0,0,0,0);
      to.setHours(0,0,0,0);
      cellDate.setHours(0,0,0,0);
      return cellDate >= from && cellDate <= to;
    });

    let dayStyle = `padding: 6px; min-height: 80px; border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); position: relative;`;
    if (isToday) {
      dayStyle += `background: rgba(37, 99, 235, 0.04);`;
    }

    html += `<div style="${dayStyle}">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
        <span style="font-size: 10px; font-weight: ${isToday ? '700' : '500'}; color: ${isToday ? 'var(--primary)' : 'var(--text)'}; background: ${isToday ? 'var(--primary-glow)' : 'transparent'}; border-radius: 50%; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;">${day}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:3px; max-height: 52px; overflow-y: auto;">`;

    overlapping.forEach(l => {
      let badgeStyle = `font-size: 9px; padding: 2px 4px; border-radius: 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; `;
      const type = (l.leave_type || 'casual').toLowerCase();
      if (type === 'sick') {
        badgeStyle += `background: #fee2e2; color: #dc2626; border-left: 2.5px solid #dc2626;`;
      } else if (type === 'casual') {
        badgeStyle += `background: #fef3c7; color: #b45309; border-left: 2.5px solid #b45309;`;
      } else if (type === 'annual') {
        badgeStyle += `background: #ccfbf1; color: #0f766e; border-left: 2.5px solid #0f766e;`;
      } else {
        badgeStyle += `background: #dbeafe; color: #1d4ed8; border-left: 2.5px solid #1d4ed8;`;
      }

      const parts = l.employee_name.split(' ');
      const shortName = parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '');
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

      html += `<div class="calendar-event-badge" style="${badgeStyle}" title="${l.employee_name} (${typeLabel} Leave: ${fmtDate(l.from_date)} to ${fmtDate(l.to_date)})">${shortName} (${typeLabel[0]})</div>`;
    });

    html += `</div></div>`;
  }

  const totalCells = firstDay + totalDays;
  const trailingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailingCells; i++) {
    html += `<div style="background: var(--bg); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); min-height: 80px;"></div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// ── Admin: Tickets ──
async function renderAdminTickets(el) {
  el.innerHTML = `<div class="page-header"><div><h2>All Tickets</h2></div><select class="form-control" style="width:140px" onchange="loadAdminTickets(this.value)" id="tk-filter"><option value="">All</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option></select></div><div class="section-card"><div class="tbl-wrap" id="adm-ticket-table">Loading…</div></div>`;
  await loadAdminTickets('');
}

async function loadAdminTickets(status) {
  try {
    const d = await API.getAllTickets(status);
    const rows = d.tickets.map(t => `<tr>
      <td style="font-weight:600">${t.ticket_number}</td><td>${t.employee_name}</td><td>${badge(t.category)}</td><td>${t.subject}</td><td>${badge(t.priority)}</td><td>${badge(t.status)}</td><td>${fmtDate(t.created_at)}</td>
      <td>${t.status !== 'resolved' ? `<button class="btn btn-sm btn-success" onclick="resolveTicket(${t.id})">Resolve</button>` : '✓'}</td>
    </tr>`).join('');
    document.getElementById('adm-ticket-table').innerHTML = `<table><thead><tr><th>#</th><th>From</th><th>Category</th><th>Subject</th><th>Priority</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="text-center text-muted" style="padding:24px">No tickets</td></tr>'}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function resolveTicket(id) {
  const notes = prompt('Resolution notes:') || 'Resolved by admin';
  try { await API.updateTicket(id, { status: 'resolved', resolution_notes: notes }); toast('Ticket resolved!', 'success'); await loadAdminTickets(document.getElementById('tk-filter')?.value || ''); }
  catch (e) { toast(e.message, 'error'); }
}

// ── Admin: Tasks ──
async function renderAdminTasks(el) {
  el.innerHTML = `<div class="page-header"><div><h2>Task Manager</h2></div><button class="btn btn-primary" onclick="showCreateTask()"><i class="fa-solid fa-plus"></i> Create Task</button></div><div class="section-card"><div class="tbl-wrap" id="adm-task-table">Loading…</div></div>`;
  await loadAdminTasks();
}

async function loadAdminTasks() {
  try {
    const d = await API.getAllTasks();
    const rows = d.tasks.map(t => `<tr>
      <td><div style="font-weight:600">${t.title}</div></td>
      <td>${t.assignee_name || '—'}</td><td>${badge(t.priority)}</td><td>${badge(t.status)}</td>
      <td><div class="progress-bar"><div class="progress-fill" style="width:${t.progress}%"></div></div><span style="font-size:11px">${t.progress}%</span></td>
      <td>${fmtDate(t.due_date)}</td>
    </tr>`).join('');
    document.getElementById('adm-task-table').innerHTML = `<table><thead><tr><th>Title</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Progress</th><th>Due</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="text-center text-muted" style="padding:24px">No tasks</td></tr>'}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function showCreateTask() {
  let emps = [];
  try { const d = await API.getEmployees(); emps = d.employees; } catch (_) {}
  const opts = emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  modal(`<div class="modal-header"><h3>Create Task</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="form-group"><label>Title</label><input class="form-control" id="ct-title" placeholder="Task title"/></div>
    <div class="form-group"><label>Description</label><textarea class="form-control" id="ct-desc" rows="2"></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Assign To</label><select class="form-control" id="ct-emp"><option value="">— Select —</option>${opts}</select></div>
      <div class="form-group"><label>Priority</label><select class="form-control" id="ct-pri"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
    </div>
    <div class="form-group"><label>Due Date</label><input class="form-control" id="ct-due" type="date"/></div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="createTask()">Create</button></div>`);
}

async function createTask() {
  const b = { title: document.getElementById('ct-title').value, description: document.getElementById('ct-desc').value, assigned_to: parseInt(document.getElementById('ct-emp').value) || null, priority: document.getElementById('ct-pri').value, due_date: document.getElementById('ct-due').value };
  if (!b.title) { toast('Title required', 'warning'); return; }
  try { 
    const res = await API.createTask(b); 
    closeModal(); 
    if (res.warning) {
      toast(res.warning, 'warning');
    }
    toast('Task created!', 'success'); 
    await loadAdminTasks(); 
  }
  catch (e) { toast(e.message, 'error'); }
}

// ── Admin: Site Visits ──
async function renderAdminVisits(el) {
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Employee Site Visits</h2>
        <p>Real-time location logs & GPS tracking overview</p>
      </div>
      <div style="display:flex;gap:8px">
        <input type="text" id="visit-search" class="form-control" placeholder="Search employee or client..." oninput="filterAdminVisits()" style="width:200px;padding:6px 10px;font-size:12px"/>
      </div>
    </div>
    <div class="section-card">
      <div class="tbl-wrap" id="adm-visits-table">Loading site visits…</div>
    </div>`;
  await loadAdminVisits();
}

let allAdminVisitsData = [];

async function loadAdminVisits() {
  try {
    const d = await API.getAllVisits();
    allAdminVisitsData = d.records || [];
    renderAdminVisitsTable(allAdminVisitsData);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderAdminVisitsTable(records) {
  const tableEl = document.getElementById('adm-visits-table');
  if (!tableEl) return;

  const rows = records.map(r => {
    const checkInCoords = r.check_in_latitude 
      ? `<a class="gps-badge" href="https://www.google.com/maps?q=${r.check_in_latitude},${r.check_in_longitude}" target="_blank" title="View on Google Maps"><i class="fa-solid fa-location-dot"></i> ${r.check_in_latitude.toFixed(4)}, ${r.check_in_longitude.toFixed(4)}</a>` 
      : '—';
    const checkOutCoords = r.check_out_latitude 
      ? `<a class="gps-badge gps-badge-checkout" href="https://www.google.com/maps?q=${r.check_out_latitude},${r.check_out_longitude}" target="_blank" title="View on Google Maps"><i class="fa-solid fa-location-dot"></i> ${r.check_out_latitude.toFixed(4)}, ${r.check_out_longitude.toFixed(4)}</a>` 
      : '—';
      
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="avatar-sm" style="width:28px;height:28px;font-size:11px">${r.employee_name ? r.employee_name[0] : 'E'}</div>
          <div style="font-weight:600">${r.employee_name || 'Unknown Employee'}</div>
        </div>
      </td>
      <td style="font-weight:600;color:var(--text);">${r.client_name}</td>
      <td>
        <div>${fmtTime(r.check_in_time)}</div>
        <div class="text-muted" style="font-size:10px">${fmtDate(r.check_in_time)}</div>
      </td>
      <td>
        <div>${r.check_out_time ? fmtTime(r.check_out_time) : '—'}</div>
        <div class="text-muted" style="font-size:10px">${r.check_out_time ? fmtDate(r.check_out_time) : ''}</div>
      </td>
      <td>${checkInCoords}</td>
      <td>${checkOutCoords}</td>
      <td><span class="badge ${r.hours_at_location > 0 ? 'badge-approved' : 'badge-present'}">${r.hours_at_location ? r.hours_at_location.toFixed(2) + ' hrs' : 'Active'}</span></td>
    </tr>`;
  }).join('');

  tableEl.innerHTML = `<table>
    <thead>
      <tr>
        <th>Employee</th>
        <th>Client Site</th>
        <th>Check In</th>
        <th>Check Out</th>
        <th>Check In GPS</th>
        <th>Check Out GPS</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="7" class="text-center text-muted" style="padding:24px">No site visits found</td></tr>'}
    </tbody>
  </table>`;
}

function filterAdminVisits() {
  const query = document.getElementById('visit-search')?.value.toLowerCase() || '';
  const filtered = allAdminVisitsData.filter(r => 
    (r.employee_name && r.employee_name.toLowerCase().includes(query)) ||
    (r.client_name && r.client_name.toLowerCase().includes(query))
  );
  renderAdminVisitsTable(filtered);
}

// ── Admin: Geofenced Sites ──
async function renderAdminSites(el) {
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Manage Geofenced Sites</h2>
        <p>Define site coordinates and boundaries (allowed radius) for check-in validation</p>
      </div>
      <button class="btn btn-primary" onclick="showAddSiteForm()"><i class="fa-solid fa-plus"></i> Add New Site</button>
    </div>
    <div class="section-card">
      <div class="tbl-wrap" id="adm-sites-table">Loading sites…</div>
    </div>`;
  await loadAdminSites();
}

async function loadAdminSites() {
  const tableEl = document.getElementById('adm-sites-table');
  if (!tableEl) return;
  try {
    const d = await API.getSitesAdmin();
    const sites = d.sites || [];
    
    const rows = sites.map(s => {
      const coords = `<a class="gps-badge" href="https://www.google.com/maps?q=${s.latitude},${s.longitude}" target="_blank" title="View on Google Maps"><i class="fa-solid fa-location-dot"></i> ${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}</a>`;
      const statusBadge = badge(s.active ? 'active' : 'inactive');
      
      return `<tr>
        <td style="font-weight:600; color:var(--text);">${s.client_name}</td>
        <td style="font-weight:600; color:var(--primary);">${s.site_name}</td>
        <td>${coords}</td>
        <td><strong>${s.radius_meters}</strong> meters</td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex; gap:6px">
            <button class="btn btn-sm btn-outline" onclick="editAdminSite(${s.id}, '${s.client_name.replace(/'/g, "\\'")}', '${s.site_name.replace(/'/g, "\\'")}', ${s.latitude}, ${s.longitude}, ${s.radius_meters}, ${s.active})">Edit</button>
            ${s.active ? `<button class="btn btn-sm btn-danger" onclick="deleteAdminSite(${s.id})">Deactivate</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    tableEl.innerHTML = `<table>
      <thead>
        <tr>
          <th>Client Name</th>
          <th>Site / Office Name</th>
          <th>GPS Center Coordinates</th>
          <th>Allowed Radius</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="text-center text-muted" style="padding:24px">No geofenced sites defined</td></tr>'}
      </tbody>
    </table>`;
  } catch (e) {
    tableEl.innerHTML = `<div class="text-center text-muted" style="padding:24px">Error loading sites: ${e.message}</div>`;
  }
}

function showAddSiteForm() {
  modal(`<div class="modal-header"><h3>Add Geofenced Site</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="form-row">
      <div class="form-group"><label>Client Name</label><input class="form-control" id="ns-client" placeholder="e.g. Clover Infotech"/></div>
      <div class="form-group"><label>Site Name</label><input class="form-control" id="ns-name" placeholder="e.g. Clover Bangalore"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Latitude</label><input class="form-control" type="number" step="any" id="ns-lat" placeholder="e.g. 12.9742787"/></div>
      <div class="form-group"><label>Longitude</label><input class="form-control" type="number" step="any" id="ns-lng" placeholder="e.g. 77.6157605"/></div>
    </div>
    <div class="form-group">
      <label>Allowed Radius (meters)</label>
      <input class="form-control" type="number" id="ns-radius" value="100" placeholder="e.g. 100"/>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="addAdminSite()">Create Site</button></div>`);
}

async function addAdminSite() {
  const b = {
    client_name: document.getElementById('ns-client').value.trim(),
    site_name: document.getElementById('ns-name').value.trim(),
    latitude: parseFloat(document.getElementById('ns-lat').value),
    longitude: parseFloat(document.getElementById('ns-lng').value),
    radius_meters: parseFloat(document.getElementById('ns-radius').value || 100)
  };
  
  if (!b.client_name || !b.site_name || isNaN(b.latitude) || isNaN(b.longitude)) {
    toast('Please fill all fields with valid numbers', 'warning');
    return;
  }
  
  try {
    await API.createSiteAdmin(b);
    closeModal();
    toast('Site geofence added successfully!', 'success');
    await loadAdminSites();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function editAdminSite(id, client, name, lat, lng, radius, active) {
  modal(`<div class="modal-header"><h3>Edit Geofenced Site</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="form-row">
      <div class="form-group"><label>Client Name</label><input class="form-control" id="us-client" value="${client}"/></div>
      <div class="form-group"><label>Site Name</label><input class="form-control" id="us-name" value="${name}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Latitude</label><input class="form-control" type="number" step="any" id="us-lat" value="${lat}"/></div>
      <div class="form-group"><label>Longitude</label><input class="form-control" type="number" step="any" id="us-lng" value="${lng}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Radius (meters)</label><input class="form-control" type="number" id="us-radius" value="${radius}"/></div>
      <div class="form-group"><label>Status</label>
        <select class="form-control" id="us-active">
          <option value="true" ${active ? 'selected' : ''}>Active</option>
          <option value="false" ${!active ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveAdminSite(${id})">Save Changes</button></div>`);
}

async function saveAdminSite(id) {
  const b = {
    client_name: document.getElementById('us-client').value.trim(),
    site_name: document.getElementById('us-name').value.trim(),
    latitude: parseFloat(document.getElementById('us-lat').value),
    longitude: parseFloat(document.getElementById('us-lng').value),
    radius_meters: parseFloat(document.getElementById('us-radius').value),
    active: document.getElementById('us-active').value === 'true'
  };
  
  if (!b.client_name || !b.site_name || isNaN(b.latitude) || isNaN(b.longitude) || isNaN(b.radius_meters)) {
    toast('Please fill all fields with valid numbers', 'warning');
    return;
  }
  
  try {
    await API.updateSiteAdmin(id, b);
    closeModal();
    toast('Site geofence updated successfully!', 'success');
    await loadAdminSites();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteAdminSite(id) {
  if (!confirm('Are you sure you want to deactivate this geofenced site? Engineers will no longer be able to check in.')) return;
  try {
    await API.deleteSiteAdmin(id);
    toast('Site deactivated', 'success');
    await loadAdminSites();
  } catch (e) {
    toast(e.message, 'error');
  }
}

