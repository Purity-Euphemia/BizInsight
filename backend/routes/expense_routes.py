from flask import Blueprint, request, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required

bp = Blueprint('expenses', __name__, url_prefix='/expenses/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('', methods=['GET'])
def get_expenses():
    db = get_db()
    expenses = db.execute(
        "SELECT * FROM expenses WHERE business_id = ? ORDER BY expense_date DESC",
        (g.user['business_id'],)
    ).fetchall()
    return jsonify([dict(e) for e in expenses])

@bp.route('', methods=['POST'])
def add_expense():
    data = request.json
    db = get_db()
    
    title = data.get('title')
    amount = data.get('amount')
    expense_date = data.get('expense_date')
    
    if not title or not expense_date:
        return jsonify({'error': 'Title and date are required'}), 400
        
    try:
        amount = float(amount)
        if amount < 0:
            return jsonify({'error': 'Amount cannot be negative'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid amount'}), 400
        
    try:
        db.execute(
            """INSERT INTO expenses (business_id, title, amount, category, expense_date) 
               VALUES (?, ?, ?, ?, ?)""",
            (g.user['business_id'], title, amount, data.get('category', 'Other'), expense_date)
        )
        db.commit()
        return jsonify({'success': True}), 201
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
        
    title = data.get('title')
    amount = data.get('amount')
    expense_date = data.get('expense_date')
    
    if not title or not expense_date:
        return jsonify({'error': 'Title and date are required'}), 400
        
    try:
        amount = float(amount)
        if amount < 0:
            return jsonify({'error': 'Amount cannot be negative'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid amount'}), 400
        
    db.execute(
        """UPDATE expenses SET 
           title = ?, amount = ?, category = ?, expense_date = ?
           WHERE id = ? AND business_id = ?""",
        (title, amount, data.get('category', 'Other'), expense_date, id, g.user['business_id'])
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
    return jsonify({'success': True})
