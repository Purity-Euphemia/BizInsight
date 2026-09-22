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

