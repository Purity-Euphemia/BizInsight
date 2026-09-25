from flask import Blueprint, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required

bp = Blueprint('notifications', __name__, url_prefix='/notifications/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('', methods=['GET'])
def get_notifications():
    db = get_db()
    b_id = g.user['business_id']
    notifications = []
    
    # 1. Low Stock Alerts
    low_stock_items = db.execute(
        "SELECT name, quantity, low_stock_limit FROM products WHERE business_id = ? AND quantity <= low_stock_limit",
        (b_id,)
    ).fetchall()
    
    for item in low_stock_items:
        notifications.append({
            'type': 'warning',
            'title': 'Low Stock Alert',
            'message': f"'{item['name']}' is running low (Current: {item['quantity']}, Limit: {item['low_stock_limit']})."
        })
        
    # 2. Negative 30-Day Profit Warning
    rev_row = db.execute(
        "SELECT SUM(total_amount) as total FROM sales WHERE business_id = ? AND created_at >= date('now', '-30 days')",
        (b_id,)
    ).fetchone()
    total_revenue = rev_row['total'] or 0.0
    
    cogs_row = db.execute(
        """
        SELECT SUM(si.quantity * p.buying_price) as cogs
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.business_id = ? AND s.created_at >= date('now', '-30 days')
        """,
        (b_id,)
    ).fetchone()
    cogs = cogs_row['cogs'] or 0.0
    
    exp_row = db.execute(
        "SELECT SUM(amount) as total FROM expenses WHERE business_id = ? AND expense_date >= date('now', '-30 days')",
        (b_id,)
    ).fetchone()
    total_expenses = exp_row['total'] or 0.0
    
    net_profit = (total_revenue - cogs) - total_expenses
    
    if net_profit < 0:
        notifications.append({
            'type': 'danger',
            'title': 'Profit Warning',
            'message': f"Your business has operated at a net loss over the last 30 days (Amount: -{abs(net_profit):.2f})."
        })
        
    return jsonify(notifications)
