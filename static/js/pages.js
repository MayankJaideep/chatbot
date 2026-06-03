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

function parseMeetingTimeAndLocation(ev) {
  let timeStr = '10:00 AM - 11:00 AM'; // Default
  let locationStr = 'Conference Room A'; // Default
  
  const timeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i;
  const timeRangeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i;
  
  const textToSearch = `${ev.title} ${ev.description || ''}`;
  
  const rangeMatch = textToSearch.match(timeRangeRegex);
  if (rangeMatch) {
    timeStr = rangeMatch[1];
  } else {
    const singleMatch = textToSearch.match(timeRegex);
    if (singleMatch) {
      timeStr = `${singleMatch[1]} - ${addOneHour(singleMatch[1])}`;
    } else {
      const idNum = ev.id ? (parseInt(ev.id.replace(/\D/g, '')) || 0) : 0;
      const startHour = 9 + (idNum % 8); // 9 AM to 5 PM
      const suffix = startHour >= 12 ? 'PM' : 'AM';
      const displayHour = startHour > 12 ? startHour - 12 : startHour;
      timeStr = `${displayHour}:00 ${suffix} - ${displayHour + 1 === 13 ? 1 : displayHour + 1}:00 ${startHour + 1 >= 12 ? 'PM' : 'AM'}`;
    }
  }
  
  const locRegexes = [
    /location:\s*([^\n,]+)/i,
    /at\s+(Zoom|Google Meet|Teams|Office|Room\s*\d+)/i,
    /in\s+([^\n,]+)/i
  ];
  
  for (const regex of locRegexes) {
    const m = textToSearch.match(regex);
    if (m) {
      locationStr = m[1].trim();
      break;
    }
  }
  
  if (locationStr.length > 30) locationStr = locationStr.substring(0, 30) + '...';
  
  return { timeStr, locationStr };
}

function addOneHour(timeStr) {
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return timeStr;
  let hr = parseInt(m[1]);
  let min = m[2];
  let ampm = m[3].toUpperCase();
  hr += 1;
  if (hr === 12) {
    ampm = ampm === 'AM' ? 'PM' : 'AM';
  } else if (hr > 12) {
    hr -= 12;
  }
  return `${hr}:${min} ${ampm}`;
}

function getCountdownBadge(timeStr) {
  const parts = timeStr.split('-');
  const startPart = parts[0].trim();
  const endPart = parts[1] ? parts[1].trim() : addOneHour(startPart);
  
  const parseTime = (str) => {
    const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let hr = parseInt(m[1]);
    const min = parseInt(m[2]);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && hr < 12) hr += 12;
    if (ampm === 'AM' && hr === 12) hr = 0;
    
    const d = new Date();
    d.setHours(hr, min, 0, 0);
    return d;
  };
  
  const start = parseTime(startPart);
  const end = parseTime(endPart);
  
  if (!start || !end) return { text: 'Scheduled', class: 'upcoming' };
  
  const now = new Date();
  
  if (now > end) {
    return { text: 'Ended', class: 'past' };
  } else if (now >= start && now <= end) {
    return { text: 'Happening now', class: 'active' };
  } else {
    const diffMs = start - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffHours > 0) {
      const remainingMins = diffMins % 60;
      return { 
        text: `In ${diffHours}h${remainingMins > 0 ? ` ${remainingMins}m` : ''}`, 
        class: 'upcoming' 
      };
    } else {
      return { 
        text: `In ${diffMins} mins`, 
        class: 'upcoming' 
      };
    }
  }
}

