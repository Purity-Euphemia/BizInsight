from flask import Blueprint, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required
from datetime import datetime, timedelta

bp = Blueprint('analytics', __name__, url_prefix='/analytics/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('/sales-trend', methods=['GET'])
def get_sales_trend():
    db = get_db()
    # In SQLite, date() extracts the YYYY-MM-DD from a timestamp
    # We want sales grouped by date for the last 30 days
    query = """
        SELECT date(created_at) as sale_date, SUM(total_amount) as daily_total
        FROM sales
        WHERE business_id = ? AND created_at >= date('now', '-30 days')
        GROUP BY date(created_at)
        ORDER BY sale_date ASC
    """
    results = db.execute(query, (g.user['business_id'],)).fetchall()
    
    # We need to fill in missing dates with 0 so the chart looks continuous
    dates = []
    totals = []
    
    # Create a lookup dictionary
    data_dict = {row['sale_date']: row['daily_total'] for row in results}
    
    # Generate last 30 days
    today = datetime.utcnow().date()
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        d_str = d.strftime('%Y-%m-%d')
        dates.append(d_str)
        totals.append(data_dict.get(d_str, 0.0))
        
    return jsonify({'labels': dates, 'data': totals})

@bp.route('/expense-breakdown', methods=['GET'])
def get_expense_breakdown():
    db = get_db()
    query = """
        SELECT category, SUM(amount) as total
        FROM expenses
        WHERE business_id = ?
        GROUP BY category
        ORDER BY total DESC
    """
    results = db.execute(query, (g.user['business_id'],)).fetchall()
    
    labels = [row['category'] for row in results]
    data = [row['total'] for row in results]
    
    return jsonify({'labels': labels, 'data': data})

@bp.route('/profit-trend', methods=['GET'])
def get_profit_trend():
    db = get_db()
    
    # Revenue per month
    rev_query = """
        SELECT strftime('%Y-%m', created_at) as month, SUM(total_amount) as total
        FROM sales
        WHERE business_id = ?
        GROUP BY strftime('%Y-%m', created_at)
    """
    rev_results = db.execute(rev_query, (g.user['business_id'],)).fetchall()
    
    # Expenses per month
    exp_query = """
        SELECT strftime('%Y-%m', expense_date) as month, SUM(amount) as total
        FROM expenses
        WHERE business_id = ?
        GROUP BY strftime('%Y-%m', expense_date)
    """
    exp_results = db.execute(exp_query, (g.user['business_id'],)).fetchall()
    
    rev_dict = {row['month']: row['total'] for row in rev_results}
    exp_dict = {row['month']: row['total'] for row in exp_results}
    
    all_months = sorted(list(set(rev_dict.keys()).union(set(exp_dict.keys()))))
    
    # If no data, provide current month
    if not all_months:
        all_months = [datetime.utcnow().strftime('%Y-%m')]
        
    revenue_data = []
    expense_data = []
    
    for m in all_months:
        revenue_data.append(rev_dict.get(m, 0.0))
        expense_data.append(exp_dict.get(m, 0.0))
        
    return jsonify({
        'labels': all_months,
        'revenue': revenue_data,
        'expenses': expense_data
    })
