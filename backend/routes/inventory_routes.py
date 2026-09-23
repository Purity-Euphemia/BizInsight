from flask import Blueprint, request, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required

bp = Blueprint('inventory', __name__, url_prefix='/inventory')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('/api/metrics', methods=['GET'])
def get_metrics():
    db = get_db()
    business_id = g.user['business_id']
    
    # Calculate metrics
    metrics = db.execute(
        """SELECT 
            COUNT(id) as total_products,
            SUM(CASE WHEN quantity > 0 AND quantity <= low_stock_limit THEN 1 ELSE 0 END) as low_stock,
            SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
            SUM(buying_price * quantity) as inventory_value
           FROM products 
           WHERE business_id = ? AND is_active = 1""",
        (business_id,)
    ).fetchone()
    
    return jsonify({
        'total_products': metrics['total_products'] or 0,
        'low_stock': metrics['low_stock'] or 0,
        'out_of_stock': metrics['out_of_stock'] or 0,
        'inventory_value': metrics['inventory_value'] or 0.0
    })

@bp.route('/api', methods=['GET'])
def get_inventory():
    db = get_db()
    business_id = g.user['business_id']
    
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    search = request.args.get('search', '').strip()
    category = request.args.get('category', '').strip()
    stock_status = request.args.get('stock_status', '').strip()
    sort_by = request.args.get('sort_by', 'name_asc')
    
    offset = (page - 1) * limit
    
    query = "SELECT * FROM products WHERE business_id = ? AND is_active = 1"
    params = [business_id]
    
    if search:
        query += " AND name LIKE ?"
        params.append(f"%{search}%")
        
    if category:
        query += " AND category = ?"
        params.append(category)
        
    if stock_status == 'healthy':
        query += " AND quantity > low_stock_limit AND quantity > 0"
    elif stock_status == 'low':
        query += " AND quantity <= low_stock_limit AND quantity > 0"
    elif stock_status == 'out':
        query += " AND quantity = 0"
        
    # Sorting
    if sort_by == 'stock_low':
        query += " ORDER BY quantity ASC"
    elif sort_by == 'stock_high':
        query += " ORDER BY quantity DESC"
    elif sort_by == 'value_high':
        query += " ORDER BY (buying_price * quantity) DESC"
    elif sort_by == 'recent':
        query += " ORDER BY updated_at DESC"
    else: # name_asc
        query += " ORDER BY name ASC"
        
    total_query = f"SELECT COUNT(*) FROM ({query})"
    total = db.execute(total_query, params).fetchone()[0]
    
    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    products = db.execute(query, params).fetchall()
    
    # Calculate total pages
    total_pages = (total + limit - 1) // limit
    
    return jsonify({
        'products': [dict(p) for p in products],
        'total': total,
        'page': page,
        'limit': limit,
        'total_pages': total_pages
    })

@bp.route('/api/adjust', methods=['POST'])
def adjust_stock():
    data = request.json
    db = get_db()
    
    product_id = data.get('product_id')
    transaction_type = data.get('transaction_type') # 'IN' or 'OUT'
    quantity = int(data.get('quantity', 0))
    reference = data.get('reference', 'Manual Adjustment')
    
    if not product_id or transaction_type not in ('IN', 'OUT') or quantity <= 0:
        return jsonify({'error': 'Invalid adjustment data'}), 400
        
    business_id = g.user['business_id']
    user_id = g.user['id']
        
    # Verify product belongs to user
    product = db.execute(
        "SELECT id, name, quantity FROM products WHERE id = ? AND business_id = ? AND is_active = 1",
        (product_id, business_id)
    ).fetchone()
    
    if not product:
        return jsonify({'error': 'Product not found'}), 404
        
    current_qty = product['quantity']
    new_qty = current_qty + quantity if transaction_type == 'IN' else current_qty - quantity
    
    if new_qty < 0:
        return jsonify({'error': f"Insufficient stock for '{product['name']}'. Available: {current_qty}"}), 400
        
    try:
        # Record the transaction
        db.execute(
            """INSERT INTO inventory_transactions 
               (business_id, product_id, transaction_type, quantity, previous_stock, new_stock, user_id, reference) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (business_id, product_id, transaction_type, quantity, current_qty, new_qty, user_id, reference)
        )
        
        # Update product quantity
        db.execute(
            "UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_qty, product_id)
        )
        
        db.commit()
        return jsonify({'success': True, 'new_quantity': new_qty})
        
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route('/api/history/<int:product_id>', methods=['GET'])
def get_history(product_id):
    db = get_db()
    business_id = g.user['business_id']
    
    # Verify product belongs to business
    product = db.execute(
        "SELECT id FROM products WHERE id = ? AND business_id = ?",
        (product_id, business_id)
    ).fetchone()
    
    if not product:
        return jsonify({'error': 'Product not found'}), 404
        
    history = db.execute(
        """SELECT t.*, u.username 
           FROM inventory_transactions t
           LEFT JOIN users u ON t.user_id = u.id
           WHERE t.product_id = ? AND t.business_id = ?
           ORDER BY t.created_at DESC""",
        (product_id, business_id)
    ).fetchall()
    
    return jsonify([dict(h) for h in history])
