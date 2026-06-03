import os
import uuid
from datetime import datetime, date, timedelta
from math import radians, sin, cos, sqrt, atan2
from flask import Blueprint, request, jsonify, g
from models import db, Employee, Attendance, Leave, Task, Ticket, ChatHistory, Notification, ClientVisit, Site, SiteAttendance, CustomEvent, TeamMessage
from utils import token_required, admin_required, generate_token, add_notification, check_employee_ooo

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
    return jsonify({'token': generate_token(emp.id, emp.role), 'user': emp.to_dict()}), 200

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    department = data.get('department', 'General').strip()
    designation = data.get('designation', 'Employee').strip()
    phone = data.get('phone', '').strip()

    if not name or not email or not password:
        return jsonify({'error': 'Name, email and password are required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    if Employee.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 400

    count = Employee.query.count()
    employee_id = f"EMP{str(count + 1).zfill(3)}"

    emp = Employee(
        employee_id=employee_id,
        name=name,
        email=email,
        department=department,
        designation=designation,
        phone=phone,
        role='employee'
    )
    emp.set_password(password)
    
    db.session.add(emp)
    db.session.commit()

    return jsonify({
        'message': 'Registration successful! You can now log in.',
        'user': emp.to_dict()
    }), 201

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

@employee_bp.route('/profile', methods=['GET', 'PUT'])
@token_required
def profile():
    if request.method == 'PUT':
        data = request.get_json()
        for field in ['name', 'phone', 'designation', 'department', 'photo_data']:
            if field in data:
                setattr(g.current_user, field, data[field])
        db.session.commit()
    return jsonify({'message': 'Profile updated', 'user': g.current_user.to_dict()} if request.method == 'PUT' else g.current_user.to_dict()), 200

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
        db.session.add(Attendance(employee_id=g.current_user.id, date=today, check_in=datetime.utcnow(), status='present'))
    db.session.commit()
    return jsonify({'message': 'Check-in recorded', 'time': datetime.utcnow().isoformat() + 'Z'}), 200

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
    att.hours_worked = round((att.check_out - att.check_in).total_seconds() / 3600, 2)
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

@employee_bp.route('/visit/checkin', methods=['POST'])
@token_required
def visit_checkin():
    data = request.get_json() or {}
    client_name = data.get('client_name', '').strip()
    lat = data.get('latitude')
    lng = data.get('longitude')

    if not client_name:
        return jsonify({'error': 'Client name or location is required'}), 400

    open_visit = ClientVisit.query.filter_by(employee_id=g.current_user.id, check_out_time=None).first()
    if open_visit:
        return jsonify({'error': f'Already checked in at {open_visit.client_name}. Please check out first.'}), 400

    visit = ClientVisit(
        employee_id=g.current_user.id,
        client_name=client_name,
        check_in_latitude=lat,
        check_in_longitude=lng,
        check_in_time=datetime.utcnow()
    )
    db.session.add(visit)
    db.session.commit()
    return jsonify({
        'message': f'Checked in to {client_name} successfully',
        'visit': visit.to_dict()
    }), 201

@employee_bp.route('/visit/checkout', methods=['POST'])
@token_required
def visit_checkout():
    data = request.get_json() or {}
    lat = data.get('latitude')
    lng = data.get('longitude')

    visit = ClientVisit.query.filter_by(employee_id=g.current_user.id, check_out_time=None).first()
    if not visit:
        return jsonify({'error': 'No active client visit found to check out from.'}), 400

    visit.check_out_time = datetime.utcnow()
    visit.check_out_latitude = lat
    visit.check_out_longitude = lng
    visit.hours_at_location = round((visit.check_out_time - visit.check_in_time).total_seconds() / 3600, 2)
    db.session.commit()

    return jsonify({
        'message': f'Checked out from {visit.client_name}',
        'hours_logged': visit.hours_at_location,
        'visit': visit.to_dict()
    }), 200

@employee_bp.route('/visits', methods=['GET'])
@token_required
def get_visits():
    records = SiteAttendance.query.filter_by(employee_id=g.current_user.id).order_by(SiteAttendance.check_in_time.desc()).all()
    active_visit = SiteAttendance.query.filter_by(employee_id=g.current_user.id, status='checked_in').first()
    return jsonify({
        'records': [r.to_dict() for r in records],
        'active_visit': active_visit.to_dict() if active_visit else None
    }), 200

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
        via_chatbot=data.get('via_chatbot', False),
        attachment_name=data.get('attachment_name'),
        attachment_data=data.get('attachment_data')
    )
    db.session.add(leave)
    recipients = []
    if g.current_user.manager_id:
        recipients.append(g.current_user.manager_id)
    else:
        recipients = [admin.id for admin in Employee.query.filter_by(role='admin').all()]
        
    for rid in recipients:
        add_notification(db, rid, 'New Leave Request', f'{g.current_user.name} applied for {days} day(s) of leave.', 'info')
    db.session.commit()
    return jsonify({'message': 'Leave applied successfully', 'leave': leave.to_dict()}), 201

@employee_bp.route('/leave', methods=['GET'])
@token_required
def get_leaves():
    leaves = Leave.query.filter_by(employee_id=g.current_user.id).order_by(Leave.applied_on.desc()).all()
    return jsonify({'leaves': [l.to_dict() for l in leaves]}), 200

@employee_bp.route('/leaves/approved', methods=['GET'])
@token_required
def get_approved_leaves():
    leaves = Leave.query.filter_by(status='approved').order_by(Leave.from_date).all()
    records = []
    for l in leaves:
        records.append({
            'id': l.id,
            'employee_name': l.employee.name if l.employee else 'Unknown',
            'leave_type': l.leave_type,
            'from_date': l.from_date.isoformat(),
            'to_date': l.to_date.isoformat(),
            'days': l.days
        })
    return jsonify({'leaves': records}), 200

@employee_bp.route('/tasks', methods=['GET'])
@token_required
def get_tasks():
    tasks = Task.query.filter_by(assigned_to=g.current_user.id).order_by(Task.created_at.desc()).all()
    return jsonify({'tasks': [t.to_dict() for t in tasks]}), 200

@employee_bp.route('/tasks/<int:task_id>', methods=['PUT', 'DELETE'])
@token_required
def modify_task(task_id):
    task = Task.query.filter_by(id=task_id, assigned_to=g.current_user.id).first()
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if request.method == 'DELETE':
        if task.status != 'completed':
            return jsonify({'error': 'Only completed tasks can be deleted'}), 400
        db.session.delete(task)
        db.session.commit()
        return jsonify({'message': 'Task deleted successfully'}), 200
    
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

@employee_bp.route('/ticket', methods=['POST', 'GET'])
@token_required
def manage_tickets():
    if request.method == 'POST':
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
        for admin in Employee.query.filter_by(role='admin').all():
            add_notification(db, admin.id, 'New Helpdesk Ticket', f'{g.current_user.name} raised a {ticket.priority} priority ticket.', 'warning')
        db.session.commit()
        return jsonify({'message': 'Ticket created', 'ticket': ticket.to_dict()}), 201
    
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

@employee_bp.route('/notifications', methods=['GET'])
@token_required
def get_notifications():
    notes = Notification.query.filter_by(employee_id=g.current_user.id).order_by(Notification.created_at.desc()).limit(20).all()
    unread = Notification.query.filter_by(employee_id=g.current_user.id, is_read=False).count()
    return jsonify({'notifications': [n.to_dict() for n in notes], 'unread_count': unread}), 200

@employee_bp.route('/notifications/<int:nid>/read', methods=['PUT'])
@token_required
def mark_read(nid):
    Notification.query.filter_by(id=nid, employee_id=g.current_user.id).update({'is_read': True})
    db.session.commit()
    return jsonify({'message': 'Marked as read'}), 200

@employee_bp.route('/notifications/read-all', methods=['PUT'])
@token_required
def mark_all_read():
    Notification.query.filter_by(employee_id=g.current_user.id, is_read=False).update({'is_read': True})
    db.session.commit()
    return jsonify({'message': 'All notifications marked as read'}), 200

@employee_bp.route('/dashboard', methods=['GET'])
@token_required
def emp_dashboard():
    uid = g.current_user.id
    active_site = SiteAttendance.query.filter_by(employee_id=uid, status='checked_in').first()
    checked_in_today = SiteAttendance.query.filter(
        SiteAttendance.employee_id == uid,
        db.func.date(SiteAttendance.check_in_time) == date.today()
    ).first() is not None
    
    return jsonify({
        'active_site_attendance': active_site.to_dict() if active_site else None,
        'checked_in_today': checked_in_today,
        'pending_leaves': Leave.query.filter_by(employee_id=uid, status='pending').count(),
        'my_tasks': Task.query.filter_by(assigned_to=uid, status='pending').count(),
        'open_tickets': Ticket.query.filter_by(employee_id=uid, status='open').count(),
        'unread_notifications': Notification.query.filter_by(employee_id=uid, is_read=False).count(),
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

    month_leaves = Leave.query.filter(
        db.extract('month', Leave.applied_on) == today.month,
        db.extract('year', Leave.applied_on) == today.year
    ).all()
    approved = sum(1 for l in month_leaves if l.status == 'approved')
    rejected = sum(1 for l in month_leaves if l.status == 'rejected')

    att_chart = [{'date': (today - timedelta(days=i)).isoformat(),
                  'count': Attendance.query.filter_by(date=today - timedelta(days=i), status='present').count()}
                 for i in range(6, -1, -1)]

    return jsonify({
        'total_employees': total_emp,
        'present_today': present_today,
        'pending_leaves': pending_leaves,
        'open_tickets': open_tickets,
        'pending_tasks': pending_tasks,
        'leave_stats': {'approved': approved, 'rejected': rejected, 'pending': pending_leaves},
        'attendance_chart': att_chart
    }), 200

@admin_bp.route('/employees', methods=['GET', 'POST'])
@admin_required
def manage_employees():
    if request.method == 'POST':
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

    employees = Employee.query.filter_by(role='employee').order_by(Employee.name).all()
    return jsonify({'employees': [e.to_dict() for e in employees]}), 200

@admin_bp.route('/employees/<int:emp_id>', methods=['PUT', 'DELETE'])
@admin_required
def modify_employee(emp_id):
    emp = Employee.query.get_or_404(emp_id)
    if request.method == 'DELETE':
        emp.is_active = False
        db.session.commit()
        return jsonify({'message': 'Employee deactivated'}), 200
    
    data = request.get_json()
    for field in ['name', 'department', 'designation', 'phone', 'is_active', 'leave_balance', 'manager_id']:
        if field in data:
            val = data[field]
            if field == 'manager_id':
                if val == 'null' or val is None or val == '':
                    val = None
                else:
                    val = int(val)
            setattr(emp, field, val)
    db.session.commit()
    return jsonify({'message': 'Employee updated', 'employee': emp.to_dict()}), 200

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

@admin_bp.route('/leaves', methods=['GET'])
@admin_required
def get_all_leaves():
    status = request.args.get('status')
    q = Leave.query.order_by(Leave.applied_on.desc())
    if status:
        q = q.filter_by(status=status)
    return jsonify({'leaves': [l.to_dict() for l in q.all()]}), 200

@admin_bp.route('/leaves/<int:leave_id>/review', methods=['PUT'])
@admin_required
def review_leave(leave_id):
    leave = Leave.query.get_or_404(leave_id)
    data = request.get_json()
    action = data.get('action')
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
        add_notification(db, leave.employee_id, 'Leave Approved! ✅', f'Your {leave.leave_type} leave from {leave.from_date} to {leave.to_date} has been approved.', 'success')
    else:
        add_notification(db, leave.employee_id, 'Leave Rejected ❌', f'Your leave request has been rejected. Reason: {leave.admin_comment}', 'danger')
    db.session.commit()
    return jsonify({'message': f'Leave {leave.status}', 'leave': leave.to_dict()}), 200

@admin_bp.route('/attendance', methods=['GET'])
@admin_required
def get_all_attendance():
    try:
        d = datetime.strptime(request.args.get('date', ''), '%Y-%m-%d').date()
    except ValueError:
        d = date.today()
    return jsonify({'date': d.isoformat(), 'records': [r.to_dict() for r in Attendance.query.filter_by(date=d).all()]}), 200

@admin_bp.route('/visits', methods=['GET'])
@admin_required
def get_all_visits():
    records = SiteAttendance.query.order_by(SiteAttendance.check_in_time.desc()).all()
    return jsonify({'records': [r.to_dict() for r in records]}), 200

@admin_bp.route('/tasks', methods=['GET', 'POST'])
@admin_required
def manage_tasks_admin():
    if request.method == 'POST':
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
        ooo_warning = None
        if task.assigned_to and task.due_date:
            ooo_leave = check_employee_ooo(db, task.assigned_to, task.due_date)
            if ooo_leave:
                ooo_warning = f"Warning: Assignee is Out of Office on this day ({ooo_leave.leave_type} leave)."
        
        if task.assigned_to:
            add_notification(db, task.assigned_to, 'New Task Assigned', f'You have been assigned: {task.title}', 'info')
            
        db.session.commit()
        res_dict = {'message': 'Task created', 'task': task.to_dict()}
        if ooo_warning:
            res_dict['warning'] = ooo_warning
        return jsonify(res_dict), 201

    return jsonify({'tasks': [t.to_dict() for t in Task.query.order_by(Task.created_at.desc()).all()]}), 200

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

@admin_bp.route('/tickets', methods=['GET'])
@admin_required
def get_all_tickets():
    status = request.args.get('status')
    q = Ticket.query.order_by(Ticket.created_at.desc())
    if status:
        q = q.filter_by(status=status)
    return jsonify({'tickets': [t.to_dict() for t in q.all()]}), 200

@admin_bp.route('/tickets/<int:ticket_id>', methods=['PUT'])
@admin_required
def update_ticket_admin(ticket_id):
    ticket = Ticket.query.get_or_404(ticket_id)
    data = request.get_json()
    if 'status' in data:
        ticket.status = data['status']
        if data['status'] == 'resolved':
            ticket.resolved_at = datetime.utcnow()
            add_notification(db, ticket.employee_id, 'Ticket Resolved ✅', f'Your ticket #{ticket.ticket_number} has been resolved.', 'success')
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

    history = ChatHistory.query.filter_by(employee_id=g.current_user.id, session_id=session_id).order_by(ChatHistory.timestamp).all()
    
    # Save user message
    db.session.add(ChatHistory(employee_id=g.current_user.id, session_id=session_id, role='user', message=message, intent='user_input'))
    db.session.flush()

    # Get response
    res = engine.chat(message, g.current_user, [{'role': h.role, 'message': h.message} for h in history], db, session_id=session_id)

    # Save assistant response
    db.session.add(ChatHistory(employee_id=g.current_user.id, session_id=session_id, role='assistant', message=res['reply'], intent=res.get('intent'), action_taken=res.get('action')))
    db.session.commit()

    return jsonify({'reply': res['reply'], 'session_id': session_id, 'action': res.get('action'), 'data': res.get('data'), 'intent': res.get('intent')}), 200

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
        {'session_id': s.session_id, 'started_at': s.started_at.isoformat() + 'Z',
         'last_msg': s.last_msg.isoformat() + 'Z', 'msg_count': s.msg_count}
        for s in sessions
    ]}), 200

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000  # meters
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c

