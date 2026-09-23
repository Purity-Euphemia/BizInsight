import pytest
from backend.database import get_db

@pytest.fixture
def auth_client(client, app):
    """A client that is logged in to a test business."""
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

@pytest.fixture
def other_auth_client(client, app):
    """A second client logged into a different business."""
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO businesses (name) VALUES ('Other Biz')")
        b_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        from werkzeug.security import generate_password_hash
        db.execute(
            "INSERT INTO users (username, password_hash, business_id) VALUES ('user2', ?, ?)",
            (generate_password_hash('pass'), b_id)
        )
        db.commit()

    # Create a new client session for user2
    new_client = app.test_client()
    new_client.post('/auth/login', data={'username': 'user2', 'password': 'pass'})
    return new_client, b_id

def test_add_product(auth_client, app):
    client, b_id = auth_client
    
    # Test valid product
    response = client.post('/products/api', json={
        'name': 'Test Product',
        'category': 'Electronics',
        'buying_price': 10.50,
        'selling_price': 20.00,
        'quantity': 50,
        'low_stock_limit': 10
    })
    
    assert response.status_code == 201
    assert response.json['success'] is True

    # Verify in DB
    with app.app_context():
        product = get_db().execute("SELECT * FROM products WHERE name = 'Test Product'").fetchone()
        assert product is not None
        assert product['business_id'] == b_id
        assert product['quantity'] == 50

def test_add_product_validation(auth_client):
    client, _ = auth_client
    
    # Missing name
    res = client.post('/products/api', json={'buying_price': 10})
    assert res.status_code == 400
    assert 'Name is required' in res.json['error']

    # Negative price
    res = client.post('/products/api', json={'name': 'A', 'buying_price': -5})
    assert res.status_code == 400
    assert 'cannot be negative' in res.json['error']

def test_get_products(auth_client, other_auth_client):
    client1, _ = auth_client
    client2, _ = other_auth_client
    
    # Add product for user 1
    client1.post('/products/api', json={'name': 'User 1 Product', 'category': 'Cat1'})
    
    # Add product for user 2
    client2.post('/products/api', json={'name': 'User 2 Product', 'category': 'Cat2'})
    
    # Get products for user 1
    res1 = client1.get('/products/api')
    products1 = res1.json['products']
    assert len(products1) == 1
    assert products1[0]['name'] == 'User 1 Product'
    
    # Search functionality
    client1.post('/products/api', json={'name': 'Apple', 'category': 'Fruit'})
    res_search = client1.get('/products/api?search=Apple')
    assert len(res_search.json['products']) == 1
    assert res_search.json['products'][0]['name'] == 'Apple'

def test_update_product(auth_client, app):
    client, b_id = auth_client
    
    client.post('/products/api', json={'name': 'Old Name', 'quantity': 10})
    
    with app.app_context():
        p_id = get_db().execute("SELECT id FROM products WHERE name = 'Old Name'").fetchone()[0]

    # Update the product
    res = client.put(f'/products/api/{p_id}', json={
        'name': 'New Name',
        'quantity': 20
    })
    
    assert res.status_code == 200
    
    with app.app_context():
        p = get_db().execute("SELECT * FROM products WHERE id = ?", (p_id,)).fetchone()
        assert p['name'] == 'New Name'
        assert p['quantity'] == 20

def test_update_product_security(auth_client, other_auth_client, app):
    client1, _ = auth_client
    client2, _ = other_auth_client
    
    # User 1 creates a product
    client1.post('/products/api', json={'name': 'User 1 Product'})
    with app.app_context():
        p_id = get_db().execute("SELECT id FROM products WHERE name = 'User 1 Product'").fetchone()[0]
        
    # User 2 tries to update it
    res = client2.put(f'/products/api/{p_id}', json={'name': 'Hacked'})
    assert res.status_code == 404 # Should not find it because business_id doesn't match
    
def test_delete_product(auth_client, app):
    client, b_id = auth_client
    
    client.post('/products/api', json={'name': 'To Delete'})
    with app.app_context():
        p_id = get_db().execute("SELECT id FROM products WHERE name = 'To Delete'").fetchone()[0]
        
    res = client.delete(f'/products/api/{p_id}')
    assert res.status_code == 200
    
    with app.app_context():
        p = get_db().execute("SELECT is_active FROM products WHERE id = ?", (p_id,)).fetchone()
        assert p is not None
        assert p['is_active'] == 0
