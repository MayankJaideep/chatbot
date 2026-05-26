import os
from dotenv import load_dotenv
load_dotenv()  # Must be first — so SECRET_KEY is in env before utils.py reads it

from flask import Flask, send_from_directory
from flask_cors import CORS
from models import db
from routes import register_routes

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'enterprise_ai_super_secret_2024')

# Use absolute path for SQLite so it works regardless of CWD
_BASE_DIR = os.path.abspath(os.path.dirname(__file__))
_DEFAULT_DB = 'sqlite:///' + os.path.join(_BASE_DIR, 'office_assistant.db')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', _DEFAULT_DB)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_SORT_KEYS'] = False

CORS(app, resources={r"/api/*": {"origins": "*"}})
db.init_app(app)
register_routes(app)

# Serve frontend
@app.route('/')
@app.route('/<path:path>')
def serve_frontend(path=''):
    if path and path.startswith('api/'):
        return {'error': 'Not found'}, 404
    return send_from_directory('templates', 'index.html')

@app.errorhandler(404)
def not_found(e):
    return {'error': 'Not found'}, 404

@app.errorhandler(500)
def server_error(e):
    return {'error': 'Internal server error'}, 500


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        # Seed admin
        from models import Employee
        if not Employee.query.filter_by(email='admin@company.com').first():
            admin = Employee(
                employee_id='EMP001',
                name='Admin User',
                email='admin@company.com',
                department='Administration',
                designation='System Administrator',
                role='admin'
            )
            admin.set_password('Admin@123')
            db.session.add(admin)

        if not Employee.query.filter_by(email='john.doe@company.com').first():
            emp = Employee(
                employee_id='EMP002',
                name='John Doe',
                email='john.doe@company.com',
                department='Engineering',
                designation='Software Engineer',
                phone='+91 9876543210',
                leave_balance=15
            )
            emp.set_password('Emp@1234')
            db.session.add(emp)

        if not Employee.query.filter_by(email='priya.sharma@company.com').first():
            emp2 = Employee(
                employee_id='EMP003',
                name='Priya Sharma',
                email='priya.sharma@company.com',
                department='Human Resources',
                designation='HR Executive',
                phone='+91 9123456780',
                leave_balance=12
            )
            emp2.set_password('Emp@1234')
            db.session.add(emp2)

        db.session.commit()
        print("\n✅ Database ready. Demo accounts:")
        print("   Admin : admin@company.com / Admin@123")
        print("   Emp 1 : john.doe@company.com / Emp@1234")
        print("   Emp 2 : priya.sharma@company.com / Emp@1234\n")

    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, host='0.0.0.0', port=port)
