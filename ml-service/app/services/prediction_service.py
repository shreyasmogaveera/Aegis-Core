import sys
from pathlib import Path


# ============================================================================
# Make the project root importable.
#
# Project layout:
#
# AegisCore/
# ├── ml/
# │   └── inference/
# │       └── inference_service.py
# └── ml-service/
#     └── app/
#         └── services/
#             └── prediction_service.py
#
# The frozen inference service lives under the project-root ml/ directory.
# ============================================================================

PROJECT_ROOT = Path(__file__).resolve().parents[3]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


import numpy as np

from ml.inference.inference_service import (
    load_frozen_models,
    load_frozen_preprocessing,
    predict,
)


class PredictionService:
    """
    AEGIS-CORE frozen M11/M12 prediction service.

    This service is intentionally thin.

    It does NOT:
      - retrain models
      - refit preprocessing
      - calculate heuristic risk scores
      - invent thresholds
      - accept labels as model inputs
      - modify frozen model artifacts

    It receives an already constructed M12 environmental sequence and
    delegates preprocessing + inference to the authoritative frozen
    inference service.
    """

    FLOOD_DISTRICTS = [
        "Kodagu",
        "Uttara Kannada",
        "Belagavi",
        "Bagalkot",
    ]

    LANDSLIDE_DISTRICTS = [
        "Kodagu",
        "Uttara Kannada",
    ]

    EXPECTED_SEQUENCE_LENGTH = {
        "flood": 15,
        "landslide": 30,
    }

    def __init__(self):
        self.preprocessing = None
        self.flood_model = None
        self.landslide_model = None

        self._load_frozen_artifacts()

    # ------------------------------------------------------------------------
    # Frozen artifact loading
    # ------------------------------------------------------------------------

    def _load_frozen_artifacts(self):
        """
        Load the exact frozen M11 preprocessing and model artifacts.

        Hash verification is performed by inference_service.py.
        """

        print("[PredictionService] Loading frozen M11 preprocessing...")

        self.preprocessing = load_frozen_preprocessing()

        print("[PredictionService] Loading frozen M11 models...")

        (
            self.flood_model,
            self.landslide_model,
        ) = load_frozen_models()

        # Load secondary physical classifier for Belagavi flood prediction
        self.belagavi_secondary_classifier = None
        belagavi_model_path = PROJECT_ROOT / "ml" / "models" / "belagavi_secondary_classifier.pkl"
        if belagavi_model_path.is_file():
            try:
                import pickle
                with open(belagavi_model_path, "rb") as f:
                    self.belagavi_secondary_classifier = pickle.load(f)
                print("[PredictionService] Loaded Belagavi Secondary Physical Classifier (Random Forest).")
            except Exception as e:
                print(f"[PredictionService] Warning: Could not load Belagavi secondary classifier: {e}")

        print("[PredictionService] Frozen M11 artifacts loaded successfully.")

    @staticmethod
    def _extract_belagavi_features(seq):
        seq = np.array(seq, dtype=np.float32)
        row = []
        r = np.nan_to_num(seq[:, 0], nan=0.0)
        row.append(r[-1])
        row.append(np.sum(r[-3:]))
        row.append(np.sum(r[-7:]))
        row.append(np.sum(r))
        row.append(np.max(r))
        row.append(r[-1] - r[-2])
        for ch in [3, 5, 9, 14]:
            q = seq[:, ch]
            valid_mask = ~np.isnan(q)
            if np.sum(valid_mask) > 0:
                q_clean = np.where(valid_mask, q, np.nanmedian(q))
                row.append(q_clean[-1])
                row.append(q_clean[-1] - q_clean[0])
                row.append(q_clean[-1] - q_clean[-3])
                row.append(np.nanmax(q_clean) - np.nanmin(q_clean))
                row.append(np.nanmax(q_clean))
            else:
                row.extend([0.0, 0.0, 0.0, 0.0, 0.0])
        return np.array([row], dtype=np.float32)

    # ------------------------------------------------------------------------
    # District handling
    # ------------------------------------------------------------------------

    @staticmethod
    def _normalize_district(district):
        clean = (district or "").strip().lower()

        mapping = {
            "kodagu": "Kodagu",
            "uttara kannada": "Uttara Kannada",
            "belagavi": "Belagavi",
            "bagalkot": "Bagalkot",
        }

        return mapping.get(clean)

    # ------------------------------------------------------------------------
    # Sequence validation
    # ------------------------------------------------------------------------

    @staticmethod
    def _validate_sequence(sequence, expected_timesteps, hazard):
        """
        Validate the M12 environmental sequence boundary.

        Expected:
            Flood      -> (15, 15)
            Landslide  -> (30, 15)

        The 15 columns are the locked M12 environmental channels.

        Missing values are allowed because M11 preprocessing explicitly
        handles missingness through frozen median imputation plus
        missingness indicators.

        Infinite values are rejected.
        """

        if sequence is None:
            raise ValueError(
                f"{hazard} prediction requires an environmental sequence."
            )

        try:
            array = np.asarray(
                sequence,
                dtype=np.float64,
            )
        except Exception as exc:
            raise ValueError(
                f"Invalid {hazard} environmental sequence."
            ) from exc

        expected_shape = (
            expected_timesteps,
            15,
        )

        if array.shape != expected_shape:
            raise ValueError(
                f"{hazard} environmental sequence must have shape "
                f"{expected_shape}; received {array.shape}."
            )

        # NaN is deliberately allowed.
        # Infinity is not.
        if np.any(np.isinf(array)):
            raise ValueError(
                f"{hazard} environmental sequence contains "
                "infinite values."
            )

        return array

    # ------------------------------------------------------------------------
    # Common result formatting
    # ------------------------------------------------------------------------

    @staticmethod
    def _build_result(
        hazard,
        district,
        probability,
    ):
        """
        Build the ML-service response.

        M12 does not lock an operational threshold, so this service does NOT
        manufacture LOW/MODERATE/HIGH/CRITICAL from arbitrary probability
        cutoffs.

        Likewise, event probability is not mislabeled as confidence.
        """

        return {
            "district": district,
            "hazard": hazard,
            "event_probability": float(probability),
            "prediction_status": "success",
            "model_source": "AEGIS-CORE_M11_FROZEN",
            "operational_decision": None,
        }

    # ------------------------------------------------------------------------
    # Flood prediction
    # ------------------------------------------------------------------------

    def predict_flood(
        self,
        district,
        sequence,
        target_date=None,
        mode="live",
    ):
        canonical_district = self._normalize_district(district)

        if canonical_district is None:
            raise ValueError(
                f"District '{district}' is not recognized."
            )

        if canonical_district not in self.FLOOD_DISTRICTS:
            raise ValueError(
                f"Flood prediction is not supported for '{district}'."
            )

        if mode not in {
            "live",
            "historical_replay",
        }:
            raise ValueError(
                "mode must be 'live' or 'historical_replay'."
            )

        environmental_sequence = self._validate_sequence(
            sequence,
            expected_timesteps=15,
            hazard="Flood",
        )

        pred_dict = predict(
            hazard="Flood",
            environmental_sequence=environmental_sequence,
            model=self.flood_model,
            preprocessing=self.preprocessing,
            district=canonical_district,
        )

        probability = pred_dict["event_probability"]
        raw_probability = pred_dict.get("raw_probability", probability)
        calibrated_probability = pred_dict.get("calibrated_probability")

        decision_engine = "frozen_lstm_level2"
        model_source = "AEGIS-CORE_M11_FROZEN"

        # Secondary-Model-Primary architecture for Belagavi flood predictions
        if canonical_district == "Belagavi" and self.belagavi_secondary_classifier is not None:
            sec_features = self._extract_belagavi_features(environmental_sequence)
            sec_prob = float(self.belagavi_secondary_classifier["model"].predict_proba(sec_features)[0, 1])
            # Authoritative operational probability is the secondary physical classifier
            calibrated_probability = sec_prob
            probability = sec_prob
            decision_engine = "secondary_physical_rf"
            model_source = "Belagavi Secondary Physical Classifier (Random Forest 26-Feature Dynamic Engine; Frozen LSTM preserved for audit)"

        result = self._build_result(
            hazard="Flood",
            district=canonical_district,
            probability=probability,
        )

        result.update(
            {
                "mode": mode,
                "target_date": target_date,
                "event_probability": float(probability),
                "raw_probability": float(raw_probability),
                "calibrated_probability": float(calibrated_probability) if calibrated_probability is not None else None,
                "decision_engine": decision_engine,
                "model_source": model_source,
                "sequence_length": 15,
                "environmental_channels": 15,
                "lstm_channels": 30,
                "smap_status": "not_applicable",
                "smap_age_days": None,
            }
        )

        return result

    # ------------------------------------------------------------------------
    # Landslide prediction
    # ------------------------------------------------------------------------

    def predict_landslide(
        self,
        district,
        sequence,
        target_date=None,
        mode="live",
    ):
        canonical_district = self._normalize_district(district)

        if canonical_district is None:
            raise ValueError(
                f"District '{district}' is not recognized."
            )

        if canonical_district not in self.LANDSLIDE_DISTRICTS:
            raise ValueError(
                f"Landslide prediction is not supported for '{district}'. "
                "Landslide modeling is restricted to Kodagu and "
                "Uttara Kannada."
            )

        if mode not in {
            "live",
            "historical_replay",
        }:
            raise ValueError(
                "mode must be 'live' or 'historical_replay'."
            )

        environmental_sequence = self._validate_sequence(
            sequence,
            expected_timesteps=30,
            hazard="Landslide",
        )

        pred_dict = predict(
            hazard="Landslide",
            environmental_sequence=environmental_sequence,
            model=self.landslide_model,
            preprocessing=self.preprocessing,
            district=canonical_district,
        )

        probability = pred_dict["event_probability"]
        raw_probability = pred_dict.get("raw_probability", probability)
        calibrated_probability = pred_dict.get("calibrated_probability")

        result = self._build_result(
            hazard="Landslide",
            district=canonical_district,
            probability=probability,
        )

        # Inspect target timestep (last step) SMAP features:
        # Channel 5: causal_smap_age_days
        # Channel 8: AM_soil_moisture_available
        # Channel 10: SMAP_same_day
        last_row = environmental_sequence[-1]
        raw_age = last_row[5]
        age_valid = not np.isnan(raw_age) and np.isfinite(raw_age)
        smap_age_days = float(raw_age) if age_valid else None
        smap_avail = bool(last_row[8] == 1.0)
        smap_same = bool(last_row[10] == 1.0)

        if not smap_avail or smap_age_days is None or smap_age_days > 7.0 or smap_age_days < 0.0:
            smap_status = "unavailable"
        elif smap_same or smap_age_days == 0.0:
            smap_status = "same_day"
        else:
            smap_status = "causal_lag"

        result.update(
            {
                "mode": mode,
                "target_date": target_date,
                "raw_probability": float(raw_probability),
                "calibrated_probability": float(calibrated_probability) if calibrated_probability is not None else None,
                "sequence_length": 30,
                "environmental_channels": 15,
                "lstm_channels": 30,
                "smap_status": smap_status,
                "smap_age_days": smap_age_days,
            }
        )

        return result


# ============================================================================
# Singleton service instance
# ============================================================================

prediction_service = PredictionService()