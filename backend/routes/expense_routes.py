from flask import Blueprint, request, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required

bp = Blueprint('expenses', __name__, url_prefix='/expenses/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('/metrics', methods=['GET'])
def get_metrics():
    db = get_db()
    business_id = g.user['business_id']
    
    date_filter = request.args.get('date', '').strip()
    
    # Base condition for selected period
    base_where = "business_id = ?"
    params = [business_id]
    
    if date_filter == 'today':
        base_where += " AND date(expense_date) = date('now', 'localtime')"
    elif date_filter == 'week':
        base_where += " AND date(expense_date) >= date('now', 'weekday 0', '-7 days')"
    elif date_filter == 'month':
        base_where += " AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now', 'localtime')"
    elif date_filter == 'last_month':
        base_where += " AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now', '-1 month', 'localtime')"
    elif date_filter == 'year':
        base_where += " AND strftime('%Y', expense_date) = strftime('%Y', 'now', 'localtime')"
        
    # Total for selected period
    total_period = db.execute(f"SELECT SUM(amount) FROM expenses WHERE {base_where}", params).fetchone()[0] or 0.0
    
    # Total for this month (fixed)
    total_this_month = db.execute(
        "SELECT SUM(amount) FROM expenses WHERE business_id = ? AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now', 'localtime')", 
        (business_id,)
    ).fetchone()[0] or 0.0
    
    # Average for selected period
    avg_expense = db.execute(f"SELECT AVG(amount) FROM expenses WHERE {base_where}", params).fetchone()[0] or 0.0
    
    # Largest Category for selected period
    largest_cat = db.execute(
        f"SELECT category, SUM(amount) as total FROM expenses WHERE {base_where} GROUP BY category ORDER BY total DESC LIMIT 1",
        params
    ).fetchone()
    
    largest_category_name = largest_cat['category'] if largest_cat else "None"
    
    return jsonify({
        'total_expenses': total_period,
        'this_month': total_this_month,
        'largest_category': largest_category_name,
        'average_expense': avg_expense
    })

@bp.route('', methods=['GET'])
def get_expenses():
    db = get_db()
    business_id = g.user['business_id']
    
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    search = request.args.get('search', '').strip()
    category = request.args.get('category', '').strip()
    date_filter = request.args.get('date', '').strip()
    payment_method = request.args.get('payment_method', '').strip()
    sort_by = request.args.get('sort_by', 'date_desc').strip()
    
    offset = (page - 1) * limit
    
    query = "SELECT * FROM expenses WHERE business_id = ?"
    params = [business_id]
    
    if search:
        query += " AND (title LIKE ? OR category LIKE ? OR payment_method LIKE ? OR notes LIKE ?)"
        params.extend([f"%{search}%"] * 4)
        
    if category:
        query += " AND category = ?"
        params.append(category)
        
    if payment_method:
        query += " AND payment_method = ?"
        params.append(payment_method)
        
    if date_filter == 'today':
        query += " AND date(expense_date) = date('now', 'localtime')"
    elif date_filter == 'week':
        query += " AND date(expense_date) >= date('now', 'weekday 0', '-7 days')"
    elif date_filter == 'month':
        query += " AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now', 'localtime')"
    elif date_filter == 'last_month':
        query += " AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now', '-1 month', 'localtime')"
    elif date_filter == 'year':
        query += " AND strftime('%Y', expense_date) = strftime('%Y', 'now', 'localtime')"
        
    if sort_by == 'date_desc':
        query += " ORDER BY expense_date DESC, id DESC"
    elif sort_by == 'date_asc':
        query += " ORDER BY expense_date ASC, id ASC"
    elif sort_by == 'amount_desc':
        query += " ORDER BY amount DESC"
    elif sort_by == 'amount_asc':
        query += " ORDER BY amount ASC"
    elif sort_by == 'cat_asc':
        query += " ORDER BY category ASC"
    elif sort_by == 'cat_desc':
        query += " ORDER BY category DESC"
    else:
        query += " ORDER BY expense_date DESC, id DESC"
        
    # Count total
    count_query = f"SELECT COUNT(*) FROM ({query})"
    total = db.execute(count_query, params).fetchone()[0]
    
    # Add limit offset
    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    expenses = db.execute(query, params).fetchall()
    total_pages = (total + limit - 1) // limit if limit > 0 else 1
    
    return jsonify({
        'expenses': [dict(e) for e in expenses],
        'total': total,
        'page': page,
        'limit': limit,
        'total_pages': total_pages
    })

@bp.route('', methods=['POST'])
def add_expense():
    data = request.json
    db = get_db()
    
    title = data.get('title', '').strip()
    amount = data.get('amount')
    expense_date = data.get('expense_date', '').strip()
    category = data.get('category', 'Other').strip()
    payment_method = data.get('payment_method', 'Cash').strip()
    notes = data.get('notes', '').strip()
    
    if not title or not expense_date:
        return jsonify({'error': 'Description and date are required'}), 400
        
    try:
        amount = float(amount)
        if amount <= 0:
            return jsonify({'error': 'Amount must be greater than zero'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid amount'}), 400
        
    try:
        cursor = db.execute(
            """INSERT INTO expenses (business_id, title, amount, category, expense_date, payment_method, notes) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (g.user['business_id'], title, amount, category, expense_date, payment_method, notes)
        )
        db.commit()
        return jsonify({'success': True, 'id': cursor.lastrowid}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<int:id>', methods=['PUT'])
def update_expense(id):
    data = request.json
    db = get_db()
    
    # Verify ownership
    expense = db.execute(
        "SELECT id FROM expenses WHERE id = ? AND business_id = ?",
        (id, g.user['business_id'])
    ).fetchone()
    
    if not expense:
        return jsonify({'error': 'Expense not found or unauthorized'}), 404
        
    title = data.get('title', '').strip()
    amount = data.get('amount')
    expense_date = data.get('expense_date', '').strip()
    category = data.get('category', 'Other').strip()
    payment_method = data.get('payment_method', 'Cash').strip()
    notes = data.get('notes', '').strip()
    
    if not title or not expense_date:
        return jsonify({'error': 'Description and date are required'}), 400
        
    try:
        amount = float(amount)
        if amount <= 0:
            return jsonify({'error': 'Amount must be greater than zero'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid amount'}), 400
        
    db.execute(
        """UPDATE expenses SET 
           title = ?, amount = ?, category = ?, expense_date = ?, payment_method = ?, notes = ?
           WHERE id = ? AND business_id = ?""",
        (title, amount, category, expense_date, payment_method, notes, id, g.user['business_id'])
    )
    db.commit()
    return jsonify({'success': True})

@bp.route('/<int:id>', methods=['DELETE'])
def delete_expense(id):
    db = get_db()
    
    expense = db.execute(
        "SELECT id FROM expenses WHERE id = ? AND business_id = ?",
        (id, g.user['business_id'])
    ).fetchone()
    
    if not expense:
        return jsonify({'error': 'Expense not found or unauthorized'}), 404
        
    db.execute("DELETE FROM expenses WHERE id = ?", (id,))
    db.commit()
    return jsonify({'success': True, 'message': 'Expense deleted successfully'})
