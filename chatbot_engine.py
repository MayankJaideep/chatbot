import os
import re
import json
import uuid
from datetime import datetime, date, timedelta
from openai import OpenAI

# OpenRouter is fully compatible with the OpenAI SDK — just set a custom base_url
client = OpenAI(
    api_key=os.environ.get('OPENAI_API_KEY', ''),
    base_url=os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
)

# Model to use — openrouter free/cheap model that supports function calling
MODEL = "openai/gpt-4o-mini"

SYSTEM_PROMPT = """You are ARIA (Automated Reasoning & Intelligence Assistant), an enterprise AI office assistant. You help employees with:
- Leave requests (sick, casual, annual, emergency leave)
- Helpdesk tickets (IT issues, HR queries, facilities, finance)
- Attendance (check-in/out)
- Task updates and status
- General office information

You must:
1. Be professional, friendly, and concise.
2. Ask follow-up questions to gather missing details.
3. When you have enough information to create a leave/ticket, signal intent with JSON in your response wrapped in <ACTION> tags.
4. Always confirm before creating records.

For leave requests, collect: leave_type, from_date, to_date, reason.
For tickets, collect: category (IT/HR/Finance/Admin/Facilities), subject, description, priority.
For task updates, collect: task_id or task name, new status, notes.

Today's date: {today}
Employee name: {name}
Department: {department}
Leave balance: {leave_balance} days
"""

ACTIONS = {
    'create_leave': {
        'required': ['leave_type', 'from_date', 'to_date', 'reason'],
        'description': 'Create a leave request'
    },
    'create_ticket': {
        'required': ['category', 'subject', 'description'],
        'description': 'Create a helpdesk ticket'
    },
    'update_task': {
        'required': ['task_id', 'status'],
        'description': 'Update a task status'
    },
    'check_attendance': {
        'required': [],
        'description': 'Check today attendance status'
    },
    'check_leave_status': {
        'required': [],
        'description': 'Check leave application status'
    }
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_leave_request",
            "description": "Create a leave request when all required information is collected",
            "parameters": {
                "type": "object",
                "properties": {
                    "leave_type": {
                        "type": "string",
                        "enum": ["sick", "casual", "annual", "emergency"],
                        "description": "Type of leave"
                    },
                    "from_date": {
                        "type": "string",
                        "description": "Start date in YYYY-MM-DD format"
                    },
                    "to_date": {
                        "type": "string",
                        "description": "End date in YYYY-MM-DD format"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Reason for leave"
                    }
                },
                "required": ["leave_type", "from_date", "to_date", "reason"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_helpdesk_ticket",
            "description": "Create a helpdesk support ticket",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["IT", "HR", "Finance", "Admin", "Facilities"],
                        "description": "Category of the issue"
                    },
                    "subject": {
                        "type": "string",
                        "description": "Brief subject of the ticket"
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of the issue"
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "urgent"],
                        "description": "Priority level"
                    }
                },
                "required": ["category", "subject", "description", "priority"]
            }
        }
    }
]


