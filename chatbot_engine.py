import os
import re
import json
import uuid
from datetime import datetime, date, timedelta
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get('OPENAI_API_KEY', ''),
    base_url=os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
)
MODEL = "openai/gpt-4o-mini"

_SESSIONS: dict = {}

def _get_state(session_id: str) -> dict:
    return _SESSIONS.setdefault(session_id, {})

def _set_state(session_id: str, state: dict):
    _SESSIONS[session_id] = state

def _clear_state(session_id: str):
    _SESSIONS.pop(session_id, None)

SYSTEM_PROMPT = """You are ARIA (Automated Reasoning & Intelligence Assistant), an enterprise AI office assistant. You help employees with:
- Leave requests (sick, casual, annual, emergency leave) and viewing their leaves
- Helpdesk tickets (IT, HR, Finance, Admin, Facilities) and viewing their tickets
- Attendance (check-in / check-out) and viewing their attendance records
- Task updates, task creation/assignment, and viewing their assigned tasks
- Scheduling meetings, deadlines, and holidays on the calendar
- General office queries

Rules:
1. Be professional, friendly, and concise.
2. Collect all required info step-by-step before creating any record.
3. For LEAVE: collect leave_type → from_date → to_date → reason → then auto-submit.
4. For TICKETS: collect category → subject → description → priority → then auto-submit.
5. For TASKS: collect title → assignee_name → due_date → then auto-submit.
6. For CALENDAR EVENTS / MEETINGS: collect title → event_type → start_date → end_date → description → then auto-submit.
7. Confirm each submitted form with a formatted summary.

Today's date: {today}
Employee: {name} | Dept: {department} | Leave Balance: {leave_balance} days
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_leave_request",
            "description": "Create a leave request when leave_type, from_date, to_date, and reason are all collected",
            "parameters": {
                "type": "object",
                "properties": {
                    "leave_type": {"type": "string", "enum": ["sick", "casual", "annual", "emergency"]},
                    "from_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "to_date":   {"type": "string", "description": "YYYY-MM-DD"},
                    "reason":    {"type": "string"}
                },
                "required": ["leave_type", "from_date", "to_date", "reason"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_helpdesk_ticket",
            "description": "Create a helpdesk ticket when category, subject, description, and priority are all collected",
            "parameters": {
                "type": "object",
                "properties": {
                    "category":    {"type": "string", "enum": ["IT", "HR", "Finance", "Admin", "Facilities"]},
                    "subject":     {"type": "string"},
                    "description": {"type": "string"},
                    "priority":    {"type": "string", "enum": ["low", "medium", "high", "urgent"]}
                },
                "required": ["category", "subject", "description", "priority"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Create or assign a task when title, assignee_name, and due_date are all collected",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "The title of the task (e.g. Create a Login Website)"},
                    "description": {"type": "string", "description": "Detailed description of the task"},
                    "assignee_name": {"type": "string", "description": "Name of the employee to assign this task to (e.g. John Doe)"},
                    "due_date": {"type": "string", "description": "YYYY-MM-DD due date for the task"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"], "default": "medium"}
                },
                "required": ["title", "assignee_name", "due_date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_calendar_event",
            "description": "Schedule a meeting, holiday, or deadline on the calendar when title, event_type, start_date, and end_date are all collected",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "The title of the meeting or event"},
                    "event_type": {"type": "string", "enum": ["meeting", "deadline", "holiday"], "description": "The type of calendar event"},
                    "start_date": {"type": "string", "description": "YYYY-MM-DD start date of the event"},
                    "end_date": {"type": "string", "description": "YYYY-MM-DD end date of the event"},
                    "description": {"type": "string", "description": "Optional details/description of the event"}
                },
                "required": ["title", "event_type", "start_date", "end_date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_in_attendance",
            "description": "Record a check-in for the employee's attendance today"
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_out_attendance",
            "description": "Record a check-out for the employee's attendance today"
        }
    },
    {
        "type": "function",
        "function": {
            "name": "view_attendance",
            "description": "Retrieve and display the employee's recent attendance records/logs"
        }
    },
    {
        "type": "function",
        "function": {
            "name": "view_tasks",
            "description": "Retrieve and display the employee's active or assigned tasks"
        }
    },
    {
        "type": "function",
        "function": {
            "name": "view_leaves",
            "description": "Retrieve and display the employee's recent leave requests and status"
        }
    },
    {
        "type": "function",
        "function": {
            "name": "view_tickets",
            "description": "Retrieve and display the employee's recent helpdesk tickets"
        }
    }
]

def _parse_date(text: str) -> str | None:
    today = date.today()
    t = text.lower()
    if 'tomorrow' in t: return (today + timedelta(days=1)).isoformat()
    if 'today' in t: return today.isoformat()
    if 'day after' in t: return (today + timedelta(days=2)).isoformat()
    months = {'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}
    for pattern, g_day, g_mon in [(r'(\d{1,2})[- /](\w{3,9})', 1, 2), (r'(\w{3,9})[- /](\d{1,2})', 2, 1)]:
        m = re.search(pattern, t)
        if m:
            try:
                day = int(m.group(g_day))
                mon = months.get(m.group(g_mon)[:3])
                if mon: return date(today.year, mon, day).isoformat()
            except:
                pass
    return None

def _parse_days(text: str) -> int:
    t = text.lower()
    m = re.search(r'(\d+)\s*day', t)
    if m: return int(m.group(1))
    words = {'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'a':1,'half':1}
    return next((n for w, n in words.items() if w in t), 1)

def _detect_leave_type(text: str) -> str:
    t = text.lower()
    keywords = {
        'sick': ['sick', 'fever', 'ill', 'flu', 'cold', 'hospital', 'doctor', 'medical'],
        'emergency': ['emergency', 'urgent', 'accident', 'death', 'funeral'],
        'annual': ['annual', 'vacation', 'holiday', 'trip', 'travel']
    }
    return next((k for k, words in keywords.items() if any(w in t for w in words)), 'casual')

def _detect_ticket_category(text: str) -> str:
    t = text.lower()
    keywords = {
        'IT': ['laptop', 'computer', 'wifi', 'internet', 'software', 'system', 'printer', 'monitor', 'keyboard', 'mouse', 'network', 'email', 'phone', 'mobile', 'app', 'login', 'password', 'access'],
        'HR': ['salary', 'payslip', 'hr', 'policy', 'offer', 'joining', 'relieving'],
        'Finance': ['reimbursement', 'expense', 'invoice', 'payment', 'finance', 'tax'],
        'Facilities': ['ac', 'air', 'chair', 'desk', 'electricity', 'cleaning', 'pantry', 'water']
    }
    return next((k for k, words in keywords.items() if any(w in t for w in words)), 'Admin')

def _state_machine(message: str, employee, session_id: str, db) -> dict:
    state = _get_state(session_id)
    t = message.lower().strip()
    mode = state.get('mode')

    # --- LEAVE FLOW ---
    if mode == 'leave':
        step = state.get('step', 'reason')
        if step == 'reason':
            state.update({'leave_type': _detect_leave_type(message), 'reason': message, 'step': 'from_date'})
            return {'reply': f"Got it — **{state['leave_type'].title()} Leave** for: _{message}_.\n\nWhich date do you need leave from? (e.g. \"tomorrow\", \"20 May\")", 'intent': 'leave'}
        
        if step == 'from_date':
            parsed = _parse_date(message)
            if not parsed:
                return {'reply': "I didn't catch the date. Please say something like \"tomorrow\" or \"20 May\".", 'intent': 'leave'}
            state.update({'from_date': parsed, 'step': 'days'})
            return {'reply': f"Leave starting **{parsed}**. How many days do you need?", 'intent': 'leave'}
        
        if step == 'days':
            days = _parse_days(message)
            from_date = datetime.strptime(state['from_date'], '%Y-%m-%d').date()
            to_date = from_date + timedelta(days=days - 1)
            state.update({'to_date': to_date.isoformat(), 'days': days, 'step': 'confirm'})
            summary = (
                f"📋 **Leave Request Summary**\n\n"
                f"👤 **Employee:** {employee.name}\n"
                f"🏷️ **Leave Type:** {state['leave_type'].title()} Leave\n"
                f"📅 **From:** {from_date.strftime('%d %b %Y')}\n"
                f"📅 **To:** {to_date.strftime('%d %b %Y')}\n"
                f"🔢 **Duration:** {days} day(s)\n"
                f"📝 **Reason:** {state['reason']}\n"
                f"📌 **Status:** Pending Approval\n\n"
                f"Shall I submit this leave request? Reply **yes** to confirm or **no** to cancel."
            )
            return {'reply': summary, 'intent': 'leave_confirm'}
        
        if step == 'confirm':
            _clear_state(session_id)
            if any(w in t for w in ['yes', 'confirm', 'ok', 'sure', 'submit', 'yeah', 'yep']):
                res = _execute_leave(state, employee, db)
                return {'reply': res['message'], 'action': 'leave_created', 'intent': 'leave'}
            return {'reply': "Leave request cancelled. Let me know if you need anything else!", 'intent': 'general'}

    # --- TICKET FLOW ---
    if mode == 'ticket':
        step = state.get('step', 'description')
        if step == 'description':
            state.update({'description': message, 'subject': message[:80], 'step': 'priority'})
            return {'reply': f"Understood — I'll raise a **{state.get('category', 'IT')}** ticket for that.\n\nWhat is the priority? (low / medium / high / urgent)", 'intent': 'ticket'}
        
        if step == 'priority':
            state['priority'] = next((p for p in ['urgent', 'high', 'medium', 'low'] if p in t), 'medium')
            res = _execute_ticket(state, employee, db)
            _clear_state(session_id)
            return {'reply': res['message'], 'action': 'ticket_created', 'intent': 'ticket'}

    # --- TASK FLOW ---
    if mode == 'task':
        step = state.get('step', 'title')
        if step == 'title':
            state.update({'title': message, 'step': 'assignee'})
            return {'reply': f"Got it — Task title: **{message}**.\n\nWho should this task be assigned to? (e.g. \"John Doe\", \"Priya\", or \"me\")", 'intent': 'task'}
        
        if step == 'assignee':
            state.update({'assignee_name': message, 'step': 'due_date'})
            return {'reply': f"Assigned to **{message}**. What is the due date? (e.g. \"tomorrow\", \"20 May\", \"next Friday\")", 'intent': 'task'}
        
        if step == 'due_date':
            parsed = _parse_date(message)
            if not parsed:
                parsed = (date.today() + timedelta(days=7)).isoformat()
            state.update({'due_date': parsed, 'step': 'confirm'})
            summary = (
                f"📋 **Task Assignment Summary**\n\n"
                f"📌 **Title:** {state['title']}\n"
                f"👤 **Assignee:** {state['assignee_name']}\n"
                f"📅 **Due Date:** {parsed}\n\n"
                f"Shall I assign this task? Reply **yes** to confirm or **no** to cancel."
            )
            return {'reply': summary, 'intent': 'task_confirm'}
        
        if step == 'confirm':
            _clear_state(session_id)
            if any(w in t for w in ['yes', 'confirm', 'ok', 'sure', 'submit', 'yeah', 'yep']):
                res = _execute_task(state, employee, db)
                return {'reply': res['message'], 'action': 'task_created', 'intent': 'task'}
            return {'reply': "Task assignment cancelled. Let me know if you need anything else!", 'intent': 'general'}

    # --- MEETING FLOW ---
    if mode == 'meeting':
        step = state.get('step', 'title')
        if step == 'title':
            state.update({'title': message, 'step': 'event_type'})
            return {'reply': "Got it. What type of event is this? (meeting / deadline / holiday)", 'intent': 'meeting'}
        
        if step == 'event_type':
            e_type = 'meeting'
            if 'deadline' in t: e_type = 'deadline'
            elif 'holiday' in t: e_type = 'holiday'
            state.update({'event_type': e_type, 'step': 'start_date'})
            return {'reply': f"Event type set to **{e_type.title()}**. What is the start date? (e.g. \"tomorrow\", \"20 May\")", 'intent': 'meeting'}
            
        if step == 'start_date':
            parsed = _parse_date(message)
            if not parsed:
                return {'reply': "I didn't catch the start date. Please say something like \"tomorrow\" or \"20 May\".", 'intent': 'meeting'}
            state.update({'start_date': parsed, 'step': 'end_date'})
            return {'reply': f"Starts on **{parsed}**. What is the end date? (Reply \"same\" if it's a one-day event)", 'intent': 'meeting'}
            
        if step == 'end_date':
            parsed = _parse_date(message)
            if not parsed or 'same' in t or 'today' in t or 'tomorrow' in t:
                parsed = state['start_date']
            state.update({'end_date': parsed, 'step': 'confirm'})
            summary = (
                f"📋 **Calendar Event Summary**\n\n"
                f"📌 **Title:** {state['title']}\n"
                f"🏷️ **Type:** {state['event_type'].title()}\n"
                f"📅 **Start Date:** {state['start_date']}\n"
                f"📅 **End Date:** {state['end_date']}\n\n"
                f"Shall I schedule this event? Reply **yes** to confirm or **no** to cancel."
            )
            return {'reply': summary, 'intent': 'meeting_confirm'}
            
        if step == 'confirm':
            _clear_state(session_id)
            if any(w in t for w in ['yes', 'confirm', 'ok', 'sure', 'submit', 'yeah', 'yep']):
                res = _execute_calendar_event(state, employee, db)
                return {'reply': res['message'], 'action': 'event_created', 'intent': 'meeting'}
            return {'reply': "Event scheduling cancelled. Let me know if you need anything else!", 'intent': 'general'}

    # --- INTENT DETECTION (No Active Mode) ---
    # 1. Attendance Check-in & Check-out actions
    if any(w in t for w in ['check-in', 'punch-in', 'clock-in', 'sign-in']) or (any(x in t for x in ['check', 'punch', 'clock', 'sign']) and 'in' in t):
        res = _execute_check_in(employee, db)
        return {'reply': res['message'], 'intent': 'attendance'}

    if any(w in t for w in ['check-out', 'punch-out', 'clock-out', 'sign-out']) or (any(x in t for x in ['check', 'punch', 'clock', 'sign']) and 'out' in t):
        res = _execute_check_out(employee, db)
        return {'reply': res['message'], 'intent': 'attendance'}

    # 2. View History commands
    if 'attendance' in t and any(w in t for w in ['show', 'view', 'record', 'log', 'history', 'list', 'get', 'see']):
        res = _execute_view_attendance(employee)
        return {'reply': res['message'], 'intent': 'attendance'}

    if 'task' in t and any(w in t for w in ['show', 'view', 'my', 'pending', 'list', 'get', 'see', 'active']):
        res = _execute_view_tasks(employee)
        return {'reply': res['message'], 'intent': 'task'}

    if 'leave' in t and any(w in t for w in ['show', 'view', 'my', 'status', 'list', 'get', 'see', 'balance']):
        res = _execute_view_leaves(employee)
        return {'reply': res['message'], 'intent': 'leave'}

    if 'ticket' in t and any(w in t for w in ['show', 'view', 'my', 'list', 'get', 'see', 'helpdesk']):
        res = _execute_view_tickets(employee)
        return {'reply': res['message'], 'intent': 'ticket'}

    # 3. Create task assignment intent
    if any(w in t for w in ['assign', 'create task', 'new task', 'add task', 'give task']):
        state.update({'mode': 'task', 'step': 'title'})
        return {'reply': "Sure! I can help you create and assign a task. What is the **title** of the task?", 'intent': 'task'}

    # 4. Schedule calendar meeting intent
    if any(w in t for w in ['schedule', 'meeting', 'calendar event', 'book a meeting', 'appointment']):
        state.update({'mode': 'meeting', 'step': 'title'})
        return {'reply': "Sure! I can help you schedule a calendar event or meeting. What is the **title** of the event?", 'intent': 'meeting'}

    # Leave application intent
    if any(w in t for w in ['leave', 'sick', 'vacation', 'day off', 'absent', 'holiday', 'not coming']):
        state.update({'mode': 'leave', 'step': 'reason'})
        ltype = _detect_leave_type(message)
        state['leave_type'] = ltype
        reasons = ['fever', 'flu', 'cold', 'medical', 'personal', 'family', 'emergency', 'sick', 'ill']
        reason_found = next((r for r in reasons if r in t), None)
        if reason_found:
            state.update({'reason': reason_found, 'step': 'from_date'})
            return {'reply': f"Sure! I can apply **{ltype.title()} Leave** for you.\n\nWhich date do you need leave from?", 'intent': 'leave'}
        return {'reply': "Sure! I can help you apply for leave. What is the **reason** for your leave?", 'intent': 'leave'}

    # Ticket creation intent
    if any(w in t for w in ['issue', 'problem', 'broken', 'not working', 'ticket', 'help', 'support', 'laptop', 'computer', 'wifi', 'printer', 'error', 'access', 'salary']):
        cat = _detect_ticket_category(message)
        state.update({'mode': 'ticket', 'step': 'description', 'category': cat})
        return {'reply': f"I'll raise a **{cat}** helpdesk ticket for you. Please describe the issue in detail:", 'intent': 'ticket'}

    # Greeting
    if any(w in t for w in ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'howdy']):
        return {
            'reply': f"Hello **{employee.name}**! 👋 I'm ARIA, your AI office assistant.\n\nI can help you with:\n📊 Check-in / Check-out & logs\n📅 Leave requests & lists\n🎫 Helpdesk tickets & history\n✅ Task creations & updates\n\nWhat do you need today?",
            'intent': 'greeting'
        }

    return {
        'reply': f"I'm here to help, **{employee.name}**! Try asking me:\n- _\"Check me in for today\"_\n- _\"Show my pending tasks\"_\n- _\"Create a task to build a login page\"_\n- _\"Show my attendance log\"_",
        'intent': 'general'
    }

def chat(message: str, employee, history: list, db, session_id: str = None) -> dict:
    today = date.today().isoformat()
    session_id = session_id or 'default'

    system = SYSTEM_PROMPT.format(
        today=today,
        name=employee.name,
        department=employee.department,
        leave_balance=employee.leave_balance
    )
    messages = [{"role": "system", "content": system}]
    for h in history[-10:]:
        messages.append({"role": h['role'], "content": h['message']})
    messages.append({"role": "user", "content": message})

    try:
        if not client.api_key or client.api_key in ('your_openai_api_key_here', '', 'sk-placeholder'):
            raise ValueError("No API key")

        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=800
        )
        choice = response.choices[0]

        if choice.finish_reason == 'tool_calls' and choice.message.tool_calls:
            tool_call = choice.message.tool_calls[0]
            fn_name = tool_call.function.name
            args = json.loads(tool_call.function.arguments) if tool_call.function.arguments else {}
            _clear_state(session_id)

            if fn_name == 'create_leave_request':
                result = _execute_leave(args, employee, db)
                return {'reply': result['message'], 'action': 'leave_created', 'intent': 'leave'}
            elif fn_name == 'create_helpdesk_ticket':
                result = _execute_ticket(args, employee, db)
                return {'reply': result['message'], 'action': 'ticket_created', 'intent': 'ticket'}
            elif fn_name == 'create_task':
                result = _execute_task(args, employee, db)
                return {'reply': result['message'], 'action': 'task_created', 'intent': 'task'}
            elif fn_name == 'create_calendar_event':
                result = _execute_calendar_event(args, employee, db)
                return {'reply': result['message'], 'action': 'event_created', 'intent': 'meeting'}
            elif fn_name == 'check_in_attendance':
                result = _execute_check_in(employee, db)
                return {'reply': result['message'], 'action': 'checkin', 'intent': 'attendance'}
            elif fn_name == 'check_out_attendance':
                result = _execute_check_out(employee, db)
                return {'reply': result['message'], 'action': 'checkout', 'intent': 'attendance'}
            elif fn_name == 'view_attendance':
                result = _execute_view_attendance(employee)
                return {'reply': result['message'], 'intent': 'attendance'}
            elif fn_name == 'view_tasks':
                result = _execute_view_tasks(employee)
                return {'reply': result['message'], 'intent': 'task'}
            elif fn_name == 'view_leaves':
                result = _execute_view_leaves(employee)
                return {'reply': result['message'], 'intent': 'leave'}
            elif fn_name == 'view_tickets':
                result = _execute_view_tickets(employee)
                return {'reply': result['message'], 'intent': 'ticket'}

        reply_text = choice.message.content or "I'm here to help! Could you clarify your request?"
        return {'reply': reply_text, 'intent': 'general'}

    except Exception:
        return _state_machine(message, employee, session_id, db)

def _execute_leave(args: dict, employee, db) -> dict:
    from models import Leave, Notification, Employee as Emp
    try:
        from_date = datetime.strptime(args['from_date'], '%Y-%m-%d').date()
        to_date   = datetime.strptime(args['to_date'],   '%Y-%m-%d').date()
        days      = (to_date - from_date).days + 1

        leave = Leave(
            employee_id=employee.id,
            leave_type=args.get('leave_type', 'casual'),
            from_date=from_date,
            to_date=to_date,
            days=days,
            reason=args.get('reason', ''),
            via_chatbot=True
        )
        db.session.add(leave)

        for admin in Emp.query.filter_by(role='admin').all():
            db.session.add(Notification(
                employee_id=admin.id,
                title='New Leave Request',
                message=f'{employee.name} applied for {days} day(s) of {args.get("leave_type","casual")} leave.',
                type='info'
            ))
        db.session.commit()

        return {
            'success': True,
            'message': (
                f"✅ **Leave request submitted!**\n\n"
                f"📋 **Summary:**\n"
                f"👤 **Employee:** {employee.name}\n"
                f"🏷️ **Type:** {args.get('leave_type','casual').title()} Leave\n"
                f"📅 **From:** {from_date.strftime('%d %b %Y')}\n"
                f"📅 **To:** {to_date.strftime('%d %b %Y')}\n"
                f"🔢 **Duration:** {days} day(s)\n"
                f"📝 **Reason:** {args.get('reason','')}\n"
                f"📌 **Status:** Pending Approval\n\n"
                f"Admin has been notified. You'll get a notification once it's approved."
            ),
            'leave': leave.to_dict()
        }
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'message': f'❌ Failed to submit leave: {str(e)}'}

def _execute_ticket(args: dict, employee, db) -> dict:
    from models import Ticket, Notification, Employee as Emp
    try:
        ticket_num = f"TKT-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"
        ticket = Ticket(
            ticket_number=ticket_num,
            employee_id=employee.id,
            category=args.get('category', 'IT'),
            subject=args.get('subject', args.get('description', '')[:80]),
            description=args.get('description', ''),
            priority=args.get('priority', 'medium'),
            via_chatbot=True
        )
        db.session.add(ticket)

        for admin in Emp.query.filter_by(role='admin').all():
            db.session.add(Notification(
                employee_id=admin.id,
                title='New Helpdesk Ticket',
                message=f'{employee.name} raised a {args.get("priority","medium")} priority {args.get("category","IT")} ticket: {args.get("subject","")}',
                type='warning'
            ))
        db.session.commit()

        return {
            'success': True,
            'message': (
                f"🎫 **Helpdesk ticket created!**\n\n"
                f"📋 **Details:**\n"
                f"🔖 **Ticket #:** {ticket_num}\n"
                f"🗂️ **Category:** {args.get('category','IT')}\n"
                f"📌 **Subject:** {args.get('subject','')}\n"
                f"⚡ **Priority:** {args.get('priority','medium').title()}\n"
                f"📌 **Status:** Open\n\n"
                f"Our support team has been notified. Track it in the **Helpdesk** section."
            ),
            'ticket': ticket.to_dict()
        }
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'message': f'❌ Failed to create ticket: {str(e)}'}

def _execute_task(args: dict, employee, db) -> dict:
    from models import Task, Employee as Emp, Notification
    try:
        title = args.get('title')
        desc = args.get('description', '')
        due_date_str = args.get('due_date')
        due_date = None
        if due_date_str:
            due_date = datetime.strptime(due_date_str, '%Y-%m-%d').date()
        priority = args.get('priority', 'medium')
        
        assignee_name = args.get('assignee_name', '').strip()
        assignee = None
        if assignee_name:
            if assignee_name.lower() in ('me', 'myself', 'self'):
                assignee = employee
            else:
                assignee = Emp.query.filter(Emp.name.like(f"%{assignee_name}%")).first()
        
        if not assignee:
            assignee = employee

        task = Task(
            title=title,
            description=desc,
            assigned_to=assignee.id,
            assigned_by=employee.id,
            priority=priority,
            due_date=due_date,
            status='pending'
        )
        db.session.add(task)
        
        db.session.add(Notification(
            employee_id=assignee.id,
            title='New Task Assigned',
            message=f'{employee.name} assigned you a task: {title}',
            type='info'
        ))
        db.session.commit()

        return {
            'success': True,
            'message': (
                f"✅ **Task assigned successfully!**\n\n"
                f"📋 **Details:**\n"
                f"📌 **Title:** {title}\n"
                f"👤 **Assignee:** {assignee.name} ({assignee.designation})\n"
                f"📅 **Due Date:** {due_date.strftime('%d %b %Y') if due_date else 'No due date'}\n"
                f"⚡ **Priority:** {priority.title()}\n\n"
                f"A notification has been sent to {assignee.name}."
            ),
            'task': task.to_dict()
        }
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'message': f'❌ Failed to assign task: {str(e)}'}

def _execute_check_in(employee, db) -> dict:
    from models import Attendance
    try:
        today = date.today()
        existing = Attendance.query.filter_by(employee_id=employee.id, date=today).first()
        if existing and existing.check_in:
            return {'success': False, 'message': '❌ **You have already checked in today!**'}
        if existing:
            existing.check_in = datetime.utcnow()
            existing.status = 'present'
        else:
            db.session.add(Attendance(employee_id=employee.id, date=today, check_in=datetime.utcnow(), status='present'))
        db.session.commit()
        return {'success': True, 'message': f'✅ **Check-in recorded successfully!** Time: {datetime.utcnow().strftime("%H:%M UTC")}. Have a productive day!'}
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'message': f'❌ Failed to check in: {str(e)}'}

def _execute_check_out(employee, db) -> dict:
    from models import Attendance
    try:
        today = date.today()
        att = Attendance.query.filter_by(employee_id=employee.id, date=today).first()
        if not att or not att.check_in:
            return {'success': False, 'message': '❌ **Please check in first today before checking out!**'}
        if att.check_out:
            return {'success': False, 'message': '❌ **You have already checked out today!**'}
        att.check_out = datetime.utcnow()
        att.hours_worked = round((att.check_out - att.check_in).total_seconds() / 3600, 2)
        db.session.commit()
        return {'success': True, 'message': f'✅ **Check-out recorded successfully!** Hours worked today: **{att.hours_worked}** hr(s). Have a great evening!'}
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'message': f'❌ Failed to check out: {str(e)}'}

def _execute_view_attendance(employee) -> dict:
    from models import Attendance
    try:
        records = Attendance.query.filter_by(employee_id=employee.id).order_by(Attendance.date.desc()).limit(5).all()
        if not records:
            return {'success': True, 'message': '📊 **No attendance records found.**'}
        lines = ["📊 **Your Recent Attendance Records:**\n"]
        for r in records:
            in_t = r.check_in.strftime('%H:%M') if r.check_in else '--:--'
            out_t = r.check_out.strftime('%H:%M') if r.check_out else '--:--'
            hrs = f"({r.hours_worked} hrs)" if r.hours_worked else ""
            lines.append(f"📅 **{r.date.strftime('%d %b %Y')}**: {r.status.upper()} | In: {in_t} | Out: {out_t} {hrs}")
        return {'success': True, 'message': '\n'.join(lines)}
    except Exception as e:
        return {'success': False, 'message': f'❌ Failed to fetch attendance log: {str(e)}'}

def _execute_view_tasks(employee) -> dict:
    from models import Task
    try:
        tasks = Task.query.filter_by(assigned_to=employee.id).order_by(Task.due_date.asc(), Task.created_at.desc()).limit(10).all()
        if not tasks:
            return {'success': True, 'message': '✅ **You have no tasks assigned!**'}
        lines = ["📋 **Your Active & Recent Tasks:**\n"]
        for t in tasks:
            icon = "✅" if t.status == 'completed' else "⏳"
            due = f"| Due: {t.due_date.strftime('%d %b')}" if t.due_date else ""
            lines.append(f"{icon} **{t.title}** {due} ({t.priority.title()} Priority) - _{t.status.upper()}_")
        return {'success': True, 'message': '\n'.join(lines)}
    except Exception as e:
        return {'success': False, 'message': f'❌ Failed to fetch tasks: {str(e)}'}

def _execute_view_leaves(employee) -> dict:
    from models import Leave
    try:
        leaves = Leave.query.filter_by(employee_id=employee.id).order_by(Leave.applied_on.desc()).limit(5).all()
        if not leaves:
            return {'success': True, 'message': '🏖️ **No leave requests found.**'}
        lines = ["🏖️ **Your Recent Leave Requests:**\n"]
        for l in leaves:
            icon = "✅" if l.status == 'approved' else ("❌" if l.status == 'rejected' else "⏳")
            lines.append(f"{icon} **{l.leave_type.title()} Leave** ({l.days} days) | {l.from_date.strftime('%d %b')} to {l.to_date.strftime('%d %b')} - _{l.status.upper()}_")
        return {'success': True, 'message': '\n'.join(lines)}
    except Exception as e:
        return {'success': False, 'message': f'❌ Failed to fetch leaves: {str(e)}'}

def _execute_view_tickets(employee) -> dict:
    from models import Ticket
    try:
        tickets = Ticket.query.filter_by(employee_id=employee.id).order_by(Ticket.created_at.desc()).limit(5).all()
        if not tickets:
            return {'success': True, 'message': '🎫 **No helpdesk tickets found.**'}
        lines = ["🎫 **Your Recent Helpdesk Tickets:**\n"]
        for t in tickets:
            icon = "✅" if t.status == 'resolved' else "⏳"
            lines.append(f"{icon} **#{t.ticket_number}** [{t.category}]: {t.subject} - _{t.status.upper()}_")
        return {'success': True, 'message': '\n'.join(lines)}
    except Exception as e:
        return {'success': False, 'message': f'❌ Failed to fetch tickets: {str(e)}'}

def _execute_calendar_event(args: dict, employee, db) -> dict:
    from models import CustomEvent, Notification
    try:
        title = args.get('title')
        event_type = args.get('event_type', args.get('type', 'meeting'))
        start_date_str = args.get('start_date', args.get('start')).replace(' ', 'T')
        end_date_str = args.get('end_date', args.get('end')).replace(' ', 'T')
        desc = args.get('description', '')
        
        # Check and extract start time
        start_time_str = ""
        if 'T' in start_date_str:
            parts = start_date_str.split('T')
            start_date_str = parts[0]
            if len(parts) > 1 and parts[1]:
                time_val = parts[1][:5]
                try:
                    dt = datetime.strptime(time_val, "%H:%M")
                    start_time_str = dt.strftime("%I:%M %p")
                except:
                    pass

        # Check and extract end time
        end_time_str = ""
        if 'T' in end_date_str:
            parts = end_date_str.split('T')
            end_date_str = parts[0]
            if len(parts) > 1 and parts[1]:
                time_val = parts[1][:5]
                try:
                    dt = datetime.strptime(time_val, "%H:%M")
                    end_time_str = dt.strftime("%I:%M %p")
                except:
                    pass

        # Format time display to append to description
        time_formatted = ""
        if start_time_str and end_time_str:
            time_formatted = f"Time: {start_time_str} - {end_time_str}"
        elif start_time_str:
            time_formatted = f"Time: {start_time_str}"
            
        if time_formatted:
            if desc:
                desc = f"{time_formatted} | {desc}"
            else:
                desc = time_formatted
        
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        
        ev = CustomEvent(
            employee_id=employee.id,
            title=title,
            event_type=event_type,
            start_date=start_date,
            end_date=end_date,
            description=desc
        )
        db.session.add(ev)
        
        db.session.add(Notification(
            employee_id=employee.id,
            title='Calendar Event Scheduled',
            message=f"Event '{title}' ({event_type.title()}) has been scheduled for {start_date.strftime('%d %b')}.",
            type='info'
        ))
        db.session.commit()
        
        return {
            'success': True,
            'message': (
                f"✅ **Calendar event scheduled!**\n\n"
                f"📋 **Details:**\n"
                f"📌 **Title:** {title}\n"
                f"🏷️ **Type:** {event_type.title()}\n"
                f"📅 **Start Date:** {start_date.strftime('%d %b %Y')}\n"
                f"📅 **End Date:** {end_date.strftime('%d %b %Y')}\n"
                f"📝 **Description:** {desc or 'No description'}\n\n"
                f"The event has been added to your calendar and Today's Schedule widget."
            )
        }
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'message': f'❌ Failed to schedule calendar event: {str(e)}'}

def execute_action(action_type: str, args: dict, employee, db) -> dict:
    if action_type == 'create_leave':
        return _execute_leave(args, employee, db)
    elif action_type == 'create_ticket':
        return _execute_ticket(args, employee, db)
    elif action_type == 'create_task':
        return _execute_task(args, employee, db)
    elif action_type == 'create_calendar_event':
        return _execute_calendar_event(args, employee, db)
    elif action_type == 'check_in':
        return _execute_check_in(employee, db)
    elif action_type == 'check_out':
        return _execute_check_out(employee, db)
    return {'success': False, 'message': 'Unknown action'}
