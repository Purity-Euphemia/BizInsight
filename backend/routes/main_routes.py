from flask import Blueprint, render_template

# Create a Blueprint named 'main'
bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    """Render the main entry point of the application."""
    return render_template('index.html')
