from flask import Blueprint, request, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required

bp = Blueprint('customers', __name__, url_prefix='/customers/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('', methods=['GET'])
def get_customers():
    db = get_db()
    customers = db.execute(
        "SELECT * FROM customers WHERE business_id = ? ORDER BY name ASC",
        (g.user['business_id'],)
    ).fetchall()
    return jsonify([dict(c) for c in customers])

@bp.route('', methods=['POST'])
def add_customer():
    data = request.json
    db = get_db()
    
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name is required'}), 400
        
    try:
        db.execute(
            """INSERT INTO customers (business_id, name, email, phone, address) 
               VALUES (?, ?, ?, ?, ?)""",
            (g.user['business_id'], name, data.get('email', ''), 
             data.get('phone', ''), data.get('address', ''))
        )
        db.commit()
        return jsonify({'success': True}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<int:id>', methods=['PUT'])
def update_customer(id):
    data = request.json
    db = get_db()
    
    # Verify ownership
    customer = db.execute(
        "SELECT id FROM customers WHERE id = ? AND business_id = ?",
        (id, g.user['business_id'])
    ).fetchone()
    
    if not customer:
        return jsonify({'error': 'Customer not found or unauthorized'}), 404
        
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name is required'}), 400
        
    db.execute(
        """UPDATE customers SET 
           name = ?, email = ?, phone = ?, address = ?
           WHERE id = ? AND business_id = ?""",
        (name, data.get('email', ''), data.get('phone', ''), 
         data.get('address', ''), id, g.user['business_id'])
    )
    db.commit()
    return jsonify({'success': True})

@bp.route('/<int:id>', methods=['DELETE'])
def delete_customer(id):
    db = get_db()
    
    customer = db.execute(
        "SELECT id FROM customers WHERE id = ? AND business_id = ?",
        (id, g.user['business_id'])
    ).fetchone()
    
    if not customer:
        return jsonify({'error': 'Customer not found or unauthorized'}), 404
        
    db.execute("DELETE FROM customers WHERE id = ?", (id,))
    db.commit()
    return jsonify({'success': True})

@bp.route('/<int:id>/history', methods=['GET'])
def get_customer_history(id):
    db = get_db()
    
    # Verify ownership
    customer = db.execute(
        "SELECT id, name FROM customers WHERE id = ? AND business_id = ?",
        (id, g.user['business_id'])
    ).fetchone()
    
    if not customer:
        return jsonify({'error': 'Customer not found'}), 404
        
    sales = db.execute(
        """SELECT id, total_amount, payment_method, created_at
           FROM sales
           WHERE customer_id = ? AND business_id = ?
           ORDER BY created_at DESC""",
        (id, g.user['business_id'])
    ).fetchall()
    
    return jsonify({
        'customer_name': customer['name'],
        'sales': [dict(s) for s in sales]
    })
