#!/bin/bash
echo "Initializing test database..."
source venv/bin/activate
export PYTHONPATH=.
export FLASK_APP=backend.app
flask init-db

echo "Running complete test suite with coverage..."
pytest --cov=backend backend/tests/
