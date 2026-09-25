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
        
        # Insert a product: cost 5.0, selling 15.0
        db.execute(
            "INSERT INTO products (business_id, name, buying_price, selling_price, quantity, low_stock_limit) VALUES (?, 'Test Item', 5.0, 15.0, 2, 5)",
            (b_id,)
        )
        p_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        # Insert an expense
        db.execute(
            "INSERT INTO expenses (business_id, title, amount, expense_date) VALUES (?, 'Rent', 10.0, '2023-01-01')",
            (b_id,)
        )
        
        # Make a sale: 2 items
        db.execute(
            "INSERT INTO sales (business_id, total_amount, payment_method) VALUES (?, 30.0, 'Cash')",
            (b_id,)
        )
        s_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        db.execute(
            "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, 2, 15.0, 30.0)",
            (s_id, p_id)
        )
        
        db.commit()

    client.post('/auth/login', data={'username': 'user1', 'password': 'pass'})
    return client, b_id, p_id

def test_dashboard_metrics(auth_client):
    client, b_id, p_id = auth_client
    
    res = client.get('/dashboard/api/metrics')
    assert res.status_code == 200
    
    data = res.json
    m = data['kpi']
    
    # Sales assertions
    assert m['today_sales'] == 30.0
    assert m['monthly_revenue'] == 30.0
    
    # Net Profit = GP (20) - Expenses (10) = 10.0
    assert m['net_profit'] == 10.0
    
    # Low stock list
    assert len(data['low_stock']) == 1
    
    # Recent Transactions
    assert len(data['recent_transactions']) == 1
    assert data['recent_transactions'][0]['total_amount'] == 30.0
    
    # Top Products
    assert len(data['top_products']) == 1
    assert data['top_products'][0]['name'] == 'Test Item'
    assert data['top_products'][0]['units_sold'] == 2

