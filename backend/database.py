import sqlite3
import os
from flask import g
from backend.config import Config

def get_db():
    """
    Connect to the application's configured database. The connection
    is unique for each request and will be reused if this is called
    again.
    """
    if 'db' not in g:
        # Extract the file path from the SQLAlchemy URI format 'sqlite:////path/to/db'
        db_path = Config.SQLALCHEMY_DATABASE_URI.replace('sqlite:///', '')
        
        g.db = sqlite3.connect(
            db_path,
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        # Return rows as dictionaries instead of tuples for easier access
        g.db.row_factory = sqlite3.Row

    return g.db

def close_db(e=None):
    """If this request connected to the database, close the connection."""
    db = g.pop('db', None)

    if db is not None:
        db.close()

def init_db():
    """Clear existing data and create new tables."""
    db = get_db()
    
    # Locate the schema.sql file
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    
    with open(schema_path, 'r', encoding='utf8') as f:
        db.executescript(f.read())

import click
from flask.cli import with_appcontext

@click.command('init-db')
@with_appcontext
def init_db_command():
    """Clear the existing data and create new tables."""
    init_db()
    click.echo('Initialized the database.')

def init_app(app):
    """Register database functions with the Flask app."""
    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)
