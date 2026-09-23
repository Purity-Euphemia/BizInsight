from flask import Blueprint, request, jsonify, g
from backend.database import get_db
from backend.routes.auth_routes import login_required
from datetime import datetime

bp = Blueprint('customers', __name__, url_prefix='/customers/api')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('/metrics', methods=['GET'])
def get_metrics():
    db = get_db()
    business_id = g.user['business_id']
    
    metrics = db.execute(
        """SELECT 
            (SELECT COUNT(*) FROM customers WHERE business_id = ? AND is_archived = 0) as total_customers,
            (SELECT COUNT(*) FROM customers WHERE business_id = ? AND is_archived = 0 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')) as new_customers,
            (SELECT COUNT(DISTINCT c.id) FROM customers c JOIN sales s ON c.id = s.customer_id WHERE c.business_id = ? AND c.is_archived = 0 AND s.status = 'Completed' GROUP BY c.id HAVING COUNT(s.id) > 1) as returning_customers,
            (SELECT SUM(s.total_amount) FROM sales s JOIN customers c ON s.customer_id = c.id WHERE s.business_id = ? AND c.is_archived = 0 AND s.status = 'Completed') as total_revenue
        """,
        (business_id, business_id, business_id, business_id)
    ).fetchone()
    
    return jsonify({
        'total_customers': metrics['total_customers'] or 0,
        'new_customers': metrics['new_customers'] or 0,
        # returning_customers will return a row count for the subquery if it wasn't wrapped properly, wait:
        # SQLite subquery returns a single value, but SELECT COUNT from GROUP BY returns multiple rows if there are multiple returning customers.
        # So I will do it with two queries for safety.
    })

# Overriding metrics route to be safer with SQLite aggregations
@bp.route('/metrics', methods=['GET'], endpoint='metrics_safe')
def get_metrics_safe():
    db = get_db()
    business_id = g.user['business_id']
    
    total = db.execute("SELECT COUNT(*) FROM customers WHERE business_id = ? AND is_archived = 0", (business_id,)).fetchone()[0]
    new_c = db.execute("SELECT COUNT(*) FROM customers WHERE business_id = ? AND is_archived = 0 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')", (business_id,)).fetchone()[0]
    returning = db.execute("SELECT COUNT(*) FROM (SELECT customer_id FROM sales WHERE business_id = ? AND status = 'Completed' AND customer_id IS NOT NULL GROUP BY customer_id HAVING COUNT(id) > 1)", (business_id,)).fetchone()[0]
    revenue = db.execute("SELECT SUM(total_amount) FROM sales WHERE business_id = ? AND status = 'Completed' AND customer_id IS NOT NULL", (business_id,)).fetchone()[0] or 0.0
    
    return jsonify({
        'total_customers': total,
        'new_customers': new_c,
        'returning_customers': returning,
        'total_revenue': revenue
    })

@bp.route('', methods=['GET'])
def get_customers():
    db = get_db()
    business_id = g.user['business_id']
    
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    search = request.args.get('search', '').strip()
    c_type = request.args.get('type', '').strip()
    c_activity = request.args.get('activity', '').strip()
    date_filter = request.args.get('date', '').strip()
    
    # We fetch 100 for the POS system if limit is large
    offset = (page - 1) * limit
    
    query = """
        SELECT c.*, 
            COUNT(s.id) as total_purchases,
            IFNULL(SUM(s.total_amount), 0.0) as total_spent,
            MAX(s.created_at) as last_purchase
        FROM customers c
        LEFT JOIN sales s ON c.id = s.customer_id AND s.status = 'Completed'
        WHERE c.business_id = ? AND c.is_archived = 0
    """
    params = [business_id]
    
    if search:
        query += " AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
        
    if date_filter == 'today':
        query += " AND date(c.created_at) = date('now', 'localtime')"
    elif date_filter == 'week':
        query += " AND date(c.created_at) >= date('now', 'weekday 0', '-7 days')"
    elif date_filter == 'month':
        query += " AND strftime('%Y-%m', c.created_at) = strftime('%Y-%m', 'now', 'localtime')"
        
    query += " GROUP BY c.id "
    
    having_clauses = []
    if c_type == 'New':
        having_clauses.append("total_purchases <= 1")
    elif c_type == 'Returning':
        having_clauses.append("total_purchases > 1")
        
    if c_activity == 'Active':
        having_clauses.append("total_purchases > 0")
    elif c_activity == 'None':
        having_clauses.append("total_purchases = 0")
        
    if having_clauses:
        query += " HAVING " + " AND ".join(having_clauses)
        
    query += " ORDER BY c.name ASC"
    
    # Total count using a subquery
    count_query = f"SELECT COUNT(*) FROM ({query})"
    total = db.execute(count_query, params).fetchone()[0]
    
    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    customers = db.execute(query, params).fetchall()
    total_pages = (total + limit - 1) // limit if limit > 0 else 1
    
    return jsonify({
        'customers': [dict(c) for c in customers],
        'total': total,
        'page': page,
        'limit': limit,
        'total_pages': total_pages
    })

