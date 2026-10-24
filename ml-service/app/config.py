import os

class Config:
    PORT = int(os.getenv("PORT", 5001))
    DEBUG = os.getenv("FLASK_ENV", "development") == "development"
    # Flexible ML prediction time window configuration (default 72 hours, fully configurable)
    DEFAULT_TIME_WINDOW_HOURS = int(os.getenv("TIME_WINDOW_HOURS", 72))
    MODEL_DIR = os.getenv("MODEL_DIR", "trained_models")
    CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")
