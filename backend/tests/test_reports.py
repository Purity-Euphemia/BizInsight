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
        
        # Insert Sales
        db.execute("INSERT INTO sales (business_id, total_amount, payment_method, created_at) VALUES (?, 100.0, 'Cash', '2023-01-01 10:00:00')", (b_id,))
        
        # Insert Expenses
        db.execute("INSERT INTO expenses (business_id, title, amount, category, expense_date) VALUES (?, 'Rent', 500.0, 'Rent', '2023-01-01')", (b_id,))
        
        # Insert Product
        db.execute("INSERT INTO products (business_id, name, category, buying_price, selling_price, quantity) VALUES (?, 'Test Item', 'Toys', 5.0, 15.0, 10)", (b_id,))
        
        db.commit()

    client.post('/auth/login', data={'username': 'user1', 'password': 'pass'})
    return client

def test_sales_report(auth_client):
    res = auth_client.get('/reports/api/download/sales')
    assert res.status_code == 200
    assert res.mimetype == 'text/csv'
    
    csv_data = res.data.decode('utf-8')
    assert 'Sale ID,Date,Amount,Payment Method,Customer Name' in csv_data
    assert '100.0' in csv_data
    assert 'Cash' in csv_data

def test_expenses_report(auth_client):
    res = auth_client.get('/reports/api/download/expenses')
    assert res.status_code == 200
    assert res.mimetype == 'text/csv'
    
    csv_data = res.data.decode('utf-8')
    assert 'Expense ID,Date,Title,Category,Amount' in csv_data
    assert 'Rent' in csv_data
    assert '500.0' in csv_data

def test_inventory_report(auth_client):
    res = auth_client.get('/reports/api/download/inventory')
    assert res.status_code == 200
    assert res.mimetype == 'text/csv'
    
    csv_data = res.data.decode('utf-8')
    assert 'Product Name,Category,Quantity in Stock,Buying Price,Selling Price,Total Stock Value' in csv_data
    assert 'Test Item' in csv_data
    assert 'Toys' in csv_data
    assert '50.0' in csv_data # 10 qty * 5.0 buying price = 50.0 total stock value
