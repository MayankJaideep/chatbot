import os
import uuid
import json
from datetime import datetime, date, timedelta
from flask import Blueprint, request, jsonify, g
from models import db, Employee, Attendance, Leave, Task, Ticket, ChatHistory, Notification
from utils import token_required, admin_required, generate_token, add_notification

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')
employee_bp = Blueprint('employee', __name__, url_prefix='/api/employee')
admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')
chat_bp = Blueprint('chat', __name__, url_prefix='/api/chat')

# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400
    emp = Employee.query.filter_by(email=email).first()
    if not emp or not emp.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401
    if not emp.is_active:
        return jsonify({'error': 'Account deactivated. Contact admin.'}), 403
    token = generate_token(emp.id, emp.role)
    return jsonify({'token': token, 'user': emp.to_dict()}), 200


@auth_bp.route('/me', methods=['GET'])
@token_required
def me():
    return jsonify(g.current_user.to_dict()), 200


@auth_bp.route('/change-password', methods=['PUT'])
@token_required
def change_password():
    data = request.get_json()
    current = data.get('current_password', '')
    new_pw = data.get('new_password', '')
    if not g.current_user.check_password(current):
        return jsonify({'error': 'Current password is incorrect'}), 400
    if len(new_pw) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    g.current_user.set_password(new_pw)
    db.session.commit()
    return jsonify({'message': 'Password updated successfully'}), 200

# ─────────────────────────────────────────────
# EMPLOYEE ROUTES
# ─────────────────────────────────────────────

@employee_bp.route('/profile', methods=['GET'])
@token_required
def get_profile():
    return jsonify(g.current_user.to_dict()), 200


@employee_bp.route('/profile', methods=['PUT'])
@token_required
def update_profile():
    data = request.get_json()
    allowed = ['name', 'phone', 'designation', 'department']
    for field in allowed:
        if field in data:
            setattr(g.current_user, field, data[field])
    db.session.commit()
    return jsonify({'message': 'Profile updated', 'user': g.current_user.to_dict()}), 200


# Attendance
@employee_bp.route('/attendance/checkin', methods=['POST'])
@token_required
def check_in():
    today = date.today()
    existing = Attendance.query.filter_by(employee_id=g.current_user.id, date=today).first()
    if existing and existing.check_in:
        return jsonify({'error': 'Already checked in today'}), 400
    if existing:
        existing.check_in = datetime.utcnow()
        existing.status = 'present'
    else:
        att = Attendance(employee_id=g.current_user.id, date=today, check_in=datetime.utcnow(), status='present')
        db.session.add(att)
    db.session.commit()
    return jsonify({'message': 'Check-in recorded', 'time': datetime.utcnow().isoformat()}), 200


@employee_bp.route('/attendance/checkout', methods=['POST'])
@token_required
def check_out():
    today = date.today()
    att = Attendance.query.filter_by(employee_id=g.current_user.id, date=today).first()
    if not att or not att.check_in:
        return jsonify({'error': 'Please check in first'}), 400
    if att.check_out:
        return jsonify({'error': 'Already checked out today'}), 400
    att.check_out = datetime.utcnow()
    delta = att.check_out - att.check_in
    att.hours_worked = round(delta.total_seconds() / 3600, 2)
    db.session.commit()
    return jsonify({'message': 'Check-out recorded', 'hours_worked': att.hours_worked}), 200


@employee_bp.route('/attendance', methods=['GET'])
@token_required
def get_attendance():
    month = request.args.get('month', date.today().month, type=int)
    year = request.args.get('year', date.today().year, type=int)
    records = Attendance.query.filter(
        Attendance.employee_id == g.current_user.id,
        db.extract('month', Attendance.date) == month,
        db.extract('year', Attendance.date) == year
    ).order_by(Attendance.date.desc()).all()
    today_rec = Attendance.query.filter_by(employee_id=g.current_user.id, date=date.today()).first()
    return jsonify({
        'records': [r.to_dict() for r in records],
        'today': today_rec.to_dict() if today_rec else None
    }), 200