// ── Dashboard Page ──
async function renderDashboard(el) {
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h2>👋 Welcome back, ${API.user.name.split(' ')[0]}!</h2>
        <p>Here's your office summary for today.</p>
      </div>
    </div>
    
    <div class="stat-grid" id="dash-stats"></div>
    
    <div class="dashboard-layout-grid">
      <!-- Left Column: Site Visit & Check In, My Tasks checklist, Recent Visits -->
      <div class="dashboard-left-col">
        <div class="clock-card" style="margin-bottom: 20px;">
          <div class="clock-time" id="live-clock">--:--:--</div>
          <div class="clock-date" id="live-date"></div>
          
          <div class="form-group" style="margin: 16px auto 6px; max-width: 340px; text-align: center;">
            <label style="font-size: 11px; opacity: 0.85; margin-bottom: 6px; display: block; font-weight: 500; letter-spacing: 0.5px;">SELECT GEOFENCED SITE</label>
            <select id="visit-site-id" class="form-control" style="padding: 8px 12px; font-size: 13px; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.25); color: #fff; border-radius: var(--radius-sm); text-align-last: center; width: 100%; font-weight: 500; cursor: pointer;"></select>
          </div>
          
          <div class="clock-btns" style="margin-top: 16px;">
            <button class="clock-btn checkin" id="btn-visit-checkin" onclick="doVisitCheckIn()"><i class="fa-solid fa-sign-in-alt"></i> Site Check In</button>
            <button class="clock-btn checkout" id="btn-visit-checkout" onclick="doVisitCheckOut()" disabled><i class="fa-solid fa-sign-out-alt"></i> Site Check Out</button>
          </div>
          
          <div id="active-visit-banner" class="hidden" style="margin-top: 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 8px; justify-content: center; width: auto; max-width: 100%;">
            <span style="font-weight: 600; color: #fff;"><i class="fa-solid fa-location-dot"></i> Logged In: </span>
            <span id="active-visit-details" style="color: #fff;"></span>
            <span id="active-visit-coords" style="font-size: 10px; opacity: 0.8; margin-left: 8px;"></span>
          </div>
        </div>

        <!-- My Tasks Widget -->
        <div class="widget-card" id="my-tasks-widget">
          <div class="widget-header">
            <h3><i class="fa-solid fa-list-check"></i> My Tasks</h3>
            <span class="text-muted" style="font-size: 11px;" id="tasks-count-badge">0 pending</span>
          </div>
          <div class="widget-tasks-list" id="widget-tasks-list">
            <div class="text-center text-muted" style="padding:12px; font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading tasks...</div>
          </div>
        </div>

        <div class="section-card">
          <div class="section-title"><i class="fa-solid fa-map-location-dot"></i>Recent Site Visits Log</div>
          <div class="tbl-wrap" id="visits-table">Loading site visits…</div>
        </div>
      </div>
      
      <!-- Right Column: Today's Schedule widget & Upgraded Visual Calendar Planner -->
      <div class="dashboard-right-col">
        <!-- Today's Schedule Widget -->
        <div class="widget-card" id="today-schedule-widget">
          <div class="widget-header">
            <h3><i class="fa-solid fa-calendar-check"></i> Today's Schedule</h3>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="text-muted" style="font-size: 11px;" id="schedule-count-badge">0 events</span>
              <button class="btn btn-sm btn-outline" onclick="scheduleWithAI()" style="padding: 3px 8px; font-size: 10px; border-radius: var(--radius-sm); font-weight: 600; display: inline-flex; align-items: center; gap: 5px; height: 24px; line-height: 1;" title="Schedule a meeting using AI Assistant">
                <i class="fa-solid fa-robot" style="color: var(--primary);"></i> Ask AI to Schedule
              </button>
            </div>
          </div>
          <div class="schedule-list" id="widget-schedule-list">
            <div class="text-center text-muted" style="padding:12px; font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading schedule...</div>
          </div>
        </div>

        <div class="calendar-card">
          <div class="calendar-header">
            <div class="calendar-title-wrapper" style="display:flex; gap:12px; align-items:center;">
              <h3><i class="fa-solid fa-calendar-days"></i> Team Calendar</h3>
              <button class="btn btn-sm btn-primary" onclick="showAddEventForm()" style="padding: 4px 10px; font-size: 11px;"><i class="fa-solid fa-plus"></i> Add Event</button>
            </div>
            <div class="calendar-nav-controls">
              <button class="btn btn-sm btn-outline" id="cal-prev-btn" onclick="changeCalendarMonth(-1)"><i class="fa-solid fa-chevron-left"></i></button>
              <button class="btn btn-sm btn-outline" id="cal-today-btn" onclick="goToTodayMonth()"><i class="fa-solid fa-calendar-day"></i> Today</button>
              <span id="cal-month-title" style="font-weight:700; font-size:13px; min-width:120px; text-align:center;">—</span>
              <button class="btn btn-sm btn-outline" id="cal-next-btn" onclick="changeCalendarMonth(1)"><i class="fa-solid fa-chevron-right"></i></button>
            </div>
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; width:100%;">
            <div class="calendar-filter-bar" style="margin-bottom:0;">
              <button class="calendar-filter-btn active" id="filter-all" onclick="setCalendarFilter('all')">All</button>
              <button class="calendar-filter-btn" id="filter-leave" onclick="setCalendarFilter('leave')">Leaves</button>
              <button class="calendar-filter-btn" id="filter-holiday" onclick="setCalendarFilter('holiday')">Holidays</button>
              <button class="calendar-filter-btn" id="filter-meeting" onclick="setCalendarFilter('meeting')">Meetings</button>
              <button class="calendar-filter-btn" id="filter-deadline" onclick="setCalendarFilter('deadline')">Deadlines</button>
            </div>
            
            <div id="calendar-summary-indicators" class="calendar-summary-indicators">
              <!-- Dynamically populated counts of leaves, holidays, meetings, deadlines in current month -->
            </div>
          </div>
          
          <div id="calendar-grid-container">Loading Calendar…</div>
        </div>
      </div>
    </div>
  `;
  
  startClock();
  
  try {
    const d = await API.empDashboard();
    document.getElementById('dash-stats').innerHTML = `
      <div class="stat-card"><div class="stat-icon si-purple"><i class="fa-solid fa-calendar-check"></i></div><div class="stat-info"><div class="stat-val">${d.active_site_attendance ? 'In' : (d.checked_in_today ? 'Out' : 'Out')}</div><div class="stat-label">Today's Status</div></div></div>
      <div class="stat-card"><div class="stat-icon si-teal"><i class="fa-solid fa-umbrella-beach"></i></div><div class="stat-info"><div class="stat-val">${d.leave_balance}</div><div class="stat-label">Leave Balance</div></div></div>
      <div class="stat-card"><div class="stat-icon si-amber"><i class="fa-solid fa-list-check"></i></div><div class="stat-info"><div class="stat-val">${d.my_tasks}</div><div class="stat-label">Pending Tasks</div></div></div>
      <div class="stat-card"><div class="stat-icon si-red"><i class="fa-solid fa-ticket"></i></div><div class="stat-info"><div class="stat-val">${d.open_tickets}</div><div class="stat-label">Open Tickets</div></div></div>
    `;
  } catch (e) { toast(e.message, 'error'); }
  
  await Promise.all([
    loadVisits(),
    loadApprovedLeavesAndRenderCalendar().then(() => {
      loadTodaySchedule();
    }),
    loadDashboardWidgets()
  ]);
}

window.loadDashboardWidgets = async function() {
  const tasksListEl = document.getElementById('widget-tasks-list');
  const tasksBadge = document.getElementById('tasks-count-badge');
  if (!tasksListEl) return;
  
  try {
    const res = await API.getTasks();
    const pendingTasks = (res.tasks || []).filter(t => t.status !== 'completed');
    
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    pendingTasks.sort((a, b) => {
      const pA = priorityOrder[a.priority?.toLowerCase()] || 99;
      const pB = priorityOrder[b.priority?.toLowerCase()] || 99;
      return pA - pB;
    });
    
    if (tasksBadge) {
      tasksBadge.textContent = `${pendingTasks.length} pending`;
    }
    
    if (pendingTasks.length === 0) {
      tasksListEl.innerHTML = `<div class="text-center text-muted" style="padding:12px; font-size:12px;">No pending tasks</div>`;
      return;
    }
    
    const html = pendingTasks.map(t => {
      return `
        <div class="widget-task-item" data-task-id="${t.id}">
          <div class="widget-task-left">
            <div class="task-checkbox-btn" onclick="toggleTaskCheckbox(${t.id})" title="Mark task completed">
              <i class="fa-solid fa-check"></i>
            </div>
            <span class="task-title-text">${escapeHTML(t.title)}</span>
          </div>
          <div class="widget-task-meta">
            <span class="priority-badge-pill priority-${t.priority.toLowerCase()}">${t.priority}</span>
            <span class="widget-task-date">Due ${fmtDate(t.due_date)}</span>
          </div>
        </div>
      `;
    }).join('');
    
    tasksListEl.innerHTML = html;
  } catch (e) {
    console.error("Failed to load tasks widget", e);
    tasksListEl.innerHTML = `<div class="text-center text-muted" style="padding:12px; font-size:12px; color:var(--danger);">Error: ${e.message}</div>`;
  }
};

window.loadTodaySchedule = function() {
  const scheduleListEl = document.getElementById('widget-schedule-list');
  const scheduleBadge = document.getElementById('schedule-count-badge');
  if (!scheduleListEl) return;
  
  const localDate = new Date();
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  const todayMeetings = (window.cachedCalendarEvents || []).filter(ev => {
    if (ev.type !== 'meeting') return false;
    const startStr = ev.start.split('T')[0];
    const endStr = ev.end.split('T')[0];
    return todayStr >= startStr && todayStr <= endStr;
  });
  
  if (scheduleBadge) {
    scheduleBadge.textContent = `${todayMeetings.length} event${todayMeetings.length === 1 ? '' : 's'}`;
  }
  
  if (todayMeetings.length === 0) {
    scheduleListEl.innerHTML = `<div class="text-center text-muted" style="padding:12px; font-size:12px;">No meetings scheduled for today</div>`;
    return;
  }
  
  const parsedMeetings = todayMeetings.map(ev => {
    const { timeStr, locationStr } = parseMeetingTimeAndLocation(ev);
    const badgeInfo = getCountdownBadge(timeStr);
    
    const startPart = timeStr.split('-')[0].trim();
    const timeMatch = startPart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    let sortMinutes = 0;
    if (timeMatch) {
      let hr = parseInt(timeMatch[1]);
      const min = parseInt(timeMatch[2]);
      const ampm = timeMatch[3].toUpperCase();
      if (ampm === 'PM' && hr < 12) hr += 12;
      if (ampm === 'AM' && hr === 12) hr = 0;
      sortMinutes = hr * 60 + min;
    }
    
    return { ev, timeStr, locationStr, badgeInfo, sortMinutes };
  });
  
  parsedMeetings.sort((a, b) => a.sortMinutes - b.sortMinutes);
  
  const html = parsedMeetings.map(m => {
    return `
      <div class="schedule-item">
        <div class="schedule-info">
          <div class="schedule-title">${escapeHTML(m.ev.title)}</div>
          <div class="schedule-meta">
            <span><i class="fa-solid fa-clock"></i> ${m.timeStr}</span>
            <span><i class="fa-solid fa-location-dot"></i> ${escapeHTML(m.locationStr)}</span>
          </div>
        </div>
        <span class="countdown-badge ${m.badgeInfo.class}">${m.badgeInfo.text}</span>
      </div>
    `;
  }).join('');
  
  scheduleListEl.innerHTML = html;
};

window.toggleTaskCheckbox = async function(taskId) {
  const taskEl = document.querySelector(`.widget-task-item[data-task-id="${taskId}"]`);
  if (!taskEl || taskEl.classList.contains('completed')) return;
  
  taskEl.classList.add('completed');
  
  const statValEl = document.querySelector('.stat-card .si-amber + .stat-info .stat-val');
  if (statValEl) {
    let currentCount = parseInt(statValEl.textContent) || 0;
    if (currentCount > 0) {
      statValEl.textContent = currentCount - 1;
    }
  }
  
  const tasksCountBadge = document.getElementById('tasks-count-badge');
  if (tasksCountBadge) {
    let currentCount = parseInt(tasksCountBadge.textContent) || 0;
    if (currentCount > 0) {
      tasksCountBadge.textContent = `${currentCount - 1} pending`;
    }
  }
  
  try {
    await API.updateTask(taskId, { status: 'completed', progress: 100, notes: 'Completed from Dashboard Checklist' });
    toast('Task completed!', 'success');
    
    setTimeout(async () => {
      await loadDashboardWidgets();
      await loadApprovedLeavesAndRenderCalendar();
    }, 1000);
  } catch (e) {
    toast(e.message, 'error');
    taskEl.classList.remove('completed');
    loadDashboardWidgets();
  }
};

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

// ── Geolocation and Site Visits ──
function getGPSLocation() {
  return new Promise((resolve, reject) => {
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
window.currentCalendarDate = new Date();
window.leaveAttachment = { name: null, data: null };

async function renderLeaves(el) {
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Leave Management</h2>
        <p>Apply and track your leave requests</p>
      </div>
      <button class="btn btn-primary" onclick="showLeaveForm()"><i class="fa-solid fa-plus"></i> Apply Leave</button>
    </div>
    
    <div class="section-card">
      <div class="section-title"><i class="fa-solid fa-list"></i>My Leave Requests</div>
      <div class="tbl-wrap" id="leave-table">Loading…</div>
    </div>
  `;

  await loadLeaves();
}