@employee_bp.route('/sites', methods=['GET'])
@token_required
def get_sites():
    sites = Site.query.filter_by(active=True).order_by(Site.site_name).all()
    return jsonify({'sites': [s.to_dict() for s in sites]}), 200

@admin_bp.route('/sites', methods=['GET', 'POST'])
@admin_required
def manage_sites_admin():
    if request.method == 'POST':
        data = request.get_json() or {}
        site_name = data.get('site_name', '').strip()
        client_name = data.get('client_name', '').strip()
        try:
            lat = float(data.get('latitude', 0))
            lng = float(data.get('longitude', 0))
            radius = float(data.get('radius_meters', 100.0))
        except (TypeError, ValueError):
            return jsonify({'error': 'Latitude, longitude and radius must be valid numbers'}), 400

        if not site_name or not client_name:
            return jsonify({'error': 'Site name and client name are required'}), 400

        site = Site(
            site_name=site_name,
            client_name=client_name,
            latitude=lat,
            longitude=lng,
            radius_meters=radius,
            active=True
        )
        db.session.add(site)
        db.session.commit()
        return jsonify({'message': 'Site created successfully', 'site': site.to_dict()}), 201

    sites = Site.query.order_by(Site.site_name).all()
    return jsonify({'sites': [s.to_dict() for s in sites]}), 200

