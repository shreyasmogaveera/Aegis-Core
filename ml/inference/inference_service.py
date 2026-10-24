from pathlib import Path
import hashlib

import numpy as np


# ============================================================================
# AEGIS-CORE — Frozen M11 / M12 Inference Service
# ============================================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]


# ============================================================================
# FROZEN ARTIFACT PATHS
# ============================================================================

PREPROCESSING_PATH = (
    PROJECT_ROOT
    / "ml"
    / "preprocessing"
    / "M11_Exact_Training_Preprocessing.npz"
)

FLOOD_MODEL_PATH = (
    PROJECT_ROOT
    / "ml"
    / "models"
    / "Flood_T06_FINAL.keras"
)

LANDSLIDE_MODEL_PATH = (
    PROJECT_ROOT
    / "ml"
    / "models"
    / "Landslide_T01_FINAL.keras"
)


# ============================================================================
# FROZEN SHA-256 IDENTITIES
# ============================================================================

EXPECTED_PREPROCESSING_SHA256 = (
    "a52634083d70a3a6a3a28341072f59cc2e48fcb465ec9f373fbd89b6ad201cfb"
)

EXPECTED_FLOOD_MODEL_SHA256 = (
    "7e30a0f69b511bed8c3ce2bb8b8432e960822f74427df66eb09ebde1df3f8910"
)

EXPECTED_LANDSLIDE_MODEL_SHA256 = (
    "6eedfb70c1e51d2fb617b22b7ef7a7d127f47f9a9d807f9e7bf2b71e0fd3463f"
)


# ============================================================================
# LOCKED FEATURE ORDERS
# ============================================================================

FLOOD_FEATURES = [
    "Rainfall_mm",
    "River_WL_1",
    "River_WL_2",
    "River_WL_3",
    "River_WL_4",
    "River_WL_5",
    "River_WL_6",
    "River_WL_7",
    "River_WL_8",
    "River_WL_9",
    "River_WL_10",
    "River_WL_11",
    "River_WL_12",
    "River_WL_13",
    "River_WL_14",
]

LANDSLIDE_FEATURES = [
    "Rainfall_mm",
    "rainfall_sum_3d_mm",
    "rainfall_sum_7d_mm",
    "rainfall_sum_15d_mm",
    "rainfall_sum_30d_mm",
    "causal_smap_age_days",
    "AM_soil_moisture",
    "PM_soil_moisture",
    "AM_soil_moisture_available",
    "PM_soil_moisture_available",
    "SMAP_same_day",
    "terrain_elevation_median",
    "terrain_slope_median",
    "terrain_aspect_circular_mean",
    "terrain_curvature_median",
]


# ============================================================================
# HASHING
# ============================================================================

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda: handle.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


# ============================================================================
# FROZEN PREPROCESSING
# ============================================================================

def load_frozen_preprocessing():
    if not PREPROCESSING_PATH.is_file():
        raise FileNotFoundError(
            f"Frozen preprocessing artifact not found: {PREPROCESSING_PATH}"
        )

    actual_sha256 = sha256_file(PREPROCESSING_PATH)

    if actual_sha256 != EXPECTED_PREPROCESSING_SHA256:
        raise RuntimeError(
            "FROZEN PREPROCESSING HASH MISMATCH\n"
            f"Expected: {EXPECTED_PREPROCESSING_SHA256}\n"
            f"Actual:   {actual_sha256}"
        )

    data = np.load(
        PREPROCESSING_PATH,
        allow_pickle=True,
    )

    required_keys = {
        "flood_training_medians",
        "flood_scaler_mean",
        "flood_scaler_scale",
        "flood_scaler_var",
        "flood_scaler_n_samples_seen",
        "landslide_training_medians",
        "landslide_scaler_mean",
        "landslide_scaler_scale",
        "landslide_scaler_var",
        "landslide_scaler_n_samples_seen",
    }

    if set(data.files) != required_keys:
        missing = required_keys - set(data.files)
        extra = set(data.files) - required_keys

        raise RuntimeError(
            "Unexpected preprocessing artifact structure.\n"
            f"Missing: {sorted(missing)}\n"
            f"Extra: {sorted(extra)}"
        )

    for prefix in ("flood", "landslide"):

        median = data[f"{prefix}_training_medians"]
        mean = data[f"{prefix}_scaler_mean"]
        scale = data[f"{prefix}_scaler_scale"]
        var = data[f"{prefix}_scaler_var"]

        for name, value in (
            ("median", median),
            ("mean", mean),
            ("scale", scale),
            ("var", var),
        ):
            if value.shape != (15,):
                raise RuntimeError(
                    f"{prefix} {name} must have shape (15,), "
                    f"got {value.shape}"
                )

            if not np.all(np.isfinite(value)):
                raise RuntimeError(
                    f"{prefix} {name} contains non-finite values."
                )

        if np.any(scale <= 0):
            raise RuntimeError(
                f"{prefix} scaler contains non-positive scale values."
            )

    return data


