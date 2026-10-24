from flask import Blueprint, jsonify
from datetime import datetime

health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "online",
        "service": "AegisCore ML Service (Flask)",
        "timestamp": datetime.utcnow().isoformat()
    }), 200