async function loadLeaves() {
  try {
    const d = await API.getLeaves();
    const cards = d.leaves.map(l => {
      const attachInfo = l.attachment_name 
        ? `<div class="data-card-row">
            <span class="data-card-label">Attachment</span>
            <span class="data-card-value" style="color:var(--primary); font-weight:500;"><i class="fa-solid fa-paperclip"></i> ${l.attachment_name}</span>
           </div>`
        : '';
      return `
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
          ${attachInfo}
          <div class="data-card-row">
            <span class="data-card-label">Applied On</span>
            <span class="data-card-value">${fmtDate(l.applied_on)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
    document.getElementById('leave-table').innerHTML = cards
      ? `<div class="card-list">${cards}</div>`
      : '<div class="empty-state" style="padding:24px"><i class="fa-solid fa-umbrella-beach"></i><p>No leave requests yet</p></div>';
  } catch (e) { toast(e.message, 'error'); }
}

function showLeaveForm() {
  window.leaveAttachment = { name: null, data: null };
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
    <div class="form-row" style="margin-top:8px;">
      <div class="form-group" style="flex: 1 1 100%;">
        <label>Attachment <span class="text-muted" style="font-weight:400;font-size:11px">(Optional - Image or PDF sick note)</span></label>
        <div class="file-upload-wrapper" style="border: 2px dashed var(--border); padding: 16px; border-radius: 8px; text-align: center; background: rgba(0,0,0,0.01); cursor: pointer; position: relative; transition: border-color var(--transition);">
          <input type="file" id="lv-file" accept="image/*,.pdf,.doc,.docx" onchange="handleLeaveFileChange(this)" style="position: absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;" />
          <div id="lv-file-label" style="font-size: 12.5px; color: var(--text2);">
            <i class="fa-solid fa-cloud-arrow-up" style="font-size:24px; color:var(--primary); margin-bottom:8px; display:block;"></i>
            Click to upload file (Max 2MB)
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitLeave()">Submit Request</button></div>`);
}

window.handleLeaveFileChange = function(input) {
  const file = input.files[0];
  if (!file) {
    window.leaveAttachment = { name: null, data: null };
    document.getElementById('lv-file-label').innerHTML = `<i class="fa-solid fa-cloud-arrow-up" style="font-size:24px; color:var(--primary); margin-bottom:8px; display:block;"></i>Click to upload file (Max 2MB)`;
    return;
  }
  
  if (file.size > 2 * 1024 * 1024) {
    toast('File is too large. Max size is 2MB.', 'warning');
    input.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    window.leaveAttachment = {
      name: file.name,
      data: e.target.result
    };
    document.getElementById('lv-file-label').innerHTML = `<i class="fa-solid fa-file-circle-check" style="font-size:24px; color:var(--success); margin-bottom:8px; display:block;"></i><strong>${file.name}</strong> (${(file.size/1024).toFixed(1)} KB)`;
    toast('File ready for upload', 'success');
  };
  reader.onerror = function() {
    toast('Failed to read file', 'error');
  };
  reader.readAsDataURL(file);
};

async function submitLeave() {
  const body = { 
    leave_type: document.getElementById('lv-type').value, 
    from_date: document.getElementById('lv-from').value, 
    to_date: document.getElementById('lv-to').value, 
    reason: document.getElementById('lv-reason').value 
  };
  if (!body.from_date || !body.to_date || !body.reason) { toast('Please fill all fields', 'warning'); return; }
  
  if (window.leaveAttachment && window.leaveAttachment.data) {
    body.attachment_name = window.leaveAttachment.name;
    body.attachment_data = window.leaveAttachment.data;
  }

  try { 
    await API.applyLeave(body); 
    closeModal(); 
    toast('Leave applied!', 'success'); 
    await loadLeaves(); 
    if (document.getElementById('calendar-grid-container')) {
      await loadApprovedLeavesAndRenderCalendar();
    }
  }
  catch (e) { toast(e.message, 'error'); }
}

window.currentCalendarFilter = 'all';

window.setCalendarFilter = function(filterVal) {
  window.currentCalendarFilter = filterVal;
  document.querySelectorAll('.calendar-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `filter-${filterVal}`);
  });
  renderCalendarGrid();
};

window.changeCalendarMonth = function(offset) {
  if (!window.currentCalendarDate) {
    window.currentCalendarDate = new Date();
  }
  window.currentCalendarDate.setMonth(window.currentCalendarDate.getMonth() + offset);
  renderCalendarGrid();
};

window.goToTodayMonth = function() {
  window.currentCalendarDate = new Date();
  renderCalendarGrid();
};

window.cachedCalendarEvents = [];

async function loadApprovedLeavesAndRenderCalendar() {
  try {
    const res = await API.getCalendarEvents();
    window.cachedCalendarEvents = res.events || [];
    renderCalendarGrid();
  } catch (e) {
    console.error("Failed to load calendar events:", e);
    const container = document.getElementById('calendar-grid-container');
    if (container) {
      container.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text3)">Error loading calendar: ${e.message}</div>`;
    }
  }
}

