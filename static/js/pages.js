// ── Utilities ──
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: 'circle-check', error: 'circle-xmark', info: 'circle-info', warning: 'triangle-exclamation' };
  t.innerHTML = `<i class="fa-solid fa-${icons[type] || 'circle-info'}"></i><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function badge(val) {
  const cls = val ? val.toLowerCase().replace(/[\s_]/g, '-') : '';
  return `<span class="badge badge-${cls}">${val || '—'}</span>`;
}
function modal(html) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal">${html}</div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  return ov;
}
function closeModal() { document.querySelectorAll('.modal-overlay').forEach(m => m.remove()); }

// ── Dashboard Page ──
async function renderDashboard(el) {
  el.innerHTML = `<div class="page-header"><div><h2>👋 Welcome back, ${API.user.name.split(' ')[0]}!</h2><p>Here's your office summary for today.</p></div></div><div class="stat-grid" id="dash-stats"></div><div class="section-card"><div class="section-title"><i class="fa-solid fa-clock-rotate-left"></i>Recent Activity</div><div id="dash-recent">Loading…</div></div>`;
  try {
    const d = await API.empDashboard();
    document.getElementById('dash-stats').innerHTML = `
      <div class="stat-card"><div class="stat-icon si-purple"><i class="fa-solid fa-calendar-check"></i></div><div class="stat-info"><div class="stat-val">${d.attendance_today ? (d.attendance_today.check_out ? 'Done' : 'In') : 'Out'}</div><div class="stat-label">Today's Status</div></div></div>
      <div class="stat-card"><div class="stat-icon si-teal"><i class="fa-solid fa-umbrella-beach"></i></div><div class="stat-info"><div class="stat-val">${d.leave_balance}</div><div class="stat-label">Leave Balance</div></div></div>
      <div class="stat-card"><div class="stat-icon si-amber"><i class="fa-solid fa-list-check"></i></div><div class="stat-info"><div class="stat-val">${d.my_tasks}</div><div class="stat-label">Pending Tasks</div></div></div>
      <div class="stat-card"><div class="stat-icon si-red"><i class="fa-solid fa-ticket"></i></div><div class="stat-info"><div class="stat-val">${d.open_tickets}</div><div class="stat-label">Open Tickets</div></div></div>
    `;
    const ci = d.attendance_today;
    document.getElementById('dash-recent').innerHTML = ci
      ? `<div class="flex items-center gap-12 mt-8"><div class="stat-icon si-green"><i class="fa-solid fa-clock"></i></div><div><div style="font-weight:600">Checked in at ${fmtTime(ci.check_in)}</div><div class="text-muted" style="font-size:12px">${ci.check_out ? 'Checked out at ' + fmtTime(ci.check_out) : 'Still clocked in'}</div></div></div>`
      : `<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><p>No check-in recorded today.<br><a href="#" onclick="navigate('attendance')" style="color:var(--primary)">Mark Attendance →</a></p></div>`;
  } catch (e) { toast(e.message, 'error'); }
}

// ── Attendance Page ──
async function renderAttendance(el) {
  const now = new Date();
  el.innerHTML = `
    <div class="page-header"><div><h2>Attendance</h2><p>Track your daily clock-in & out</p></div></div>
    <div class="clock-card">
      <div class="clock-time" id="live-clock">--:--:--</div>
      <div class="clock-date" id="live-date"></div>
      <div class="clock-btns">
        <button class="clock-btn checkin" id="btn-checkin" onclick="doCheckIn()"><i class="fa-solid fa-sign-in-alt"></i> Check In</button>
        <button class="clock-btn checkout" id="btn-checkout" onclick="doCheckOut()" disabled><i class="fa-solid fa-sign-out-alt"></i> Check Out</button>
      </div>
      <div id="today-status" class="mt-12" style="font-size:13px;opacity:.85"></div>
    </div>
    <div class="section-card"><div class="section-title"><i class="fa-solid fa-table"></i>Monthly Record</div><div class="tbl-wrap" id="att-table">Loading…</div></div>`;
  startClock();
  await loadAttendance(now.getMonth() + 1, now.getFullYear());
}

function startClock() {
  const tc = document.getElementById('live-clock');
  const td = document.getElementById('live-date');
  if (!tc) return;
  const tick = () => {
    if (!document.getElementById('live-clock')) return;
    const n = new Date();
    tc.textContent = n.toLocaleTimeString('en-IN');
    td.textContent = n.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    setTimeout(tick, 1000);
  };
  tick();
}

