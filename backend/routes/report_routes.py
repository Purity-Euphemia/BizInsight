import csv
import io
import json
from flask import Blueprint, Response, g, request, jsonify
from backend.database import get_db
from backend.routes.auth_routes import login_required
from datetime import datetime

bp = Blueprint('reports', __name__, url_prefix='/reports/api')

@bp.before_request
@login_required
def require_login():
    pass

def get_date_cond(date_filter, col):
    if date_filter == 'today':
        return f"date({col}) = date('now', 'localtime')"
    elif date_filter == 'week':
        return f"date({col}) >= date('now', 'weekday 0', '-7 days')"
    elif date_filter == 'month':
        return f"strftime('%Y-%m', {col}) = strftime('%Y-%m', 'now', 'localtime')"
    elif date_filter == 'last_month':
        return f"strftime('%Y-%m', {col}) = strftime('%Y-%m', 'now', '-1 month', 'localtime')"
    elif date_filter == '3_months':
        return f"date({col}) >= date('now', '-3 months', 'localtime')"
    elif date_filter == 'year':
        return f"strftime('%Y', {col}) = strftime('%Y', 'now', 'localtime')"
    else:
        return "1=1"

def generate_csv_response(filename, header, data_rows):
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

# --- SALES REPORT ---
def get_sales_data(b_id, date_filter):
    db = get_db()
    cond = get_date_cond(date_filter, 's.created_at')
    
    query = f"""
        SELECT s.id, s.created_at, s.total_amount, s.payment_method, s.status, 
               c.name as customer_name,
               (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.business_id = ? AND {cond}
        ORDER BY s.created_at DESC
    """
    sales = db.execute(query, (b_id,)).fetchall()
    
    summary = db.execute(f"SELECT COUNT(*) as count, SUM(total_amount) as rev FROM sales s WHERE s.business_id=? AND s.status='Completed' AND {cond}", (b_id,)).fetchone()
    
    return {
        'sales': [dict(r) for r in sales],
        'total_sales': summary['count'] or 0,
        'total_revenue': summary['rev'] or 0.0,
        'avg_order': (summary['rev'] / summary['count']) if summary['count'] else 0.0
    }

@bp.route('/data/sales', methods=['GET'])
def data_sales():
    return jsonify(get_sales_data(g.user['business_id'], request.args.get('date', 'month')))

@bp.route('/download/sales', methods=['GET'])
def download_sales():
    data = get_sales_data(g.user['business_id'], request.args.get('date', 'month'))
    header = ['Date', 'Sale ID', 'Customer', 'Items', 'Total Amount', 'Payment Method', 'Status']
    rows = [[s['created_at'], s['id'], s['customer_name'] or 'Guest', s['items_count'], s['total_amount'], s['payment_method'], s['status']] for s in data['sales']]
    return generate_csv_response("sales_report.csv", header, rows)

# --- PROFIT & LOSS REPORT ---
def get_pl_data(b_id, date_filter):
    db = get_db()
    s_cond = get_date_cond(date_filter, 's.created_at')
    e_cond = get_date_cond(date_filter, 'expense_date')
    
    s_stats = db.execute(f"""
        SELECT SUM(s.total_amount) as rev, SUM(s.profit) as gp
        FROM sales s WHERE s.business_id=? AND s.status='Completed' AND {s_cond}
    """, (b_id,)).fetchone()
    
    rev = s_stats['rev'] or 0.0
    gp = s_stats['gp'] or 0.0
    cogs = rev - gp
    
    e_stats = db.execute(f"""
        SELECT SUM(amount) as exp FROM expenses WHERE business_id=? AND {e_cond}
    """, (b_id,)).fetchone()
    
    exp = e_stats['exp'] or 0.0
    np = gp - exp
    
    return {
        'revenue': rev,
        'cogs': cogs,
        'gross_profit': gp,
        'expenses': exp,
        'net_profit': np
    }

@bp.route('/data/profit_loss', methods=['GET'])
def data_pl():
    return jsonify(get_pl_data(g.user['business_id'], request.args.get('date', 'month')))

@bp.route('/download/profit_loss', methods=['GET'])
def download_pl():
    data = get_pl_data(g.user['business_id'], request.args.get('date', 'month'))
    header = ['Metric', 'Amount']
    rows = [
        ['Revenue', data['revenue']],
        ['Cost of Goods Sold (COGS)', data['cogs']],
        ['Gross Profit', data['gross_profit']],
        ['Operating Expenses', data['expenses']],
        ['Net Profit', data['net_profit']]
    ]
    return generate_csv_response("profit_loss_report.csv", header, rows)

# --- EXPENSE REPORT ---
def get_expense_data(b_id, date_filter):
    db = get_db()
    cond = get_date_cond(date_filter, 'expense_date')
    
    query = f"SELECT * FROM expenses WHERE business_id=? AND {cond} ORDER BY expense_date DESC"
    expenses = db.execute(query, (b_id,)).fetchall()
    
    cat_query = f"SELECT category, SUM(amount) as total FROM expenses WHERE business_id=? AND {cond} GROUP BY category ORDER BY total DESC"
    categories = db.execute(cat_query, (b_id,)).fetchall()
    
    total = sum([c['total'] for c in categories])
    largest = categories[0]['category'] if categories else 'None'
    avg = (total / len(expenses)) if expenses else 0.0
    
    return {
        'expenses': [dict(r) for r in expenses],
        'categories': [dict(c) for c in categories],
        'total': total,
        'largest_category': largest,
        'average': avg
    }

