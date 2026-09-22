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

def test_add_customer(auth_client, app):
    client, b_id = auth_client
    
    res = client.post('/customers/api', json={
        'name': 'John Doe',
        'email': 'john@example.com',
        'phone': '1234567890',
        'address': '123 Main St'
    })
    
    assert res.status_code == 201
    
    with app.app_context():
        customer = get_db().execute("SELECT * FROM customers WHERE name = 'John Doe'").fetchone()
        assert customer is not None
        assert customer['business_id'] == b_id
        assert customer['email'] == 'john@example.com'

def test_add_customer_validation(auth_client):
    client, _ = auth_client
    res = client.post('/customers/api', json={'email': 'no-name@example.com'})
    assert res.status_code == 400
    assert 'Name is required' in res.json['error']

def test_get_customers(auth_client):
    client, b_id = auth_client
    client.post('/customers/api', json={'name': 'Customer A'})
    client.post('/customers/api', json={'name': 'Customer B'})
    
    res = client.get('/customers/api')
    assert res.status_code == 200
    assert len(res.json) == 2
    assert res.json[0]['name'] == 'Customer A'

def test_update_customer(auth_client, app):
    client, b_id = auth_client
    
    client.post('/customers/api', json={'name': 'Old Name'})
    with app.app_context():
        c_id = get_db().execute("SELECT id FROM customers WHERE name = 'Old Name'").fetchone()[0]
        
    res = client.put(f'/customers/api/{c_id}', json={
        'name': 'New Name',
        'email': 'new@email.com'
    })
    
    assert res.status_code == 200
    
    with app.app_context():
        c = get_db().execute("SELECT * FROM customers WHERE id = ?", (c_id,)).fetchone()
        assert c['name'] == 'New Name'
        assert c['email'] == 'new@email.com'

def test_delete_customer(auth_client, app):
    client, b_id = auth_client
    
    client.post('/customers/api', json={'name': 'To Delete'})
    with app.app_context():
        c_id = get_db().execute("SELECT id FROM customers WHERE name = 'To Delete'").fetchone()[0]
        
    res = client.delete(f'/customers/api/{c_id}')
    assert res.status_code == 200
    
    with app.app_context():
        c = get_db().execute("SELECT id FROM customers WHERE id = ?", (c_id,)).fetchone()
        assert c is None

def test_customer_purchase_history(auth_client, app):
    client, b_id = auth_client
    
    # Create customer
    client.post('/customers/api', json={'name': 'Buyer Bob'})
    with app.app_context():
        db = get_db()
        c_id = db.execute("SELECT id FROM customers WHERE name = 'Buyer Bob'").fetchone()[0]
        
        # Insert a product to sell
        db.execute("INSERT INTO products (business_id, name, quantity, selling_price) VALUES (?, 'Item', 10, 5.0)", (b_id,))
        p_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        db.commit()
        
    # Perform a sale linked to Buyer Bob
    res = client.post('/sales/api/checkout', json={
        'customer_id': c_id,
        'payment_method': 'Cash',
        'items': [{'product_id': p_id, 'quantity': 2}]
    })
    assert res.status_code == 200
    
    # Check history
    res_hist = client.get(f'/customers/api/{c_id}/history')
    assert res_hist.status_code == 200
    assert res_hist.json['customer_name'] == 'Buyer Bob'
    assert len(res_hist.json['sales']) == 1
    assert res_hist.json['sales'][0]['total_amount'] == 10.0
