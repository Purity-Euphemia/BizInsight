from flask import Blueprint, jsonify, g, request
from backend.database import get_db
from backend.routes.auth_routes import login_required
from datetime import datetime, timedelta

bp = Blueprint('dashboard', __name__, url_prefix='/dashboard/api')

@bp.before_request
@login_required
def require_login():
    pass

def get_sales_sum(db, b_id, start_date, end_date=None):
    if end_date:
        query = "SELECT SUM(total_amount) as total FROM sales WHERE business_id = ? AND created_at >= ? AND created_at < ?"
        params = (b_id, start_date, end_date)
    else:
        query = "SELECT SUM(total_amount) as total FROM sales WHERE business_id = ? AND created_at >= ?"
        params = (b_id, start_date)
    row = db.execute(query, params).fetchone()
    return row['total'] or 0.0

def get_cogs_sum(db, b_id, start_date, end_date=None):
    query = """
        SELECT SUM(si.quantity * p.buying_price) as cogs
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.business_id = ?
    """
    if end_date:
        query += " AND s.created_at >= ? AND s.created_at < ?"
        params = (b_id, start_date, end_date)
    else:
        query += " AND s.created_at >= ?"
        params = (b_id, start_date)
    
    row = db.execute(query, params).fetchone()
    return row['cogs'] or 0.0

def get_expenses_sum(db, b_id, start_date, end_date=None):
    if end_date:
        query = "SELECT SUM(amount) as total FROM expenses WHERE business_id = ? AND created_at >= ? AND created_at < ?"
        params = (b_id, start_date, end_date)
    else:
        query = "SELECT SUM(amount) as total FROM expenses WHERE business_id = ? AND created_at >= ?"
        params = (b_id, start_date)
    row = db.execute(query, params).fetchone()
    return row['total'] or 0.0

@bp.route('/metrics', methods=['GET'])
def get_metrics():
    db = get_db()
    b_id = g.user['business_id']
    
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    
    week_start = today_start - timedelta(days=now.weekday())
    last_week_start = week_start - timedelta(days=7)
    
    month_start = today_start.replace(day=1)
    if month_start.month == 1:
        last_month_start = month_start.replace(year=month_start.year - 1, month=12)
    else:
        last_month_start = month_start.replace(month=month_start.month - 1)
        
    # Today's Sales
    today_sales = get_sales_sum(db, b_id, today_start)
    yesterday_sales = get_sales_sum(db, b_id, yesterday_start, today_start)
    today_trend = 0
    if yesterday_sales > 0:
        today_trend = ((today_sales - yesterday_sales) / yesterday_sales) * 100
    elif today_sales > 0:
        today_trend = 100
        
    # Weekly Sales
    weekly_sales = get_sales_sum(db, b_id, week_start)
    last_weekly_sales = get_sales_sum(db, b_id, last_week_start, week_start)
    weekly_trend = 0
    if last_weekly_sales > 0:
        weekly_trend = ((weekly_sales - last_weekly_sales) / last_weekly_sales) * 100
    elif weekly_sales > 0:
        weekly_trend = 100

    # Monthly Revenue
    monthly_revenue = get_sales_sum(db, b_id, month_start)
    last_monthly_revenue = get_sales_sum(db, b_id, last_month_start, month_start)
    monthly_trend = 0
    if last_monthly_revenue > 0:
        monthly_trend = ((monthly_revenue - last_monthly_revenue) / last_monthly_revenue) * 100
    elif monthly_revenue > 0:
        monthly_trend = 100
        
    # Net Profit (Monthly)
    monthly_cogs = get_cogs_sum(db, b_id, month_start)
    monthly_expenses = get_expenses_sum(db, b_id, month_start)
    monthly_net_profit = monthly_revenue - monthly_cogs - monthly_expenses
    
    last_monthly_cogs = get_cogs_sum(db, b_id, last_month_start, month_start)
    last_monthly_expenses = get_expenses_sum(db, b_id, last_month_start, month_start)
    last_monthly_net_profit = last_monthly_revenue - last_monthly_cogs - last_monthly_expenses
    
    profit_trend = 0
    if last_monthly_net_profit > 0:
        profit_trend = ((monthly_net_profit - last_monthly_net_profit) / last_monthly_net_profit) * 100
    elif monthly_net_profit > 0:
        profit_trend = 100
    
    # Low Stock Products
    low_stock_query = """
        SELECT id, name, quantity as current_stock, low_stock_limit
        FROM products 
        WHERE business_id = ? AND quantity <= low_stock_limit
        ORDER BY quantity ASC
        LIMIT 5
    """
    low_stock_items = db.execute(low_stock_query, (b_id,)).fetchall()
    low_stock_list = []
    for item in low_stock_items:
        status = 'Out of Stock' if item['current_stock'] == 0 else 'Low Stock'
        low_stock_list.append({
            'name': item['name'],
            'current_stock': item['current_stock'],
            'status': status
        })
        
    # Recent Sales
    recent_sales_query = """
        SELECT s.id, c.name as customer_name, s.total_amount, s.payment_method, s.created_at, 
               (SELECT p.name FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id LIMIT 1) as product_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.business_id = ? 
        ORDER BY s.created_at DESC 
        LIMIT 5
    """
    recent_sales = db.execute(recent_sales_query, (b_id,)).fetchall()
    
    # Top Products
    top_products_query = """
        SELECT p.name, SUM(si.quantity) as units_sold, SUM(si.quantity * si.unit_price) as revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.business_id = ?
        GROUP BY p.id
        ORDER BY revenue DESC
        LIMIT 5
    """
    top_products = db.execute(top_products_query, (b_id,)).fetchall()
    
    return jsonify({
        'kpi': {
            'today_sales': today_sales,
            'today_trend': today_trend,
            'weekly_sales': weekly_sales,
            'weekly_trend': weekly_trend,
            'monthly_revenue': monthly_revenue,
            'monthly_trend': monthly_trend,
            'net_profit': monthly_net_profit,
            'profit_trend': profit_trend
        },
        'recent_transactions': [dict(s) for s in recent_sales],
        'top_products': [dict(p) for p in top_products],
        'low_stock': low_stock_list
    })

@bp.route('/sales_trend', methods=['GET'])
def get_sales_trend():
    db = get_db()
    b_id = g.user['business_id']
    days = int(request.args.get('days', 30))
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    query = """
        SELECT date(created_at) as sale_date, SUM(total_amount) as total
        FROM sales
        WHERE business_id = ? AND created_at >= ?
        GROUP BY sale_date
        ORDER BY sale_date ASC
    """
    results = db.execute(query, (b_id, start_date)).fetchall()
    
    dates = []
    totals = []
    for r in results:
        dates.append(r['sale_date'])
        totals.append(r['total'])
        
    return jsonify({
        'labels': dates,
        'data': totals
    })