@admin_bp.route('/sites/<int:site_id>', methods=['PUT', 'DELETE'])
@admin_required
def modify_site_admin(site_id):
    site = db.session.get(Site, site_id)
    if not site:
        return jsonify({'error': 'Site not found'}), 404

    if request.method == 'DELETE':
        site.active = False
        db.session.commit()
        return jsonify({'message': 'Site deactivated successfully'}), 200

    data = request.get_json() or {}
    if 'site_name' in data:
        site.site_name = data['site_name'].strip()
    if 'client_name' in data:
        site.client_name = data['client_name'].strip()
    try:
        if 'latitude' in data:
            site.latitude = float(data['latitude'])
        if 'longitude' in data:
            site.longitude = float(data['longitude'])
        if 'radius_meters' in data:
            site.radius_meters = float(data['radius_meters'])
    except (TypeError, ValueError):
         return jsonify({'error': 'Latitude, longitude and radius must be valid numbers'}), 400

    if 'active' in data:
        site.active = bool(data['active'])

    db.session.commit()
    return jsonify({'message': 'Site updated successfully', 'site': site.to_dict()}), 200

@employee_bp.route('/calendar/events', methods=['GET'])
@token_required
def get_calendar_events():
    leaves = Leave.query.filter_by(status='approved').all()
    tasks = Task.query.filter_by(assigned_to=g.current_user.id).all()
    
    # Query meeting and holiday events globally, and deadlines only for current user
    custom_events = CustomEvent.query.filter(
        (CustomEvent.employee_id == g.current_user.id) |
        (CustomEvent.event_type.in_(['meeting', 'holiday']))
    ).all()
    
    holidays = [
        {"title": "New Year's Day", "date": "2026-01-01"},
        {"title": "Republic Day", "date": "2026-01-26"},
        {"title": "Holi", "date": "2026-03-03"},
        {"title": "Good Friday", "date": "2026-04-03"},
        {"title": "Independence Day", "date": "2026-08-15"},
        {"title": "Gandhi Jayanti", "date": "2026-10-02"},
        {"title": "Diwali", "date": "2026-11-08"},
        {"title": "Christmas Day", "date": "2026-12-25"},
        {"title": "New Year's Day", "date": "2027-01-01"},
        {"title": "Republic Day", "date": "2027-01-26"},
        {"title": "Good Friday", "date": "2027-03-26"},
        {"title": "Independence Day", "date": "2027-08-15"},
        {"title": "Gandhi Jayanti", "date": "2027-10-02"},
        {"title": "Christmas Day", "date": "2027-12-25"},
    ]
    
    events = []
    for l in leaves:
        events.append({
            "type": "leave",
            "id": f"leave-{l.id}",
            "title": f"{l.employee.name} (OOO)",
            "start": l.from_date.isoformat(),
            "end": l.to_date.isoformat(),
            "leave_type": l.leave_type,
            "employee_name": l.employee.name
        })
        
    for t in tasks:
        if t.due_date:
            events.append({
                "type": "deadline",
                "id": f"task-{t.id}",
                "title": f"Deadline: {t.title}",
                "start": t.due_date.isoformat(),
                "end": t.due_date.isoformat(),
                "priority": t.priority,
                "status": t.status,
                "progress": t.progress,
                "description": t.description
            })
            
    for h in holidays:
        events.append({
            "type": "holiday",
            "id": f"holiday-{h['date']}",
            "title": h['title'],
            "start": h['date'],
            "end": h['date']
        })

    for c in custom_events:
        events.append({
            "type": c.event_type,
            "id": f"custom-{c.id}",
            "title": c.title,
            "start": c.start_date.isoformat(),
            "end": c.end_date.isoformat(),
            "description": c.description,
            "employee_name": c.employee.name if c.employee else 'Unknown'
        })
        
    return jsonify({"events": events}), 200