async function loadAttendance(m, y) {
  try {
    const d = await API.getAttendance(m, y);
    if (d.today) {
      const ci = document.getElementById('btn-checkin');
      const co = document.getElementById('btn-checkout');
      const st = document.getElementById('today-status');
      if (d.today.check_in) { ci.disabled = true; co.disabled = false; }
      if (d.today.check_out) { co.disabled = true; }
      if (st) st.textContent = d.today.check_in ? `✅ Checked in: ${fmtTime(d.today.check_in)}${d.today.check_out ? '  |  Checked out: ' + fmtTime(d.today.check_out) : ''}` : '';
    }
    const rows = d.records.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${fmtTime(r.check_in)}</td><td>${fmtTime(r.check_out)}</td><td>${r.hours_worked ? r.hours_worked + ' hrs' : '—'}</td><td>${badge(r.status)}</td></tr>`).join('');
    document.getElementById('att-table').innerHTML = `<table><thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="text-center text-muted" style="padding:24px">No records found</td></tr>'}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function doCheckIn() {
  try { await API.checkIn(); toast('Checked in successfully!', 'success'); await loadAttendance(new Date().getMonth() + 1, new Date().getFullYear()); }
  catch (e) { toast(e.message, 'error'); }
}
async function doCheckOut() {
  try { const d = await API.checkOut(); toast(`Checked out! Hours worked: ${d.hours_worked}`, 'success'); await loadAttendance(new Date().getMonth() + 1, new Date().getFullYear()); }
  catch (e) { toast(e.message, 'error'); }
}

// ── Leave Page ──
async function renderLeaves(el) {
  el.innerHTML = `
    <div class="page-header"><div><h2>Leave Management</h2><p>Apply and track your leave requests</p></div><button class="btn btn-primary" onclick="showLeaveForm()"><i class="fa-solid fa-plus"></i> Apply Leave</button></div>
    <div class="section-card"><div class="section-title"><i class="fa-solid fa-list"></i>My Leave Requests</div><div class="tbl-wrap" id="leave-table">Loading…</div></div>`;
  await loadLeaves();
}

async function loadLeaves() {
  try {
    const d = await API.getLeaves();
    const rows = d.leaves.map(l => `<tr><td>${badge(l.leave_type)}</td><td>${fmtDate(l.from_date)}</td><td>${fmtDate(l.to_date)}</td><td>${l.days} day(s)</td><td>${l.reason}</td><td>${badge(l.status)}</td><td>${fmtDate(l.applied_on)}</td></tr>`).join('');
    document.getElementById('leave-table').innerHTML = `<table><thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Applied</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="text-center text-muted" style="padding:24px">No leave requests yet</td></tr>'}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function showLeaveForm() {
  const ov = modal(`
    <div class="modal-header"><h3><i class="fa-solid fa-umbrella-beach" style="color:var(--primary)"></i> Apply for Leave</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="form-row">
      <div class="form-group"><label>Leave Type</label><select class="form-control" id="lv-type"><option value="sick">Sick Leave</option><option value="casual">Casual Leave</option><option value="annual">Annual Leave</option><option value="emergency">Emergency Leave</option></select></div>
      <div class="form-group"><label>From Date</label><input type="date" class="form-control" id="lv-from" min="${new Date().toISOString().split('T')[0]}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>To Date</label><input type="date" class="form-control" id="lv-to" min="${new Date().toISOString().split('T')[0]}"/></div>
      <div class="form-group"><label>Reason</label><input type="text" class="form-control" id="lv-reason" placeholder="Brief reason"/></div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitLeave()">Submit Request</button></div>`);
}

async function submitLeave() {
  const body = { leave_type: document.getElementById('lv-type').value, from_date: document.getElementById('lv-from').value, to_date: document.getElementById('lv-to').value, reason: document.getElementById('lv-reason').value };
  if (!body.from_date || !body.to_date || !body.reason) { toast('Please fill all fields', 'warning'); return; }
  try { await API.applyLeave(body); closeModal(); toast('Leave applied!', 'success'); await loadLeaves(); }
  catch (e) { toast(e.message, 'error'); }
}

// ── Tasks Page ──
async function renderTasks(el) {
  el.innerHTML = `<div class="page-header"><div><h2>My Tasks</h2><p>Track and update your assignments</p></div></div><div class="section-card"><div class="tbl-wrap" id="task-table">Loading…</div></div>`;
  await loadTasks();
}

async function loadTasks() {
  try {
    const d = await API.getTasks();
    const rows = d.tasks.map(t => {
      const isCompleted = t.status === 'completed';
      const deleteBtn = isCompleted
        ? `<button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);margin-left:6px" onclick="deleteTask(${t.id})" title="Delete completed task"><i class="fa-solid fa-trash"></i></button>`
        : '';
      return `<tr style="${isCompleted ? 'opacity:0.65' : ''}">  
        <td><div style="font-weight:600">${t.title}</div><div class="text-muted" style="font-size:11px">${t.description || ''}</div></td>
        <td>${badge(t.priority)}</td>
        <td>${badge(t.status)}</td>
        <td><div class="progress-bar"><div class="progress-fill" style="width:${t.progress}%"></div></div><div style="font-size:11px;margin-top:3px">${t.progress}%</div></td>
        <td>${fmtDate(t.due_date)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="updateTaskModal(${t.id},'${t.status}',${t.progress})">Update</button>
          ${deleteBtn}
        </td>
      </tr>`;
    }).join('');
    document.getElementById('task-table').innerHTML = `<table><thead><tr><th>Task</th><th>Priority</th><th>Status</th><th>Progress</th><th>Due</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="text-center text-muted" style="padding:24px">No tasks assigned</td></tr>'}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function updateTaskModal(id, status, progress) {
  modal(`
    <div class="modal-header"><h3>Update Task</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="form-group"><label>Status</label><select class="form-control" id="tk-status">
      <option value="pending" ${status==='pending'?'selected':''}>Pending</option>
      <option value="in_progress" ${status==='in_progress'?'selected':''}>In Progress</option>
      <option value="completed" ${status==='completed'?'selected':''}>Completed</option>
    </select></div>
    <div class="form-group"><label>Progress (%)</label><input type="range" class="form-control" id="tk-prog" min="0" max="100" value="${progress}" oninput="document.getElementById('prog-val').textContent=this.value"/><span id="prog-val">${progress}</span>%</div>
    <div class="form-group"><label>Notes</label><textarea class="form-control" id="tk-notes" rows="2" placeholder="Update notes…"></textarea></div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveTask(${id})">Save</button></div>`);
}

async function saveTask(id) {
  const body = { status: document.getElementById('tk-status').value, progress: parseInt(document.getElementById('tk-prog').value), notes: document.getElementById('tk-notes').value };
  try { await API.updateTask(id, body); closeModal(); toast('Task updated!', 'success'); await loadTasks(); }
  catch (e) { toast(e.message, 'error'); }
}

// ── Tickets Page ──
async function renderTickets(el) {
  el.innerHTML = `<div class="page-header"><div><h2>Helpdesk</h2><p>Raise and track support tickets</p></div><button class="btn btn-primary" onclick="showTicketForm()"><i class="fa-solid fa-plus"></i> New Ticket</button></div><div class="section-card"><div class="tbl-wrap" id="ticket-table">Loading…</div></div>`;
  await loadTickets();
}

async function loadTickets() {
  try {
    const d = await API.getTickets();
    const rows = d.tickets.map(t => {
      const isDone = t.status === 'resolved' || t.status === 'closed';
      const deleteBtn = isDone
        ? `<button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);margin-left:6px" onclick="deleteTicket(${t.id})" title="Delete resolved ticket"><i class="fa-solid fa-trash"></i></button>`
        : '';
      return `<tr style="${isDone ? 'opacity:0.65' : ''}">
        <td style="font-weight:600">${t.ticket_number}</td>
        <td>${badge(t.category)}</td>
        <td>${t.subject}</td>
        <td>${badge(t.priority)}</td>
        <td>${badge(t.status)}</td>
        <td>${fmtDate(t.created_at)}</td>
        <td>${deleteBtn}</td>
      </tr>`;
    }).join('');
    document.getElementById('ticket-table').innerHTML = `<table><thead><tr><th>#</th><th>Category</th><th>Subject</th><th>Priority</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="text-center text-muted" style="padding:24px">No tickets raised</td></tr>'}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function showTicketForm() {
  modal(`
    <div class="modal-header"><h3><i class="fa-solid fa-ticket" style="color:var(--primary)"></i> New Helpdesk Ticket</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="form-row">
      <div class="form-group"><label>Category</label><select class="form-control" id="tk-cat"><option>IT</option><option>HR</option><option>Finance</option><option>Admin</option><option>Facilities</option></select></div>
      <div class="form-group"><label>Priority</label><select class="form-control" id="tk-pri"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
    </div>
    <div class="form-group"><label>Subject</label><input type="text" class="form-control" id="tk-sub" placeholder="Brief subject"/></div>
    <div class="form-group"><label>Description</label><textarea class="form-control" id="tk-desc" rows="3" placeholder="Describe your issue…"></textarea></div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitTicket()">Submit Ticket</button></div>`);
}

async function submitTicket() {
  const body = { category: document.getElementById('tk-cat').value, priority: document.getElementById('tk-pri').value, subject: document.getElementById('tk-sub').value, description: document.getElementById('tk-desc').value };
  if (!body.subject || !body.description) { toast('Please fill all fields', 'warning'); return; }
  try { await API.createTicket(body); closeModal(); toast('Ticket submitted!', 'success'); await loadTickets(); }
  catch (e) { toast(e.message, 'error'); }
}

async function deleteTicket(id) {
  if (!confirm('Delete this resolved ticket? This cannot be undone.')) return;
  try {
    await API.deleteTicket(id);
    toast('Ticket deleted', 'success');
    await loadTickets();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteTask(id) {
  if (!confirm('Delete this completed task? This cannot be undone.')) return;
  try {
    await API.deleteTask(id);
    toast('Task deleted', 'success');
    await loadTasks();
  } catch (e) { toast(e.message, 'error'); }
}
