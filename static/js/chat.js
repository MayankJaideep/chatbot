// ── Chat Module ──
let chatSessionId = null;
let isTyping = false;

const QUICK_PROMPTS = [
  "Apply for sick leave tomorrow",
  "My laptop is not working",
  "Check my leave balance",
  "I need 2 days casual leave",
  "Raise an IT ticket",
];

function renderChat(el) {
  if (!chatSessionId) chatSessionId = 'sess-' + Date.now();
  el.innerHTML = `
  <div class="page-header"><div><h2><i class="fa-solid fa-robot" style="color:var(--primary)"></i> ARIA AI Assistant</h2><p>Chat naturally — ARIA handles the rest</p></div></div>
  <div class="chat-layout">
    <div class="chat-main">
      <div class="chat-header">
        <div class="aria-avatar"><i class="fa-solid fa-brain"></i></div>
        <div><div style="font-weight:700">ARIA</div><div class="aria-status">Online & Ready</div></div>
        <button class="btn btn-sm btn-outline" style="margin-left:auto" onclick="newChatSession()"><i class="fa-solid fa-plus"></i> New Chat</button>
      </div>
      <div class="quick-actions" id="quick-actions">
        ${QUICK_PROMPTS.map(p => `<span class="qa-chip" onclick="sendQuick('${p}')">${p}</span>`).join('')}
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="msg-row bot">
          <div class="msg-avatar bot"><i class="fa-solid fa-brain"></i></div>
          <div><div class="msg-bubble">Hello <strong>${API.user?.name?.split(' ')[0] || 'there'}</strong>! 👋 I'm ARIA, your AI office assistant.<br><br>I can help you:<br>📅 Apply for leave<br>🎫 Create helpdesk tickets<br>✅ Update tasks<br>📊 Check attendance<br><br>Just tell me what you need!</div><div class="msg-time">Just now</div></div>
        </div>
      </div>
      <div class="chat-input-bar">
        <textarea class="chat-input" id="chat-input" rows="1" placeholder="Ask ARIA anything… e.g. 'I need sick leave tomorrow'" onkeydown="chatKeyDown(event)"></textarea>
        <button class="chat-send" id="chat-send-btn" onclick="sendChatMessage()"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    </div>
    <div class="chat-sidebar">
      <div class="chat-action-card">
        <h4>Quick Actions</h4>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-outline" style="justify-content:flex-start" onclick="sendQuick('Apply for sick leave')"><i class="fa-solid fa-bed"></i> Apply Sick Leave</button>
          <button class="btn btn-outline" style="justify-content:flex-start" onclick="sendQuick('I need casual leave for 2 days')"><i class="fa-solid fa-umbrella-beach"></i> Casual Leave</button>
          <button class="btn btn-outline" style="justify-content:flex-start" onclick="sendQuick('My laptop screen is broken, raise a ticket')"><i class="fa-solid fa-laptop-code"></i> IT Issue</button>
          <button class="btn btn-outline" style="justify-content:flex-start" onclick="sendQuick('Check my attendance today')"><i class="fa-solid fa-clock"></i> Attendance</button>
          <button class="btn btn-outline" style="justify-content:flex-start" onclick="sendQuick('What are my pending tasks?')"><i class="fa-solid fa-list-check"></i> My Tasks</button>
        </div>
      </div>
      <div class="chat-action-card">
        <h4>Chat Tips</h4>
        <div style="font-size:12px;color:var(--text2);line-height:1.8">
          💬 Speak naturally<br>
          📅 Say "tomorrow" or specific dates<br>
          🔄 ARIA follows up if info is missing<br>
          ✅ Forms auto-submitted via chat<br>
          🔒 All history securely stored
        </div>
      </div>
    </div>
  </div>`;
}

function newChatSession() {
  chatSessionId = 'sess-' + Date.now();
  renderChat(document.getElementById('page-chat'));
}

function chatKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
}

function sendQuick(msg) {
  document.getElementById('chat-input').value = msg;
  sendChatMessage();
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg || isTyping) return;
  input.value = '';
  appendMsg('user', msg);
  showTyping();
  isTyping = true;
  try {
    const d = await API.sendMsg(msg, chatSessionId);
    hideTyping();
    appendMsg('bot', d.reply);
    if (d.action) {
      setTimeout(() => toast(`Action: ${d.action.replace(/_/g,' ')}`, 'success'), 300);
    }
  } catch (e) {
    hideTyping();
    appendMsg('bot', `⚠️ ${e.message || 'Something went wrong. Please try again.'}`);
  }
  isTyping = false;
}

function appendMsg(role, text) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const isBot = role === 'bot';
  const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  const div = document.createElement('div');
  div.className = `msg-row ${role}`;
  div.innerHTML = `
    ${isBot ? `<div class="msg-avatar bot"><i class="fa-solid fa-brain"></i></div>` : ''}
    <div>
      <div class="msg-bubble">${formatted}</div>
      <div class="msg-time">${now}</div>
    </div>
    ${!isBot ? `<div class="msg-avatar user">${API.user?.name?.[0] || 'U'}</div>` : ''}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const c = document.getElementById('chat-messages');
  if (!c) return;
  const d = document.createElement('div');
  d.className = 'msg-row bot'; d.id = 'typing-row';
  d.innerHTML = `<div class="msg-avatar bot"><i class="fa-solid fa-brain"></i></div><div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing-row')?.remove();
}