@bp.route('/data/expenses', methods=['GET'])
def data_expenses():
    return jsonify(get_expense_data(g.user['business_id'], request.args.get('date', 'month')))

@bp.route('/download/expenses', methods=['GET'])
def download_expenses():
    data = get_expense_data(g.user['business_id'], request.args.get('date', 'month'))
    header = ['Date', 'Category', 'Description/Notes', 'Amount', 'Payment Method']
    rows = [[e['expense_date'], e['category'], e['notes'] or e['title'], e['amount'], e['payment_method']] for e in data['expenses']]
    return generate_csv_response("expenses_report.csv", header, rows)

# --- PRODUCT PERFORMANCE REPORT ---
def get_product_data(b_id, date_filter):
    db = get_db()
    cond = get_date_cond(date_filter, 's.created_at')
    
    query = f"""
        SELECT p.name, p.quantity as current_stock,
               SUM(si.quantity) as units_sold,
               SUM(si.subtotal) as revenue,
               SUM(si.quantity * si.buying_price) as cogs,
               SUM(si.profit) as gross_profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.business_id=? AND s.status='Completed' AND {cond}
        GROUP BY p.id, p.name, p.quantity
        ORDER BY units_sold DESC
    """
    products = db.execute(query, (b_id,)).fetchall()
    
    return {'products': [dict(r) for r in products]}

@bp.route('/data/products', methods=['GET'])
def data_products():
    return jsonify(get_product_data(g.user['business_id'], request.args.get('date', 'month')))

@bp.route('/download/products', methods=['GET'])
def download_products():
    data = get_product_data(g.user['business_id'], request.args.get('date', 'month'))
    header = ['Product Name', 'Units Sold', 'Revenue', 'COGS', 'Gross Profit', 'Current Stock']
    rows = [[p['name'], p['units_sold'], p['revenue'], p['cogs'], p['gross_profit'], p['current_stock']] for p in data['products']]
    return generate_csv_response("product_performance_report.csv", header, rows)

# --- INVENTORY REPORT ---
def get_inventory_data(b_id):
    db = get_db()
    query = "SELECT * FROM products WHERE business_id=? ORDER BY name ASC"
    products = db.execute(query, (b_id,)).fetchall()
    
    total_val = sum([max(0, p['buying_price'] * p['quantity']) for p in products])
    total_units = sum([max(0, p['quantity']) for p in products])
    low_stock = sum([1 for p in products if p['quantity'] <= p['low_stock_limit'] and p['quantity'] > 0])
    out_of_stock = sum([1 for p in products if p['quantity'] == 0])
    
    return {
        'products': [dict(p) for p in products],
        'total_products': len(products),
        'total_units': total_units,
        'inventory_value': total_val,
        'low_stock': low_stock,
        'out_of_stock': out_of_stock
    }

@bp.route('/data/inventory', methods=['GET'])
def data_inventory():
    return jsonify(get_inventory_data(g.user['business_id']))

@bp.route('/download/inventory', methods=['GET'])
def download_inventory():
    data = get_inventory_data(g.user['business_id'])
    header = ['Product', 'Category', 'Current Stock', 'Low Stock Limit', 'Buying Price', 'Selling Price', 'Inventory Value', 'Status']
    rows = []
    for p in data['products']:
        status = 'Out of Stock' if p['quantity'] == 0 else ('Low Stock' if p['quantity'] <= p['low_stock_limit'] else 'In Stock')
        val = max(0, p['quantity'] * p['buying_price'])
        rows.append([p['name'], p['category'], p['quantity'], p['low_stock_limit'], p['buying_price'], p['selling_price'], val, status])
    return generate_csv_response("inventory_report.csv", header, rows)

# --- CUSTOMER REPORT ---
def get_customer_data(b_id, date_filter):
    db = get_db()
    cond = get_date_cond(date_filter, 's.created_at')
    
    query = f"""
        SELECT c.name, c.phone, c.email,
               COUNT(s.id) as purchases,
               SUM(s.total_amount) as total_spent,
               MAX(s.created_at) as last_purchase
        FROM sales s
        JOIN customers c ON s.customer_id = c.id
        WHERE s.business_id=? AND s.status='Completed' AND {cond}
        GROUP BY c.id, c.name, c.phone, c.email
        ORDER BY total_spent DESC
    """
    customers = db.execute(query, (b_id,)).fetchall()
    
    total = len(customers)
    returning = sum([1 for c in customers if c['purchases'] > 1])
    rev = sum([c['total_spent'] for c in customers])
    
    return {
        'customers': [dict(c) for c in customers],
        'total_customers': total,
        'returning_customers': returning,
        'total_revenue': rev
    }

@bp.route('/data/customers', methods=['GET'])
def data_customers():
    return jsonify(get_customer_data(g.user['business_id'], request.args.get('date', 'month')))

@bp.route('/download/customers', methods=['GET'])
def download_customers():
    data = get_customer_data(g.user['business_id'], request.args.get('date', 'month'))
    header = ['Customer', 'Phone', 'Email', 'Purchases', 'Total Spent', 'Last Purchase']
    rows = [[c['name'], c['phone'], c['email'], c['purchases'], c['total_spent'], c['last_purchase']] for c in data['customers']]
    return generate_csv_response("customer_report.csv", header, rows)