# ============================================================================
# EXACT M11 PREPROCESSING
# ============================================================================

def preprocess_sequence(
    environmental_sequence,
    hazard,
    preprocessing=None,
):
    """
    Transform 15 environmental channels into 30 frozen M11 channels.
    """

    if hazard not in {"Flood", "Landslide"}:
        raise ValueError(
            "hazard must be exactly 'Flood' or 'Landslide'."
        )

    if preprocessing is None:
        preprocessing = load_frozen_preprocessing()

    x = np.asarray(
        environmental_sequence,
        dtype=np.float64,
    )

    if x.ndim != 2:
        raise ValueError(
            f"Environmental sequence must be 2-D, got {x.ndim} dimensions."
        )

    if x.shape[1] != 15:
        raise ValueError(
            f"Environmental sequence must contain 15 channels, "
            f"got {x.shape[1]}."
        )

    prefix = (
        "flood"
        if hazard == "Flood"
        else "landslide"
    )

    medians = np.asarray(
        preprocessing[f"{prefix}_training_medians"],
        dtype=np.float64,
    )

    scaler_mean = np.asarray(
        preprocessing[f"{prefix}_scaler_mean"],
        dtype=np.float64,
    )

    scaler_scale = np.asarray(
        preprocessing[f"{prefix}_scaler_scale"],
        dtype=np.float64,
    )

    # Missingness captured BEFORE imputation.
    missingness = np.isnan(x).astype(np.float32)

    # Frozen training-only median imputation.
    imputed = np.where(
        np.isnan(x),
        medians[np.newaxis, :],
        x,
    )

    # Frozen training-fitted scaling.
    scaled = (
        imputed - scaler_mean[np.newaxis, :]
    ) / scaler_scale[np.newaxis, :]

    # Exact 30-channel representation.
    output = np.concatenate(
        [
            scaled.astype(np.float32),
            missingness,
        ],
        axis=1,
    ).astype(np.float32)

    if not np.all(np.isfinite(output)):
        raise RuntimeError(
            "Preprocessing produced non-finite values."
        )

    return output


# ============================================================================
# FROZEN MODEL LOADING
# ============================================================================

def load_frozen_models():
    import keras

    if not FLOOD_MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Flood model not found: {FLOOD_MODEL_PATH}"
        )

    if not LANDSLIDE_MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Landslide model not found: {LANDSLIDE_MODEL_PATH}"
        )

    flood_sha256 = sha256_file(FLOOD_MODEL_PATH)
    landslide_sha256 = sha256_file(LANDSLIDE_MODEL_PATH)

    if flood_sha256 != EXPECTED_FLOOD_MODEL_SHA256:
        raise RuntimeError(
            "FLOOD MODEL HASH MISMATCH\n"
            f"Expected: {EXPECTED_FLOOD_MODEL_SHA256}\n"
            f"Actual:   {flood_sha256}"
        )

    if landslide_sha256 != EXPECTED_LANDSLIDE_MODEL_SHA256:
        raise RuntimeError(
            "LANDSLIDE MODEL HASH MISMATCH\n"
            f"Expected: {EXPECTED_LANDSLIDE_MODEL_SHA256}\n"
            f"Actual:   {landslide_sha256}"
        )

    flood_model = keras.models.load_model(
        FLOOD_MODEL_PATH,
        compile=False,
    )

    landslide_model = keras.models.load_model(
        LANDSLIDE_MODEL_PATH,
        compile=False,
    )

    if flood_model.input_shape != (None, 15, 30):
        raise RuntimeError(
            f"Unexpected Flood model input shape: "
            f"{flood_model.input_shape}"
        )

    if landslide_model.input_shape != (None, 30, 30):
        raise RuntimeError(
            f"Unexpected Landslide model input shape: "
            f"{landslide_model.input_shape}"
        )

    if flood_model.count_params() != 85569:
        raise RuntimeError(
            f"Unexpected Flood parameter count: "
            f"{flood_model.count_params()}"
        )

    if landslide_model.count_params() != 8609:
        raise RuntimeError(
            f"Unexpected Landslide parameter count: "
            f"{landslide_model.count_params()}"
        )

    return flood_model, landslide_model


