import pytest
from backend.app import create_app
from backend.database import get_db

@pytest.fixture
def app():
    """Create and configure a new app instance for each test."""
    # Create the app with test config
    app = create_app({
        'TESTING': True,
        'SECRET_KEY': 'test',
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:', # Though we don't strictly use sqlalchemy yet, we can keep it
    })
    
    # Push an application context to allow db initialization
    with app.app_context():
        # Initialize the test database
        from backend.database import init_db
        init_db()
        
    yield app

@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()
