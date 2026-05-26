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
    const cards = d.leaves.map(l => `
      <div class="data-card">
        <div class="data-card-header">
          <span class="data-card-title">${badge(l.leave_type)}</span>
          <span>${badge(l.status)}</span>
        </div>
        <div class="data-card-body">
          <div class="data-card-row">
            <span class="data-card-label">Duration</span>
            <span class="data-card-value">📅 ${fmtDate(l.from_date)} to ${fmtDate(l.to_date)} (${l.days} days)</span>
          </div>
          <div class="data-card-row">
            <span class="data-card-label">Reason</span>
            <span class="data-card-value" style="text-align:right;max-width:70%">${l.reason}</span>
          </div>
          <div class="data-card-row">
            <span class="data-card-label">Applied On</span>
            <span class="data-card-value">${fmtDate(l.applied_on)}</span>
          </div>
        </div>
      </div>`).join('');
    document.getElementById('leave-table').innerHTML = cards
      ? `<div class="card-list">${cards}</div>`
      : '<div class="empty-state" style="padding:24px"><i class="fa-solid fa-umbrella-beach"></i><p>No leave requests yet</p></div>';
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
    const cards = d.tasks.map(t => {
      const isCompleted = t.status === 'completed';
      const deleteBtn = isCompleted
        ? `<button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3)" onclick="deleteTask(${t.id})" title="Delete completed task"><i class="fa-solid fa-trash"></i></button>`
        : '';
      return `
      <div class="data-card" style="${isCompleted ? 'opacity:0.65' : ''}">
        <div class="data-card-header">
          <span class="data-card-title">${t.title}</span>
          <div style="display:flex;gap:4px">
            ${badge(t.priority)}
            ${badge(t.status)}
          </div>
        </div>
        <div class="data-card-body">
          ${t.description ? `<p style="font-size:11.5px;color:var(--text2);margin-bottom:4px">${t.description}</p>` : ''}
          <div class="data-card-row">
            <span class="data-card-label">Progress</span>
            <span class="data-card-value" style="display:flex;align-items:center;gap:8px;width:60%;justify-content:flex-end">
              <div class="progress-bar" style="flex:1;margin-top:0"><div class="progress-fill" style="width:${t.progress}%"></div></div>
              <span>${t.progress}%</span>
            </span>
          </div>
          <div class="data-card-row">
            <span class="data-card-label">Due Date</span>
            <span class="data-card-value">⏳ ${fmtDate(t.due_date)}</span>
          </div>
        </div>
        <div class="data-card-footer">
          <button class="btn btn-sm btn-outline" onclick="updateTaskModal(${t.id},'${t.status}',${t.progress})"><i class="fa-solid fa-pen"></i> Update</button>
          ${deleteBtn}
        </div>
      </div>`;
    }).join('');
    document.getElementById('task-table').innerHTML = cards
      ? `<div class="card-list">${cards}</div>`
      : '<div class="empty-state" style="padding:24px"><i class="fa-solid fa-list-check"></i><p>No tasks assigned</p></div>';
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
    const cards = d.tickets.map(t => {
      const isDone = t.status === 'resolved' || t.status === 'closed';
      const deleteBtn = isDone
        ? `<button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3)" onclick="deleteTicket(${t.id})" title="Delete ticket"><i class="fa-solid fa-trash"></i></button>`
        : '';
      return `
      <div class="data-card" style="${isDone ? 'opacity:0.65' : ''}">
        <div class="data-card-header">
          <span class="data-card-title" style="color:var(--primary)">${t.ticket_number}</span>
          <div style="display:flex;gap:4px">
            ${badge(t.priority)}
            ${badge(t.status)}
          </div>
        </div>
        <div class="data-card-body">
          <div class="data-card-row">
            <span class="data-card-label">Category</span>
            <span class="data-card-value">${badge(t.category)}</span>
          </div>
          <div class="data-card-row">
            <span class="data-card-label">Subject</span>
            <span class="data-card-value" style="text-align:right;max-width:70%">${t.subject}</span>
          </div>
          <div class="data-card-row">
            <span class="data-card-label">Created On</span>
            <span class="data-card-value">📅 ${fmtDate(t.created_at)}</span>
          </div>
        </div>
        ${deleteBtn ? `
        <div class="data-card-footer">
          ${deleteBtn}
        </div>` : ''}
      </div>`;
    }).join('');
    document.getElementById('ticket-table').innerHTML = cards
      ? `<div class="card-list">${cards}</div>`
      : '<div class="empty-state" style="padding:24px"><i class="fa-solid fa-ticket"></i><p>No tickets raised yet</p></div>';
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
