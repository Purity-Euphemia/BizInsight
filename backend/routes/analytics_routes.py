from flask import Blueprint, jsonify, request, g
from backend.database import get_db
from backend.routes.auth_routes import login_required
from datetime import datetime, timedelta

bp = Blueprint('analytics', __name__, url_prefix='/analytics/api')

@bp.before_request
@login_required
def require_login():
    pass

def get_date_conditions(date_filter, col):
    """Returns (current_period_sql, previous_period_sql) based on date_filter"""
    if date_filter == 'today':
        return f"date({col}) = date('now', 'localtime')", f"date({col}) = date('now', '-1 day', 'localtime')"
    elif date_filter == 'week':
        return f"date({col}) >= date('now', 'weekday 0', '-7 days')", f"date({col}) >= date('now', 'weekday 0', '-14 days') AND date({col}) < date('now', 'weekday 0', '-7 days')"
    elif date_filter == 'month':
        return f"strftime('%Y-%m', {col}) = strftime('%Y-%m', 'now', 'localtime')", f"strftime('%Y-%m', {col}) = strftime('%Y-%m', 'now', '-1 month', 'localtime')"
    elif date_filter == 'last_month':
        return f"strftime('%Y-%m', {col}) = strftime('%Y-%m', 'now', '-1 month', 'localtime')", f"strftime('%Y-%m', {col}) = strftime('%Y-%m', 'now', '-2 months', 'localtime')"
    elif date_filter == '3_months':
        return f"date({col}) >= date('now', '-3 months', 'localtime')", f"date({col}) >= date('now', '-6 months', 'localtime') AND date({col}) < date('now', '-3 months', 'localtime')"
    elif date_filter == 'year':
        return f"strftime('%Y', {col}) = strftime('%Y', 'now', 'localtime')", f"strftime('%Y', {col}) = strftime('%Y', 'now', '-1 year', 'localtime')"
    else: # all time
        return "1=1", "1=0"

@bp.route('/overview', methods=['GET'])
def get_overview():
    db = get_db()
    b_id = g.user['business_id']
    date_filter = request.args.get('date', 'month').strip()
    
    s_cond, s_prev_cond = get_date_conditions(date_filter, 'created_at')
    e_cond, e_prev_cond = get_date_conditions(date_filter, 'expense_date')
    
    # Current Period
    sales_data = db.execute(f"SELECT SUM(total_amount) as rev, SUM(profit) as gp, COUNT(*) as cnt FROM sales WHERE business_id = ? AND status = 'Completed' AND {s_cond}", (b_id,)).fetchone()
    expenses_data = db.execute(f"SELECT SUM(amount) as exp FROM expenses WHERE business_id = ? AND {e_cond}", (b_id,)).fetchone()
    
    rev = sales_data['rev'] or 0.0
    gp = sales_data['gp'] or 0.0
    cnt = sales_data['cnt'] or 0
    exp = expenses_data['exp'] or 0.0
    np = gp - exp
    avg_order = rev / cnt if cnt > 0 else 0.0
    
    # Previous Period
    p_sales_data = db.execute(f"SELECT SUM(total_amount) as rev, SUM(profit) as gp, COUNT(*) as cnt FROM sales WHERE business_id = ? AND status = 'Completed' AND {s_prev_cond}", (b_id,)).fetchone()
    p_expenses_data = db.execute(f"SELECT SUM(amount) as exp FROM expenses WHERE business_id = ? AND {e_prev_cond}", (b_id,)).fetchone()
    
    p_rev = p_sales_data['rev'] or 0.0
    p_gp = p_sales_data['gp'] or 0.0
    p_cnt = p_sales_data['cnt'] or 0
    p_exp = p_expenses_data['exp'] or 0.0
    p_np = p_gp - p_exp
    p_avg_order = p_rev / p_cnt if p_cnt > 0 else 0.0
    
    def calc_change(curr, prev):
        if prev == 0:
            return None
        return ((curr - prev) / prev) * 100
        
    return jsonify({
        'revenue': rev, 'revenue_change': calc_change(rev, p_rev),
        'gross_profit': gp, 'gross_profit_change': calc_change(gp, p_gp),
        'net_profit': np, 'net_profit_change': calc_change(np, p_np),
        'expenses': exp, 'expenses_change': calc_change(exp, p_exp),
        'sales_count': cnt, 'sales_count_change': calc_change(cnt, p_cnt),
        'avg_order': avg_order, 'avg_order_change': calc_change(avg_order, p_avg_order)
    })

