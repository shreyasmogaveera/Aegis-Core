"""
AegisCore — Level 2 Probability Calibration Module
Applies post-hoc probability calibration (Platt Scaling or Isotonic Regression)
to raw frozen LSTM model outputs without touching model weights or forward-pass logic.
"""

import pickle
from pathlib import Path
import numpy as np

CALIBRATION_DIR = Path(__file__).resolve().parent

class ProbabilityCalibrator:
    def __init__(self, calibration_dir=None):
        self.calibration_dir = Path(calibration_dir) if calibration_dir else CALIBRATION_DIR
        self._models = {}
        self._load_models()

    def _normalize_district(self, district):
        clean = (district or "").strip().lower()
        mapping = {
            "bagalkot": "bagalkot",
            "belagavi": "belagavi",
            "kodagu": "kodagu",
            "uttara kannada": "uttara_kannada",
            "uttara_kannada": "uttara_kannada",
        }
        return mapping.get(clean, clean)

    def _load_models(self):
        for dist in ["bagalkot", "belagavi", "kodagu", "uttara_kannada"]:
            pkl_path = self.calibration_dir / f"flood_calibration_{dist}.pkl"
            if pkl_path.is_file():
                try:
                    with open(pkl_path, "rb") as f:
                        data = pickle.load(f)
                        self._models[("flood", dist)] = data
                except Exception as err:
                    print(f"[ProbabilityCalibrator] Warning: could not load {pkl_path}: {err}")

    def calibrate(self, hazard, district, raw_probability):
        """
        Calibrate raw model probability to true empirical posterior probability.
        
        Parameters:
        -----------
        hazard: 'Flood' or 'Landslide'
        district: District name (e.g. 'Belagavi')
        raw_probability: float in [0.0, 1.0]

        Returns:
        --------
        float in [0.0, 1.0] or None if calibration is not configured for that hazard/district.
        """
        if raw_probability is None or not np.isfinite(raw_probability):
            return None

        haz = str(hazard or "").strip().lower()
        if haz != "flood":
            # Landslide model is already well-calibrated (ROC-AUC 0.97/0.96, dry median 0.009)
            return None

        dist = self._normalize_district(district)
        entry = self._models.get(("flood", dist))
        if not entry:
            return None

        method = entry.get("method")
        model = entry.get("model")

        try:
            if method == "isotonic":
                calibrated = float(model.predict([float(raw_probability)])[0])
            elif method == "platt":
                calibrated = float(model.predict_proba([[float(raw_probability)]])[0, 1])
            else:
                calibrated = float(raw_probability)

            return round(max(0.0, min(1.0, calibrated)), 6)
        except Exception as exc:
            print(f"[ProbabilityCalibrator] Calibration failed for {hazard}/{district}: {exc}")
            return None

calibrator = ProbabilityCalibrator()
