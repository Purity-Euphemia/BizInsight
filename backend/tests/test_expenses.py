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

def test_add_expense(auth_client, app):
    client, b_id = auth_client
    
    res = client.post('/expenses/api', json={
        'title': 'Office Rent',
        'amount': 1500.00,
        'category': 'Rent',
        'expense_date': '2023-01-01'
    })
    assert res.status_code == 201
    
    with app.app_context():
        e = get_db().execute("SELECT * FROM expenses WHERE title = 'Office Rent'").fetchone()
        assert e is not None
        assert e['amount'] == 1500.00
        assert e['category'] == 'Rent'
        assert e['business_id'] == b_id

def test_add_expense_validation(auth_client):
    client, _ = auth_client
    
    # Missing title
    res = client.post('/expenses/api', json={'amount': 100, 'expense_date': '2023-01-01'})
    assert res.status_code == 400
    
    # Negative amount
    res = client.post('/expenses/api', json={'title': 'Test', 'amount': -50, 'expense_date': '2023-01-01'})
    assert res.status_code == 400
    assert 'negative' in res.json['error'].lower()

def test_get_expenses(auth_client):
    client, b_id = auth_client
    
    client.post('/expenses/api', json={'title': 'E1', 'amount': 10, 'expense_date': '2023-01-02'})
    client.post('/expenses/api', json={'title': 'E2', 'amount': 20, 'expense_date': '2023-01-01'})
    
    res = client.get('/expenses/api')
    assert res.status_code == 200
    assert len(res.json) == 2
    # Should be ordered by date DESC
    assert res.json[0]['title'] == 'E1'
    assert res.json[1]['title'] == 'E2'

def test_update_expense(auth_client, app):
    client, b_id = auth_client
    
    client.post('/expenses/api', json={'title': 'Old', 'amount': 10, 'expense_date': '2023-01-01'})
    with app.app_context():
        e_id = get_db().execute("SELECT id FROM expenses WHERE title = 'Old'").fetchone()[0]
        
    res = client.put(f'/expenses/api/{e_id}', json={'title': 'New', 'amount': 15, 'expense_date': '2023-01-02', 'category': 'Other'})
    assert res.status_code == 200
    
    with app.app_context():
        e = get_db().execute("SELECT * FROM expenses WHERE id = ?", (e_id,)).fetchone()
        assert e['title'] == 'New'
        assert e['amount'] == 15.0

def test_delete_expense(auth_client, app):
    client, b_id = auth_client
    
    client.post('/expenses/api', json={'title': 'ToDelete', 'amount': 10, 'expense_date': '2023-01-01'})
    with app.app_context():
        e_id = get_db().execute("SELECT id FROM expenses WHERE title = 'ToDelete'").fetchone()[0]
        
    res = client.delete(f'/expenses/api/{e_id}')
    assert res.status_code == 200
    
    with app.app_context():
        e = get_db().execute("SELECT * FROM expenses WHERE id = ?", (e_id,)).fetchone()
        assert e is None
