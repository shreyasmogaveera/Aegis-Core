from flask import Flask
from flask_cors import CORS
from app.config import Config
from app.routes.prediction_routes import prediction_bp
from app.routes.health_routes import health_bp
from app.routes.smap_routes import smap_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app, origins=app.config.get('CORS_ORIGIN', '*'))

    # Register blueprints under /api/v1
    app.register_blueprint(prediction_bp, url_prefix='/api/v1')
    app.register_blueprint(health_bp, url_prefix='/api/v1')
    app.register_blueprint(smap_bp, url_prefix='/api/v1')

    return app