@employee_bp.route('/calendar/custom-events', methods=['POST'])
@token_required
def create_custom_event():
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    event_type = data.get('type', 'meeting').strip()
    start_str = data.get('start')
    end_str = data.get('end')
    description = data.get('description', '').strip()
    
    if not title or not start_str or not end_str:
        return jsonify({"error": "Title, start date, and end date are required"}), 400
        
    try:
        start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400
        
    event = CustomEvent(
        employee_id=g.current_user.id,
        title=title,
        event_type=event_type,
        start_date=start_date,
        end_date=end_date,
        description=description
    )
    db.session.add(event)
    db.session.commit()
    
    return jsonify({"message": "Event created successfully", "event": event.to_dict()}), 201

@employee_bp.route('/calendar/custom-events/<int:event_id>', methods=['DELETE'])
@token_required
def delete_custom_event(event_id):
    event = CustomEvent.query.filter_by(id=event_id).first()
    if not event:
        return jsonify({"error": "Event not found"}), 404
        
    if event.employee_id != g.current_user.id and g.current_user.role != 'admin':
        return jsonify({"error": "You do not have permission to delete this event"}), 403
        
    db.session.delete(event)
    db.session.commit()
    return jsonify({"message": "Event deleted successfully"}), 200

@employee_bp.route('/managers', methods=['GET'])
@token_required
def get_managers():
    emps = Employee.query.filter_by(is_active=True).order_by(Employee.name).all()
    managers = [{'id': e.id, 'name': e.name, 'designation': e.designation} for e in emps]
    return jsonify({'managers': managers}), 200

