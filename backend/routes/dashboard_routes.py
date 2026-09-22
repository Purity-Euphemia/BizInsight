from flask import Blueprint, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required

bp = Blueprint('dashboard', __name__, url_prefix='/dashboard/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('/metrics', methods=['GET'])
def get_metrics():
    db = get_db()
    b_id = g.user['business_id']
    
    # 1. Total Revenue
    rev_row = db.execute("SELECT SUM(total_amount) as total FROM sales WHERE business_id = ?", (b_id,)).fetchone()
    total_revenue = rev_row['total'] or 0.0
    
    # 2. Total Expenses
    exp_row = db.execute("SELECT SUM(amount) as total FROM expenses WHERE business_id = ?", (b_id,)).fetchone()
    total_expenses = exp_row['total'] or 0.0
    
    # 3. Cost of Goods Sold (COGS)
    # COGS = sum of (quantity * product's historical buying_price at the time... wait, we only have current buying_price)
    # Actually, we should ideally store buying_price in sale_items, but for now we'll join products to get current buying_price.
    # A robust system would snapshot buying_price in sale_items, but let's join for now.
    cogs_query = """
        SELECT SUM(si.quantity * p.buying_price) as cogs
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.business_id = ?
    """
    cogs_row = db.execute(cogs_query, (b_id,)).fetchone()
    cogs = cogs_row['cogs'] or 0.0
    
    # Gross Profit = Revenue - COGS
    gross_profit = total_revenue - cogs
    
    # Net Profit = Gross Profit - Expenses
    net_profit = gross_profit - total_expenses
    
    # Low Stock Count
    low_stock_row = db.execute(
        "SELECT COUNT(id) as count FROM products WHERE business_id = ? AND quantity <= low_stock_limit",
        (b_id,)
    ).fetchone()
    low_stock_count = low_stock_row['count'] or 0
    
    # Recent Sales (last 5)
    recent_sales = db.execute(
        "SELECT id, total_amount, created_at FROM sales WHERE business_id = ? ORDER BY created_at DESC LIMIT 5",
        (b_id,)
    ).fetchall()
    
    # Top Products (by quantity sold)
    top_products_query = """
        SELECT p.name, SUM(si.quantity) as total_sold
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.business_id = ?
        GROUP BY p.id
        ORDER BY total_sold DESC
        LIMIT 5
    """
    top_products = db.execute(top_products_query, (b_id,)).fetchall()
    
    return jsonify({
        'metrics': {
            'revenue': total_revenue,
            'expenses': total_expenses,
            'cogs': cogs,
            'gross_profit': gross_profit,
            'net_profit': net_profit,
            'low_stock_count': low_stock_count
        },
        'recent_sales': [dict(s) for s in recent_sales],
        'top_products': [dict(p) for p in top_products]
    })
