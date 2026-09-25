import functools
from flask import Blueprint, Response, g, request, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash
from backend.database import get_db
from backend.routes.auth_routes import login_required
import json

bp = Blueprint('settings', __name__, url_prefix='/api/settings')

@bp.before_request
@login_required
def require_login():
    pass

@bp.route('/', methods=['GET'])
def get_settings():
    db = get_db()
    b_id = g.user['business_id']
    u_id = g.user['id']
    
    business = db.execute('SELECT * FROM businesses WHERE id = ?', (b_id,)).fetchone()
    user = db.execute('SELECT * FROM users WHERE id = ?', (u_id,)).fetchone()
    
    if not business or not user:
        return jsonify({'error': 'Not found'}), 404
        
    return jsonify({
        'business': dict(business),
        'user': {
            'username': user['username'],
            'created_at': user['created_at']
        }
    })

@bp.route('/business', methods=['PUT'])
def update_business():
    db = get_db()
    b_id = g.user['business_id']
    data = request.json
    
    name = data.get('name')
    b_type = data.get('type')
    phone = data.get('phone')
    address = data.get('address')
    currency = data.get('currency', 'NGN')
    
    if not name:
        return jsonify({'error': 'Business name is required'}), 400
        
    db.execute('''
        UPDATE businesses 
        SET name = ?, type = ?, phone = ?, address = ?, currency = ?
        WHERE id = ?
    ''', (name, b_type, phone, address, currency, b_id))
    db.commit()
    
    return jsonify({'success': True, 'message': 'Business information updated successfully'})

@bp.route('/password', methods=['PUT'])
def update_password():
    db = get_db()
    u_id = g.user['id']
    data = request.json
    
    current_pass = data.get('current_password')
    new_pass = data.get('new_password')
    
    if not current_pass or not new_pass:
        return jsonify({'error': 'Both current and new passwords are required'}), 400
        
    user = db.execute('SELECT * FROM users WHERE id = ?', (u_id,)).fetchone()
    
    if not check_password_hash(user['password_hash'], current_pass):
        return jsonify({'error': 'Incorrect current password'}), 401
        
    if len(new_pass) < 6:
        return jsonify({'error': 'New password must be at least 6 characters'}), 400
        
    db.execute('''
        UPDATE users 
        SET password_hash = ?
        WHERE id = ?
    ''', (generate_password_hash(new_pass), u_id))
    db.commit()
    
    return jsonify({'success': True, 'message': 'Password updated successfully'})