# Leaves
@employee_bp.route('/leave/apply', methods=['POST'])
@token_required
def apply_leave():
    data = request.get_json()
    try:
        from_date = datetime.strptime(data['from_date'], '%Y-%m-%d').date()
        to_date = datetime.strptime(data['to_date'], '%Y-%m-%d').date()
    except (KeyError, ValueError):
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    days = (to_date - from_date).days + 1
    leave = Leave(
        employee_id=g.current_user.id,
        leave_type=data.get('leave_type', 'casual'),
        from_date=from_date,
        to_date=to_date,
        days=days,
        reason=data.get('reason', ''),
        via_chatbot=data.get('via_chatbot', False)
    )
    db.session.add(leave)
    admins = Employee.query.filter_by(role='admin').all()
    for admin in admins:
        add_notification(db, admin.id, 'New Leave Request',
                         f'{g.current_user.name} applied for {days} day(s) of leave.', 'info')
    db.session.commit()
    return jsonify({'message': 'Leave applied successfully', 'leave': leave.to_dict()}), 201


@employee_bp.route('/leave', methods=['GET'])
@token_required
def get_leaves():
    leaves = Leave.query.filter_by(employee_id=g.current_user.id).order_by(Leave.applied_on.desc()).all()
    return jsonify({'leaves': [l.to_dict() for l in leaves]}), 200


# Tasks
@employee_bp.route('/tasks', methods=['GET'])
@token_required
def get_tasks():
    tasks = Task.query.filter_by(assigned_to=g.current_user.id).order_by(Task.created_at.desc()).all()
    return jsonify({'tasks': [t.to_dict() for t in tasks]}), 200


@employee_bp.route('/tasks/<int:task_id>', methods=['PUT'])
@token_required
def update_task(task_id):
    task = Task.query.filter_by(id=task_id, assigned_to=g.current_user.id).first()
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    data = request.get_json()
    if 'status' in data:
        task.status = data['status']
        if data['status'] == 'completed':
            task.completed_at = datetime.utcnow()
    if 'progress' in data:
        task.progress = min(100, max(0, int(data['progress'])))
    if 'notes' in data:
        task.notes = data['notes']
    db.session.commit()
    return jsonify({'message': 'Task updated', 'task': task.to_dict()}), 200


# Tickets
@employee_bp.route('/ticket', methods=['POST'])
@token_required
def create_ticket():
    data = request.get_json()
    ticket_num = f"TKT-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"
    ticket = Ticket(
        ticket_number=ticket_num,
        employee_id=g.current_user.id,
        category=data.get('category', 'IT'),
        subject=data.get('subject', ''),
        description=data.get('description', ''),
        priority=data.get('priority', 'medium'),
        via_chatbot=data.get('via_chatbot', False)
    )
    db.session.add(ticket)
    admins = Employee.query.filter_by(role='admin').all()
    for admin in admins:
        add_notification(db, admin.id, 'New Helpdesk Ticket',
                         f'{g.current_user.name} raised a {ticket.priority} priority ticket.', 'warning')
    db.session.commit()
    return jsonify({'message': 'Ticket created', 'ticket': ticket.to_dict()}), 201


@employee_bp.route('/ticket', methods=['GET'])
@token_required
def get_tickets():
    tickets = Ticket.query.filter_by(employee_id=g.current_user.id).order_by(Ticket.created_at.desc()).all()
    return jsonify({'tickets': [t.to_dict() for t in tickets]}), 200

@employee_bp.route('/ticket/<int:ticket_id>', methods=['DELETE'])
@token_required
def delete_ticket(ticket_id):
    ticket = Ticket.query.filter_by(id=ticket_id, employee_id=g.current_user.id).first()
    if not ticket:
        return jsonify({'error': 'Ticket not found'}), 404
    if ticket.status not in ('resolved', 'closed'):
        return jsonify({'error': 'Only resolved or closed tickets can be deleted'}), 400
    db.session.delete(ticket)
    db.session.commit()
    return jsonify({'message': 'Ticket deleted successfully'}), 200


@employee_bp.route('/tasks/<int:task_id>', methods=['DELETE'])
@token_required
def delete_task(task_id):
    task = Task.query.filter_by(id=task_id, assigned_to=g.current_user.id).first()
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if task.status != 'completed':
        return jsonify({'error': 'Only completed tasks can be deleted'}), 400
    db.session.delete(task)
    db.session.commit()
    return jsonify({'message': 'Task deleted successfully'}), 200


@employee_bp.route('/notifications', methods=['GET'])
@token_required
def get_notifications():
    notes = Notification.query.filter_by(employee_id=g.current_user.id)\
        .order_by(Notification.created_at.desc()).limit(20).all()
    unread = Notification.query.filter_by(employee_id=g.current_user.id, is_read=False).count()
    return jsonify({'notifications': [n.to_dict() for n in notes], 'unread_count': unread}), 200


