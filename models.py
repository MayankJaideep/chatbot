from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class Employee(db.Model):
    __tablename__ = 'employees'
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.String(20), unique=True, nullable=False)  # e.g. EMP001
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    department = db.Column(db.String(80), default='General')
    designation = db.Column(db.String(100), default='Employee')
    phone = db.Column(db.String(20))
    role = db.Column(db.String(20), default='employee')  # 'employee' or 'admin'
    is_active = db.Column(db.Boolean, default=True)
    leave_balance = db.Column(db.Integer, default=15)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    attendances = db.relationship('Attendance', backref='employee', lazy=True, foreign_keys='Attendance.employee_id')
    leaves = db.relationship('Leave', backref='employee', lazy=True, foreign_keys='Leave.employee_id')
    tasks = db.relationship('Task', backref='assignee', lazy=True, foreign_keys='Task.assigned_to')
    tickets = db.relationship('Ticket', backref='employee', lazy=True, foreign_keys='Ticket.employee_id')
    notifications = db.relationship('Notification', backref='employee', lazy=True, foreign_keys='Notification.employee_id')
    chat_history = db.relationship('ChatHistory', backref='employee', lazy=True, foreign_keys='ChatHistory.employee_id')
    client_visits = db.relationship('ClientVisit', backref='employee', lazy=True, foreign_keys='ClientVisit.employee_id')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'employee_id': self.employee_id,
            'name': self.name,
            'email': self.email,
            'department': self.department,
            'designation': self.designation,
            'phone': self.phone,
            'role': self.role,
            'is_active': self.is_active,
            'leave_balance': self.leave_balance,
            'created_at': self.created_at.isoformat() + 'Z'
        }


class Attendance(db.Model):
    __tablename__ = 'attendances'
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employees.id'), nullable=False)
    date = db.Column(db.Date, default=date.today, nullable=False)
    check_in = db.Column(db.DateTime)
    check_out = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='present')  # present, absent, half-day
    hours_worked = db.Column(db.Float, default=0.0)
    notes = db.Column(db.Text)

    def to_dict(self):
        return {
            'id': self.id,
            'employee_id': self.employee_id,
            'employee_name': self.employee.name if self.employee else None,
            'date': self.date.isoformat(),
            'check_in': self.check_in.isoformat() + 'Z' if self.check_in else None,
            'check_out': self.check_out.isoformat() + 'Z' if self.check_out else None,
            'status': self.status,
            'hours_worked': self.hours_worked
        }


class Leave(db.Model):
    __tablename__ = 'leaves'
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employees.id'), nullable=False)
    leave_type = db.Column(db.String(50), nullable=False)  # sick, casual, annual, emergency
    from_date = db.Column(db.Date, nullable=False)
    to_date = db.Column(db.Date, nullable=False)
    days = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected
    applied_on = db.Column(db.DateTime, default=datetime.utcnow)
    reviewed_by = db.Column(db.Integer, db.ForeignKey('employees.id'))
    reviewed_on = db.Column(db.DateTime)
    admin_comment = db.Column(db.Text)
    via_chatbot = db.Column(db.Boolean, default=False)

    reviewer = db.relationship('Employee', foreign_keys=[reviewed_by], lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'employee_id': self.employee_id,
            'employee_name': self.employee.name if self.employee else None,
            'leave_type': self.leave_type,
            'from_date': self.from_date.isoformat(),
            'to_date': self.to_date.isoformat(),
            'days': self.days,
            'reason': self.reason,
            'status': self.status,
            'applied_on': self.applied_on.isoformat() + 'Z',
            'admin_comment': self.admin_comment,
            'via_chatbot': self.via_chatbot
        }


class Task(db.Model):
    __tablename__ = 'tasks'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    assigned_to = db.Column(db.Integer, db.ForeignKey('employees.id'))
    assigned_by = db.Column(db.Integer, db.ForeignKey('employees.id'))
    priority = db.Column(db.String(20), default='medium')  # low, medium, high, urgent
    status = db.Column(db.String(30), default='pending')  # pending, in_progress, completed, cancelled
    due_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    progress = db.Column(db.Integer, default=0)
    notes = db.Column(db.Text)

    creator = db.relationship('Employee', foreign_keys=[assigned_by], lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'assigned_to': self.assigned_to,
            'assignee_name': self.assignee.name if self.assignee else None,
            'assigned_by': self.assigned_by,
            'priority': self.priority,
            'status': self.status,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'created_at': self.created_at.isoformat() + 'Z',
            'progress': self.progress,
            'notes': self.notes
        }


