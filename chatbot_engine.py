import os
import re
import json
import uuid
from datetime import datetime, date, timedelta
from openai import OpenAI

# OpenRouter is fully compatible with the OpenAI SDK
client = OpenAI(
    api_key=os.environ.get('OPENAI_API_KEY', ''),
    base_url=os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
)
MODEL = "openai/gpt-4o-mini"

# ── Conversation State Machine ────────────────────────────────────────────────
# States track multi-turn chatbot flows (leave, ticket, etc.)
# State is stored per session_id in memory (you can move to Redis/DB for prod)
_SESSIONS: dict = {}

def _get_state(session_id: str) -> dict:
    return _SESSIONS.setdefault(session_id, {})

def _set_state(session_id: str, state: dict):
    _SESSIONS[session_id] = state

def _clear_state(session_id: str):
    _SESSIONS.pop(session_id, None)


# ── System Prompt ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are ARIA (Automated Reasoning & Intelligence Assistant), an enterprise AI office assistant. You help employees with:
- Leave requests (sick, casual, annual, emergency leave)
- Helpdesk tickets (IT, HR, Finance, Admin, Facilities)
- Attendance (check-in / check-out)
- Task updates
- General office queries

Rules:
1. Be professional, friendly, and concise.
2. Collect all required info step-by-step before creating any record.
3. For LEAVE: collect leave_type → from_date → to_date → reason → then auto-submit.
4. For TICKETS: collect category → subject → description → priority → then auto-submit.
5. Confirm each submitted form with a formatted summary.

