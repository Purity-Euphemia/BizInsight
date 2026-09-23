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
    
    assert res.status_code == 200
    
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
    data = res.json
    assert data['total'] == 2
    assert len(data['customers']) == 2
    assert data['customers'][0]['name'] == 'Customer A'

def test_update_customer(auth_client, app):
    client, b_id = auth_client
    
    client.post('/customers/api', json={'name': 'Old Name'})
    with app.app_context():
        c_id = get_db().execute("SELECT id FROM customers WHERE name = 'Old Name'").fetchone()[0]
        
    res = client.put(f'/customers/api/{c_id}', json={
        'name': 'New Name',
        'email': 'new@email.com',
        'phone': '',
        'address': ''
    })
    
    assert res.status_code == 200
    
    with app.app_context():
        c = get_db().execute("SELECT * FROM customers WHERE id = ?", (c_id,)).fetchone()
        assert c['name'] == 'New Name'
        assert c['email'] == 'new@email.com'

def test_delete_customer_no_sales(auth_client, app):
    client, b_id = auth_client
    
    client.post('/customers/api', json={'name': 'To Delete'})
    with app.app_context():
        c_id = get_db().execute("SELECT id FROM customers WHERE name = 'To Delete'").fetchone()[0]
        
    res = client.delete(f'/customers/api/{c_id}')
    assert res.status_code == 200
    assert 'deleted completely' in res.json['message']
    
    with app.app_context():
        c = get_db().execute("SELECT id FROM customers WHERE id = ?", (c_id,)).fetchone()
        assert c is None

def test_archive_customer_with_sales(auth_client, app):
    client, b_id = auth_client
    
    # Create customer
    client.post('/customers/api', json={'name': 'Buyer Bob'})
    with app.app_context():
        db = get_db()
        c_id = db.execute("SELECT id FROM customers WHERE name = 'Buyer Bob'").fetchone()[0]
        
        # Insert a product to sell
        db.execute("INSERT INTO products (business_id, name, quantity, selling_price, buying_price) VALUES (?, 'Item', 10, 5.0, 2.0)", (b_id,))
        p_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        db.commit()
        
    # Perform a sale
    res = client.post('/sales/api/checkout', json={
        'customer_id': c_id,
        'payment_method': 'Cash',
        'items': [{'product_id': p_id, 'quantity': 2}]
    })
    assert res.status_code == 200
    
    # Try to delete
    res_del = client.delete(f'/customers/api/{c_id}')
    assert res_del.status_code == 200
    assert 'archived successfully' in res_del.json['message']
    
    # Verify it was archived, not hard deleted
    with app.app_context():
        c = get_db().execute("SELECT is_archived FROM customers WHERE id = ?", (c_id,)).fetchone()
        assert c is not None
        assert c['is_archived'] == 1
        
    # Verify it doesn't show up in the main list
    res_list = client.get('/customers/api')
    assert res_list.json['total'] == 0

def test_customer_insights(auth_client, app):
    client, b_id = auth_client
    
    client.post('/customers/api', json={'name': 'Insightful Bob'})
    with app.app_context():
        db = get_db()
        c_id = db.execute("SELECT id FROM customers WHERE name = 'Insightful Bob'").fetchone()[0]
        db.execute("INSERT INTO products (business_id, name, quantity, selling_price, buying_price) VALUES (?, 'Item', 10, 5.0, 2.0)", (b_id,))
        p_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        db.commit()
        
    client.post('/sales/api/checkout', json={
        'customer_id': c_id,
        'payment_method': 'Cash',
        'items': [{'product_id': p_id, 'quantity': 2}]
    })
    
    res = client.get(f'/customers/api/{c_id}/insights')
    assert res.status_code == 200
    data = res.json
    assert data['total_spent'] == 10.0
    assert data['purchase_count'] == 1
    assert data['favorite_product'] == 'Item'