function updateCalendarSummaryIndicators(events, year, month) {
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
  
  let leaveCount = 0;
  let holidayCount = 0;
  let meetingCount = 0;
  let deadlineCount = 0;
  
  events.forEach(ev => {
    const from = new Date(ev.start);
    const to = new Date(ev.end);
    from.setHours(0,0,0,0);
    to.setHours(0,0,0,0);
    
    const overlaps = (from <= endOfMonth && to >= startOfMonth);
    if (overlaps) {
      if (ev.type === 'leave') leaveCount++;
      else if (ev.type === 'holiday') holidayCount++;
      else if (ev.type === 'meeting') meetingCount++;
      else if (ev.type === 'deadline') deadlineCount++;
    }
  });
  
  const container = document.getElementById('calendar-summary-indicators');
  if (container) {
    container.innerHTML = `
      <div class="summary-pill leave" title="${leaveCount} Leave events this month">
        <span class="pill-dot dot-leave"></span>
        <span class="pill-label">Leave</span>
        <span class="pill-count">${leaveCount}</span>
      </div>
      <div class="summary-pill holiday" title="${holidayCount} Holiday events this month">
        <span class="pill-dot dot-holiday"></span>
        <span class="pill-label">Holiday</span>
        <span class="pill-count">${holidayCount}</span>
      </div>
      <div class="summary-pill meeting" title="${meetingCount} Meeting events this month">
        <span class="pill-dot dot-meeting"></span>
        <span class="pill-label">Meeting</span>
        <span class="pill-count">${meetingCount}</span>
      </div>
      <div class="summary-pill deadline" title="${deadlineCount} Deadline events this month">
        <span class="pill-dot dot-deadline"></span>
        <span class="pill-label">Deadline</span>
        <span class="pill-count">${deadlineCount}</span>
      </div>
    `;
  }
}

