from flask import Blueprint, request, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required
import datetime

bp = Blueprint('products', __name__, url_prefix='/products/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('', methods=['GET'])
def get_products():
    db = get_db()
    search = request.args.get('search', '')
    category = request.args.get('category', '')

    query = "SELECT * FROM products WHERE business_id = ?"
    params = [g.user['business_id']]

    if search:
        query += " AND name LIKE ?"
        params.append(f"%{search}%")
    
    if category:
        query += " AND category = ?"
        params.append(category)
        
    query += " ORDER BY name ASC"

    products = db.execute(query, params).fetchall()
    
    # Convert sqlite.Row objects to dicts
    return jsonify([dict(p) for p in products])

@bp.route('', methods=['POST'])
def add_product():
    data = request.json
    db = get_db()

    # Validate inputs
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    buying_price = float(data.get('buying_price', 0))
    selling_price = float(data.get('selling_price', 0))
    quantity = int(data.get('quantity', 0))
    low_stock_limit = int(data.get('low_stock_limit', 0))
    
    if buying_price < 0 or selling_price < 0 or quantity < 0 or low_stock_limit < 0:
        return jsonify({'error': 'Prices and quantities cannot be negative'}), 400

    try:
        db.execute(
            """INSERT INTO products 
               (business_id, name, category, buying_price, selling_price, quantity, low_stock_limit) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (g.user['business_id'], name, data.get('category', ''), 
             buying_price, selling_price, quantity, low_stock_limit)
        )
        db.commit()
        return jsonify({'success': True}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<int:id>', methods=['PUT'])
def update_product(id):
    data = request.json
    db = get_db()
    
    # Verify product belongs to user's business
    product = db.execute(
        "SELECT id FROM products WHERE id = ? AND business_id = ?",
        (id, g.user['business_id'])
    ).fetchone()
    
    if not product:
        return jsonify({'error': 'Product not found or unauthorized'}), 404

    # Validate inputs
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    buying_price = float(data.get('buying_price', 0))
    selling_price = float(data.get('selling_price', 0))
    quantity = int(data.get('quantity', 0))
    low_stock_limit = int(data.get('low_stock_limit', 0))
    
    if buying_price < 0 or selling_price < 0 or quantity < 0 or low_stock_limit < 0:
        return jsonify({'error': 'Prices and quantities cannot be negative'}), 400

    db.execute(
        """UPDATE products SET 
           name = ?, category = ?, buying_price = ?, selling_price = ?, 
           quantity = ?, low_stock_limit = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND business_id = ?""",
        (name, data.get('category', ''), buying_price, selling_price, 
         quantity, low_stock_limit, id, g.user['business_id'])
    )
    db.commit()
    
    return jsonify({'success': True})

@bp.route('/<int:id>', methods=['DELETE'])
def delete_product(id):
    db = get_db()
    
    # Check if exists and belongs to business
    product = db.execute(
        "SELECT id FROM products WHERE id = ? AND business_id = ?",
        (id, g.user['business_id'])
    ).fetchone()
    
    if not product:
        return jsonify({'error': 'Product not found or unauthorized'}), 404
        
    db.execute("DELETE FROM products WHERE id = ?", (id,))
    db.commit()
    
    return jsonify({'success': True})
