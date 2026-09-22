import csv
import io
from flask import Blueprint, Response, g
from backend.database import get_db
from backend.routes.auth_routes import login_required
from datetime import datetime

bp = Blueprint('reports', __name__, url_prefix='/reports/api')

@bp.before_request
@login_required
def require_login():
    pass

def generate_csv_response(filename, header, data_rows):
    """Helper to generate a CSV download response."""
    si = io.StringIO()
    cw = csv.writer(si)
    cw.writerow(header)
    cw.writerows(data_rows)
    
    output = si.getvalue()
    
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename={filename}"}
    )

@bp.route('/download/sales', methods=['GET'])
def download_sales():
    db = get_db()
    query = """
        SELECT s.id, s.created_at, s.total_amount, s.payment_method, c.name as customer_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.business_id = ?
        ORDER BY s.created_at DESC
    """
    sales = db.execute(query, (g.user['business_id'],)).fetchall()
    
    header = ['Sale ID', 'Date', 'Amount', 'Payment Method', 'Customer Name']
    data = []
    for s in sales:
        data.append([
            s['id'],
            s['created_at'],
            s['total_amount'],
            s['payment_method'],
            s['customer_name'] or 'Guest'
        ])
        
    date_str = datetime.now().strftime('%Y-%m-%d')
    return generate_csv_response(f"sales_report_{date_str}.csv", header, data)

@bp.route('/download/expenses', methods=['GET'])
def download_expenses():
    db = get_db()
    query = """
        SELECT id, expense_date, title, category, amount
        FROM expenses
        WHERE business_id = ?
        ORDER BY expense_date DESC
    """
    expenses = db.execute(query, (g.user['business_id'],)).fetchall()
    
    header = ['Expense ID', 'Date', 'Title', 'Category', 'Amount']
    data = []
    for e in expenses:
        data.append([
            e['id'],
            e['expense_date'],
            e['title'],
            e['category'],
            e['amount']
        ])
        
    date_str = datetime.now().strftime('%Y-%m-%d')
    return generate_csv_response(f"expenses_report_{date_str}.csv", header, data)

@bp.route('/download/inventory', methods=['GET'])
def download_inventory():
    db = get_db()
    query = """
        SELECT name, category, quantity, buying_price, selling_price
        FROM products
        WHERE business_id = ?
        ORDER BY name ASC
    """
    products = db.execute(query, (g.user['business_id'],)).fetchall()
    
    header = ['Product Name', 'Category', 'Quantity in Stock', 'Buying Price', 'Selling Price', 'Total Stock Value']
    data = []
    for p in products:
        stock_value = p['quantity'] * p['buying_price']
        data.append([
            p['name'],
            p['category'] or 'Uncategorized',
            p['quantity'],
            p['buying_price'],
            p['selling_price'],
            stock_value
        ])
        
    date_str = datetime.now().strftime('%Y-%m-%d')
    return generate_csv_response(f"inventory_report_{date_str}.csv", header, data)
