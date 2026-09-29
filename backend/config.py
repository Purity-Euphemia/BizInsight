import os

class Config:
    # Secret key for session management and security
    _env_secret = os.environ.get('SECRET_KEY')
    if os.environ.get('FLASK_ENV') == 'production' and not _env_secret:
        raise ValueError("No SECRET_KEY set for production environment")
    SECRET_KEY = _env_secret or 'dev-secret-key-change-in-production'

    # Session cookie security
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = os.environ.get('FLASK_ENV') == 'production'
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # SQLite database URI
    # This will create a file named bizinsight.db in the root directory
    basedir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'bizinsight.db')
    
    # Disable tracking modifications to save resources
    SQLALCHEMY_TRACK_MODIFICATIONS = False
