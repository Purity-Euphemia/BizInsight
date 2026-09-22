import pytest
from backend.database import get_db

@pytest.fixture
def auth_client(client, app):
    """A client logged in to a test business with some products."""
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO businesses (name) VALUES ('Test Biz')")
        b_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        from werkzeug.security import generate_password_hash
        db.execute(
            "INSERT INTO users (username, password_hash, business_id) VALUES ('user1', ?, ?)",
            (generate_password_hash('pass'), b_id)
        )
        
        # Product 1: 10 in stock, $15.00
        db.execute(
            "INSERT INTO products (business_id, name, selling_price, quantity) VALUES (?, 'P1', 15.0, 10)",
            (b_id,)
        )
        p1_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        # Product 2: 5 in stock, $5.00
        db.execute(
            "INSERT INTO products (business_id, name, selling_price, quantity) VALUES (?, 'P2', 5.0, 5)",
            (b_id,)
        )
        p2_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        db.commit()

    client.post('/auth/login', data={'username': 'user1', 'password': 'pass'})
    return client, b_id, p1_id, p2_id

def test_successful_checkout(auth_client, app):
    client, b_id, p1_id, p2_id = auth_client
    
    # Buy 2 of P1 and 1 of P2
    payload = {
        'payment_method': 'Cash',
        'items': [
            {'product_id': p1_id, 'quantity': 2},
            {'product_id': p2_id, 'quantity': 1}
        ]
    }
    
    res = client.post('/sales/api/checkout', json=payload)
    assert res.status_code == 200
    
    data = res.json
    assert data['success'] is True
    assert data['total_amount'] == 35.0 # (2*15) + (1*5)
    
    sale_id = data['sale_id']
    
    # Verify DB state
    with app.app_context():
        db = get_db()
        
        # Check sales table
        sale = db.execute("SELECT * FROM sales WHERE id = ?", (sale_id,)).fetchone()
        assert sale['total_amount'] == 35.0
        assert sale['payment_method'] == 'Cash'
        
        # Check sale_items
        items = db.execute("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY product_id", (sale_id,)).fetchall()
        assert len(items) == 2
        assert items[0]['product_id'] == p1_id
        assert items[0]['quantity'] == 2
        assert items[0]['subtotal'] == 30.0
        
        # Check inventory deduction
        p1 = db.execute("SELECT quantity FROM products WHERE id = ?", (p1_id,)).fetchone()
        assert p1['quantity'] == 8 # 10 - 2
        
        # Check inventory transactions ledger
        tx = db.execute("SELECT * FROM inventory_transactions WHERE product_id = ?", (p1_id,)).fetchone()
        assert tx['transaction_type'] == 'OUT'
        assert tx['quantity'] == 2
        assert f"Sale #{sale_id}" in tx['reference']

def test_checkout_insufficient_stock(auth_client, app):
    client, b_id, p1_id, p2_id = auth_client
    
    # P2 only has 5 in stock, try to buy 6
    payload = {
        'items': [
            {'product_id': p2_id, 'quantity': 6}
        ]
    }
    
    res = client.post('/sales/api/checkout', json=payload)
    assert res.status_code == 400
    assert 'Insufficient stock' in res.json['error']
    
    # Verify NO deduction occurred (transaction rolled back)
    with app.app_context():
        p2 = get_db().execute("SELECT quantity FROM products WHERE id = ?", (p2_id,)).fetchone()
        assert p2['quantity'] == 5 # Still 5

def test_checkout_empty_cart(auth_client):
    client, *_ = auth_client
    res = client.post('/sales/api/checkout', json={'items': []})
    assert res.status_code == 400

def test_checkout_negative_quantity(auth_client):
    client, b_id, p1_id, _ = auth_client
    res = client.post('/sales/api/checkout', json={'items': [{'product_id': p1_id, 'quantity': -2}]})
    assert res.status_code == 400

def test_sales_history(auth_client):
    client, b_id, p1_id, _ = auth_client
    
    # Make 2 sales
    client.post('/sales/api/checkout', json={'items': [{'product_id': p1_id, 'quantity': 1}]})
    client.post('/sales/api/checkout', json={'items': [{'product_id': p1_id, 'quantity': 2}]})
    
    res = client.get('/sales/api/history')
    assert res.status_code == 200
    assert len(res.json) == 2

def test_sale_details(auth_client):
    client, b_id, p1_id, _ = auth_client
    
    res = client.post('/sales/api/checkout', json={'items': [{'product_id': p1_id, 'quantity': 1}]})
    sale_id = res.json['sale_id']
    
    res2 = client.get(f'/sales/api/{sale_id}')
    assert res2.status_code == 200
    assert res2.json['sale']['id'] == sale_id
    assert len(res2.json['items']) == 1
    assert res2.json['items'][0]['product_id'] == p1_id
