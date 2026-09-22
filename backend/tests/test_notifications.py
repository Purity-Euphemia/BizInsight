import pytest
from backend.database import get_db

@pytest.fixture
def auth_client(client, app):
    """A client logged in to a test business."""
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO businesses (name) VALUES ('Test Biz')")
        b_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        from werkzeug.security import generate_password_hash
        db.execute(
            "INSERT INTO users (username, password_hash, business_id) VALUES ('user1', ?, ?)",
            (generate_password_hash('pass'), b_id)
        )
        db.commit()

    client.post('/auth/login', data={'username': 'user1', 'password': 'pass'})
    return client, b_id

def test_no_notifications(auth_client):
    client, _ = auth_client
    res = client.get('/notifications/api')
    assert res.status_code == 200
    assert len(res.json) == 0

def test_low_stock_notification(auth_client, app):
    client, b_id = auth_client
    
    with app.app_context():
        db = get_db()
        # Insert product with quantity < limit
        db.execute("INSERT INTO products (business_id, name, quantity, low_stock_limit) VALUES (?, 'Test Item', 2, 5)", (b_id,))
        db.commit()
        
    res = client.get('/notifications/api')
    assert res.status_code == 200
    
    data = res.json
    assert len(data) == 1
    assert data[0]['type'] == 'warning'
    assert 'Test Item' in data[0]['message']

def test_profit_warning_notification(auth_client, app):
    client, b_id = auth_client
    
    with app.app_context():
        db = get_db()
        # Insert expense to make net profit negative
        db.execute("INSERT INTO expenses (business_id, title, amount, expense_date) VALUES (?, 'Test Exp', 1000.0, date('now'))", (b_id,))
        db.commit()
        
    res = client.get('/notifications/api')
    assert res.status_code == 200
    
    data = res.json
    assert len(data) == 1
    assert data[0]['type'] == 'danger'
    assert 'loss' in data[0]['message']