def _fallback_response(message: str, employee, context: list) -> dict:
    """Rule-based fallback when OpenAI is unavailable."""
    msg_lower = message.lower()

    # Leave intent
    if any(w in msg_lower for w in ['leave', 'sick', 'vacation', 'off day', 'holiday', 'absent']):
        # Try to extract basic details
        leave_type = 'sick' if 'sick' in msg_lower or 'fever' in msg_lower or 'ill' in msg_lower else \
                     'casual' if 'casual' in msg_lower else \
                     'emergency' if 'emergency' in msg_lower else \
                     'annual' if 'annual' in msg_lower or 'vacation' in msg_lower else 'casual'

        today_str = date.today().isoformat()
        tmr_str = (date.today() + timedelta(days=1)).isoformat()

        if 'tomorrow' in msg_lower:
            from_date, to_date = tmr_str, tmr_str
        elif 'today' in msg_lower:
            from_date, to_date = today_str, today_str
        else:
            from_date, to_date = None, None

        # Extract reason
        reasons = ['fever', 'flu', 'cold', 'sick', 'medical', 'family', 'personal', 'emergency']
        reason = next((r for r in reasons if r in msg_lower), None)

        if from_date and reason:
            return {
                'reply': f"I'll create a {leave_type} leave request for you. Please confirm:\n\n📅 **Date:** {from_date}\n📝 **Reason:** {reason.title()}\n\nShall I submit this? (yes/no)",
                'intent': 'leave_confirm',
                'pending_action': {
                    'type': 'create_leave',
                    'leave_type': leave_type,
                    'from_date': from_date,
                    'to_date': to_date,
                    'reason': reason
                }
            }
        elif not from_date:
            return {'reply': "Sure! I can help with a leave request. Which dates do you need leave for?", 'intent': 'leave'}
        else:
            return {'reply': f"Got it! Can you share the reason for your {leave_type} leave?", 'intent': 'leave'}

    # Ticket intent
    if any(w in msg_lower for w in ['ticket', 'issue', 'problem', 'broken', 'not working', 'error', 'help', 'support']):
        category = 'IT' if any(w in msg_lower for w in ['laptop', 'computer', 'wifi', 'internet', 'software', 'system', 'printer']) else \
                   'HR' if any(w in msg_lower for w in ['salary', 'payslip', 'hr', 'policy']) else \
                   'Facilities' if any(w in msg_lower for w in ['ac', 'chair', 'desk', 'electricity', 'cleaning']) else 'IT'
        return {
            'reply': f"I can raise a {category} helpdesk ticket for you. Could you briefly describe the issue?",
            'intent': 'ticket'
        }

    # Attendance
    if any(w in msg_lower for w in ['attendance', 'check in', 'check-in', 'punch in', 'mark attendance']):
        return {'reply': "Your attendance for today is being tracked. You can check the **Attendance** section in the sidebar for details.", 'intent': 'attendance'}

    # Task
    if any(w in msg_lower for w in ['task', 'assignment', 'work', 'deadline', 'complete']):
        return {'reply': "I can help with task updates! Please go to the **Tasks** section to view and update your assignments, or tell me which task you'd like to update.", 'intent': 'task'}

    # Greetings
    if any(w in msg_lower for w in ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening']):
        return {'reply': f"Hello, {employee.name}! 👋 I'm ARIA, your AI office assistant. How can I help you today?\n\nI can help you with:\n- 📅 Leave requests\n- 🎫 Helpdesk tickets\n- ✅ Task updates\n- 📊 Attendance tracking", 'intent': 'greeting'}

    return {'reply': f"I'm here to help, {employee.name}! You can ask me to:\n- Apply for leave\n- Create helpdesk tickets\n- Update task status\n- Check attendance\n\nWhat do you need?", 'intent': 'general'}


def chat(message: str, employee, history: list, db) -> dict:
    """Main chat function. Returns dict with 'reply', optional 'action', 'intent'."""
    today = date.today().isoformat()

    system = SYSTEM_PROMPT.format(
        today=today,
        name=employee.name,
        department=employee.department,
        leave_balance=employee.leave_balance
    )

    # Build message history for context (last 10 messages)
    messages = [{"role": "system", "content": system}]
    for h in history[-10:]:
        messages.append({"role": h['role'], "content": h['message']})
    messages.append({"role": "user", "content": message})

    try:
        # Check if API key is real (supports both sk- and sk-or-v1- prefixes)
        if not client.api_key or client.api_key in ('your_openai_api_key_here', ''):
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
        finish_reason = choice.finish_reason

        if finish_reason == 'tool_calls' and choice.message.tool_calls:
            tool_call = choice.message.tool_calls[0]
            fn_name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)

            if fn_name == 'create_leave_request':
                result = _execute_leave(args, employee, db)
                return {
                    'reply': result['message'],
                    'action': 'leave_created',
                    'data': result.get('leave'),
                    'intent': 'leave'
                }
            elif fn_name == 'create_helpdesk_ticket':
                result = _execute_ticket(args, employee, db)
                return {
                    'reply': result['message'],
                    'action': 'ticket_created',
                    'data': result.get('ticket'),
                    'intent': 'ticket'
                }

        reply_text = choice.message.content or "I'm here to help! Could you clarify your request?"
        return {'reply': reply_text, 'intent': 'general'}

    except Exception as e:
        # Use rule-based fallback
        return _fallback_response(message, employee, history)


