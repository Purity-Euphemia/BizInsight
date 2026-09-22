import os
from flask import Flask
from backend.config import Config
from backend import database

def create_app(test_config=None):
    """Application factory for creating a Flask app instance."""
    
    # Define the path to the frontend folder
    # We use this as both template_folder (for HTML) and static_folder (for CSS/JS)
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
    
    app = Flask(__name__, 
                template_folder=frontend_dir, 
                static_folder=frontend_dir,
                static_url_path='/static')

    if test_config is None:
        # load the instance config, if it exists, when not testing
        app.config.from_object(Config)
    else:
        # load the test config if passed in
        app.config.from_mapping(test_config)

    # Ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    # Register database connection handling and CLI commands
    database.init_app(app)

    # Register blueprints (routes)
    from backend.routes import auth_routes, main_routes, product_routes, inventory_routes, sales_routes, customer_routes, expense_routes, dashboard_routes
    app.register_blueprint(auth_routes.bp)
    app.register_blueprint(main_routes.bp)
    app.register_blueprint(product_routes.bp)
    app.register_blueprint(inventory_routes.bp)
    app.register_blueprint(sales_routes.bp)
    app.register_blueprint(customer_routes.bp)
    app.register_blueprint(expense_routes.bp)
    app.register_blueprint(dashboard_routes.bp)

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)
