from flask import Blueprint, request, jsonify

from app.services.prediction_service import prediction_service


prediction_bp = Blueprint(
    "prediction",
    __name__,
)


@prediction_bp.route("/predict/flood", methods=["POST"])
def predict_flood():
    try:
        payload = request.get_json(silent=True) or {}

        district = payload.get("district")
        sequence = payload.get("sequence")
        target_date = payload.get("target_date")
        mode = payload.get("mode", "live")

        if district is None:
            return jsonify({
                "error": "Missing required field: district"
            }), 400

        if sequence is None:
            return jsonify({
                "error": "Missing required field: sequence"
            }), 400

        result = prediction_service.predict_flood(
            district=district,
            sequence=sequence,
            target_date=target_date,
            mode=mode,
        )

        return jsonify(result), 200

    except ValueError as exc:
        return jsonify({
            "error": str(exc)
        }), 400

    except Exception as exc:
        print(
            "[MLService] Flood prediction error:",
            str(exc),
        )

        return jsonify({
            "error": "Internal flood prediction error"
        }), 500


@prediction_bp.route("/predict/landslide", methods=["POST"])
def predict_landslide():
    try:
        payload = request.get_json(silent=True) or {}

        district = payload.get("district")
        sequence = payload.get("sequence")
        target_date = payload.get("target_date")
        mode = payload.get("mode", "live")

        if district is None:
            return jsonify({
                "error": "Missing required field: district"
            }), 400

        if sequence is None:
            return jsonify({
                "error": "Missing required field: sequence"
            }), 400

        result = prediction_service.predict_landslide(
            district=district,
            sequence=sequence,
            target_date=target_date,
            mode=mode,
        )

        return jsonify(result), 200

    except ValueError as exc:
        return jsonify({
            "error": str(exc)
        }), 400

    except Exception as exc:
        print(
            "[MLService] Landslide prediction error:",
            str(exc),
        )

        return jsonify({
            "error": "Internal landslide prediction error"
        }), 500