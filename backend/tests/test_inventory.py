import pytest
from backend.database import get_db

@pytest.fixture
def auth_client(client, app):
    """A client that is logged in to a test business with a product."""
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO businesses (name) VALUES ('Test Biz')")
        b_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        from werkzeug.security import generate_password_hash
        db.execute(
            "INSERT INTO users (username, password_hash, business_id) VALUES ('user1', ?, ?)",
            (generate_password_hash('pass'), b_id)
        )
        
        db.execute(
            "INSERT INTO products (business_id, name, quantity, low_stock_limit) VALUES (?, 'Test Item', 10, 5)",
            (b_id,)
        )
        p_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        db.commit()

    client.post('/auth/login', data={'username': 'user1', 'password': 'pass'})
    return client, b_id, p_id

def test_get_inventory(auth_client):
    client, b_id, p_id = auth_client
    
    res = client.get('/inventory/api')
    assert res.status_code == 200
    
    data = res.json
    assert data['total'] == 1
    assert len(data['products']) == 1
    assert data['products'][0]['name'] == 'Test Item'
    assert data['products'][0]['quantity'] == 10

def test_get_inventory_metrics(auth_client):
    client, b_id, p_id = auth_client
    
    res = client.get('/inventory/api/metrics')
    assert res.status_code == 200
    
    data = res.json
    assert data['total_products'] == 1
    assert data['low_stock'] == 0
    assert data['out_of_stock'] == 0

def test_adjust_stock_in(auth_client, app):
    client, b_id, p_id = auth_client
    
    res = client.post('/inventory/api/adjust', json={
        'product_id': p_id,
        'transaction_type': 'IN',
        'quantity': 5,
        'reference': 'Restock'
    })
    
    assert res.status_code == 200
    assert res.json['new_quantity'] == 15
    
    with app.app_context():
        db = get_db()
        p = db.execute("SELECT quantity FROM products WHERE id = ?", (p_id,)).fetchone()
        assert p['quantity'] == 15
        
        tx = db.execute("SELECT * FROM inventory_transactions WHERE product_id = ?", (p_id,)).fetchone()
        assert tx['transaction_type'] == 'IN'
        assert tx['quantity'] == 5
        assert tx['previous_stock'] == 10
        assert tx['new_stock'] == 15
        assert tx['reference'] == 'Restock'

def test_adjust_stock_out(auth_client, app):
    client, b_id, p_id = auth_client
    
    res = client.post('/inventory/api/adjust', json={
        'product_id': p_id,
        'transaction_type': 'OUT',
        'quantity': 4,
        'reference': 'Sale'
    })
    
    assert res.status_code == 200
    assert res.json['new_quantity'] == 6

def test_adjust_stock_insufficient(auth_client):
    client, b_id, p_id = auth_client
    
    # Product only has 10, try to remove 15
    res = client.post('/inventory/api/adjust', json={
        'product_id': p_id,
        'transaction_type': 'OUT',
        'quantity': 15,
        'reference': 'Sale'
    })
    
    assert res.status_code == 400
    assert 'Insufficient stock' in res.json['error']

def test_adjust_stock_invalid_inputs(auth_client):
    client, b_id, p_id = auth_client
    
    # Negative quantity
    res = client.post('/inventory/api/adjust', json={
        'product_id': p_id,
        'transaction_type': 'IN',
        'quantity': -5
    })
    assert res.status_code == 400
    
    # Invalid transaction type
    res = client.post('/inventory/api/adjust', json={
        'product_id': p_id,
        'transaction_type': 'MAGIC',
        'quantity': 5
    })
    assert res.status_code == 400

def test_adjust_stock_security(client, app):
    """Test that a user cannot adjust a product that belongs to another business."""
    with app.app_context():
        db = get_db()
        
        # Biz 1
        db.execute("INSERT INTO businesses (name) VALUES ('Biz 1')")
        b1_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        db.execute("INSERT INTO products (business_id, name, quantity) VALUES (?, 'P1', 10)", (b1_id,))
        p1_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        # Biz 2
        db.execute("INSERT INTO businesses (name) VALUES ('Biz 2')")
        b2_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        from werkzeug.security import generate_password_hash
        db.execute("INSERT INTO users (username, password_hash, business_id) VALUES ('user2', ?, ?)", (generate_password_hash('pass'), b2_id))
        
        db.commit()

    # Login as User 2
    client.post('/auth/login', data={'username': 'user2', 'password': 'pass'})
    
    # User 2 tries to adjust User 1's product (P1)
    res = client.post('/inventory/api/adjust', json={
        'product_id': p1_id,
        'transaction_type': 'IN',
        'quantity': 5
    })
    
    assert res.status_code == 404
    assert 'Product not found' in res.json['error']
