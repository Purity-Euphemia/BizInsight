import functools
from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for
)
from werkzeug.security import check_password_hash, generate_password_hash
from backend.database import get_db

bp = Blueprint('auth', __name__, url_prefix='/auth')

@bp.route('/register', methods=('GET', 'POST'))
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        business_name = request.form['business_name']
        
        db = get_db()
        error = None

        if not username:
            error = 'Username is required.'
        elif not password:
            error = 'Password is required.'
        elif not business_name:
            error = 'Business name is required.'

        if error is None:
            try:
                # 1. First, create the business
                cursor = db.execute(
                    "INSERT INTO businesses (name) VALUES (?)",
                    (business_name,),
                )
                business_id = cursor.lastrowid
                
                # 2. Then, create the user and link to the business
                db.execute(
                    "INSERT INTO users (username, password_hash, business_id) VALUES (?, ?, ?)",
                    (username, generate_password_hash(password), business_id),
                )
                db.commit()
            except db.IntegrityError:
                error = f"User {username} is already registered."
            else:
                return redirect(url_for("auth.login"))

        flash(error)

    return render_template('register.html')

@bp.route('/login', methods=('GET', 'POST'))
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        db = get_db()
        error = None
        
        # Fetch the user from the database
        user = db.execute(
            'SELECT * FROM users WHERE username = ?', (username,)
        ).fetchone()

        if user is None:
            error = 'Incorrect username.'
        elif not check_password_hash(user['password_hash'], password):
            error = 'Incorrect password.'

        if error is None:
            # Store the user ID in the session to keep them logged in
            session.clear()
            session['user_id'] = user['id']
            return redirect(url_for('main.dashboard'))

        flash(error)

    return render_template('login.html')

@bp.before_app_request
def load_logged_in_user():
    """If a user id is stored in the session, load the user object from 
    the database into ``g.user``."""
    user_id = session.get('user_id')

    if user_id is None:
        g.user = None
    else:
        g.user = get_db().execute(
            'SELECT * FROM users WHERE id = ?', (user_id,)
        ).fetchone()

@bp.route('/logout')
def logout():
    """Clear the current session, including the stored user id."""
    session.clear()
    return redirect(url_for('main.index'))

def login_required(view):
    """View decorator that redirects anonymous users to the login page."""
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for('auth.login'))

        return view(**kwargs)

    return wrapped_view