@employee_bp.route('/team-chat/users', methods=['GET'])
@token_required
def get_team_chat_users():
    users = Employee.query.filter(Employee.id != g.current_user.id).order_by(Employee.name).all()
    today = date.today()
    start_of_today = datetime.combine(today, datetime.min.time())
    user_list = []
    
    for u in users:
        active_visit = SiteAttendance.query.filter_by(employee_id=u.id, status='checked_in').first()
        if active_visit:
            status = 'online'
            status_text = f"On Duty ({active_visit.site.site_name if active_visit.site else 'Site'})"
        else:
            checked_in_today = SiteAttendance.query.filter(
                SiteAttendance.employee_id == u.id,
                SiteAttendance.check_in_time >= start_of_today
            ).first()
            if checked_in_today:
                status = 'away'
                status_text = 'Away'
            else:
                status = 'offline'
                status_text = 'Offline'
                
        user_list.append({
            'id': u.id,
            'name': u.name,
            'email': u.email,
            'department': u.department,
            'designation': u.designation,
            'photo_data': u.photo_data,
            'status': status,
            'status_text': status_text
        })
        
    return jsonify({"users": user_list}), 200

@employee_bp.route('/team-chat/messages', methods=['GET', 'POST'])
@token_required
def team_chat_messages():
    if request.method == 'GET':
        recipient_id = request.args.get('user_id')
        if recipient_id and recipient_id != 'null':
            recipient_id = int(recipient_id)
            messages = TeamMessage.query.filter(
                ((TeamMessage.sender_id == g.current_user.id) & (TeamMessage.receiver_id == recipient_id)) |
                ((TeamMessage.sender_id == recipient_id) & (TeamMessage.receiver_id == g.current_user.id))
            ).order_by(TeamMessage.timestamp.asc()).all()
        else:
            messages = TeamMessage.query.filter(TeamMessage.receiver_id == None).order_by(TeamMessage.timestamp.asc()).all()
            
        return jsonify({"messages": [m.to_dict() for m in messages]}), 200
        
    elif request.method == 'POST':
        data = request.get_json() or {}
        msg_text = data.get('message', '').strip()
        receiver_id = data.get('receiver_id')
        
        if receiver_id == 'null' or receiver_id == '' or receiver_id is None:
            receiver_id = None
        else:
            receiver_id = int(receiver_id)
            
        attachment_name = data.get('attachment_name')
        attachment_data = data.get('attachment_data')
        
        if not msg_text and not attachment_data:
            return jsonify({"error": "Message content or attachment required"}), 400
            
        msg = TeamMessage(
            sender_id=g.current_user.id,
            receiver_id=receiver_id,
            message=msg_text,
            timestamp=datetime.utcnow(),
            attachment_name=attachment_name,
            attachment_data=attachment_data
        )
        db.session.add(msg)
        db.session.commit()
        
        return jsonify({"message": "Message sent successfully", "record": msg.to_dict()}), 201

