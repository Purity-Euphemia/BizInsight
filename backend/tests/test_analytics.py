import pytest
from backend.database import get_db

@pytest.fixture
def auth_client(client, app):
    """A client logged in to a test business with some mock data."""
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO businesses (name) VALUES ('Test Biz')")
        b_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        from werkzeug.security import generate_password_hash
        db.execute(
            "INSERT INTO users (username, password_hash, business_id) VALUES ('user1', ?, ?)",
            (generate_password_hash('pass'), b_id)
        )
        
        # Insert Sales across a few days
        db.execute("INSERT INTO sales (business_id, total_amount, payment_method, created_at) VALUES (?, 100.0, 'Cash', date('now', '-2 days'))", (b_id,))
        db.execute("INSERT INTO sales (business_id, total_amount, payment_method, created_at) VALUES (?, 150.0, 'Cash', date('now', '-2 days'))", (b_id,))
        db.execute("INSERT INTO sales (business_id, total_amount, payment_method, created_at) VALUES (?, 50.0, 'Card', date('now', '-1 days'))", (b_id,))
        
        # Insert Expenses across categories
        db.execute("INSERT INTO expenses (business_id, title, amount, category, expense_date) VALUES (?, 'Rent', 500.0, 'Rent', date('now', '-5 days'))", (b_id,))
        db.execute("INSERT INTO expenses (business_id, title, amount, category, expense_date) VALUES (?, 'Water', 50.0, 'Utilities', date('now', '-5 days'))", (b_id,))
        db.execute("INSERT INTO expenses (business_id, title, amount, category, expense_date) VALUES (?, 'Power', 100.0, 'Utilities', date('now', '-4 days'))", (b_id,))
        
        db.commit()

    client.post('/auth/login', data={'username': 'user1', 'password': 'pass'})
    return client

def test_sales_trend(auth_client):
    res = auth_client.get('/analytics/api/sales-trend')
    assert res.status_code == 200
    data = res.json
    
    assert len(data['labels']) == 30
    assert len(data['data']) == 30
    
    # Check that there is a day with 250 (100 + 150) and a day with 50
    assert 250.0 in data['data']
    assert 50.0 in data['data']

def test_expense_breakdown(auth_client):
    res = auth_client.get('/analytics/api/expense-breakdown')
    assert res.status_code == 200
    data = res.json
    
    labels = data['labels']
    amounts = data['data']
    
    assert 'Rent' in labels
    assert 'Utilities' in labels
    
    rent_idx = labels.index('Rent')
    utils_idx = labels.index('Utilities')
    
    assert amounts[rent_idx] == 500.0
    assert amounts[utils_idx] == 150.0 # 50 + 100

def test_profit_trend(auth_client):
    res = auth_client.get('/analytics/api/profit-trend')
    assert res.status_code == 200
    data = res.json
    
    assert len(data['labels']) > 0
    assert len(data['revenue']) > 0
    assert len(data['expenses']) > 0
    
    # Because we inserted into 'now' offsets, it should aggregate into the current month
    # Revenue = 300, Expenses = 650
    assert sum(data['revenue']) == 300.0
    assert sum(data['expenses']) == 650.0