@employee_bp.route('/notifications/<int:nid>/read', methods=['PUT'])
@token_required
def mark_read(nid):
    n = Notification.query.filter_by(id=nid, employee_id=g.current_user.id).first()
    if n:
        n.is_read = True
        db.session.commit()
    return jsonify({'message': 'Marked as read'}), 200


@employee_bp.route('/notifications/read-all', methods=['PUT'])
@token_required
def mark_all_read():
    Notification.query.filter_by(employee_id=g.current_user.id, is_read=False)\
        .update({'is_read': True})
    db.session.commit()
    return jsonify({'message': 'All notifications marked as read'}), 200


@employee_bp.route('/dashboard', methods=['GET'])
@token_required
def emp_dashboard():
    today = date.today()
    att = Attendance.query.filter_by(employee_id=g.current_user.id, date=today).first()
    pending_leaves = Leave.query.filter_by(employee_id=g.current_user.id, status='pending').count()
    my_tasks = Task.query.filter_by(assigned_to=g.current_user.id, status='pending').count()
    open_tickets = Ticket.query.filter_by(employee_id=g.current_user.id, status='open').count()
    unread = Notification.query.filter_by(employee_id=g.current_user.id, is_read=False).count()
    return jsonify({
        'attendance_today': att.to_dict() if att else None,
        'pending_leaves': pending_leaves,
        'my_tasks': my_tasks,
        'open_tickets': open_tickets,
        'unread_notifications': unread,
        'leave_balance': g.current_user.leave_balance
    }), 200

# ─────────────────────────────────────────────
# ADMIN ROUTES
# ─────────────────────────────────────────────

@admin_bp.route('/dashboard', methods=['GET'])
@admin_required
def admin_dashboard():
    today = date.today()
    total_emp = Employee.query.filter_by(role='employee').count()
    present_today = Attendance.query.filter_by(date=today, status='present').count()
    pending_leaves = Leave.query.filter_by(status='pending').count()
    open_tickets = Ticket.query.filter_by(status='open').count()
    pending_tasks = Task.query.filter_by(status='pending').count()

    # Leave stats this month
    month_leaves = Leave.query.filter(
        db.extract('month', Leave.applied_on) == today.month,
        db.extract('year', Leave.applied_on) == today.year
    ).all()
    approved = sum(1 for l in month_leaves if l.status == 'approved')
    rejected = sum(1 for l in month_leaves if l.status == 'rejected')

    # Attendance chart data (last 7 days)
    att_chart = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        count = Attendance.query.filter_by(date=d, status='present').count()
        att_chart.append({'date': d.isoformat(), 'count': count})

    return jsonify({
        'total_employees': total_emp,
        'present_today': present_today,
        'pending_leaves': pending_leaves,
        'open_tickets': open_tickets,
        'pending_tasks': pending_tasks,
        'leave_stats': {'approved': approved, 'rejected': rejected, 'pending': pending_leaves},
        'attendance_chart': att_chart
    }), 200


@admin_bp.route('/employees', methods=['GET'])
@admin_required
def get_employees():
    employees = Employee.query.filter_by(role='employee').order_by(Employee.name).all()
    return jsonify({'employees': [e.to_dict() for e in employees]}), 200


@admin_bp.route('/employees', methods=['POST'])
@admin_required
def create_employee():
    data = request.get_json()
    if Employee.query.filter_by(email=data['email'].lower()).first():
        return jsonify({'error': 'Email already registered'}), 400
    count = Employee.query.count()
    emp = Employee(
        employee_id=f"EMP{str(count + 1).zfill(3)}",
        name=data['name'],
        email=data['email'].lower(),
        department=data.get('department', 'General'),
        designation=data.get('designation', 'Employee'),
        phone=data.get('phone', ''),
        role=data.get('role', 'employee')
    )
    emp.set_password(data.get('password', 'Welcome@123'))
    db.session.add(emp)
    db.session.commit()
    return jsonify({'message': 'Employee created', 'employee': emp.to_dict()}), 201


@admin_bp.route('/employees/<int:emp_id>', methods=['PUT'])
@admin_required
def update_employee(emp_id):
    emp = Employee.query.get_or_404(emp_id)
    data = request.get_json()
    for field in ['name', 'department', 'designation', 'phone', 'is_active', 'leave_balance']:
        if field in data:
            setattr(emp, field, data[field])
    db.session.commit()
    return jsonify({'message': 'Employee updated', 'employee': emp.to_dict()}), 200


