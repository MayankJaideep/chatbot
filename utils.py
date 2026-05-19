import jwt
import os
import functools
from datetime import datetime, timezone, timedelta
from flask import request, jsonify, g
from models import db

# Read SECRET_KEY at call-time, not import-time,
# so load_dotenv() in app.py always runs first.
def _secret():
    return os.environ.get('SECRET_KEY', 'enterprise_ai_super_secret_2024')


def generate_token(employee_id: int, role: str) -> str:
    payload = {
        'sub': str(employee_id),   # PyJWT 2.10+ requires sub to be a string
        'role': role,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(hours=8)
    }
    return jwt.encode(payload, _secret(), algorithm='HS256')


def decode_token(token: str):
    return jwt.decode(token, _secret(), algorithms=['HS256'])


def token_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]
        if not token:
            token = request.cookies.get('access_token')
        if not token:
            return jsonify({'error': 'Authentication token required'}), 401
        try:
            data = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired, please login again'}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({'error': f'Invalid token: {e}'}), 401
        try:
            from models import Employee
            emp_id = int(data['sub'])   # sub is stored as string, convert back to int
            emp = db.session.get(Employee, emp_id)
            if not emp or not emp.is_active:
                return jsonify({'error': 'Invalid or inactive account'}), 401
            g.current_user = emp
        except Exception as e:
            print(f'[token_required] DB error: {type(e).__name__}: {e}')
            return jsonify({'error': 'Server error during auth'}), 500
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]
        if not token:
            token = request.cookies.get('access_token')
        if not token:
            return jsonify({'error': 'Authentication required'}), 401
        try:
            data = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({'error': f'Invalid token: {e}'}), 401
        try:
            from models import Employee
            emp_id = int(data['sub'])   # sub is stored as string, convert back to int
            emp = db.session.get(Employee, emp_id)
            if not emp or not emp.is_active:
                return jsonify({'error': 'Invalid account'}), 401
            if emp.role != 'admin':
                return jsonify({'error': 'Admin privileges required'}), 403
            g.current_user = emp
        except Exception as e:
            print(f'[admin_required] DB error: {type(e).__name__}: {e}')
            return jsonify({'error': 'Server error during auth'}), 500
        return f(*args, **kwargs)
    return decorated


def add_notification(db, employee_id, title, message, ntype='info', link=None):
    from models import Notification
    n = Notification(employee_id=employee_id, title=title,
                     message=message, type=ntype, link=link)
    db.session.add(n)
    db.session.commit()
