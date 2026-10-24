from flask import Blueprint, request, jsonify
from app.services.smap_service import smap_adapter_service

smap_bp = Blueprint("smap", __name__)

@smap_bp.route("/smap/latest", methods=["GET", "POST"])
def get_latest_smap():
    try:
        payload = request.get_json(silent=True) or {}
        target_date = request.args.get("target_date") or payload.get("target_date")
        district = request.args.get("district") or payload.get("district")

        telemetry = smap_adapter_service.extract_district_telemetry(target_date_str=target_date)

        if district:
            canon = None
            for d in telemetry["districts"]:
                if d.lower() == district.strip().lower():
                    canon = d
                    break
            if canon:
                return jsonify({
                    "status": "success",
                    "district": canon,
                    "telemetry": telemetry["districts"][canon],
                    "metadata": {
                        "granule_id": telemetry["granule_id"],
                        "observation_utc": telemetry["observation_utc"],
                        "observation_date": telemetry["observation_date"],
                        "target_date": telemetry["target_date"],
                        "dataset": telemetry["dataset"],
                        "variable": telemetry["variable"],
                        "units": telemetry["units"]
                    }
                }), 200
            else:
                return jsonify({
                    "error": f"District '{district}' not recognized in SMAP telemetry."
                }), 400

        return jsonify(telemetry), 200

    except Exception as exc:
        print("[SmapRoutes] Error extracting NASA SMAP telemetry:", str(exc))
        return jsonify({
            "status": "error",
            "error": str(exc),
            "smap_status": "unavailable"
        }), 500
