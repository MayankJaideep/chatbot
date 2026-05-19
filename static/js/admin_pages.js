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
  ctx.fillStyle = '#8892b0'; ctx.font = '10px Inter'; ctx.textAlign = 'center';
  labels.forEach((lbl, i) => {
    const x = pad + i * ((w - pad * 2) / labels.length) + bw / 2;
    const bh = ((data[i] || 0) / max) * (h - 40);
    const y = h - bh - 20;
    const grad = ctx.createLinearGradient(0, y, 0, h - 20);
    grad.addColorStop(0, '#6c63ff'); grad.addColorStop(1, 'rgba(108,99,255,0.2)');
    ctx.fillStyle = grad; ctx.beginPath();
    ctx.roundRect(x - bw / 2, y, bw, bh, 4); ctx.fill();
    ctx.fillStyle = '#8892b0'; ctx.fillText(lbl, x, h - 4);
    if (data[i]) { ctx.fillStyle = '#e8eaf6'; ctx.fillText(data[i], x, y - 4); }
  });
}

function drawDonut(id, labels, data) {
  const c = document.getElementById(id);
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width = c.offsetWidth; const h = c.height = 180;
  const cx = w / 2 - 40; const cy = h / 2; const r = 60; const ri = 38;
  const colors = ['#10b981', '#ef4444', '#f59e0b'];
  const total = data.reduce((a, b) => a + b, 0) || 1;
  let start = -Math.PI / 2;
  data.forEach((v, i) => {
    const angle = (v / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath(); ctx.fillStyle = colors[i]; ctx.fill();
    start += angle;
  });
  ctx.beginPath(); ctx.arc(cx, cy, ri, 0, Math.PI * 2);
  ctx.fillStyle = '#1a2033'; ctx.fill();
  ctx.fillStyle = '#e8eaf6'; ctx.font = 'bold 18px Inter'; ctx.textAlign = 'center';
  ctx.fillText(total, cx, cy + 6);
  ctx.font = '10px Inter'; ctx.fillStyle = '#8892b0'; ctx.fillText('Total', cx, cy + 20);
  const lx = w / 2 + 30; let ly = h / 2 - 25;
  labels.forEach((l, i) => {
    ctx.fillStyle = colors[i]; ctx.fillRect(lx, ly, 12, 12);
    ctx.fillStyle = '#8892b0'; ctx.font = '11px Inter'; ctx.textAlign = 'left';
    ctx.fillText(`${l}: ${data[i]}`, lx + 16, ly + 10);
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
      <td>${badge(e.is_active ? 'active' : 'inactive')}</td>
      <td>${e.leave_balance}</td>
      <td><button class="btn btn-sm btn-outline" onclick="editEmp(${e.id},'${e.name}',${e.leave_balance})">Edit</button></td>
    </tr>`).join('');
    document.getElementById('emp-table').innerHTML = `<table><thead><tr><th>Employee</th><th>ID</th><th>Department</th><th>Designation</th><th>Status</th><th>Leave Bal.</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="text-center text-muted" style="padding:24px">No employees found</td></tr>'}</tbody></table>`;
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

function editEmp(id, name, bal) {
  modal(`<div class="modal-header"><h3>Edit Employee</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="form-group"><label>Name</label><input class="form-control" id="ue-name" value="${name}"/></div>
    <div class="form-group"><label>Leave Balance</label><input class="form-control" id="ue-bal" type="number" value="${bal}"/></div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveEmp(${id})">Save</button></div>`);
}

async function saveEmp(id) {
  try { await API.updateEmployee(id, { name: document.getElementById('ue-name').value, leave_balance: parseInt(document.getElementById('ue-bal').value) }); closeModal(); toast('Updated!', 'success'); await loadEmployees(); }
  catch (e) { toast(e.message, 'error'); }
}

// ── Admin: Leaves ──
async function renderAdminLeaves(el) {
  el.innerHTML = `<div class="page-header"><div><h2>Leave Requests</h2></div><select class="form-control" style="width:140px" onchange="loadAdminLeaves(this.value)" id="lv-filter"><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div><div class="section-card"><div class="tbl-wrap" id="adm-leave-table">Loading…</div></div>`;
  await loadAdminLeaves('');
}

async function loadAdminLeaves(status) {
  try {
    const d = await API.getAllLeaves(status);
    const rows = d.leaves.map(l => `<tr>
      <td><div style="font-weight:600">${l.employee_name}</div></td>
      <td>${badge(l.leave_type)}</td><td>${fmtDate(l.from_date)}</td><td>${fmtDate(l.to_date)}</td><td>${l.days}</td><td>${l.reason}</td><td>${badge(l.status)}</td>
      <td>${l.status === 'pending' ? `<div style="display:flex;gap:6px"><button class="btn btn-sm btn-success" onclick="reviewLeave(${l.id},'approve')">✓</button><button class="btn btn-sm btn-danger" onclick="reviewLeave(${l.id},'reject')">✗</button></div>` : '—'}</td>
    </tr>`).join('');
    document.getElementById('adm-leave-table').innerHTML = `<table><thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="text-center text-muted" style="padding:24px">No records</td></tr>'}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function reviewLeave(id, action) {
  const comment = action === 'reject' ? prompt('Rejection reason (optional):') || '' : '';
  try { await API.reviewLeave(id, { action, comment }); toast(`Leave ${action}d!`, action === 'approve' ? 'success' : 'warning'); await loadAdminLeaves(document.getElementById('lv-filter')?.value || ''); }
  catch (e) { toast(e.message, 'error'); }
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
  try { await API.createTask(b); closeModal(); toast('Task created!', 'success'); await loadAdminTasks(); }
  catch (e) { toast(e.message, 'error'); }
}