@bp.route('/trends', methods=['GET'])
def get_trends():
    db = get_db()
    b_id = g.user['business_id']
    date_filter = request.args.get('date', 'month').strip()
    
    s_cond, _ = get_date_conditions(date_filter, 'created_at')
    e_cond, _ = get_date_conditions(date_filter, 'expense_date')
    
    fmt = "%Y-%m-%d"
    if date_filter in ['year', 'all']:
        fmt = "%Y-%m"
        
    s_query = f"SELECT strftime('{fmt}', created_at) as label, SUM(total_amount) as rev, SUM(profit) as gp, COUNT(*) as cnt FROM sales WHERE business_id = ? AND status = 'Completed' AND {s_cond} GROUP BY label ORDER BY label ASC"
    e_query = f"SELECT strftime('{fmt}', expense_date) as label, SUM(amount) as exp FROM expenses WHERE business_id = ? AND {e_cond} GROUP BY label ORDER BY label ASC"
    
    s_res = db.execute(s_query, (b_id,)).fetchall()
    e_res = db.execute(e_query, (b_id,)).fetchall()
    
    labels_set = set([r['label'] for r in s_res] + [r['label'] for r in e_res])
    labels = sorted(list(labels_set))
    
    s_dict = {r['label']: dict(r) for r in s_res}
    e_dict = {r['label']: r['exp'] for r in e_res}
    
    data = []
    for l in labels:
        rev = s_dict.get(l, {}).get('rev', 0.0) or 0.0
        cnt = s_dict.get(l, {}).get('cnt', 0) or 0
        gp = s_dict.get(l, {}).get('gp', 0.0) or 0.0
        exp = e_dict.get(l, 0.0) or 0.0
        np = gp - exp
        
        data.append({
            'label': l,
            'revenue': rev,
            'sales': cnt,
            'gross_profit': gp,
            'net_profit': np,
            'expenses': exp
        })
        
    return jsonify(data)

@bp.route('/expenses', methods=['GET'])
def get_expenses_breakdown():
    db = get_db()
    b_id = g.user['business_id']
    date_filter = request.args.get('date', 'month').strip()
    e_cond, _ = get_date_conditions(date_filter, 'expense_date')
    
    query = f"SELECT category, SUM(amount) as total FROM expenses WHERE business_id = ? AND {e_cond} GROUP BY category ORDER BY total DESC"
    res = db.execute(query, (b_id,)).fetchall()
    return jsonify([dict(r) for r in res])

@bp.route('/products', methods=['GET'])
def get_product_analytics():
    db = get_db()
    b_id = g.user['business_id']
    date_filter = request.args.get('date', 'month').strip()
    s_cond, _ = get_date_conditions(date_filter, 's.created_at')
    
    query = f"""
        SELECT p.name, SUM(si.quantity) as units_sold, SUM(si.subtotal) as revenue, SUM(si.profit) as profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.business_id = ? AND s.status = 'Completed' AND {s_cond}
        GROUP BY p.id, p.name
        ORDER BY units_sold DESC
        LIMIT 10
    """
    res = db.execute(query, (b_id,)).fetchall()
    return jsonify([dict(r) for r in res])

@bp.route('/customers', methods=['GET'])
def get_customer_analytics():
    db = get_db()
    b_id = g.user['business_id']
    date_filter = request.args.get('date', 'month').strip()
    s_cond, _ = get_date_conditions(date_filter, 's.created_at')
    
    top_c_query = f"""
        SELECT c.name, COUNT(s.id) as purchases, SUM(s.total_amount) as total_spent, MAX(s.created_at) as last_purchase
        FROM sales s
        JOIN customers c ON s.customer_id = c.id
        WHERE s.business_id = ? AND s.status = 'Completed' AND {s_cond}
        GROUP BY c.id, c.name
        ORDER BY total_spent DESC
        LIMIT 5
    """
    top_c = db.execute(top_c_query, (b_id,)).fetchall()
    
    stats_query = f"""
        SELECT COUNT(DISTINCT customer_id) as active_customers, COUNT(s.id) as total_sales
        FROM sales s
        WHERE business_id = ? AND customer_id IS NOT NULL AND status = 'Completed' AND {s_cond}
    """
    stats = db.execute(stats_query, (b_id,)).fetchone()
    active_customers = stats['active_customers'] or 0
    total_sales = stats['total_sales'] or 0
    
    total_customers = db.execute("SELECT COUNT(*) FROM customers WHERE business_id = ?", (b_id,)).fetchone()[0] or 0
    
    # Calculate returning customers (customers with more than 1 purchase in the period)
    returning_query = f"""
        SELECT COUNT(*) as returning_count
        FROM (
            SELECT customer_id, COUNT(*) as cnt
            FROM sales s
            WHERE business_id = ? AND customer_id IS NOT NULL AND status = 'Completed' AND {s_cond}
            GROUP BY customer_id
            HAVING cnt > 1
        )
    """
    returning = db.execute(returning_query, (b_id,)).fetchone()['returning_count'] or 0
    
    return jsonify({
        'top_customers': [dict(r) for r in top_c],
        'active_customers': active_customers,
        'total_customers': total_customers,
        'returning_customers': returning,
        'new_customers': active_customers - returning
    })