def register_routes(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(employee_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(chat_bp)

    @app.route("/api/site/checkin", methods=["POST"])
    @token_required
    def site_checkin():
        data = request.get_json() or {}
        try:
            user_lat = float(data.get("lat"))
            user_lng = float(data.get("lng"))
        except (TypeError, ValueError):
            return jsonify({"error": "Latitude and longitude are required and must be numbers"}), 400

        accuracy = float(data.get("accuracy", 0))
        site_id = data.get("site_id")

        if not site_id:
            return jsonify({"error": "site_id is required"}), 400

        if accuracy > 100:
            return jsonify({"error": f"GPS accuracy is too poor ({round(accuracy, 1)}m). Please stand in an open space and try again."}), 400

        site = db.session.get(Site, site_id)
        if not site:
            return jsonify({"error": "Site not found."}), 404
        if not site.active:
            return jsonify({"error": "Site is inactive."}), 400

        distance = haversine_m(user_lat, user_lng, site.latitude, site.longitude)
        if distance > site.radius_meters:
            return jsonify({"error": f"You are outside the allowed site area. (Distance: {round(distance, 1)}m, Allowed Radius: {site.radius_meters}m)"}), 403

        existing = SiteAttendance.query.filter_by(employee_id=g.current_user.id, status='checked_in').first()
        if existing:
            return jsonify({"error": f"You are already checked in at '{existing.site.site_name}'. Please check out first."}), 400

        record = SiteAttendance(
            employee_id=g.current_user.id,
            site_id=site_id,
            check_in_time=datetime.utcnow(),
            check_in_lat=user_lat,
            check_in_lng=user_lng,
            status='checked_in'
        )
        db.session.add(record)
        db.session.commit()
        return jsonify({"message": "Check-in successful", "record": record.to_dict()}), 200

    @app.route("/api/site/checkout", methods=["POST"])
    @token_required
    def site_checkout():
        data = request.get_json() or {}
        try:
            user_lat = float(data.get("lat"))
            user_lng = float(data.get("lng"))
        except (TypeError, ValueError):
            return jsonify({"error": "Latitude and longitude are required and must be numbers"}), 400

        accuracy = float(data.get("accuracy", 0))
        site_id = data.get("site_id")

        if not site_id:
            return jsonify({"error": "site_id is required"}), 400

        if accuracy > 100:
            return jsonify({"error": f"GPS accuracy is too poor ({round(accuracy, 1)}m). Please stand in an open space and try again."}), 400

        site = db.session.get(Site, site_id)
        if not site:
            return jsonify({"error": "Site not found."}), 404

        record = SiteAttendance.query.filter_by(employee_id=g.current_user.id, site_id=site_id, status='checked_in').first()
        if not record:
            return jsonify({"error": "You are not checked in to this site."}), 400

        distance = haversine_m(user_lat, user_lng, site.latitude, site.longitude)
        if distance > site.radius_meters:
            return jsonify({"error": f"You are outside the allowed site area to check out. (Distance: {round(distance, 1)}m, Allowed Radius: {site.radius_meters}m)"}), 403

        record.check_out_time = datetime.utcnow()
        record.check_out_lat = user_lat
        record.check_out_lng = user_lng
        record.status = 'checked_out'
        db.session.commit()
        return jsonify({"message": "Check-out successful", "record": record.to_dict()}), 200
