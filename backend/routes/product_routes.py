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
    stock_status = request.args.get('stock_status', '')
    sort_by = request.args.get('sort_by', 'name_asc')
    
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
    except ValueError:
        page = 1
        limit = 50
        
    offset = (page - 1) * limit

    query = "SELECT * FROM products WHERE business_id = ? AND is_active = 1"
    count_query = "SELECT COUNT(*) as total FROM products WHERE business_id = ? AND is_active = 1"
    params = [g.user['business_id']]

    if search:
        query += " AND name LIKE ?"
        count_query += " AND name LIKE ?"
        params.append(f"%{search}%")
    
    if category:
        query += " AND category = ?"
        count_query += " AND category = ?"
        params.append(category)
        
    if stock_status == 'healthy':
        query += " AND quantity > low_stock_limit"
        count_query += " AND quantity > low_stock_limit"
    elif stock_status == 'low':
        query += " AND quantity > 0 AND quantity <= low_stock_limit"
        count_query += " AND quantity > 0 AND quantity <= low_stock_limit"
    elif stock_status == 'out':
        query += " AND quantity = 0"
        count_query += " AND quantity = 0"
        
    if sort_by == 'name_asc':
        query += " ORDER BY name ASC"
    elif sort_by == 'name_desc':
        query += " ORDER BY name DESC"
    elif sort_by == 'price_asc':
        query += " ORDER BY selling_price ASC"
    elif sort_by == 'price_desc':
        query += " ORDER BY selling_price DESC"
    elif sort_by == 'stock_asc':
        query += " ORDER BY quantity ASC"
    elif sort_by == 'stock_desc':
        query += " ORDER BY quantity DESC"
    else:
        query += " ORDER BY updated_at DESC"
        
    query += " LIMIT ? OFFSET ?"
    
    total_count = db.execute(count_query, params).fetchone()['total']
    
    params.extend([limit, offset])
    products = db.execute(query, params).fetchall()
    
    return jsonify({
        'products': [dict(p) for p in products],
        'total': total_count,
        'page': page,
        'limit': limit,
        'total_pages': (total_count + limit - 1) // limit
    })

@bp.route('/metrics', methods=['GET'])
def get_product_metrics():
    db = get_db()
    b_id = g.user['business_id']
    
    metrics = db.execute("""
        SELECT 
            COUNT(*) as total_products,
            SUM(CASE WHEN quantity > 0 AND quantity <= low_stock_limit THEN 1 ELSE 0 END) as low_stock,
            SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
            SUM(quantity * buying_price) as inventory_value
        FROM products 
        WHERE business_id = ? AND is_active = 1
    """, (b_id,)).fetchone()
    
    return jsonify({
        'total_products': metrics['total_products'] or 0,
        'low_stock': metrics['low_stock'] or 0,
        'out_of_stock': metrics['out_of_stock'] or 0,
        'inventory_value': metrics['inventory_value'] or 0
    })

@bp.route('/<int:id>', methods=['GET'])
def get_product(id):
    db = get_db()
    b_id = g.user['business_id']
    
    product = db.execute(
        "SELECT * FROM products WHERE id = ? AND business_id = ? AND is_active = 1",
        (id, b_id)
    ).fetchone()
    
    if not product:
        return jsonify({'error': 'Product not found'}), 404
        
    sales_data = db.execute("""
        SELECT 
            SUM(si.quantity) as total_units_sold,
            SUM(si.subtotal) as total_revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE si.product_id = ? AND s.business_id = ?
    """, (id, b_id)).fetchone()
    
    prod_dict = dict(product)
    prod_dict['total_units_sold'] = sales_data['total_units_sold'] or 0
    prod_dict['total_revenue'] = sales_data['total_revenue'] or 0
    
    return jsonify(prod_dict)

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
        "SELECT id FROM products WHERE id = ? AND business_id = ? AND is_active = 1",
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
        "SELECT id FROM products WHERE id = ? AND business_id = ? AND is_active = 1",
        (id, g.user['business_id'])
    ).fetchone()
    
    if not product:
        return jsonify({'error': 'Product not found or unauthorized'}), 404
        
    # Soft delete
    db.execute("UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (id,))
    db.commit()
    
    return jsonify({'success': True})
