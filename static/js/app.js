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
  
  // Populate expandable profile fields
  document.getElementById('profile-name').value = u.name || '';
  document.getElementById('profile-phone').value = u.phone || '';
  document.getElementById('profile-desig-text').textContent = u.designation || 'Employee';
  document.getElementById('profile-dept-text').textContent = u.department || 'General';
  document.getElementById('profile-manager-text').textContent = u.manager_name || 'None';
  
  // Update user photo views
  window.updateUserAvatars(u.photo_data);

  if (u.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  }
  navigate('dashboard');
  loadNotifications();
  if (!notifInterval) notifInterval = setInterval(loadNotifications, 30000);
}

// ── Profile Expand Handlers ──
window.updateUserAvatars = function(photoData) {
  const sbAvatar = document.getElementById('sidebar-avatar');
  const tbAvatar = document.getElementById('topbar-avatar');
  const pPlaceholder = document.getElementById('profile-photo-placeholder');
  const pImg = document.getElementById('profile-photo-img');
  
  const initial = API.user ? API.user.name[0] : 'U';

  if (photoData) {
    const imgHtml = `<img src="${photoData}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" />`;
    if (sbAvatar) sbAvatar.innerHTML = imgHtml;
    if (tbAvatar) tbAvatar.innerHTML = imgHtml;
    if (pImg) {
      pImg.src = photoData;
      pImg.classList.remove('hidden');
    }
    if (pPlaceholder) pPlaceholder.classList.add('hidden');
  } else {
    if (sbAvatar) {
      sbAvatar.innerHTML = '';
      sbAvatar.textContent = initial;
    }
    if (tbAvatar) {
      tbAvatar.innerHTML = '';
      tbAvatar.textContent = initial;
    }
    if (pImg) {
      pImg.src = '';
      pImg.classList.add('hidden');
    }
    if (pPlaceholder) {
      pPlaceholder.textContent = initial;
      pPlaceholder.classList.remove('hidden');
    }
  }
};

window.toggleProfileExpand = function() {
  const card = document.getElementById('profile-expand-card');
  if (card) {
    card.classList.toggle('active');
  }
};

window.triggerPhotoUpload = function() {
  const fileInput = document.getElementById('profile-photo-input');
  if (fileInput) fileInput.click();
};

window.handleProfilePhotoUpload = function(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    toast('File is too large. Max size is 2MB.', 'warning');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const photoData = e.target.result;
    window.updateUserAvatars(photoData);
    window.tempPhotoData = photoData;
    toast('Photo selected. Click "Save Changes" to apply.', 'info');
  };
  reader.onerror = function() {
    toast('Failed to read photo file', 'error');
  };
  reader.readAsDataURL(file);
};

window.saveProfileChanges = async function() {
  const name = document.getElementById('profile-name').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  
  if (!name) {
    toast('Name cannot be empty', 'warning');
    return;
  }

  const body = { name, phone };
  if (window.tempPhotoData) {
    body.photo_data = window.tempPhotoData;
  }

  try {
    const res = await API.updateProfile(body);
    toast('Profile updated successfully!', 'success');
    API.user = res.user;
    
    document.getElementById('sidebar-name').textContent = res.user.name;
    document.getElementById('profile-name').value = res.user.name;
    document.getElementById('profile-phone').value = res.user.phone || '';
    
    window.updateUserAvatars(res.user.photo_data);
    window.tempPhotoData = null;
    
    setTimeout(window.toggleProfileExpand, 1000);
  } catch (e) {
    toast(e.message, 'error');
  }
};

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
  const card = document.getElementById('profile-expand-card');
  if (card) card.classList.remove('active');
  showLogin();
}

const PAGE_TITLES = {
  dashboard: 'Dashboard', chat: 'AI Assistant', 'team-chat': 'Team Chat',
  leaves: 'Leave Management', tasks: 'My Tasks', tickets: 'Helpdesk',
  'admin-dashboard': 'Analytics', employees: 'Employees',
  'admin-leaves': 'Leave Requests', 'admin-tickets': 'All Tickets', 'admin-tasks': 'Task Manager',
  'admin-visits': 'Site Visits', 'admin-sites': 'Manage Sites'
};

const PAGE_RENDERERS = {
  dashboard: renderDashboard,
  chat: renderChat,
  'team-chat': renderTeamChat,
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
  if (page !== 'team-chat' && window.teamChatPollInterval) {
    clearInterval(window.teamChatPollInterval);
    window.teamChatPollInterval = null;
  }
  const isAdminPage = page.startsWith('admin-') || page === 'employees';
  if (isAdminPage && API.user?.role !== 'admin') {
    navigate('dashboard');
    return;
  }
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
