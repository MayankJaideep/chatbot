import jwt
import os
import functools
from datetime import datetime, timezone, timedelta
from flask import request, jsonify, g
from models import db

def _secret():
    return os.environ.get('SECRET_KEY', 'enterprise_ai_super_secret_2024')

def generate_token(employee_id: int, role: str) -> str:
    payload = {
        'sub': str(employee_id),
        'role': role,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(hours=8)
    }
    return jwt.encode(payload, _secret(), algorithm='HS256')

def decode_token(token: str):
    return jwt.decode(token, _secret(), algorithms=['HS256'])

def _get_auth_user(admin_only=False):
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.split(' ', 1)[1] if auth_header.startswith('Bearer ') else request.cookies.get('access_token')
    if not token:
        return {'error': 'Authentication token required'}, 401
    try:
        data = decode_token(token)
        from models import Employee
        emp = db.session.get(Employee, int(data['sub']))
        if not emp or not emp.is_active:
            return {'error': 'Invalid or inactive account'}, 401
        if admin_only and emp.role != 'admin':
            return {'error': 'Admin privileges required'}, 403
        g.current_user = emp
        return None
    except jwt.ExpiredSignatureError:
        return {'error': 'Token expired, please login again'}, 401
    except jwt.InvalidTokenError as e:
        return {'error': f'Invalid token: {e}'}, 401
    except Exception as e:
        print(f'[auth] DB error: {type(e).__name__}: {e}')
        return {'error': 'Server error during auth'}, 500

def token_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        err = _get_auth_user(admin_only=False)
        if err:
            return jsonify(err[0]), err[1]
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        err = _get_auth_user(admin_only=True)
        if err:
            return jsonify(err[0]), err[1]
        return f(*args, **kwargs)
    return decorated

def add_notification(db, employee_id, title, message, ntype='info', link=None):
    from models import Notification
    n = Notification(employee_id=employee_id, title=title, message=message, type=ntype, link=link)
    db.session.add(n)
    db.session.commit()
