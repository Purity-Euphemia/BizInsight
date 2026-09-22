from flask import Blueprint, request, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required

bp = Blueprint('inventory', __name__, url_prefix='/inventory/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('/status', methods=['GET'])
def get_inventory_status():
    db = get_db()
    
    products = db.execute(
        """SELECT id, name, category, quantity, low_stock_limit 
           FROM products 
           WHERE business_id = ? 
           ORDER BY name ASC""",
        (g.user['business_id'],)
    ).fetchall()
    
    # Calculate summary stats
    total_products = len(products)
    low_stock = 0
    out_of_stock = 0
    
    items = []
    for p in products:
        status = 'In Stock'
        if p['quantity'] == 0:
            status = 'Out of Stock'
            out_of_stock += 1
        elif p['quantity'] <= p['low_stock_limit']:
            status = 'Low Stock'
            low_stock += 1
            
        items.append({
            'id': p['id'],
            'name': p['name'],
            'category': p['category'],
            'quantity': p['quantity'],
            'low_stock_limit': p['low_stock_limit'],
            'status': status
        })
        
    return jsonify({
        'summary': {
            'total_products': total_products,
            'low_stock': low_stock,
            'out_of_stock': out_of_stock
        },
        'items': items
    })

@bp.route('/adjust', methods=['POST'])
def adjust_stock():
    data = request.json
    db = get_db()
    
    product_id = data.get('product_id')
    transaction_type = data.get('transaction_type') # 'IN' or 'OUT'
    quantity = int(data.get('quantity', 0))
    reference = data.get('reference', 'Manual Adjustment')
    
    if not product_id or transaction_type not in ('IN', 'OUT') or quantity <= 0:
        return jsonify({'error': 'Invalid adjustment data'}), 400
        
    # Verify product belongs to user
    product = db.execute(
        "SELECT id, quantity FROM products WHERE id = ? AND business_id = ?",
        (product_id, g.user['business_id'])
    ).fetchone()
    
    if not product:
        return jsonify({'error': 'Product not found'}), 404
        
    current_qty = product['quantity']
    new_qty = current_qty + quantity if transaction_type == 'IN' else current_qty - quantity
    
    if new_qty < 0:
        return jsonify({'error': 'Insufficient stock for this transaction'}), 400
        
    try:
        # Record the transaction
        db.execute(
            """INSERT INTO inventory_transactions 
               (business_id, product_id, transaction_type, quantity, reference) 
               VALUES (?, ?, ?, ?, ?)""",
            (g.user['business_id'], product_id, transaction_type, quantity, reference)
        )
        
        # Update product quantity
        db.execute(
            "UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_qty, product_id)
        )
        
        db.commit()
        return jsonify({'success': True, 'new_quantity': new_qty})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