@admin_bp.route('/employees/<int:emp_id>', methods=['DELETE'])
@admin_required
def delete_employee(emp_id):
    emp = Employee.query.get_or_404(emp_id)
    emp.is_active = False
    db.session.commit()
    return jsonify({'message': 'Employee deactivated'}), 200


@admin_bp.route('/tickets/<int:ticket_id>', methods=['DELETE'])
@admin_required
def delete_ticket_admin(ticket_id):
    ticket = Ticket.query.get_or_404(ticket_id)
    if ticket.status not in ('resolved', 'closed'):
        return jsonify({'error': 'Only resolved or closed tickets can be deleted'}), 400
    db.session.delete(ticket)
    db.session.commit()
    return jsonify({'message': 'Ticket deleted'}), 200


@admin_bp.route('/tasks/<int:task_id>', methods=['DELETE'])
@admin_required
def delete_task_admin(task_id):
    task = Task.query.get_or_404(task_id)
    if task.status != 'completed':
        return jsonify({'error': 'Only completed tasks can be deleted'}), 400
    db.session.delete(task)
    db.session.commit()
    return jsonify({'message': 'Task deleted'}), 200


# Leave management
@admin_bp.route('/leaves', methods=['GET'])
@admin_required
def get_all_leaves():
    status = request.args.get('status', None)
    q = Leave.query.order_by(Leave.applied_on.desc())
    if status:
        q = q.filter_by(status=status)
    return jsonify({'leaves': [l.to_dict() for l in q.all()]}), 200


@admin_bp.route('/leaves/<int:leave_id>/review', methods=['PUT'])
@admin_required
def review_leave(leave_id):
    leave = Leave.query.get_or_404(leave_id)
    data = request.get_json()
    action = data.get('action')  # 'approve' or 'reject'
    if action not in ('approve', 'reject'):
        return jsonify({'error': 'Action must be approve or reject'}), 400
    leave.status = 'approved' if action == 'approve' else 'rejected'
    leave.reviewed_by = g.current_user.id
    leave.reviewed_on = datetime.utcnow()
    leave.admin_comment = data.get('comment', '')
    if action == 'approve':
        emp = Employee.query.get(leave.employee_id)
        if emp:
            emp.leave_balance = max(0, emp.leave_balance - leave.days)
        add_notification(db, leave.employee_id, 'Leave Approved! ✅',
                         f'Your {leave.leave_type} leave from {leave.from_date} to {leave.to_date} has been approved.', 'success')
    else:
        add_notification(db, leave.employee_id, 'Leave Rejected ❌',
                         f'Your leave request has been rejected. Reason: {leave.admin_comment}', 'danger')
    db.session.commit()
    return jsonify({'message': f'Leave {leave.status}', 'leave': leave.to_dict()}), 200


# Attendance
@admin_bp.route('/attendance', methods=['GET'])
@admin_required
def get_all_attendance():
    target_date = request.args.get('date', date.today().isoformat())
    try:
        d = datetime.strptime(target_date, '%Y-%m-%d').date()
    except ValueError:
        d = date.today()
    records = Attendance.query.filter_by(date=d).all()
    return jsonify({'date': d.isoformat(), 'records': [r.to_dict() for r in records]}), 200


# Tasks
@admin_bp.route('/tasks', methods=['GET'])
@admin_required
def get_all_tasks():
    tasks = Task.query.order_by(Task.created_at.desc()).all()
    return jsonify({'tasks': [t.to_dict() for t in tasks]}), 200


@admin_bp.route('/tasks', methods=['POST'])
@admin_required
def create_task():
    data = request.get_json()
    task = Task(
        title=data['title'],
        description=data.get('description', ''),
        assigned_to=data.get('assigned_to'),
        assigned_by=g.current_user.id,
        priority=data.get('priority', 'medium'),
        due_date=datetime.strptime(data['due_date'], '%Y-%m-%d').date() if data.get('due_date') else None
    )
    db.session.add(task)
    if task.assigned_to:
        add_notification(db, task.assigned_to, 'New Task Assigned',
                         f'You have been assigned: {task.title}', 'info')
    db.session.commit()
    return jsonify({'message': 'Task created', 'task': task.to_dict()}), 201


