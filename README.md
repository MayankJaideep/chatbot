# 🤖 ARIA — Enterprise AI Office Assistant

A production-ready, full-stack Enterprise AI Office Assistant built with **Python Flask + SQLite/MySQL + Vanilla JS**.

---

## 🚀 Quick Start

```bash
# 1. Navigate to the project
cd /Users/mayankjaideep/Desktop/chatbot

# 2. Create & activate virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. (Optional) Set OpenAI API key for full AI features
#    Edit .env and replace: OPENAI_API_KEY=your_key_here

# 5. Run the server
python app.py
```

Then open **http://127.0.0.1:5001** in your browser.

---

## 🔐 Demo Accounts

| Role     | Email                        | Password    |
|----------|------------------------------|-------------|
| Admin    | admin@company.com            | Admin@123   |
| Employee | john.doe@company.com         | Emp@1234    |
| Employee | priya.sharma@company.com     | Emp@1234    |

---

## ✨ Features

### Employee Module
- **Dashboard** — Attendance status, leave balance, task count, open tickets
- **AI Chatbot (ARIA)** — Natural conversation to apply leave, raise tickets, get updates
- **Attendance** — Live clock, check-in/out, monthly records
- **Leave Management** — Apply and track leave requests by type
- **Tasks** — View assignments, update status & progress
- **Helpdesk** — Raise and track IT/HR/Finance/Admin tickets
- **Notifications** — Real-time bell alerts with read/unread state

### Admin Module
- **Analytics Dashboard** — Attendance charts, leave stats, company-wide KPIs
- **Employee Management** — Add, edit, deactivate employees
- **Leave Approvals** — Review, approve or reject leave requests
- **Ticket Management** — Resolve helpdesk tickets with resolution notes
- **Task Manager** — Create and assign tasks to employees

### AI Chatbot
- Powered by **OpenAI GPT-4o-mini** (with intelligent rule-based fallback when no API key)
- Natural language understanding for leave, tickets, tasks
- **Function Calling** — auto-fills forms from conversation
- Full chat history stored in database per session
- Quick-action chips for common requests

---

## 📁 Project Structure

```
chatbot/
├── app.py              # Flask entry point, DB seed
├── models.py           # SQLAlchemy models
├── routes.py           # All API blueprints (auth/employee/admin/chat)
├── chatbot_engine.py   # AI engine (OpenAI + fallback)
├── utils.py            # JWT auth decorators
├── requirements.txt
├── .env                # Environment config
├── static/
│   ├── css/style.css   # Full design system
│   └── js/
│       ├── api.js        # REST client
│       ├── app.js        # Router, auth, notifications
│       ├── pages.js      # Employee page renderers
│       ├── admin_pages.js # Admin page renderers + canvas charts
│       └── chat.js       # Chatbot UI
└── templates/
    └── index.html      # SPA shell
```

---

## 🔌 MySQL Setup (Optional)

By default the app uses **SQLite** — zero config needed.

To switch to MySQL:
```bash
# In .env:
DATABASE_URL=mysql+pymysql://username:password@localhost/office_db
```

---

## 🛡️ Security
- JWT tokens (8-hour expiry)
- Password hashing with Werkzeug's PBKDF2
- Role-based access control (`@token_required` / `@admin_required`)
- CORS configured for API endpoints only
