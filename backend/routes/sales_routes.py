from flask import Blueprint, request, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required
from datetime import datetime, timedelta

bp = Blueprint('sales', __name__, url_prefix='/sales/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('/metrics', methods=['GET'])
def get_metrics():
    db = get_db()
    business_id = g.user['business_id']
    
    # Calculate Today, This Week, This Month, and Total Profit for completed sales
    metrics = db.execute(
        """SELECT 
            SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) as today_sales,
            SUM(CASE WHEN date(created_at) >= date('now', 'weekday 0', '-7 days') THEN 1 ELSE 0 END) as week_sales,
            SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime') THEN 1 ELSE 0 END) as month_sales,
            SUM(profit) as total_profit
           FROM sales 
           WHERE business_id = ? AND status = 'Completed'""",
        (business_id,)
    ).fetchone()
    
    return jsonify({
        'today_sales': metrics['today_sales'] or 0,
        'week_sales': metrics['week_sales'] or 0,
        'month_sales': metrics['month_sales'] or 0,
        'total_profit': metrics['total_profit'] or 0.0
    })

@bp.route('', methods=['GET'])
def get_sales():
    db = get_db()
    business_id = g.user['business_id']
    
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    search = request.args.get('search', '').strip()
    date_filter = request.args.get('date', '').strip()
    status_filter = request.args.get('status', '').strip()
    payment_filter = request.args.get('payment_method', '').strip()
    
    offset = (page - 1) * limit
    
    query = """
        SELECT s.*, c.name as customer_name,
        (SELECT SUM(quantity) FROM sale_items WHERE sale_id = s.id) as total_items
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.business_id = ?
    """
    params = [business_id]
    
    if search:
        # Search by sale id or customer name
        if search.startswith('#') or search.isdigit():
            s_id = search.replace('#', '')
            query += " AND s.id = ?"
            params.append(s_id)
        else:
            query += " AND c.name LIKE ?"
            params.append(f"%{search}%")
            
    if status_filter:
        query += " AND s.status = ?"
        params.append(status_filter)
        
    if payment_filter:
        query += " AND s.payment_method = ?"
        params.append(payment_filter)
        
    if date_filter == 'today':
        query += " AND date(s.created_at) = date('now', 'localtime')"
    elif date_filter == 'week':
        query += " AND date(s.created_at) >= date('now', 'weekday 0', '-7 days')"
    elif date_filter == 'month':
        query += " AND strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime')"
        
    query += " ORDER BY s.created_at DESC"
    
    # Get total count
    count_query = f"SELECT COUNT(*) FROM ({query})"
    total = db.execute(count_query, params).fetchone()[0]
    
    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    sales = db.execute(query, params).fetchall()
    total_pages = (total + limit - 1) // limit
    
    return jsonify({
        'sales': [dict(s) for s in sales],
        'total': total,
        'page': page,
        'limit': limit,
        'total_pages': total_pages
    })

@bp.route('/checkout', methods=['POST'])
def checkout():
    data = request.json
    db = get_db()
    
    items = data.get('items', [])
    payment_method = data.get('payment_method', 'Cash')
    customer_id = data.get('customer_id') # Optional
    discount = float(data.get('discount', 0.0))
    
    if not items:
        return jsonify({'error': 'Cart is empty'}), 400
        
    if discount < 0:
        return jsonify({'error': 'Discount cannot be negative'}), 400
        
    business_id = g.user['business_id']
    subtotal_amount = 0.0
    total_profit_before_discount = 0.0
    
    try:
        # Verify all items securely on the server
        processed_items = []
        for item in items:
            product_id = item.get('product_id')
            cart_qty = int(item.get('quantity', 0))
            
            if cart_qty <= 0:
                raise ValueError(f"Invalid quantity for product ID {product_id}")
                
            product = db.execute(
                "SELECT id, name, selling_price, buying_price, quantity FROM products WHERE id = ? AND business_id = ?",
                (product_id, business_id)
            ).fetchone()
            
            if not product:
                raise ValueError(f"Product not found")
                
            if product['quantity'] < cart_qty:
                raise ValueError(f"Insufficient stock for '{product['name']}'. Available: {product['quantity']}")
                
            unit_price = product['selling_price']
            buying_price = product['buying_price']
            
            item_subtotal = unit_price * cart_qty
            item_profit = (unit_price - buying_price) * cart_qty
            
            subtotal_amount += item_subtotal
            total_profit_before_discount += item_profit
            
            processed_items.append({
                'product_id': product['id'],
                'quantity': cart_qty,
                'unit_price': unit_price,
                'buying_price': buying_price,
                'subtotal': item_subtotal,
                'profit': item_profit,
                'current_stock': product['quantity']
            })
            
        total_amount = subtotal_amount - discount
        if total_amount < 0:
            raise ValueError("Discount cannot exceed subtotal amount")
            
        final_profit = total_profit_before_discount - discount
            
        # Record the sale
        cursor = db.execute(
            """INSERT INTO sales (business_id, customer_id, total_amount, discount, profit, payment_method, status) 
               VALUES (?, ?, ?, ?, ?, ?, 'Completed')""",
            (business_id, customer_id, total_amount, discount, final_profit, payment_method)
        )
        sale_id = cursor.lastrowid
        
        # Record items and update inventory
        for p_item in processed_items:
            db.execute(
                """INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, buying_price, subtotal, profit)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (sale_id, p_item['product_id'], p_item['quantity'], p_item['unit_price'], 
                 p_item['buying_price'], p_item['subtotal'], p_item['profit'])
            )
            
            new_stock = p_item['current_stock'] - p_item['quantity']
            db.execute(
                "UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (new_stock, p_item['product_id'])
            )
            
            db.execute(
                """INSERT INTO inventory_transactions (business_id, product_id, transaction_type, quantity, previous_stock, new_stock, user_id, reference)
                   VALUES (?, ?, 'OUT', ?, ?, ?, ?, ?)""",
                (business_id, p_item['product_id'], p_item['quantity'], p_item['current_stock'], new_stock, g.user['id'], f"Sale #{sale_id}")
            )
            
        db.commit()
        return jsonify({'success': True, 'sale_id': sale_id, 'total_amount': total_amount})
        
    except ValueError as e:
        db.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.rollback()
        return jsonify({'error': 'An unexpected error occurred: ' + str(e)}), 500

@bp.route('/<int:sale_id>', methods=['GET'])
def sale_details(sale_id):
    db = get_db()
    
    sale = db.execute(
        """SELECT s.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
           FROM sales s 
           LEFT JOIN customers c ON s.customer_id = c.id 
           WHERE s.id = ? AND s.business_id = ?""",
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

@bp.route('/<int:sale_id>/cancel', methods=['POST'])
def cancel_sale(sale_id):
    db = get_db()
    business_id = g.user['business_id']
    
    try:
        # Lock and check sale
        sale = db.execute(
            "SELECT id, status FROM sales WHERE id = ? AND business_id = ?",
            (sale_id, business_id)
        ).fetchone()
        
        if not sale:
            return jsonify({'error': 'Sale not found'}), 404
            
        if sale['status'] == 'Cancelled':
            return jsonify({'error': 'Sale is already cancelled'}), 400
            
        # Get items
        items = db.execute("SELECT product_id, quantity FROM sale_items WHERE sale_id = ?", (sale_id,)).fetchall()
        
        # Mark as cancelled
        db.execute("UPDATE sales SET status = 'Cancelled', profit = 0 WHERE id = ?", (sale_id,))
        
        # Restore inventory
        for item in items:
            product = db.execute("SELECT quantity FROM products WHERE id = ?", (item['product_id'],)).fetchone()
            if product:
                curr_qty = product['quantity']
                new_qty = curr_qty + item['quantity']
                
                db.execute(
                    "UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (new_qty, item['product_id'])
                )
                
                db.execute(
                    """INSERT INTO inventory_transactions (business_id, product_id, transaction_type, quantity, previous_stock, new_stock, user_id, reference)
                       VALUES (?, ?, 'IN', ?, ?, ?, ?, ?)""",
                    (business_id, item['product_id'], item['quantity'], curr_qty, new_qty, g.user['id'], f"Sale Cancelled #{sale_id}")
                )
                
        db.commit()
        return jsonify({'success': True})
        
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
