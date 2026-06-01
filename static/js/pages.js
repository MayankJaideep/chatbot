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
    <div class="section-card"><div class="section-title"><i class="fa-solid fa-table"></i>Monthly Record</div><div class="tbl-wrap" id="att-table">Loading…</div></div>
    
    <div class="section-card mt-16">
      <div class="section-title"><i class="fa-solid fa-map-location-dot"></i>📍 Client & Site Visits</div>
      <p style="font-size: 11.5px; color: var(--text2); margin-bottom: 12px;">Log multiple location visits per day with GPS check-in/out verification.</p>
      
      <div class="form-row" style="margin-bottom: 12px; gap: 8px; display: flex; flex-wrap: wrap; align-items: flex-end;">
        <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 180px;">
          <label style="font-size: 9px; margin-bottom: 4px; display: block;">Select Geofenced Site</label>
          <select id="visit-site-id" class="form-control" style="padding: 6px 10px; font-size: 11.5px;"></select>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-primary btn-sm" id="btn-visit-checkin" onclick="doVisitCheckIn()"><i class="fa-solid fa-sign-in-alt"></i> Site Check In</button>
          <button class="btn btn-danger btn-sm" id="btn-visit-checkout" onclick="doVisitCheckOut()" disabled><i class="fa-solid fa-sign-out-alt"></i> Site Check Out</button>
        </div>
      </div>

      <div class="form-row" style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="mock-gps-enable" onchange="toggleMockGPS()" style="width: auto; margin: 0; cursor: pointer;" />
        <label for="mock-gps-enable" style="font-size: 11px; margin: 0; cursor: pointer; color: var(--primary); font-weight: 500;">🧪 Dev Mode: Mock GPS Coordinates</label>
      </div>

      <div id="mock-gps-inputs" class="hidden" style="margin-bottom: 12px; border-left: 2px dashed var(--primary); padding-left: 10px; padding-bottom: 4px;">
        <div class="form-row" style="gap: 8px; display: flex; flex-wrap: wrap; margin-bottom: 6px;">
          <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 120px;">
            <label style="font-size: 8px; margin-bottom: 2px; display: block;">Mock Latitude</label>
            <input type="number" step="any" id="mock-lat" class="form-control" placeholder="e.g. 19.1135499" style="padding: 4px 8px; font-size: 11px;" />
          </div>
          <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 120px;">
            <label style="font-size: 8px; margin-bottom: 2px; display: block;">Mock Longitude</label>
            <input type="number" step="any" id="mock-lng" class="form-control" placeholder="e.g. 72.8665541" style="padding: 4px 8px; font-size: 11px;" />
          </div>
        </div>
        <p style="font-size: 9.5px; color: var(--text2); margin: 0;">
          Auto-fill center: 
          <a href="#" onclick="fillMockCoords(19.1135499, 72.8665541); return false;" style="color:var(--primary); font-weight: 600; text-decoration: underline;">Mumbai</a> | 
          <a href="#" onclick="fillMockCoords(12.9742787, 77.6157605); return false;" style="color:var(--primary); font-weight: 600; text-decoration: underline;">Bangalore</a> |
          <a href="#" onclick="fillMockCoords(13.0245982, 75.8943748); return false;" style="color:var(--primary); font-weight: 600; text-decoration: underline;">Home (Alur)</a>
        </p>
      </div>
      
      <div id="active-visit-banner" class="hidden" style="background: rgba(108, 99, 255, 0.08); border: 1px solid rgba(108, 99, 255, 0.2); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 11.5px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <span style="font-weight: 600; color: var(--primary);"><i class="fa-solid fa-location-dot"></i> Logged In: </span>
          <span id="active-visit-details" style="color: var(--text);">Google HQ</span>
        </div>
        <div id="active-visit-coords" style="font-size: 9.5px; color: var(--text2);">GPS: --, --</div>
      </div>

      <div class="tbl-wrap" id="visits-table">Loading site visits…</div>
    </div>`;
  startClock();
  await loadAttendance(now.getMonth() + 1, now.getFullYear());
  await loadVisits();
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

// ── Geolocation and Site Visits ──
function getGPSLocation() {
  return new Promise((resolve, reject) => {
    // Check if Mock GPS is enabled
    const mockEnabled = document.getElementById('mock-gps-enable')?.checked;
    if (mockEnabled) {
      const lat = parseFloat(document.getElementById('mock-lat')?.value);
      const lng = parseFloat(document.getElementById('mock-lng')?.value);
      if (isNaN(lat) || isNaN(lng)) {
        reject(new Error('Please enter valid numeric latitude and longitude for Mock GPS.'));
        return;
      }
      resolve({ latitude: lat, longitude: lng, accuracy: 10.0 });
      return;
    }

    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }
    
    const tryGet = (highAccuracy) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ 
          latitude: pos.coords.latitude, 
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        (err) => {
          // If high accuracy failed or timed out, fall back to standard accuracy
          if (highAccuracy && (err.code === 3 || err.code === 2)) {
            console.warn('High accuracy location failed, retrying with standard accuracy...');
            tryGet(false);
            return;
          }
          
          let msg = 'Failed to get GPS location.';
          if (err.code === 1) msg = 'Permission denied. Please allow location access in your browser settings.';
          else if (err.code === 2) msg = 'Position unavailable. Please ensure macOS Location Services and Wi-Fi are turned ON.';
          else if (err.code === 3) msg = 'Timeout obtaining location. Try standing near a window or check location settings.';
          reject(new Error(msg));
        },
        { enableHighAccuracy: highAccuracy, timeout: 8000, maximumAge: 0 }
      );
    };

    tryGet(true);
  });
}

function toggleMockGPS() {
  const isEnabled = document.getElementById('mock-gps-enable')?.checked;
  const panel = document.getElementById('mock-gps-inputs');
  if (isEnabled) {
    panel?.classList.remove('hidden');
    // Pre-fill Mumbai by default
    fillMockCoords(19.1135499, 72.8665541);
  } else {
    panel?.classList.add('hidden');
  }
}

function fillMockCoords(lat, lng) {
  const latEl = document.getElementById('mock-lat');
  const lngEl = document.getElementById('mock-lng');
  if (latEl) latEl.value = lat;
  if (lngEl) lngEl.value = lng;
  toast(`Mock coordinates set to: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'info');
}