function renderCalendarGrid() {
  const container = document.getElementById('calendar-grid-container');
  const monthTitle = document.getElementById('cal-month-title');
  if (!container || !monthTitle) return;

  if (!window.currentCalendarDate) {
    window.currentCalendarDate = new Date();
  }

  const year = window.currentCalendarDate.getFullYear();
  const month = window.currentCalendarDate.getMonth();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  monthTitle.innerText = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  let html = `<div class="calendar-grid">`;

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  daysOfWeek.forEach(day => {
    html += `<div class="calendar-day-header">${day}</div>`;
  });

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="calendar-cell empty"></div>`;
  }

  const events = window.cachedCalendarEvents || [];
  
  updateCalendarSummaryIndicators(events, year, month);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  for (let day = 1; day <= totalDays; day++) {
    const isToday = isCurrentMonth && today.getDate() === day;
    const cellDate = new Date(year, month, day);
    const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const allOverlapping = events.filter(ev => {
      const from = new Date(ev.start);
      const to = new Date(ev.end);
      from.setHours(0,0,0,0);
      to.setHours(0,0,0,0);
      cellDate.setHours(0,0,0,0);
      return cellDate >= from && cellDate <= to;
    });

    const overlappingToRender = allOverlapping.filter(ev => {
      if (window.currentCalendarFilter === 'all') return true;
      return ev.type === window.currentCalendarFilter;
    });

    let cellClass = 'calendar-cell';
    if (isToday) cellClass += ' today';

    html += `<div class="${cellClass}" onclick="handleCellClick('${cellDateStr}')">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px; width:100%;">
        <span class="calendar-date-number">${day}</span>
        <div style="display:flex; gap:2.5px; align-items:center;">`;
        
    const typesPresent = new Set(allOverlapping.map(ev => ev.type));
    if (typesPresent.has('leave')) html += `<span class="dot dot-leave" style="width:5px; height:5px; border-radius:50%; display:inline-block; background-color:#dc2626;"></span>`;
    if (typesPresent.has('holiday')) html += `<span class="dot dot-holiday" style="width:5px; height:5px; border-radius:50%; display:inline-block; background-color:#9ca3af;"></span>`;
    if (typesPresent.has('meeting')) html += `<span class="dot dot-meeting" style="width:5px; height:5px; border-radius:50%; display:inline-block; background-color:#9333ea;"></span>`;
    if (typesPresent.has('deadline')) html += `<span class="dot dot-deadline" style="width:5px; height:5px; border-radius:50%; display:inline-block; background-color:#ea580c;"></span>`;
        
    html += `</div>
      </div>
      <div class="calendar-events-container">`;

    overlappingToRender.forEach(ev => {
      let badgeClass = 'calendar-badge';
      let displayTitle = ev.title;
      
      if (ev.type === 'leave') {
        const type = (ev.leave_type || 'casual').toLowerCase();
        badgeClass += ` badge-${type}`;
        const parts = ev.employee_name.split(' ');
        const shortName = parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '');
        displayTitle = `${shortName} (OOO)`;
      } 
      else if (ev.type === 'deadline') {
        const priority = (ev.priority || 'medium').toLowerCase();
        const isCompleted = ev.status === 'completed';
        if (isCompleted) {
          badgeClass += ' badge-task-completed';
        } else {
          badgeClass += ` badge-task-${priority}`;
        }
      } 
      else if (ev.type === 'holiday') {
        badgeClass += ' badge-holiday';
        displayTitle = `🎉 ${ev.title}`;
      }
      else if (ev.type === 'meeting') {
        badgeClass += ' badge-meeting';
        displayTitle = `🤝 ${ev.title}`;
      }
      
      html += `<div class="${badgeClass}">${displayTitle}</div>`;
    });

    html += `</div></div>`;
  }

  const totalCells = firstDay + totalDays;
  const trailingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailingCells; i++) {
    html += `<div class="calendar-cell empty"></div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

window.handleCellClick = function(dateStr) {
  const cellDate = new Date(dateStr);
  const overlapping = (window.cachedCalendarEvents || []).filter(ev => {
    const from = new Date(ev.start);
    const to = new Date(ev.end);
    from.setHours(0,0,0,0);
    to.setHours(0,0,0,0);
    cellDate.setHours(0,0,0,0);
    return cellDate >= from && cellDate <= to;
  });
  
  window.showEventDetailsModal(dateStr, overlapping);
};

window.showEventDetailsModal = function(dateStr, events) {
  const formattedDate = new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  
  let eventsHtml = '';
  if (events.length === 0) {
    eventsHtml = '<div class="empty-state" style="padding:16px;"><i class="fa-solid fa-calendar-day"></i><p>No events scheduled for this day</p></div>';
  } else {
    eventsHtml = `<div class="event-details-list">`;
    events.forEach(ev => {
      let deleteBtn = '';
      if (ev.id && ev.id.startsWith('custom-')) {
        const idVal = ev.id.replace('custom-', '');
        deleteBtn = `<button class="btn btn-sm btn-outline" style="background:rgba(239,68,68,0.1); color:#ef4444; border-color:rgba(239,68,68,0.2); padding: 2px 6px; font-size:10px; font-weight:600;" onclick="deleteCustomEvent(${idVal})"><i class="fa-solid fa-trash"></i> Delete</button>`;
      }

      if (ev.type === 'leave') {
        const typeLabel = ev.leave_type ? ev.leave_type.toUpperCase() + ' LEAVE' : 'LEAVE';
        eventsHtml += `
          <div class="event-detail-item">
            <div class="event-detail-header">
              <span class="event-detail-title"><i class="fa-solid fa-user-clock" style="color:#d97706"></i> ${ev.employee_name} (OOO)</span>
              <div style="display:flex; gap:6px; align-items:center;">
                <span class="badge badge-${(ev.leave_type || 'casual').toLowerCase()}">${typeLabel}</span>
                ${deleteBtn}
              </div>
            </div>
            <div class="event-detail-body">
              <div class="event-detail-row">
                <span class="event-detail-label">Duration</span>
                <span class="event-detail-value">${fmtDate(ev.start)} to ${fmtDate(ev.end)}</span>
              </div>
              <div class="event-detail-row">
                <span class="event-detail-label">Reason</span>
                <span class="event-detail-value">${ev.reason || 'No reason provided'}</span>
              </div>
            </div>
          </div>
        `;
      } else if (ev.type === 'deadline') {
        const isCompleted = ev.status === 'completed';
        const priorityBadge = ev.priority ? badge(ev.priority) : '';
        const statusBadge = ev.status ? badge(ev.status) : '';
        eventsHtml += `
          <div class="event-detail-item">
            <div class="event-detail-header">
              <span class="event-detail-title" style="${isCompleted ? 'text-decoration: line-through; opacity: 0.7;' : ''}"><i class="fa-solid fa-list-check" style="color:#2563eb"></i> ${ev.title}</span>
              <div style="display:flex; gap:6px; align-items:center;">
                ${priorityBadge}
                ${statusBadge}
                ${deleteBtn}
              </div>
            </div>
            <div class="event-detail-body">
              ${ev.description ? `
              <div style="margin-bottom: 6px; font-size:11.5px; color:var(--text2); text-align: left;">
                ${ev.description}
              </div>` : ''}
              <div class="event-detail-row">
                <span class="event-detail-label">Progress</span>
                <span class="event-detail-value" style="display:flex; align-items:center; gap:8px; width:50%; justify-content:flex-end">
                  <div class="progress-bar" style="flex:1; margin-top:0; height:6px;"><div class="progress-fill" style="width:${ev.progress || 0}%"></div></div>
                  <span>${ev.progress || 0}%</span>
                </span>
              </div>
              <div class="event-detail-row">
                <span class="event-detail-label">Due Date</span>
                <span class="event-detail-value">${fmtDate(ev.end)}</span>
              </div>
            </div>
          </div>
        `;
      } else if (ev.type === 'meeting') {
        eventsHtml += `
          <div class="event-detail-item">
            <div class="event-detail-header">
              <span class="event-detail-title"><i class="fa-solid fa-handshake" style="color:#9333ea"></i> ${ev.title}</span>
              <div style="display:flex; gap:6px; align-items:center;">
                <span class="badge badge-meeting">MEETING</span>
                ${deleteBtn}
              </div>
            </div>
            <div class="event-detail-body">
              <div class="event-detail-row">
                <span class="event-detail-label">Time</span>
                <span class="event-detail-value">${fmtDate(ev.start)} to ${fmtDate(ev.end)}</span>
              </div>
              ${ev.description ? `
              <div style="margin-top: 4px; font-size:11.5px; color:var(--text2); text-align: left;">
                ${ev.description}
              </div>` : ''}
            </div>
          </div>
        `;
      } else if (ev.type === 'holiday') {
        eventsHtml += `
          <div class="event-detail-item" style="border-left: 3px solid #9ca3af;">
            <div class="event-detail-header">
              <span class="event-detail-title"><i class="fa-solid fa-gifts" style="color:#0f766e"></i> 🎉 ${ev.title}</span>
              <div style="display:flex; gap:6px; align-items:center;">
                <span class="badge" style="background:#f3f4f6; color:#374151">HOLIDAY</span>
                ${deleteBtn}
              </div>
            </div>
            <div class="event-detail-body">
              <div style="font-weight:600; font-size:11px; color:var(--text2); margin-top:2px; text-align: left;">
                ${ev.description || 'Public holiday / Out-of-office day'}
              </div>
            </div>
          </div>
        `;
      }
    });
    eventsHtml += `</div>`;
  }

  modal(`
    <div class="modal-header">
      <h3><i class="fa-solid fa-calendar-day" style="color:var(--primary)"></i> Schedule for ${formattedDate}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="margin-top: 12px; margin-bottom: 16px;">
      ${eventsHtml}
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal()">Close</button>
    </div>
  `);
};

window.showAddEventForm = function() {
  modal(`
    <div class="modal-header">
      <h3><i class="fa-solid fa-plus-circle" style="color:var(--primary)"></i> Add Calendar Event</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="form-group" style="text-align: left;"><label>Event Title</label><input type="text" class="form-control" id="evt-title" placeholder="Event name or title" /></div>
    <div class="form-row">
      <div class="form-group" style="text-align: left;"><label>Event Type</label><select class="form-control" id="evt-type"><option value="meeting">Meeting</option><option value="deadline">Deadline</option><option value="leave">Leave</option><option value="holiday">Holiday</option></select></div>
      <div class="form-group" style="text-align: left;"><label>Start Date</label><input type="date" class="form-control" id="evt-start" value="${new Date().toISOString().split('T')[0]}" /></div>
    </div>
    <div class="form-row">
      <div class="form-group" style="text-align: left;"><label>End Date</label><input type="date" class="form-control" id="evt-end" value="${new Date().toISOString().split('T')[0]}" /></div>
      <div class="form-group" style="text-align: left;"><label>Description</label><input type="text" class="form-control" id="evt-desc" placeholder="Details (optional)" /></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitCustomEvent()">Create Event</button>
    </div>
  `);
};

window.submitCustomEvent = async function() {
  const title = document.getElementById('evt-title').value.trim();
  const type = document.getElementById('evt-type').value;
  const start = document.getElementById('evt-start').value;
  const end = document.getElementById('evt-end').value;
  const description = document.getElementById('evt-desc').value.trim();

  if (!title || !start || !end) {
    toast('Please fill in title and dates', 'warning');
    return;
  }

  try {
    await API.createCustomEvent({ title, type, start, end, description });
    closeModal();
    toast('Event added to calendar!', 'success');
    await loadApprovedLeavesAndRenderCalendar();
  } catch (e) {
    toast(e.message, 'error');
  }
};

window.deleteCustomEvent = async function(id) {
  if (!confirm('Are you sure you want to delete this event?')) return;
  try {
    await API.deleteCustomEvent(id);
    closeModal();
    toast('Event deleted successfully!', 'success');
    await loadApprovedLeavesAndRenderCalendar();
  } catch (e) {
    toast(e.message, 'error');
  }
};

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

// ── Team Chat Page ──
async function renderTeamChat(el) {
  if (window.teamChatPollInterval) {
    clearInterval(window.teamChatPollInterval);
    window.teamChatPollInterval = null;
  }
  
  if (window.currentChatRecipientId === undefined) {
    window.currentChatRecipientId = null; 
  }
  
  el.innerHTML = `
    <div class="team-chat-layout">
      <!-- Left Sidebar: Users & Channel List -->
      <div class="chat-sidebar-left" id="chat-sidebar-left">
        <div class="chat-search-box">
          <input type="text" id="chat-user-search" class="chat-search-input" placeholder="Search teammates..." oninput="filterChatUsers()" />
        </div>
        <div class="chat-user-list" id="chat-users-list">
          <div class="text-center text-muted" style="padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>
        </div>
      </div>
      
      <!-- Right Main Panel: Chat Window -->
      <div class="chat-main-panel" id="chat-main-panel">
        <div class="text-center text-muted" style="margin: auto; padding: 24px;">
          <i class="fa-solid fa-comments" style="font-size: 48px; color: var(--primary-glow); margin-bottom: 16px; display: block;"></i>
          <h3>Select a conversation</h3>
          <p style="font-size:12px; max-width:240px; margin: 8px auto 0;">Choose a teammate or the General Channel from the list to start messaging.</p>
        </div>
      </div>
    </div>
  `;
  
  await loadTeamChatSidebar();
  
  if (window.currentChatRecipientId !== undefined) {
    await selectChatUser(window.currentChatRecipientId);
  }
  
  window.teamChatPollInterval = setInterval(async () => {
    const activePage = document.getElementById('page-team-chat');
    if (!activePage || !activePage.classList.contains('active')) {
      clearInterval(window.teamChatPollInterval);
      window.teamChatPollInterval = null;
      return;
    }
    
    await loadTeamChatSidebar(true);
    
    if (window.currentChatRecipientId !== undefined) {
      await refreshChatMessages();
    }
  }, 5000);
}

window.chatUsersData = [];

async function loadTeamChatSidebar(isSilent = false) {
  const listEl = document.getElementById('chat-users-list');
  if (!listEl) return;
  
  try {
    const res = await API.getTeamChatUsers();
    window.chatUsersData = res.users || [];
    renderSidebarUsersList();
  } catch (e) {
    if (!isSilent) {
      listEl.innerHTML = `<div class="text-center text-muted" style="padding: 20px;">Error: ${e.message}</div>`;
    }
  }
}

function renderSidebarUsersList() {
  const listEl = document.getElementById('chat-users-list');
  if (!listEl) return;
  
  const searchVal = document.getElementById('chat-user-search')?.value.toLowerCase() || '';
  
  let html = `
    <div class="chat-user-item ${window.currentChatRecipientId === null ? 'active' : ''}" onclick="selectChatUser(null)">
      <div class="chat-user-avatar" style="background: var(--primary-glow); color: var(--primary);">
        <i class="fa-solid fa-users"></i>
      </div>
      <div class="chat-user-info">
        <span class="chat-user-name">General Channel</span>
        <span class="chat-user-status">Public Announcements</span>
      </div>
    </div>
  `;
  
  const filteredUsers = window.chatUsersData.filter(u => {
    return u.name.toLowerCase().includes(searchVal) || 
           u.department.toLowerCase().includes(searchVal) || 
           u.designation.toLowerCase().includes(searchVal);
  });
  
  filteredUsers.forEach(u => {
    const isSelected = window.currentChatRecipientId === u.id;
    const initial = u.name ? u.name[0] : 'U';
    
    let avatarHtml = `<div class="chat-user-avatar">`;
    if (u.photo_data) {
      avatarHtml += `<img src="${u.photo_data}" />`;
    } else {
      avatarHtml += `<span>${initial}</span>`;
    }
    avatarHtml += `<span class="status-dot-indicator ${u.status || 'offline'}"></span></div>`;
    
    html += `
      <div class="chat-user-item ${isSelected ? 'active' : ''}" onclick="selectChatUser(${u.id})">
        ${avatarHtml}
        <div class="chat-user-info">
          <span class="chat-user-name">${u.name}</span>
          <span class="chat-user-status">${u.status_text || 'Offline'}</span>
        </div>
      </div>
    `;
  });
  
  listEl.innerHTML = html;
}

window.filterChatUsers = function() {
  renderSidebarUsersList();
};

window.currentChatRecipientId = null;
window.chatTempAttachment = null;

window.selectChatUser = async function(recipientId) {
  window.currentChatRecipientId = recipientId;
  window.chatTempAttachment = null;
  
  renderSidebarUsersList();
  
  const mainPanel = document.getElementById('chat-main-panel');
  if (!mainPanel) return;
  
  let chatTitle = 'General Channel';
  let chatStatus = 'General announcements & discussions';
  let avatarHtml = `<div class="chat-user-avatar" style="background: var(--primary-glow); color: var(--primary);"><i class="fa-solid fa-users"></i></div>`;
  
  if (recipientId !== null) {
    const user = window.chatUsersData.find(u => u.id === recipientId);
    if (user) {
      chatTitle = user.name;
      chatStatus = `${user.designation} • ${user.department}`;
      const initial = user.name ? user.name[0] : 'U';
      avatarHtml = `<div class="chat-user-avatar">`;
      if (user.photo_data) {
        avatarHtml += `<img src="${user.photo_data}" />`;
      } else {
        avatarHtml += `<span>${initial}</span>`;
      }
      avatarHtml += `<span class="status-dot-indicator ${user.status || 'offline'}"></span></div>`;
    }
  }
  
  mainPanel.innerHTML = `
    <div class="chat-panel-header">
      <div class="chat-panel-user-title">
        ${avatarHtml}
        <div>
          <div class="chat-panel-user-name">${chatTitle}</div>
          <div class="chat-panel-user-status">${chatStatus}</div>
        </div>
      </div>
    </div>
    
    <div class="chat-messages-container" id="chat-messages-container">
      <div class="text-center text-muted" style="margin: auto;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading messages...</div>
    </div>
    
    <div class="chat-attachment-preview-banner hidden" id="chat-attachment-preview"></div>
    
    <div class="chat-input-toolbar">
      <button class="btn-chat-action" id="btn-chat-attach" onclick="triggerChatFileSelect()" title="Attach file"><i class="fa-solid fa-paperclip"></i></button>
      <input type="file" id="chat-file-input" style="display:none;" onchange="handleChatFileChange(this)" />
      
      <textarea class="chat-text-area" id="chat-text-input" placeholder="Type your message here..." onkeydown="handleChatInputKeyDown(event)"></textarea>
      
      <button class="btn-chat-action btn-chat-send" id="btn-chat-send" onclick="sendTeamMessage()" title="Send"><i class="fa-solid fa-paper-plane"></i></button>
    </div>
  `;
  
  await refreshChatMessages(true);
};

window.lastMessageCount = 0;

window.refreshChatMessages = async function(forceScroll = false) {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;
  
  try {
    const res = await API.getTeamChatMessages(window.currentChatRecipientId);
    const messages = res.messages || [];
    
    let html = '';
    if (messages.length === 0) {
      html = `
        <div class="text-center text-muted" style="margin: auto; font-size: 12.5px;">
          <i class="fa-regular fa-comment-dots" style="font-size: 32px; display: block; margin-bottom: 8px; opacity: 0.6;"></i>
          No messages yet. Say hello!
        </div>
      `;
    } else {
      messages.forEach(m => {
        const isOutgoing = m.sender_id === API.user.id;
        const bubbleClass = isOutgoing ? 'outgoing' : 'incoming';
        
        let attachmentHtml = '';
        if (m.attachment_name && m.attachment_data) {
          attachmentHtml = `
            <div class="chat-attachment-block">
              <a href="${m.attachment_data}" download="${m.attachment_name}" class="chat-attachment-link" title="Download attachment">
                <i class="fa-solid fa-file-arrow-down"></i> ${m.attachment_name}
              </a>
            </div>
          `;
        }
        
        const timeFormatted = fmtTime(m.timestamp);
        
        let senderLabel = '';
        if (!isOutgoing && window.currentChatRecipientId === null) {
          senderLabel = `<span style="font-size:9.5px; font-weight:600; color:var(--text2); margin-bottom:2.5px; display:block; padding-left:4px;">${m.sender_name}</span>`;
        }
        
        html += `
          <div class="chat-msg-row ${bubbleClass}">
            <div class="chat-bubble-container">
              ${senderLabel}
              <div class="chat-message-bubble">
                <div>${escapeHTML(m.message)}</div>
                ${attachmentHtml}
              </div>
              <div class="chat-message-time">${timeFormatted}</div>
            </div>
          </div>
        `;
      });
    }
    
    const hadNewMessages = messages.length !== window.lastMessageCount;
    window.lastMessageCount = messages.length;
    
    container.innerHTML = html;
    
    if (forceScroll || hadNewMessages) {
      container.scrollTop = container.scrollHeight;
    }
  } catch (e) {
    console.error("Failed to load chat messages", e);
    if (forceScroll) {
      container.innerHTML = `<div class="text-center text-muted" style="margin: auto;">Failed to load messages: ${e.message}</div>`;
    }
  }
};

window.triggerChatFileSelect = function() {
  const fileInput = document.getElementById('chat-file-input');
  if (fileInput) fileInput.click();
};

window.handleChatFileChange = function(input) {
  const file = input.files[0];
  if (!file) return;
  
  if (file.size > 2 * 1024 * 1024) {
    toast('File is too large. Max size is 2MB.', 'warning');
    input.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    window.chatTempAttachment = {
      name: file.name,
      data: e.target.result
    };
    
    const previewEl = document.getElementById('chat-attachment-preview');
    if (previewEl) {
      previewEl.innerHTML = `
        <span style="display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-file"></i> Ready to send: <strong>${file.name}</strong> (${(file.size/1024).toFixed(1)} KB)</span>
        <button class="btn" style="padding:2px; background:transparent; border:none; margin:0;" onclick="clearChatAttachment()" title="Cancel attachment"><i class="fa-solid fa-circle-xmark"></i></button>
      `;
      previewEl.classList.remove('hidden');
    }
    toast('Attachment added', 'success');
  };
  reader.onerror = function() {
    toast('Failed to read file', 'error');
  };
  reader.readAsDataURL(file);
};

window.clearChatAttachment = function() {
  window.chatTempAttachment = null;
  const fileInput = document.getElementById('chat-file-input');
  if (fileInput) fileInput.value = '';
  const previewEl = document.getElementById('chat-attachment-preview');
  if (previewEl) {
    previewEl.innerHTML = '';
    previewEl.classList.add('hidden');
  }
};

window.sendTeamMessage = async function() {
  const inputEl = document.getElementById('chat-text-input');
  if (!inputEl) return;
  
  const text = inputEl.value.trim();
  const attachment = window.chatTempAttachment;
  
  if (!text && !attachment) {
    toast('Please enter a message or select a file.', 'warning');
    return;
  }
  
  const body = {
    message: text,
    receiver_id: window.currentChatRecipientId
  };
  
  if (attachment) {
    body.attachment_name = attachment.name;
    body.attachment_data = attachment.data;
  }
  
  const sendBtn = document.getElementById('btn-chat-send');
  if (sendBtn) sendBtn.disabled = true;
  inputEl.disabled = true;
  
  try {
    await API.sendTeamChatMessage(body);
    inputEl.value = '';
    window.clearChatAttachment();
    await refreshChatMessages(true);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }
};

window.handleChatInputKeyDown = function(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendTeamMessage();
  }
};

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

window.scheduleWithAI = function() {
  navigate('chat');
  setTimeout(() => {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.value = "Schedule a meeting";
      chatInput.focus();
      if (typeof sendChatMessage === 'function') {
        sendChatMessage();
      }
    }
  }, 200);
};
