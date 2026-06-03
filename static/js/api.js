// ── API helper ──
const API = {
  token: null,
  user: null,

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = 'Bearer ' + this.token;
    return h;
  },

  async req(method, url, body = null) {
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      if (!url.includes('/api/auth/me') && !url.includes('/api/auth/login')) {
        localStorage.removeItem('aria_token');
        API.token = null;
        API.user = null;
        const app = document.getElementById('app');
        const login = document.getElementById('login-page');
        if (app) app.classList.add('hidden');
        if (login) login.classList.remove('hidden');
        throw new Error('Session expired — please log in again.');
      }
      throw new Error(data.error || 'Unauthorized');
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get: (url) => API.req('GET', url),
  post: (url, body) => API.req('POST', url, body),
  put: (url, body) => API.req('PUT', url, body),
  del: (url) => API.req('DELETE', url),

  // Auth
  login: (email, pw) => API.post('/api/auth/login', { email, password: pw }),
  register: (name, email, pw, dept, desig) => API.post('/api/auth/register', { name, email, password: pw, department: dept, designation: desig }),
  me: () => API.get('/api/auth/me'),

  // Employee
  empDashboard: () => API.get('/api/employee/dashboard'),
  checkIn: () => API.post('/api/employee/attendance/checkin'),
  checkOut: () => API.post('/api/employee/attendance/checkout'),
  getAttendance: (m, y) => API.get(`/api/employee/attendance?month=${m}&year=${y}`),
  checkInVisit: (client, lat, lng) => API.post('/api/employee/visit/checkin', { client_name: client, latitude: lat, longitude: lng }),
  checkOutVisit: (lat, lng) => API.post('/api/employee/visit/checkout', { latitude: lat, longitude: lng }),
  getVisits: () => API.get('/api/employee/visits'),
  applyLeave: (d) => API.post('/api/employee/leave/apply', d),
  getLeaves: () => API.get('/api/employee/leave'),
  getApprovedLeaves: () => API.get('/api/employee/leaves/approved'),
  getTasks: () => API.get('/api/employee/tasks'),
  updateTask: (id, d) => API.put(`/api/employee/tasks/${id}`, d),
  createTicket: (d) => API.post('/api/employee/ticket', d),
  getTickets: () => API.get('/api/employee/ticket'),
  deleteTicket: (id) => API.del(`/api/employee/ticket/${id}`),
  deleteTask: (id) => API.del(`/api/employee/tasks/${id}`),
  getNotifications: () => API.get('/api/employee/notifications'),
  markRead: (id) => API.put(`/api/employee/notifications/${id}/read`),
  markAllRead: () => API.put('/api/employee/notifications/read-all'),
  getSites: () => API.get('/api/employee/sites'),
  checkInSite: (siteId, lat, lng, acc) => API.post('/api/site/checkin', { site_id: siteId, lat: lat, lng: lng, accuracy: acc }),
  checkOutSite: (siteId, lat, lng, acc) => API.post('/api/site/checkout', { site_id: siteId, lat: lat, lng: lng, accuracy: acc }),

  // Admin
  adminDashboard: () => API.get('/api/admin/dashboard'),
  getEmployees: () => API.get('/api/admin/employees'),
  createEmployee: (d) => API.post('/api/admin/employees', d),
  updateEmployee: (id, d) => API.put(`/api/admin/employees/${id}`, d),
  getAllLeaves: (s) => API.get('/api/admin/leaves' + (s ? `?status=${s}` : '')),
  reviewLeave: (id, d) => API.put(`/api/admin/leaves/${id}/review`, d),
  getAllTickets: (s) => API.get('/api/admin/tickets' + (s ? `?status=${s}` : '')),
  updateTicket: (id, d) => API.put(`/api/admin/tickets/${id}`, d),
  getAllTasks: () => API.get('/api/admin/tasks'),
  createTask: (d) => API.post('/api/admin/tasks', d),
  updateTaskAdmin: (id, d) => API.put(`/api/admin/tasks/${id}`, d),
  getAllVisits: () => API.get('/api/admin/visits'),
  getSitesAdmin: () => API.get('/api/admin/sites'),
  createSiteAdmin: (d) => API.post('/api/admin/sites', d),
  updateSiteAdmin: (id, d) => API.put(`/api/admin/sites/${id}`, d),
  deleteSiteAdmin: (id) => API.del(`/api/admin/sites/${id}`),

  // Chat
  sendMsg: (msg, sid) => API.post('/api/chat/message', { message: msg, session_id: sid }),
  getChatHistory: (sid) => API.get('/api/chat/history' + (sid ? `?session_id=${sid}` : '')),
  getCalendarEvents: () => API.get('/api/employee/calendar/events'),
  getPotentialManagers: () => API.get('/api/employee/managers'),
  updateProfile: (d) => API.put('/api/employee/profile', d),
  createCustomEvent: (d) => API.post('/api/employee/calendar/custom-events', d),
  deleteCustomEvent: (id) => API.del(`/api/employee/calendar/custom-events/${id}`),
  getTeamChatUsers: () => API.get('/api/employee/team-chat/users'),
  getTeamChatMessages: (userId) => API.get('/api/employee/team-chat/messages' + (userId ? `?user_id=${userId}` : '')),
  sendTeamChatMessage: (body) => API.post('/api/employee/team-chat/messages', body),
};
