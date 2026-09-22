from flask import Blueprint, render_template, g, redirect, url_for
from backend.routes.auth_routes import login_required
from backend.database import get_db

# Create a Blueprint named 'main'
bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    """Render the main entry point of the application."""
    if g.user:
        return redirect(url_for('main.dashboard'))
    return render_template('index.html')

@bp.route('/dashboard')
@login_required
def dashboard():
    """Render the dashboard. Only accessible if logged in."""
    db = get_db()
    
    # Fetch the business associated with the logged-in user
    business = db.execute(
        'SELECT * FROM businesses WHERE id = ?',
        (g.user['business_id'],)
    ).fetchone()
    
    return render_template('dashboard.html', business=business)

@bp.route('/products')
@login_required
def products():
    """Render the product management page."""
    return render_template('products.html')

@bp.route('/inventory')
@login_required
def inventory():
    """Render the inventory management page."""
    return render_template('inventory.html')

@bp.route('/sales')
@login_required
def sales():
    """Render the Point of Sale and Sales History page."""
    return render_template('sales.html')

@bp.route('/customers')
@login_required
def customers():
    """Render the customer management page."""
    return render_template('customers.html')





