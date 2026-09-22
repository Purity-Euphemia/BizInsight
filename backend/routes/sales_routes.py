from flask import Blueprint, request, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required

bp = Blueprint('sales', __name__, url_prefix='/sales/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('/checkout', methods=['POST'])
def checkout():
    data = request.json
    db = get_db()
    
    items = data.get('items', [])
    payment_method = data.get('payment_method', 'Cash')
    customer_id = data.get('customer_id') # Optional
    
    if not items:
        return jsonify({'error': 'Cart is empty'}), 400
        
    business_id = g.user['business_id']
    total_amount = 0.0
    
    # We will start a manual transaction to ensure all or nothing happens
    try:
        # First, verify all items and calculate total securely on the server
        processed_items = []
        for item in items:
            product_id = item.get('product_id')
            cart_qty = int(item.get('quantity', 0))
            
            if cart_qty <= 0:
                raise ValueError(f"Invalid quantity for product {product_id}")
                
            # Lock the row for update (in SQLite, a simple read within a transaction is often sufficient
            # because of the global database lock, but it's good practice to verify exactly)
            product = db.execute(
                "SELECT id, name, selling_price, quantity FROM products WHERE id = ? AND business_id = ?",
                (product_id, business_id)
            ).fetchone()
            
            if not product:
                raise ValueError(f"Product {product_id} not found")
                
            if product['quantity'] < cart_qty:
                raise ValueError(f"Insufficient stock for '{product['name']}'. Available: {product['quantity']}")
                
            unit_price = product['selling_price']
            subtotal = unit_price * cart_qty
            total_amount += subtotal
            
            processed_items.append({
                'product_id': product['id'],
                'quantity': cart_qty,
                'unit_price': unit_price,
                'subtotal': subtotal,
                'current_stock': product['quantity']
            })
            
        # All items verified. Now record the sale.
        cursor = db.execute(
            "INSERT INTO sales (business_id, customer_id, total_amount, payment_method) VALUES (?, ?, ?, ?)",
            (business_id, customer_id, total_amount, payment_method)
        )
        sale_id = cursor.lastrowid
        
        # Record sale items and update inventory
        for p_item in processed_items:
            # 1. Insert sale_items
            db.execute(
                """INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
                   VALUES (?, ?, ?, ?, ?)""",
                (sale_id, p_item['product_id'], p_item['quantity'], p_item['unit_price'], p_item['subtotal'])
            )
            
            # 2. Update products table stock
            new_stock = p_item['current_stock'] - p_item['quantity']
            db.execute(
                "UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (new_stock, p_item['product_id'])
            )
            
            # 3. Log in inventory_transactions
            db.execute(
                """INSERT INTO inventory_transactions (business_id, product_id, transaction_type, quantity, reference)
                   VALUES (?, ?, 'OUT', ?, ?)""",
                (business_id, p_item['product_id'], p_item['quantity'], f"Sale #{sale_id}")
            )
            
        db.commit()
        return jsonify({'success': True, 'sale_id': sale_id, 'total_amount': total_amount})
        
    except ValueError as e:
        db.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.rollback()
        return jsonify({'error': 'An unexpected error occurred: ' + str(e)}), 500

@bp.route('/history', methods=['GET'])
def history():
    db = get_db()
    
    sales = db.execute(
        """SELECT s.id, s.total_amount, s.payment_method, s.created_at, c.name as customer_name
           FROM sales s
           LEFT JOIN customers c ON s.customer_id = c.id
           WHERE s.business_id = ? 
           ORDER BY s.created_at DESC 
           LIMIT 50""",
        (g.user['business_id'],)
    ).fetchall()
    
    return jsonify([dict(s) for s in sales])

@bp.route('/<int:sale_id>', methods=['GET'])
def sale_details(sale_id):
    db = get_db()
    
    # Verify sale belongs to business
    sale = db.execute(
        "SELECT * FROM sales WHERE id = ? AND business_id = ?",
        (sale_id, g.user['business_id'])
    ).fetchone()
    
    if not sale:
        return jsonify({'error': 'Sale not found'}), 404
        
    items = db.execute(
        """SELECT si.*, p.name as product_name
           FROM sale_items si
           JOIN products p ON si.product_id = p.id
           WHERE si.sale_id = ?""",
        (sale_id,)
    ).fetchall()
    
    return jsonify({
        'sale': dict(sale),
        'items': [dict(i) for i in items]
    })