# ============================================================================
# LOW-LEVEL MODEL INFERENCE
# ============================================================================

def predict_flood(
    preprocessed_sequence,
    model,
):
    x = np.asarray(
        preprocessed_sequence,
        dtype=np.float32,
    )

    if x.shape != (15, 30):
        raise ValueError(
            f"Flood model requires (15, 30), got {x.shape}"
        )

    if not np.all(np.isfinite(x)):
        raise ValueError(
            "Flood model input contains non-finite values."
        )

    prediction = model.predict(
        x[np.newaxis, ...],
        verbose=0,
    )

    probability = float(
        np.asarray(prediction).reshape(-1)[0]
    )

    if not np.isfinite(probability):
        raise RuntimeError(
            "Flood model produced a non-finite probability."
        )

    if not 0.0 <= probability <= 1.0:
        raise RuntimeError(
            f"Flood probability outside [0, 1]: {probability}"
        )

    return probability


def predict_landslide(
    preprocessed_sequence,
    model,
):
    x = np.asarray(
        preprocessed_sequence,
        dtype=np.float32,
    )

    if x.shape != (30, 30):
        raise ValueError(
            f"Landslide model requires (30, 30), got {x.shape}"
        )

    if not np.all(np.isfinite(x)):
        raise ValueError(
            "Landslide model input contains non-finite values."
        )

    prediction = model.predict(
        x[np.newaxis, ...],
        verbose=0,
    )

    probability = float(
        np.asarray(prediction).reshape(-1)[0]
    )

    if not np.isfinite(probability):
        raise RuntimeError(
            "Landslide model produced a non-finite probability."
        )

    if not 0.0 <= probability <= 1.0:
        raise RuntimeError(
            f"Landslide probability outside [0, 1]: {probability}"
        )

    return probability


# ============================================================================
# M12 PREDICTION INTERFACE
# ============================================================================

try:
    from ml.calibration.calibrator import calibrator
except ImportError:
    try:
        from calibration.calibrator import calibrator
    except ImportError:
        calibrator = None


def predict(
    hazard,
    environmental_sequence,
    model=None,
    preprocessing=None,
    district=None,
):
    """
    Main M12 inference boundary.

    Parameters
    ----------
    hazard:
        "Flood" or "Landslide"

    environmental_sequence:
        Flood:      (15, 15)
        Landslide:  (30, 15)

    Returns
    -------
    dict
        Standardized prediction result.
    """

    if hazard not in {"Flood", "Landslide"}:
        raise ValueError(
            "hazard must be exactly 'Flood' or 'Landslide'."
        )

    expected_timesteps = (
        15
        if hazard == "Flood"
        else 30
    )

    sequence = np.asarray(
        environmental_sequence,
        dtype=np.float64,
    )

    expected_shape = (
        expected_timesteps,
        15,
    )

    if sequence.shape != expected_shape:
        raise ValueError(
            f"{hazard} requires environmental sequence "
            f"shape {expected_shape}, got {sequence.shape}"
        )

    if preprocessing is None:
        preprocessing = load_frozen_preprocessing()

    if model is None:
        flood_model, landslide_model = load_frozen_models()

        model = (
            flood_model
            if hazard == "Flood"
            else landslide_model
        )

    processed = preprocess_sequence(
        sequence,
        hazard,
        preprocessing,
    )

    if hazard == "Flood":
        probability = predict_flood(
            processed,
            model,
        )
    else:
        probability = predict_landslide(
            processed,
            model,
        )

    raw_probability = float(probability)
    calibrated_probability = None
    if district and calibrator is not None:
        calibrated_probability = calibrator.calibrate(hazard, district, raw_probability)

    return {
        "hazard": hazard,
        "district": district,
        "event_probability": raw_probability,  # Preserved 100% for contract compatibility
        "raw_probability": raw_probability,
        "calibrated_probability": calibrated_probability,
        "sequence_length": expected_timesteps,
        "environmental_channels": 15,
        "lstm_channels": 30,
        "model_sha256": (
            EXPECTED_FLOOD_MODEL_SHA256
            if hazard == "Flood"
            else EXPECTED_LANDSLIDE_MODEL_SHA256
        ),
        "preprocessing_sha256": EXPECTED_PREPROCESSING_SHA256,
    }


