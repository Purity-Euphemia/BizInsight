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
        
        # Product 1: 10 in stock, $15.00 selling, $10.00 buying
        db.execute(
            "INSERT INTO products (business_id, name, selling_price, buying_price, quantity) VALUES (?, 'P1', 15.0, 10.0, 10)",
            (b_id,)
        )
        p1_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        # Product 2: 5 in stock, $5.00 selling, $2.00 buying
        db.execute(
            "INSERT INTO products (business_id, name, selling_price, buying_price, quantity) VALUES (?, 'P2', 5.0, 2.0, 5)",
            (b_id,)
        )
        p2_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        db.commit()

    client.post('/auth/login', data={'username': 'user1', 'password': 'pass'})
    return client, b_id, p1_id, p2_id

def test_successful_checkout(auth_client, app):
    client, b_id, p1_id, p2_id = auth_client
    
    # Buy 2 of P1 and 1 of P2 with a $5 discount
    payload = {
        'payment_method': 'Cash',
        'discount': 5.0,
        'items': [
            {'product_id': p1_id, 'quantity': 2},
            {'product_id': p2_id, 'quantity': 1}
        ]
    }
    
    res = client.post('/sales/api/checkout', json=payload)
    assert res.status_code == 200
    
    data = res.json
    assert data['success'] is True
    # Subtotal: (2*15) + (1*5) = 35. Discount = 5. Total = 30.
    assert data['total_amount'] == 30.0
    
    sale_id = data['sale_id']
    
    # Verify DB state
    with app.app_context():
        db = get_db()
        
        # Check sales table
        sale = db.execute("SELECT * FROM sales WHERE id = ?", (sale_id,)).fetchone()
        assert sale['total_amount'] == 30.0
        assert sale['discount'] == 5.0
        # Profit before discount: P1: 2 * (15-10) = 10. P2: 1 * (5-2) = 3. Total profit = 13.
        # After discount = 13 - 5 = 8.
        assert sale['profit'] == 8.0
        assert sale['status'] == 'Completed'
        
        # Check sale_items
        items = db.execute("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY product_id", (sale_id,)).fetchall()
        assert len(items) == 2
        assert items[0]['product_id'] == p1_id
        assert items[0]['profit'] == 10.0
        
        # Check inventory deduction
        p1 = db.execute("SELECT quantity FROM products WHERE id = ?", (p1_id,)).fetchone()
        assert p1['quantity'] == 8 # 10 - 2

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

def test_checkout_negative_discount(auth_client):
    client, b_id, p1_id, p2_id = auth_client
    payload = {
        'discount': -5.0,
        'items': [{'product_id': p1_id, 'quantity': 1}]
    }
    res = client.post('/sales/api/checkout', json=payload)
    assert res.status_code == 400
    assert 'cannot be negative' in res.json['error'].lower()

def test_sales_list(auth_client):
    client, b_id, p1_id, _ = auth_client
    
    # Make 2 sales
    client.post('/sales/api/checkout', json={'items': [{'product_id': p1_id, 'quantity': 1}]})
    client.post('/sales/api/checkout', json={'items': [{'product_id': p1_id, 'quantity': 2}]})
    
    res = client.get('/sales/api')
    assert res.status_code == 200
    data = res.json
    assert data['total'] == 2
    assert len(data['sales']) == 2

def test_sales_metrics(auth_client):
    client, b_id, p1_id, p2_id = auth_client
    
    client.post('/sales/api/checkout', json={'items': [{'product_id': p1_id, 'quantity': 1}]})
    
    res = client.get('/sales/api/metrics')
    assert res.status_code == 200
    data = res.json
    assert data['today_sales'] == 1
    # P1 Profit: 1 * (15 - 10) = 5
    assert data['total_profit'] == 5.0

def test_sale_cancellation(auth_client, app):
    client, b_id, p1_id, p2_id = auth_client
    
    res = client.post('/sales/api/checkout', json={'items': [{'product_id': p1_id, 'quantity': 2}]})
    sale_id = res.json['sale_id']
    
    # Cancel the sale
    cancel_res = client.post(f'/sales/api/{sale_id}/cancel')
    assert cancel_res.status_code == 200
    
    # Verify DB state
    with app.app_context():
        db = get_db()
        sale = db.execute("SELECT status, profit FROM sales WHERE id = ?", (sale_id,)).fetchone()
        assert sale['status'] == 'Cancelled'
        assert sale['profit'] == 0.0
        
        # Verify inventory restored
        p1 = db.execute("SELECT quantity FROM products WHERE id = ?", (p1_id,)).fetchone()
        assert p1['quantity'] == 10 # restored from 8