@bp.route('/validate', methods=['POST'])
def validate_duplicate():
    data = request.json
    db = get_db()
    
    email = data.get('email', '').strip()
    phone = data.get('phone', '').strip()
    
    if not email and not phone:
        return jsonify({'duplicate': False})
        
    query = "SELECT id FROM customers WHERE business_id = ? AND is_archived = 0 AND ("
    params = [g.user['business_id']]
    
    conditions = []
    if email:
        conditions.append("email = ?")
        params.append(email)
    if phone:
        conditions.append("phone = ?")
        params.append(phone)
        
    query += " OR ".join(conditions) + ") LIMIT 1"
    
    exists = db.execute(query, params).fetchone()
    
    return jsonify({'duplicate': bool(exists)})

@bp.route('', methods=['POST'])
def add_customer():
    data = request.json
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    phone = data.get('phone', '').strip()
    address = data.get('address', '').strip()
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400
        
    db = get_db()
    
    try:
        cursor = db.execute(
            """INSERT INTO customers (business_id, name, email, phone, address) 
               VALUES (?, ?, ?, ?, ?)""",
            (g.user['business_id'], name, email, phone, address)
        )
        db.commit()
        return jsonify({'success': True, 'customer_id': cursor.lastrowid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<int:id>', methods=['PUT'])
def edit_customer(id):
    data = request.json
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    phone = data.get('phone', '').strip()
    address = data.get('address', '').strip()
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400
        
    db = get_db()
    
    # Check owner
    cust = db.execute("SELECT id FROM customers WHERE id = ? AND business_id = ?", (id, g.user['business_id'])).fetchone()
    if not cust:
        return jsonify({'error': 'Customer not found'}), 404
        
    db.execute(
        """UPDATE customers 
           SET name = ?, email = ?, phone = ?, address = ? 
           WHERE id = ?""",
        (name, email, phone, address, id)
    )
    db.commit()
    return jsonify({'success': True})

@bp.route('/<int:id>', methods=['DELETE'])
def archive_customer(id):
    db = get_db()
    business_id = g.user['business_id']
    
    # Check owner
    cust = db.execute("SELECT id FROM customers WHERE id = ? AND business_id = ?", (id, business_id)).fetchone()
    if not cust:
        return jsonify({'error': 'Customer not found'}), 404
        
    # Check if they have sales
    sales_count = db.execute("SELECT COUNT(*) FROM sales WHERE customer_id = ?", (id,)).fetchone()[0]
    
    if sales_count > 0:
        # Archive
        db.execute("UPDATE customers SET is_archived = 1 WHERE id = ?", (id,))
        message = "Customer archived successfully because they have existing sales."
    else:
        # Hard Delete
        db.execute("DELETE FROM customers WHERE id = ?", (id,))
        message = "Customer deleted completely."
        
    db.commit()
    return jsonify({'success': True, 'message': message})

@bp.route('/<int:id>/insights', methods=['GET'])
def get_insights(id):
    db = get_db()
    business_id = g.user['business_id']
    
    cust = db.execute("SELECT id FROM customers WHERE id = ? AND business_id = ?", (id, business_id)).fetchone()
    if not cust:
        return jsonify({'error': 'Customer not found'}), 404
        
    # Get total spent, count, avg
    stats = db.execute("""
        SELECT COUNT(id) as count, SUM(total_amount) as total_spent, AVG(total_amount) as avg_order, MAX(created_at) as last_purchase
        FROM sales 
        WHERE customer_id = ? AND status = 'Completed'
    """, (id,)).fetchone()
    
    # Get most purchased product
    fav_product = db.execute("""
        SELECT p.name, SUM(si.quantity) as qty
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.customer_id = ? AND s.status = 'Completed'
        GROUP BY p.id
        ORDER BY qty DESC
        LIMIT 1
    """, (id,)).fetchone()
    
    return jsonify({
        'total_spent': stats['total_spent'] or 0.0,
        'purchase_count': stats['count'] or 0,
        'avg_order': stats['avg_order'] or 0.0,
        'last_purchase': stats['last_purchase'],
        'favorite_product': fav_product['name'] if fav_product else None
    })

@bp.route('/<int:id>/sales', methods=['GET'])
def get_customer_sales(id):
    db = get_db()
    business_id = g.user['business_id']
    
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 5))
    offset = (page - 1) * limit
    
    cust = db.execute("SELECT id FROM customers WHERE id = ? AND business_id = ?", (id, business_id)).fetchone()
    if not cust:
        return jsonify({'error': 'Customer not found'}), 404
        
    total = db.execute("SELECT COUNT(*) FROM sales WHERE customer_id = ?", (id,)).fetchone()[0]
    
    sales = db.execute("""
        SELECT s.*, (SELECT SUM(quantity) FROM sale_items WHERE sale_id = s.id) as total_items
        FROM sales s
        WHERE s.customer_id = ?
        ORDER BY s.created_at DESC
        LIMIT ? OFFSET ?
    """, (id, limit, offset)).fetchall()
    
    total_pages = (total + limit - 1) // limit if limit > 0 else 1
    
    return jsonify({
        'sales': [dict(s) for s in sales],
        'total': total,
        'page': page,
        'total_pages': total_pages
    })