@admin_bp.route('/tasks/<int:task_id>', methods=['PUT'])
@admin_required
def update_task_admin(task_id):
    task = Task.query.get_or_404(task_id)
    data = request.get_json()
    for field in ['title', 'description', 'priority', 'status', 'progress', 'notes', 'assigned_to']:
        if field in data:
            setattr(task, field, data[field])
    if data.get('due_date'):
        task.due_date = datetime.strptime(data['due_date'], '%Y-%m-%d').date()
    if data.get('status') == 'completed':
        task.completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Task updated', 'task': task.to_dict()}), 200


# Tickets
@admin_bp.route('/tickets', methods=['GET'])
@admin_required
def get_all_tickets():
    status = request.args.get('status', None)
    q = Ticket.query.order_by(Ticket.created_at.desc())
    if status:
        q = q.filter_by(status=status)
    return jsonify({'tickets': [t.to_dict() for t in q.all()]}), 200


@admin_bp.route('/tickets/<int:ticket_id>', methods=['PUT'])
@admin_required
def update_ticket(ticket_id):
    ticket = Ticket.query.get_or_404(ticket_id)
    data = request.get_json()
    if 'status' in data:
        ticket.status = data['status']
        if data['status'] == 'resolved':
            ticket.resolved_at = datetime.utcnow()
            add_notification(db, ticket.employee_id, 'Ticket Resolved ✅',
                             f'Your ticket #{ticket.ticket_number} has been resolved.', 'success')
    if 'resolution_notes' in data:
        ticket.resolution_notes = data['resolution_notes']
    db.session.commit()
    return jsonify({'message': 'Ticket updated', 'ticket': ticket.to_dict()}), 200


# ─────────────────────────────────────────────
# CHATBOT ROUTES
# ─────────────────────────────────────────────

@chat_bp.route('/message', methods=['POST'])
@token_required
def chat_message():
    import chatbot_engine as engine
    data = request.get_json()
    message = data.get('message', '').strip()
    session_id = data.get('session_id', str(uuid.uuid4()))
    if not message:
        return jsonify({'error': 'Message required'}), 400

    # Load history
    history = ChatHistory.query.filter_by(
        employee_id=g.current_user.id, session_id=session_id
    ).order_by(ChatHistory.timestamp).all()
    history_dicts = [{'role': h.role, 'message': h.message} for h in history]

    # Save user message
    user_msg = ChatHistory(
        employee_id=g.current_user.id,
        session_id=session_id,
        role='user',
        message=message,
        intent='user_input'
    )
    db.session.add(user_msg)
    db.session.flush()

    # Get AI response (pass session_id for state machine)
    result = engine.chat(message, g.current_user, history_dicts, db, session_id=session_id)

    # Save assistant response
    bot_msg = ChatHistory(
        employee_id=g.current_user.id,
        session_id=session_id,
        role='assistant',
        message=result['reply'],
        intent=result.get('intent'),
        action_taken=result.get('action')
    )
    db.session.add(bot_msg)
    db.session.commit()

    return jsonify({
        'reply': result['reply'],
        'session_id': session_id,
        'action': result.get('action'),
        'data': result.get('data'),
        'intent': result.get('intent')
    }), 200


@chat_bp.route('/history', methods=['GET'])
@token_required
def chat_history():
    session_id = request.args.get('session_id')
    q = ChatHistory.query.filter_by(employee_id=g.current_user.id)
    if session_id:
        q = q.filter_by(session_id=session_id)
    msgs = q.order_by(ChatHistory.timestamp.desc()).limit(50).all()
    return jsonify({'history': [m.to_dict() for m in reversed(msgs)]}), 200


@chat_bp.route('/sessions', methods=['GET'])
@token_required
def chat_sessions():
    sessions = db.session.query(
        ChatHistory.session_id,
        db.func.min(ChatHistory.timestamp).label('started_at'),
        db.func.max(ChatHistory.timestamp).label('last_msg'),
        db.func.count(ChatHistory.id).label('msg_count')
    ).filter_by(employee_id=g.current_user.id)\
     .group_by(ChatHistory.session_id)\
     .order_by(db.func.max(ChatHistory.timestamp).desc())\
     .limit(10).all()
    return jsonify({'sessions': [
        {'session_id': s.session_id, 'started_at': s.started_at.isoformat(),
         'last_msg': s.last_msg.isoformat(), 'msg_count': s.msg_count}
        for s in sessions
    ]}), 200


def register_routes(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(employee_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(chat_bp)