# ============================================================================
# SELF-TEST
# ============================================================================

if __name__ == "__main__":

    print("=" * 70)
    print("AEGIS-CORE M12 INFERENCE WRAPPER SELF-TEST")
    print("=" * 70)

    preprocessing = load_frozen_preprocessing()

    print("Preprocessing: PASS")
    print(
        "  SHA256:",
        sha256_file(PREPROCESSING_PATH),
    )

    flood_model, landslide_model = load_frozen_models()

    print("Flood model: PASS")
    print(
        "  SHA256:",
        sha256_file(FLOOD_MODEL_PATH),
    )
    print(
        "  input:",
        flood_model.input_shape,
    )
    print(
        "  params:",
        flood_model.count_params(),
    )

    print("Landslide model: PASS")
    print(
        "  SHA256:",
        sha256_file(LANDSLIDE_MODEL_PATH),
    )
    print(
        "  input:",
        landslide_model.input_shape,
    )
    print(
        "  params:",
        landslide_model.count_params(),
    )

    # --------------------------------------------------------
    # Synthetic causal sequences.
    # --------------------------------------------------------

    flood_sequence = np.zeros(
        (15, 15),
        dtype=np.float64,
    )

    landslide_sequence = np.zeros(
        (30, 15),
        dtype=np.float64,
    )

    # Deliberate missing values to verify missingness handling.
    flood_sequence[0, 0] = np.nan
    flood_sequence[5, 7] = np.nan

    landslide_sequence[0, 0] = np.nan
    landslide_sequence[10, 6] = np.nan
    landslide_sequence[20, 14] = np.nan

    flood_result = predict(
        "Flood",
        flood_sequence,
        model=flood_model,
        preprocessing=preprocessing,
    )

    landslide_result = predict(
        "Landslide",
        landslide_sequence,
        model=landslide_model,
        preprocessing=preprocessing,
    )

    print("Flood prediction interface: PASS")
    print(
        "  probability:",
        flood_result["event_probability"],
    )
    print(
        "  sequence:",
        flood_result["sequence_length"],
    )
    print(
        "  channels:",
        flood_result["lstm_channels"],
    )

    print("Landslide prediction interface: PASS")
    print(
        "  probability:",
        landslide_result["event_probability"],
    )
    print(
        "  sequence:",
        landslide_result["sequence_length"],
    )
    print(
        "  channels:",
        landslide_result["lstm_channels"],
    )

    # --------------------------------------------------------
    # Determinism.
    # --------------------------------------------------------

    flood_result_2 = predict(
        "Flood",
        flood_sequence,
        model=flood_model,
        preprocessing=preprocessing,
    )

    landslide_result_2 = predict(
        "Landslide",
        landslide_sequence,
        model=landslide_model,
        preprocessing=preprocessing,
    )

    flood_difference = abs(
        flood_result["event_probability"]
        - flood_result_2["event_probability"]
    )

    landslide_difference = abs(
        landslide_result["event_probability"]
        - landslide_result_2["event_probability"]
    )

    if flood_difference != 0.0:
        raise RuntimeError(
            f"Flood determinism failure: {flood_difference}"
        )

    if landslide_difference != 0.0:
        raise RuntimeError(
            f"Landslide determinism failure: {landslide_difference}"
        )

    print("Determinism: PASS")
    print(
        "  Flood difference:",
        flood_difference,
    )
    print(
        "  Landslide difference:",
        landslide_difference,
    )

    print("=" * 70)
    print("STEP 3.9 SELF-TEST: PASS")
    print("=" * 70)