@bp.route('/inventory', methods=['GET'])
def get_inventory_analytics():
    db = get_db()
    b_id = g.user['business_id']
    
    query = """
        SELECT COUNT(*) as total_products, 
               SUM(buying_price * quantity) as inventory_value,
               SUM(CASE WHEN quantity <= low_stock_limit AND quantity > 0 THEN 1 ELSE 0 END) as low_stock_count,
               SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_count
        FROM products
        WHERE business_id = ?
    """
    stats = db.execute(query, (b_id,)).fetchone()
    
    alerts_query = """
        SELECT name, quantity, low_stock_limit
        FROM products
        WHERE business_id = ? AND quantity <= low_stock_limit
        ORDER BY quantity ASC
        LIMIT 10
    """
    alerts = db.execute(alerts_query, (b_id,)).fetchall()
    
    inv_value = stats['inventory_value'] or 0.0
    if inv_value < 0:
        inv_value = 0.0
        
    return jsonify({
        'total_products': stats['total_products'] or 0,
        'inventory_value': inv_value,
        'low_stock_count': stats['low_stock_count'] or 0,
        'out_of_stock_count': stats['out_of_stock_count'] or 0,
        'alerts': [dict(r) for r in alerts]
    })

@bp.route('/payments', methods=['GET'])
def get_payments():
    db = get_db()
    b_id = g.user['business_id']
    date_filter = request.args.get('date', 'month').strip()
    s_cond, _ = get_date_conditions(date_filter, 'created_at')
    
    query = f"""
        SELECT payment_method, COUNT(*) as count, SUM(total_amount) as total
        FROM sales
        WHERE business_id = ? AND status = 'Completed' AND {s_cond}
        GROUP BY payment_method
        ORDER BY total DESC
    """
    res = db.execute(query, (b_id,)).fetchall()
    return jsonify([dict(r) for r in res])

@bp.route('/insights', methods=['GET'])
def get_insights():
    db = get_db()
    b_id = g.user['business_id']
    date_filter = request.args.get('date', 'month').strip()
    
    insights = []
    
    oos = db.execute("SELECT COUNT(*) FROM products WHERE business_id = ? AND quantity = 0", (b_id,)).fetchone()[0]
    if oos > 0:
        insights.append({
            'priority': 'high',
            'type': 'danger',
            'title': 'Out of Stock Items',
            'message': f"You have {oos} product(s) completely out of stock. Consider restocking soon to avoid lost sales."
        })
        
    low_stock = db.execute("SELECT COUNT(*) FROM products WHERE business_id = ? AND quantity > 0 AND quantity <= low_stock_limit", (b_id,)).fetchone()[0]
    if low_stock > 0:
        insights.append({
            'priority': 'medium',
            'type': 'warning',
            'title': 'Low Stock Alert',
            'message': f"{low_stock} product(s) are running low on inventory."
        })
        
    s_cond, s_prev_cond = get_date_conditions(date_filter, 'created_at')
    rev_curr = db.execute(f"SELECT SUM(total_amount) FROM sales WHERE business_id = ? AND status = 'Completed' AND {s_cond}", (b_id,)).fetchone()[0] or 0.0
    rev_prev = db.execute(f"SELECT SUM(total_amount) FROM sales WHERE business_id = ? AND status = 'Completed' AND {s_prev_cond}", (b_id,)).fetchone()[0] or 0.0
    
    if rev_prev > 0:
        change = ((rev_curr - rev_prev) / rev_prev) * 100
        if change > 10:
            insights.append({
                'priority': 'high',
                'type': 'success',
                'title': 'Strong Revenue Growth',
                'message': f"Revenue increased by {change:.1f}% compared to the previous period."
            })
        elif change < -10:
            insights.append({
                'priority': 'high',
                'type': 'warning',
                'title': 'Revenue Decline',
                'message': f"Revenue dropped by {abs(change):.1f}% compared to the previous period."
            })
            
    if rev_curr > 0:
        top_prod_rev = db.execute(f"""
            SELECT SUM(si.subtotal) 
            FROM sale_items si JOIN sales s ON si.sale_id = s.id 
            WHERE s.business_id = ? AND s.status = 'Completed' AND {s_cond}
            GROUP BY si.product_id ORDER BY SUM(si.subtotal) DESC LIMIT 1
        """, (b_id,)).fetchone()
        
        if top_prod_rev and top_prod_rev[0]:
            top_pct = (top_prod_rev[0] / rev_curr) * 100
            if top_pct > 30:
                insights.append({
                    'priority': 'medium',
                    'type': 'info',
                    'title': 'High Product Concentration',
                    'message': f"A single product makes up {top_pct:.1f}% of your revenue for this period."
                })
                
    if not insights:
        insights.append({
            'priority': 'low',
            'type': 'info',
            'title': 'Analytics Ready',
            'message': 'Keep recording sales and expenses to generate meaningful business insights.'
        })
        
    # Sort by priority
    priority_order = {'high': 1, 'medium': 2, 'low': 3}
    insights.sort(key=lambda x: priority_order.get(x['priority'], 4))
    
    return jsonify(insights)