Today's date: {today}
Employee: {name} | Dept: {department} | Leave Balance: {leave_balance} days
"""

# ── OpenAI Function Tools ─────────────────────────────────────────────────────
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
    }
]


# ── State-machine fallback (no AI key needed) ─────────────────────────────────

def _parse_date(text: str) -> str | None:
    """Parse natural language dates into YYYY-MM-DD."""
    today = date.today()
    t = text.lower()
    if 'tomorrow' in t:
        return (today + timedelta(days=1)).isoformat()
    if 'today' in t:
        return today.isoformat()
    if 'day after' in t:
        return (today + timedelta(days=2)).isoformat()
    # Try to parse "20 may" or "may 20" patterns
    months = {'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
              'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}
    m = re.search(r'(\d{1,2})[- /](\w{3,9})', t)
    if m:
        try:
            day = int(m.group(1))
            mon = months.get(m.group(2)[:3].lower())
            if mon:
                return date(today.year, mon, day).isoformat()
        except:
            pass
    m = re.search(r'(\w{3,9})[- /](\d{1,2})', t)
    if m:
        try:
            mon = months.get(m.group(1)[:3].lower())
            day = int(m.group(2))
            if mon:
                return date(today.year, mon, day).isoformat()
        except:
            pass
    return None


def _parse_days(text: str) -> int:
    """Extract number of days from user message."""
    m = re.search(r'(\d+)\s*(day|days)', text.lower())
    if m:
        return int(m.group(1))
    words = {'one':1,'two':2,'three':3,'four':4,'five':5,
             'six':6,'seven':7,'a':'1','half':1}
    for w, n in words.items():
        if w in text.lower():
            return n
    return 1


def _detect_leave_type(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ['sick', 'fever', 'ill', 'flu', 'cold', 'hospital', 'doctor', 'medical']):
        return 'sick'
    if any(w in t for w in ['emergency', 'urgent', 'accident', 'death', 'funeral']):
        return 'emergency'
    if any(w in t for w in ['annual', 'vacation', 'holiday', 'trip', 'travel']):
        return 'annual'
    return 'casual'


def _detect_ticket_category(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ['laptop', 'computer', 'wifi', 'internet', 'software', 'system',
                             'printer', 'monitor', 'keyboard', 'mouse', 'network', 'email',
                             'phone', 'mobile', 'app', 'login', 'password', 'access']):
        return 'IT'
    if any(w in t for w in ['salary', 'payslip', 'hr', 'policy', 'offer', 'joining', 'relieving']):
        return 'HR'
    if any(w in t for w in ['reimbursement', 'expense', 'invoice', 'payment', 'finance', 'tax']):
        return 'Finance'
    if any(w in t for w in ['ac', 'air', 'chair', 'desk', 'electricity', 'cleaning', 'pantry', 'water']):
        return 'Facilities'
    return 'Admin'


def _state_machine(message: str, employee, session_id: str, db) -> dict:
    """
    Multi-turn rule-based chatbot flow.

    LEAVE FLOW:
      1. Detect leave intent
      2. Ask: reason / leave type
      3. Ask: from date
      4. Ask: how many days / to date
      5. Confirm & submit

    TICKET FLOW:
      1. Detect ticket intent
      2. Ask: category (auto-detected)
      3. Ask: description
      4. Ask: priority
      5. Submit immediately
    """
    state = _get_state(session_id)
    t = message.lower().strip()
    mode = state.get('mode')

    # ── LEAVE FLOW ──────────────────────────────────────────────────────────
    if mode == 'leave':
        step = state.get('step', 'reason')

        if step == 'reason':
            leave_type = _detect_leave_type(message)
            state['leave_type'] = leave_type
            state['reason'] = message
            state['step'] = 'from_date'
            _set_state(session_id, state)
            return {'reply': f"Got it — **{leave_type.title()} Leave** for: _{message}_.\n\nWhich date do you need leave from? (e.g. \"tomorrow\", \"20 May\")",
                    'intent': 'leave'}

        if step == 'from_date':
            parsed = _parse_date(message)
            if not parsed:
                return {'reply': "I didn't catch the date. Please say something like \"tomorrow\" or \"20 May\".", 'intent': 'leave'}
            state['from_date'] = parsed
            state['step'] = 'days'
            _set_state(session_id, state)
            return {'reply': f"Leave starting **{parsed}**. How many days do you need?", 'intent': 'leave'}

        if step == 'days':
            days = _parse_days(message)
            from_date = datetime.strptime(state['from_date'], '%Y-%m-%d').date()
            to_date = from_date + timedelta(days=days - 1)
            state['to_date'] = to_date.isoformat()
            state['days'] = days
            state['step'] = 'confirm'
            _set_state(session_id, state)
            emp_name = employee.name
            summary = (
                f"📋 **Leave Request Summary**\n\n"
                f"👤 **Employee:** {emp_name}\n"
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
            if any(w in t for w in ['yes', 'confirm', 'ok', 'sure', 'submit', 'yeah', 'yep']):
                result = _execute_leave(state, employee, db)
                _clear_state(session_id)
                return {'reply': result['message'], 'action': 'leave_created', 'intent': 'leave'}
            else:
                _clear_state(session_id)
                return {'reply': "Leave request cancelled. Let me know if you need anything else!", 'intent': 'general'}

    # ── TICKET FLOW ─────────────────────────────────────────────────────────
    if mode == 'ticket':
        step = state.get('step', 'description')

        if step == 'description':
            state['description'] = message
            state['subject'] = message[:80]  # First 80 chars as subject
            state['step'] = 'priority'
            _set_state(session_id, state)
            category = state.get('category', 'IT')
            return {'reply': f"Understood — I'll raise a **{category}** ticket for that.\n\nWhat is the priority? (low / medium / high / urgent)", 'intent': 'ticket'}

        if step == 'priority':
            priority = 'medium'
            for p in ['urgent', 'high', 'medium', 'low']:
                if p in t:
                    priority = p
                    break
            state['priority'] = priority
            # Auto-submit immediately
            result = _execute_ticket(state, employee, db)
            _clear_state(session_id)
            return {'reply': result['message'], 'action': 'ticket_created', 'intent': 'ticket'}

    # ── INTENT DETECTION (no active mode) ───────────────────────────────────

    # Leave intent
    if any(w in t for w in ['leave', 'sick', 'vacation', 'day off', 'absent', 'holiday', 'not coming']):
        state = {'mode': 'leave', 'step': 'reason'}
        _set_state(session_id, state)
        leave_type = _detect_leave_type(message)
        state['leave_type'] = leave_type
        # If reason already in message
        reasons = ['fever', 'flu', 'cold', 'medical', 'personal', 'family', 'emergency', 'sick', 'ill']
        reason_found = next((r for r in reasons if r in t), None)
        if reason_found:
            state['reason'] = reason_found
            state['step'] = 'from_date'
            _set_state(session_id, state)
            return {'reply': f"Sure! I can apply **{leave_type.title()} Leave** for you.\n\nWhich date do you need leave from?", 'intent': 'leave'}
        return {'reply': "Sure! I can help you apply for leave. What is the **reason** for your leave?", 'intent': 'leave'}

    # Ticket / issue intent
    if any(w in t for w in ['issue', 'problem', 'broken', 'not working', 'ticket', 'help', 'support',
                             'laptop', 'computer', 'wifi', 'printer', 'error', 'access', 'salary']):
        category = _detect_ticket_category(message)
        state = {'mode': 'ticket', 'step': 'description', 'category': category}
        _set_state(session_id, state)
        return {'reply': f"I'll raise a **{category}** helpdesk ticket for you. Please describe the issue in detail:", 'intent': 'ticket'}

    # Attendance
    if any(w in t for w in ['attendance', 'check in', 'check-in', 'punch in', 'marked']):
        return {'reply': "Your attendance is being tracked. Use the **Attendance** page in the sidebar to check-in or check-out. ✅", 'intent': 'attendance'}

    # Task
    if any(w in t for w in ['task', 'assignment', 'todo', 'pending work', 'complete']):
        return {'reply': "Check the **Tasks** section in the sidebar to view and update your assignments. Want me to show your pending tasks?", 'intent': 'task'}

    # Greeting
    if any(w in t for w in ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'howdy']):
        return {
            'reply': f"Hello **{employee.name}**! 👋 I'm ARIA, your AI office assistant.\n\nI can help you with:\n📅 Leave requests\n🎫 Helpdesk tickets\n✅ Task updates\n📊 Attendance\n\nWhat do you need today?",
            'intent': 'greeting'
        }

    # Default
    return {
        'reply': f"I'm here to help, **{employee.name}**! Try asking me:\n- _\"I need sick leave tomorrow\"_\n- _\"My laptop is not working\"_\n- _\"Show my pending tasks\"_",
        'intent': 'general'
    }


# ── Main Chat Entry Point ─────────────────────────────────────────────────────

def chat(message: str, employee, history: list, db, session_id: str = None) -> dict:
    """Main chat function. Returns dict with 'reply', optional 'action', 'intent'."""
    today = date.today().isoformat()
    session_id = session_id or 'default'

    # Build OpenAI message history
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
            args = json.loads(tool_call.function.arguments)
            _clear_state(session_id)  # Reset any pending state

            if fn_name == 'create_leave_request':
                result = _execute_leave(args, employee, db)
                return {'reply': result['message'], 'action': 'leave_created', 'intent': 'leave'}
            elif fn_name == 'create_helpdesk_ticket':
                result = _execute_ticket(args, employee, db)
                return {'reply': result['message'], 'action': 'ticket_created', 'intent': 'ticket'}

        reply_text = choice.message.content or "I'm here to help! Could you clarify your request?"
        return {'reply': reply_text, 'intent': 'general'}

    except Exception:
        # Use state-machine fallback
        return _state_machine(message, employee, session_id, db)


# ── DB Action Executors ───────────────────────────────────────────────────────

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
            'leave': leave.to_dict() if hasattr(leave, 'to_dict') else {}
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
            'ticket': ticket.to_dict() if hasattr(ticket, 'to_dict') else {}
        }
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'message': f'❌ Failed to create ticket: {str(e)}'}


def execute_action(action_type: str, args: dict, employee, db) -> dict:
    if action_type == 'create_leave':
        return _execute_leave(args, employee, db)
    elif action_type == 'create_ticket':
        return _execute_ticket(args, employee, db)
    return {'success': False, 'message': 'Unknown action'}
