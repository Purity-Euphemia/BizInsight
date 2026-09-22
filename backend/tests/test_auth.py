import pytest
from backend.database import get_db

def test_register(client, app):
    # Test that viewing the page works
    assert client.get('/auth/register').status_code == 200
    
    # Test that registering a user works
    response = client.post(
        '/auth/register', data={'username': 'a', 'password': 'a', 'business_name': 'My Business'}
    )
    assert response.headers["Location"] == "/auth/login"

    # Verify that the user and business were inserted into the database
    with app.app_context():
        db = get_db()
        business = db.execute("SELECT * FROM businesses WHERE name = 'My Business'").fetchone()
        assert business is not None
        
        user = db.execute("SELECT * FROM users WHERE username = 'a'").fetchone()
        assert user is not None
        assert user['business_id'] == business['id']

@pytest.mark.parametrize(('username', 'password', 'business_name', 'message'), (
    ('', 'a', 'Biz', b'Username is required.'),
    ('a', '', 'Biz', b'Password is required.'),
    ('a', 'a', '', b'Business name is required.'),
    ('test', 'test', 'Biz', b'already registered'),
))
def test_register_validate_input(client, username, password, business_name, message, app):
    # First create the user 'test' so we can test duplicate usernames
    if message == b'already registered':
        with app.app_context():
            db = get_db()
            db.execute("INSERT INTO businesses (name) VALUES ('x')")
            b_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            db.execute(
                "INSERT INTO users (username, password_hash, business_id) VALUES ('test', 'hash', ?)", 
                (b_id,)
            )
            db.commit()
            
    response = client.post(
        '/auth/register',
        data={'username': username, 'password': password, 'business_name': business_name}
    )
    assert message in response.data

def test_login(client, app):
    # Setup user
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO businesses (name) VALUES ('Biz')")
        b_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        # use generate_password_hash in actual code, this is simplified for tests unless we import it
        from werkzeug.security import generate_password_hash
        db.execute(
            "INSERT INTO users (username, password_hash, business_id) VALUES ('test', ?, ?)", 
            (generate_password_hash('test'), b_id)
        )
        db.commit()

    # Test login page
    assert client.get('/auth/login').status_code == 200
    
    # Test logging in
    response = client.post(
        '/auth/login', data={'username': 'test', 'password': 'test'}
    )
    assert response.headers["Location"] == "/dashboard"

    # Test session is set
    with client:
        client.get('/')
        from flask import session
        assert session['user_id'] == 1

@pytest.mark.parametrize(('username', 'password', 'message'), (
    ('a', 'test', b'Incorrect username.'),
    ('test', 'a', b'Incorrect password.'),
))
def test_login_validate_input(client, username, password, message, app):
    # Setup user
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO businesses (name) VALUES ('Biz')")
        b_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        from werkzeug.security import generate_password_hash
        db.execute(
            "INSERT INTO users (username, password_hash, business_id) VALUES ('test', ?, ?)", 
            (generate_password_hash('test'), b_id)
        )
        db.commit()
        
    response = client.post(
        '/auth/login',
        data={'username': username, 'password': password}
    )
    assert message in response.data

def test_logout(client, app):
    # Set up session directly for testing logout
    with client.session_transaction() as sess:
        sess['user_id'] = 1

    response = client.get('/auth/logout')
    assert response.headers["Location"] == "/"
    
    with client.session_transaction() as sess:
        assert 'user_id' not in sess

def test_dashboard_login_required(client):
    # Dashboard should redirect to login if not authenticated
    response = client.get('/dashboard')
    assert response.headers["Location"] == "/auth/login"