def execute_action(action_type: str, args: dict, employee, db) -> dict:
    """Execute a confirmed pending action."""
    if action_type == 'create_leave':
        return _execute_leave(args, employee, db)
    elif action_type == 'create_ticket':
        return _execute_ticket(args, employee, db)
    return {'success': False, 'message': 'Unknown action'}


def _execute_leave(args: dict, employee, db) -> dict:
    from models import Leave, Notification
    try:
        from_date = datetime.strptime(args['from_date'], '%Y-%m-%d').date()
        to_date = datetime.strptime(args['to_date'], '%Y-%m-%d').date()
        days = (to_date - from_date).days + 1

        leave = Leave(
            employee_id=employee.id,
            leave_type=args.get('leave_type', 'casual'),
            from_date=from_date,
            to_date=to_date,
            days=days,
            reason=args['reason'],
            via_chatbot=True
        )
        db.session.add(leave)

        # Notify all admins
        from models import Employee as Emp
        admins = Emp.query.filter_by(role='admin').all()
        for admin in admins:
            n = Notification(
                employee_id=admin.id,
                title='New Leave Request',
                message=f'{employee.name} applied for {days} day(s) of {args.get("leave_type", "casual")} leave.',
                type='info'
            )
            db.session.add(n)

        db.session.commit()
        return {
            'success': True,
            'message': f"✅ **Leave request submitted successfully!**\n\n📋 **Summary:**\n- Type: {args.get('leave_type', 'casual').title()} Leave\n- From: {from_date.strftime('%b %d, %Y')}\n- To: {to_date.strftime('%b %d, %Y')}\n- Duration: {days} day(s)\n- Reason: {args['reason']}\n\nYour request is pending admin approval. You'll be notified once it's reviewed.",
            'leave': leave.to_dict()
        }
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'message': f'Failed to create leave: {str(e)}'}


def _execute_ticket(args: dict, employee, db) -> dict:
    from models import Ticket, Notification
    try:
        from datetime import datetime
        ticket_num = f"TKT-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"
        ticket = Ticket(
            ticket_number=ticket_num,
            employee_id=employee.id,
            category=args.get('category', 'IT'),
            subject=args['subject'],
            description=args['description'],
            priority=args.get('priority', 'medium'),
            via_chatbot=True
        )
        db.session.add(ticket)

        from models import Employee as Emp
        admins = Emp.query.filter_by(role='admin').all()
        for admin in admins:
            n = Notification(
                employee_id=admin.id,
                title='New Helpdesk Ticket',
                message=f'{employee.name} raised a {args.get("priority", "medium")} priority {args.get("category", "IT")} ticket: {args["subject"]}',
                type='warning'
            )
            db.session.add(n)

        db.session.commit()
        return {
            'success': True,
            'message': f"🎫 **Helpdesk ticket created!**\n\n📋 **Details:**\n- Ticket #: {ticket_num}\n- Category: {args.get('category', 'IT')}\n- Subject: {args['subject']}\n- Priority: {args.get('priority', 'medium').title()}\n\nOur support team will respond shortly. Track it in the **Helpdesk** section.",
            'ticket': ticket.to_dict()
        }
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'message': f'Failed to create ticket: {str(e)}'}