class Ticket(db.Model):
    __tablename__ = 'tickets'
    id = db.Column(db.Integer, primary_key=True)
    ticket_number = db.Column(db.String(20), unique=True, nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey('employees.id'), nullable=False)
    category = db.Column(db.String(80), nullable=False)  # IT, HR, Finance, Admin, Facilities
    subject = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    priority = db.Column(db.String(20), default='medium')
    status = db.Column(db.String(30), default='open')  # open, in_progress, resolved, closed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved_at = db.Column(db.DateTime)
    assigned_to = db.Column(db.Integer, db.ForeignKey('employees.id'))
    resolution_notes = db.Column(db.Text)
    via_chatbot = db.Column(db.Boolean, default=False)

    assigned_agent = db.relationship('Employee', foreign_keys=[assigned_to], lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'ticket_number': self.ticket_number,
            'employee_id': self.employee_id,
            'employee_name': self.employee.name if self.employee else None,
            'category': self.category,
            'subject': self.subject,
            'description': self.description,
            'priority': self.priority,
            'status': self.status,
            'created_at': self.created_at.isoformat() + 'Z',
            'resolved_at': self.resolved_at.isoformat() + 'Z' if self.resolved_at else None,
            'via_chatbot': self.via_chatbot
        }


class ChatHistory(db.Model):
    __tablename__ = 'chat_history'
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employees.id'), nullable=False)
    session_id = db.Column(db.String(64), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'user' or 'assistant'
    message = db.Column(db.Text, nullable=False)
    intent = db.Column(db.String(80))
    action_taken = db.Column(db.String(200))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'employee_id': self.employee_id,
            'session_id': self.session_id,
            'role': self.role,
            'message': self.message,
            'intent': self.intent,
            'action_taken': self.action_taken,
            'timestamp': self.timestamp.isoformat() + 'Z'
        }


class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employees.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(50), default='info')  # info, success, warning, danger
    is_read = db.Column(db.Boolean, default=False)
    link = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'employee_id': self.employee_id,
            'title': self.title,
            'message': self.message,
            'type': self.type,
            'is_read': self.is_read,
            'link': self.link,
            'created_at': self.created_at.isoformat() + 'Z'
        }


class ClientVisit(db.Model):
    __tablename__ = 'client_visits'
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employees.id'), nullable=False)
    client_name = db.Column(db.String(150), nullable=False)
    check_in_latitude = db.Column(db.Float)
    check_in_longitude = db.Column(db.Float)
    check_out_latitude = db.Column(db.Float)
    check_out_longitude = db.Column(db.Float)
    check_in_time = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    check_out_time = db.Column(db.DateTime)
    hours_at_location = db.Column(db.Float, default=0.0)

    def to_dict(self):
        return {
            'id': self.id,
            'employee_id': self.employee_id,
            'employee_name': self.employee.name if self.employee else None,
            'client_name': self.client_name,
            'check_in_latitude': self.check_in_latitude,
            'check_in_longitude': self.check_in_longitude,
            'check_out_latitude': self.check_out_latitude,
            'check_out_longitude': self.check_out_longitude,
            'check_in_time': self.check_in_time.isoformat() + 'Z' if self.check_in_time else None,
            'check_out_time': self.check_out_time.isoformat() + 'Z' if self.check_out_time else None,
            'hours_at_location': self.hours_at_location
        }


class Site(db.Model):
    __tablename__ = 'sites'
    id = db.Column(db.Integer, primary_key=True)
    site_name = db.Column(db.String(150), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    radius_meters = db.Column(db.Float, default=100.0)
    client_name = db.Column(db.String(150))
    active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id,
            'site_name': self.site_name,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'radius_meters': self.radius_meters,
            'client_name': self.client_name,
            'active': self.active
        }


class SiteAttendance(db.Model):
    __tablename__ = 'site_attendances'
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employees.id'), nullable=False)
    site_id = db.Column(db.Integer, db.ForeignKey('sites.id'), nullable=False)
    check_in_time = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    check_in_lat = db.Column(db.Float, nullable=False)
    check_in_lng = db.Column(db.Float, nullable=False)
    check_out_time = db.Column(db.DateTime)
    check_out_lat = db.Column(db.Float)
    check_out_lng = db.Column(db.Float)
    status = db.Column(db.String(50), default='checked_in')

    employee = db.relationship('Employee', backref=db.backref('site_attendances', lazy=True))
    site = db.relationship('Site', backref=db.backref('attendances', lazy=True))

    def to_dict(self):
        return {
            'id': self.id,
            'employee_id': self.employee_id,
            'employee_name': self.employee.name if self.employee else None,
            'site_id': self.site_id,
            'site_name': self.site.site_name if self.site else None,
            'client_name': f"{self.site.client_name} - {self.site.site_name}" if self.site else "Unknown",
            'check_in_latitude': self.check_in_lat,
            'check_in_longitude': self.check_in_lng,
            'check_out_latitude': self.check_out_lat,
            'check_out_longitude': self.check_out_lng,
            'check_in_time': self.check_in_time.isoformat() + 'Z' if self.check_in_time else None,
            'check_out_time': self.check_out_time.isoformat() + 'Z' if self.check_out_time else None,
            'hours_at_location': round((self.check_out_time - self.check_in_time).total_seconds() / 3600, 2) if self.check_out_time else None,
            'status': self.status
        }


