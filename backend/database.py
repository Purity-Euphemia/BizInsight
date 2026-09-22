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
