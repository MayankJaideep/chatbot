// ── App Bootstrap ──
let notifInterval = null;

async function boot() {
  const token = localStorage.getItem('aria_token');
  if (token) {
    API.token = token;
    try {
      const user = await API.me();
      API.user = user;
      showApp();
      return;
    } catch (_) {
      // Token invalid or expired — clear everything
      localStorage.removeItem('aria_token');
      API.token = null;
      API.user = null;
    }
  }
  showLogin();
}

function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  // Stop any background polling
  if (notifInterval) { clearInterval(notifInterval); notifInterval = null; }
}

function showApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const u = API.user;
  document.getElementById('sidebar-name').textContent = u.name;
  document.getElementById('sidebar-role').textContent = u.role;
  document.getElementById('sidebar-avatar').textContent = u.name[0];
  document.getElementById('topbar-avatar').textContent = u.name[0];
  if (u.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }
  navigate('dashboard');
  loadNotifications();
  if (!notifInterval) notifInterval = setInterval(loadNotifications, 30000);
}

// ── Login ──
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-loader').classList.remove('hidden');
  err.classList.add('hidden');
  try {
    const d = await API.login(
      document.getElementById('login-email').value,
      document.getElementById('login-password').value
    );
    API.token = d.token;
    API.user = d.user;
    localStorage.setItem('aria_token', d.token);
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  } finally {
    btn.querySelector('.btn-text').classList.remove('hidden');
    btn.querySelector('.btn-loader').classList.add('hidden');
  }
});

// ── Register ──
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  const err = document.getElementById('login-error');
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-loader').classList.remove('hidden');
  err.classList.add('hidden');
  try {
    const d = await API.register(
      document.getElementById('register-name').value,
      document.getElementById('register-email').value,
      document.getElementById('register-password').value,
      document.getElementById('register-dept').value || 'General',
      document.getElementById('register-desig').value || 'Employee'
    );
    toast(d.message, 'success');
    showLoginForm();
    // Pre-fill login email
    document.getElementById('login-email').value = document.getElementById('register-email').value;
    document.getElementById('login-password').value = '';
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  } finally {
    btn.querySelector('.btn-text').classList.remove('hidden');
    btn.querySelector('.btn-loader').classList.add('hidden');
  }
});

function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
  document.getElementById('to-register').classList.add('hidden');
  document.getElementById('to-login').classList.remove('hidden');
  document.getElementById('login-error').classList.add('hidden');
  document.querySelector('.demo-creds').classList.add('hidden');
}

function showLoginForm() {
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('to-login').classList.add('hidden');
  document.getElementById('to-register').classList.remove('hidden');
  document.getElementById('login-error').classList.add('hidden');
  document.querySelector('.demo-creds').classList.remove('hidden');
}

function fillCreds(email, pw) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = pw;
}

function togglePw() {
  const inp = document.getElementById('login-password');
  const eye = document.getElementById('pw-eye');
  if (inp.type === 'password') { inp.type = 'text'; eye.className = 'fa-solid fa-eye-slash'; }
  else { inp.type = 'password'; eye.className = 'fa-solid fa-eye'; }
}

function logout() {
  localStorage.removeItem('aria_token');
  API.token = null; API.user = null;
  clearInterval(notifInterval);
  showLogin();
}

// ── Navigation ──
const PAGE_TITLES = {
  dashboard: 'Dashboard', chat: 'AI Assistant', attendance: 'Attendance',
  leaves: 'Leave Management', tasks: 'My Tasks', tickets: 'Helpdesk',
  'admin-dashboard': 'Analytics', employees: 'Employees',
  'admin-leaves': 'Leave Requests', 'admin-tickets': 'All Tickets', 'admin-tasks': 'Task Manager',
  'admin-visits': 'Site Visits', 'admin-sites': 'Manage Sites'
};

const PAGE_RENDERERS = {
  dashboard: renderDashboard,
  chat: renderChat,
  attendance: renderAttendance,
  leaves: renderLeaves,
  tasks: renderTasks,
  tickets: renderTickets,
  'admin-dashboard': renderAdminDashboard,
  employees: renderEmployees,
  'admin-leaves': renderAdminLeaves,
  'admin-tickets': renderAdminTickets,
  'admin-tasks': renderAdminTasks,
  'admin-visits': renderAdminVisits,
  'admin-sites': renderAdminSites,
};

function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
    pageEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
  }
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;
  const renderer = PAGE_RENDERERS[page];
  if (renderer && pageEl) renderer(pageEl);
  // Close sidebar on navigation
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.add('hidden');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) {
    sidebar.classList.toggle('open');
    if (overlay) {
      if (sidebar.classList.contains('open')) {
        overlay.classList.remove('hidden');
      } else {
        overlay.classList.add('hidden');
      }
    }
  }
}

// ── Notifications ──
async function loadNotifications() {
  try {
    const d = await API.getNotifications();
    const badge = document.getElementById('notif-badge');
    if (d.unread_count > 0) { badge.textContent = d.unread_count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
    const list = document.getElementById('notif-list');
    if (!list) return;
    list.innerHTML = d.notifications.length
      ? d.notifications.map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id},this)">
          <div class="notif-dot ${n.type}"></div>
          <div><div class="notif-title">${n.title}</div><div class="notif-msg">${n.message}</div><div class="notif-time">${fmtTime(n.created_at)}</div></div>
        </div>`).join('')
      : '<div class="empty-state" style="padding:24px"><i class="fa-solid fa-bell-slash"></i><p>No notifications</p></div>';
  } catch (_) {}
}

async function markRead(id, el) {
  try { await API.markRead(id); el.classList.remove('unread'); await loadNotifications(); } catch (_) {}
}

async function markAllRead() {
  try { await API.markAllRead(); await loadNotifications(); } catch (_) {}
}

function toggleNotifPanel() {
  const p = document.getElementById('notif-panel');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) loadNotifications();
}

document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const btn = document.getElementById('notif-btn');
  if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

// ── Start ──
boot();
