import os
from app import app
from models import db

def run_migration():
    print("Running migration to add manager_id column to employees table...")
    with app.app_context():
        # Check database engine
        engine_name = db.engine.url.drivername
        print(f"Database dialect/driver: {engine_name}")
        
        try:
            # Check if manager_id column already exists
            db.session.execute(db.text("SELECT manager_id FROM employees LIMIT 1"))
            print("Column manager_id already exists in employees table. No migration needed.")
        except Exception:
            # Column does not exist, need to add it
            print("Adding manager_id column to employees table...")
            db.session.rollback()
            
            if 'sqlite' in engine_name:
                # SQLite doesn't support adding foreign key constraints easily in ALTER TABLE, 
                # but we can add the column itself.
                db.session.execute(db.text("ALTER TABLE employees ADD COLUMN manager_id INTEGER REFERENCES employees(id)"))
            else:
                # MySQL / standard SQL
                try:
                    db.session.execute(db.text("ALTER TABLE employees ADD COLUMN manager_id INT NULL"))
                    db.session.execute(db.text("ALTER TABLE employees ADD CONSTRAINT fk_employee_manager FOREIGN KEY (manager_id) REFERENCES employees(id)"))
                except Exception as e:
                    print(f"MySQL ALTER error (might already exist/altered): {e}")
                    db.session.rollback()
                    return
                
            db.session.commit()
            print("Successfully added manager_id column.")

if __name__ == '__main__':
    run_migration()