async function doVisitCheckIn() {
  const selectEl = document.getElementById('visit-site-id');
  const siteId = parseInt(selectEl?.value);
  if (!siteId) {
    toast('Please select a site to check in.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-visit-checkin');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Getting GPS...';

  try {
    const coords = await getGPSLocation();
    const res = await API.checkInSite(siteId, coords.latitude, coords.longitude, coords.accuracy);
    toast(res.message || 'Successfully checked in to site!', 'success');
    await loadVisits();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function doVisitCheckOut() {
  const btn = document.getElementById('btn-visit-checkout');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Getting GPS...';

  try {
    const d = await API.getVisits();
    const activeVisit = d.active_visit;
    if (!activeVisit) {
      toast('No active site visit found to check out from.', 'warning');
      return;
    }

    const coords = await getGPSLocation();
    const res = await API.checkOutSite(activeVisit.site_id, coords.latitude, coords.longitude, coords.accuracy);
    toast(res.message || 'Successfully checked out of site!', 'success');
    await loadVisits();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function loadVisits() {
  const tableEl = document.getElementById('visits-table');
  if (!tableEl) return;
  try {
    const d = await API.getVisits();
    
    const ciBtn = document.getElementById('btn-visit-checkin');
    const coBtn = document.getElementById('btn-visit-checkout');
    const banner = document.getElementById('active-visit-banner');
    const bannerDetails = document.getElementById('active-visit-details');
    const bannerCoords = document.getElementById('active-visit-coords');
    const selectEl = document.getElementById('visit-site-id');

    // Fetch active sites list for dropdown
    let sites = [];
    try {
      const sitesRes = await API.getSites();
      sites = sitesRes.sites || [];
    } catch (err) {
      console.error('Failed to load sites', err);
    }

    if (d.active_visit) {
      if (ciBtn) ciBtn.disabled = true;
      if (coBtn) coBtn.disabled = false;
      if (selectEl) {
        selectEl.innerHTML = `<option value="${d.active_visit.site_id}">${d.active_visit.client_name}</option>`;
        selectEl.disabled = true;
      }
      if (banner) banner.classList.remove('hidden');
      if (bannerDetails) {
        bannerDetails.textContent = `${d.active_visit.client_name} (checked in at ${fmtTime(d.active_visit.check_in_time)})`;
      }
      if (bannerCoords && d.active_visit.check_in_latitude) {
        bannerCoords.textContent = `GPS: ${d.active_visit.check_in_latitude.toFixed(4)}, ${d.active_visit.check_in_longitude.toFixed(4)}`;
      }
    } else {
      if (ciBtn) ciBtn.disabled = false;
      if (coBtn) coBtn.disabled = true;
      if (selectEl) {
        selectEl.disabled = false;
        selectEl.innerHTML = sites.map(s => `<option value="${s.id}">${s.client_name} - ${s.site_name} (${s.radius_meters}m radius)</option>`).join('');
      }
      if (banner) banner.classList.add('hidden');
    }

    const rows = d.records.map(r => {
      const inCoords = r.check_in_latitude ? `<a class="gps-badge" href="https://www.google.com/maps?q=${r.check_in_latitude},${r.check_in_longitude}" target="_blank" title="View location on map"><i class="fa-solid fa-map-pin"></i> ${r.check_in_latitude.toFixed(4)}, ${r.check_in_longitude.toFixed(4)}</a>` : '—';
      const outCoords = r.check_out_latitude ? `<a class="gps-badge gps-badge-checkout" href="https://www.google.com/maps?q=${r.check_out_latitude},${r.check_out_longitude}" target="_blank" title="View location on map"><i class="fa-solid fa-map-pin"></i> ${r.check_out_latitude.toFixed(4)}, ${r.check_out_longitude.toFixed(4)}</a>` : '—';
      return `<tr>
        <td style="font-weight: 600;">${r.client_name}</td>
        <td>${fmtTime(r.check_in_time)}</td>
        <td>${fmtTime(r.check_out_time)}</td>
        <td>${inCoords}</td>
        <td>${outCoords}</td>
        <td>${r.hours_at_location ? r.hours_at_location + ' hrs' : '—'}</td>
      </tr>`;
    }).join('');

    tableEl.innerHTML = `<table>
      <thead>
        <tr>
          <th>Client Site</th>
          <th>Check In</th>
          <th>Check Out</th>
          <th>Check In GPS</th>
          <th>Check Out GPS</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="text-center text-muted" style="padding:24px">No site visits logged today</td></tr>'}
      </tbody>
    </table>`;
  } catch (e) {
    tableEl.innerHTML = `<div class="text-center text-muted" style="padding:24px">Error loading visits: ${e.message}</div>`;
  }
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
