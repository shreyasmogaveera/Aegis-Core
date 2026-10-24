"""
AegisCore — Standalone Prediction Accuracy Comparison Script (Statistically Rescaled Hydrology)
Compares prediction accuracy between:
  1) Frozen M7 Ground-Truth Datasets (CWC River Gauges + NASA SMAP)
  2) Open-Meteo Rescaled River Hydrology & Weather APIs (GloFAS + ECMWF)

Enhancement:
  Applies statistical z-score rescaling to bridge the physical units mismatch:
    - Open-Meteo GloFAS discharge (m3/s) -> z-score relative to 2023 discharge distribution.
    - Mapped to corresponding river channel water-level distribution in meters MSL:
        scaled_WL = channel_training_mean + (discharge_zscore * channel_training_std)
    - Aligns with the district-specific active channel topology frozen in M7:
        Bagalkot:        Channels 1, 2, 6, 10, 12
        Belagavi:        Channels 3, 5, 9, 14
        Kodagu:          Channels 4, 7, 8, 11
        Uttara Kannada:  Channel 13

This is a read-only analysis script. It does NOT modify models,
preprocessing artifacts, or backend/frontend code.
"""

from datetime import datetime, timedelta
from pathlib import Path
import csv
import sys
import time

import numpy as np
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Set project root on sys.path so inference_service imports cleanly
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.inference.inference_service import (
    load_frozen_models,
    load_frozen_preprocessing,
    predict,
)

REPLAY_DIR = PROJECT_ROOT / "historical-replay"
OUTPUT_CSV = PROJECT_ROOT / "ml" / "testing" / "accuracy_comparison_results.csv"

# Centroid coordinates for district weather queries
DISTRICT_COORDS = {
    "Kodagu": {"lat": 12.4244, "lon": 75.7382},
    "Uttara Kannada": {"lat": 14.8153, "lon": 74.6868},
    "Belagavi": {"lat": 15.8497, "lon": 74.4977},
    "Bagalkot": {"lat": 16.1853, "lon": 75.6868},
}

# 5 distinct hydrological coordinates per district along the relevant river systems:
DISTRICT_RIVER_POINTS = {
    "Kodagu": [
        {"lat": 12.3900, "lon": 75.5300, "name": "Cauvery - Upstream Bhagamandala/Talakaveri"},
        {"lat": 12.4244, "lon": 75.7382, "name": "Cauvery - Mid-upstream Madikeri Basin"},
        {"lat": 12.4550, "lon": 75.9600, "name": "Cauvery - Midstream Kushalnagar"},
        {"lat": 12.5000, "lon": 75.8700, "name": "Harangi Tributary - Somwarpet/Harangi Reservoir"},
        {"lat": 12.4700, "lon": 76.0100, "name": "Cauvery - Downstream Kudige Border"},
    ],
    "Belagavi": [
        {"lat": 15.6300, "lon": 74.5200, "name": "Malaprabha - Upstream Khanapur Ghats"},
        {"lat": 16.5800, "lon": 74.5900, "name": "Krishna - Chikkodi/Kallol Confluence"},
        {"lat": 16.1500, "lon": 74.6300, "name": "Ghataprabha - Hidkal Dam/Hukkeri"},
        {"lat": 16.1700, "lon": 74.8300, "name": "Ghataprabha - Gokak Falls/Gokak"},
        {"lat": 15.7700, "lon": 75.1200, "name": "Malaprabha - Saundatti/Navilatirtha Dam"},
    ],
    "Bagalkot": [
        {"lat": 16.3400, "lon": 75.2900, "name": "Ghataprabha - Mudhol Basin"},
        {"lat": 16.1853, "lon": 75.6868, "name": "Ghataprabha - Bagalkot City/Bilagi Reach"},
        {"lat": 16.5100, "lon": 75.2900, "name": "Krishna - Jamkhandi Reach"},
        {"lat": 16.3300, "lon": 75.8900, "name": "Krishna - Almatti Dam Forebay"},
        {"lat": 15.9200, "lon": 75.6800, "name": "Malaprabha - Badami/Cholachagudda"},
    ],
    "Uttara Kannada": [
        {"lat": 15.2400, "lon": 74.6200, "name": "Kali - Dandeli/Supa Dam Upstream"},
        {"lat": 14.9000, "lon": 74.3300, "name": "Kali - Kadra Dam/Mallapur Midstream"},
        {"lat": 14.8153, "lon": 74.1300, "name": "Kali - Karwar Estuary Downstream"},
        {"lat": 14.2800, "lon": 74.4500, "name": "Sharavathi - Gersoppa/Honnavar Downstream"},
        {"lat": 14.5300, "lon": 74.4200, "name": "Aghanashini - Sirsi/Kumta Basin"},
    ],
}

# District-specific active channels from training data
DISTRICT_ACTIVE_CHANNELS = {
    "Bagalkot": [1, 2, 6, 10, 12],
    "Belagavi": [3, 5, 9, 14],
    "Kodagu": [4, 7, 8, 11],
    "Uttara Kannada": [13],
}

# Frozen static terrain representations from M12_Prediction_Input_Contract.json
DISTRICT_TERRAIN = {
    "Kodagu": {
        "elevation": 809.2864,
        "slope": 8.361528,
        "aspect": 183.026977,
        "curvature": 0.000063,
    },
    "Uttara Kannada": {
        "elevation": 425.01316,
        "slope": 5.729603,
        "aspect": 188.525166,
        "curvature": 0.000039,
    },
}


def get_retry_session():
    session = requests.Session()
    retries = Retry(
        total=5,
        backoff_factor=2.0,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


def load_metadata_csv(path: Path):
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def compute_training_channel_stats(X_flood: np.ndarray):
    stats = {}
    for c in range(1, 15):
        vals = X_flood[:, :, c].flatten()
        valid = vals[np.isfinite(vals)]
        if len(valid) > 0:
            stats[c] = {
                "mean": float(np.mean(valid)),
                "std": float(np.std(valid)) if np.std(valid) > 0 else 1.0,
                "min": float(np.min(valid)),
                "max": float(np.max(valid)),
                "valid_pct": len(valid) / len(vals) * 100.0,
            }
        else:
            stats[c] = {"mean": 0.0, "std": 1.0, "min": 0.0, "max": 0.0, "valid_pct": 0.0}
    return stats


def fetch_open_meteo_archive_and_multi_point_flood(district: str, start_date: str, end_date: str):
    coords = DISTRICT_COORDS[district]
    river_pts = DISTRICT_RIVER_POINTS[district]
    session = get_retry_session()

    # 1. Weather Archive (Rainfall + Hourly Soil Moisture)
    weather_url = "https://archive-api.open-meteo.com/v1/archive"
    weather_params = {
        "latitude": coords["lat"],
        "longitude": coords["lon"],
        "start_date": start_date,
        "end_date": end_date,
        "daily": "precipitation_sum",
        "hourly": "soil_moisture_0_to_7cm",
        "timezone": "Asia/Kolkata",
    }
    w_resp = session.get(weather_url, params=weather_params, timeout=60)
    w_resp.raise_for_status()
    w_data = w_resp.json()

    # 2. Flood API (GloFAS River Discharge for 5 river reach coordinates)
    flood_url = "https://flood-api.open-meteo.com/v1/flood"
    flood_params = {
        "latitude": [p["lat"] for p in river_pts],
        "longitude": [p["lon"] for p in river_pts],
        "start_date": start_date,
        "end_date": end_date,
        "daily": "river_discharge",
    }
    f_resp = session.get(flood_url, params=flood_params, timeout=60)
    f_resp.raise_for_status()
    f_data = f_resp.json()

    # Build date-indexed lookup structures
    daily_rainfall = {}
    for d, p in zip(w_data["daily"]["time"], w_data["daily"]["precipitation_sum"]):
        daily_rainfall[d] = float(p) if p is not None else 0.0

    am_soil = {}
    pm_soil = {}
    hourly_times = w_data["hourly"]["time"]
    hourly_sm = w_data["hourly"]["soil_moisture_0_to_7cm"]

    for t_str, sm_val in zip(hourly_times, hourly_sm):
        if "T06:00" in t_str:
            date_key = t_str.split("T")[0]
            am_soil[date_key] = float(sm_val) if sm_val is not None else np.nan
        elif "T18:00" in t_str:
            date_key = t_str.split("T")[0]
            pm_soil[date_key] = float(sm_val) if sm_val is not None else np.nan

    point_discharges = []
    if isinstance(f_data, list):
        for item in f_data:
            dis_dict = {}
            if "daily" in item and "river_discharge" in item["daily"]:
                for d, q in zip(item["daily"]["time"], item["daily"]["river_discharge"]):
                    dis_dict[d] = float(q) if q is not None else np.nan
            point_discharges.append(dis_dict)
    elif isinstance(f_data, dict):
        dis_dict = {}
        if "daily" in f_data and "river_discharge" in f_data["daily"]:
            for d, q in zip(f_data["daily"]["time"], f_data["daily"]["river_discharge"]):
                dis_dict[d] = float(q) if q is not None else np.nan
        point_discharges.append(dis_dict)

    # Compute discharge statistics per point
    discharge_stats = []
    for pt_dict in point_discharges:
        valid_vals = [v for v in pt_dict.values() if np.isfinite(v)]
        if valid_vals:
            m = float(np.mean(valid_vals))
            s = float(np.std(valid_vals))
            discharge_stats.append({
                "mean": m,
                "std": s if s > 0 else 1.0,
                "min": float(np.min(valid_vals)),
                "max": float(np.max(valid_vals)),
            })
        else:
            discharge_stats.append({"mean": 0.0, "std": 1.0, "min": 0.0, "max": 0.0})

    return {
        "rainfall": daily_rainfall,
        "am_soil": am_soil,
        "pm_soil": pm_soil,
        "point_discharges": point_discharges,
        "discharge_stats": discharge_stats,
    }


def build_rescaled_openmeteo_flood_sequence(
    district: str,
    target_date_str: str,
    om_data: dict,
    train_stats: dict
):
    """
    Build (15, 15) flood sequence with statistical z-score rescaling:
      - Channel 0: Rainfall_mm (from Open-Meteo)
      - Active district channels mapped to corresponding reach discharges:
          discharge_zscore = (raw_discharge - mean_discharge) / std_discharge
          scaled_WL = training_mean[channel] + (discharge_zscore * training_std[channel])
      - Unmonitored channels in that district remain NaN (imputed by frozen medians).
    """
    target_dt = datetime.strptime(target_date_str, "%Y-%m-%d")
    seq = np.full((15, 15), np.nan, dtype=np.float64)
    target_channels = DISTRICT_ACTIVE_CHANNELS[district]
    pt_discharges = om_data["point_discharges"]
    pt_stats = om_data["discharge_stats"]

    for step in range(15):
        day_dt = target_dt - timedelta(days=(14 - step))
        day_str = day_dt.strftime("%Y-%m-%d")

        # Channel 0: Rainfall
        seq[step, 0] = om_data["rainfall"].get(day_str, 0.0)

        # Active channels for this district
        for i, channel_idx in enumerate(target_channels):
            if i < len(pt_discharges):
                raw_discharge = pt_discharges[i].get(day_str, np.nan)
                if np.isfinite(raw_discharge):
                    z = (raw_discharge - pt_stats[i]["mean"]) / pt_stats[i]["std"]
                    scaled_wl = train_stats[channel_idx]["mean"] + (z * train_stats[channel_idx]["std"])
                    seq[step, channel_idx] = scaled_wl

    return seq


def build_openmeteo_landslide_sequence(district: str, target_date_str: str, om_data: dict):
    target_dt = datetime.strptime(target_date_str, "%Y-%m-%d")
    seq = np.zeros((30, 15), dtype=np.float64)
    terrain = DISTRICT_TERRAIN[district]

    for step in range(30):
        day_dt = target_dt - timedelta(days=(29 - step))
        day_str = day_dt.strftime("%Y-%m-%d")

        daily_rain = om_data["rainfall"].get(day_str, 0.0)
        seq[step, 0] = daily_rain

        def get_rolling_sum(window_days):
            total = 0.0
            for w in range(window_days):
                prev_dt = day_dt - timedelta(days=w)
                prev_str = prev_dt.strftime("%Y-%m-%d")
                total += om_data["rainfall"].get(prev_str, 0.0)
            return total

        seq[step, 1] = get_rolling_sum(3)
        seq[step, 2] = get_rolling_sum(7)
        seq[step, 3] = get_rolling_sum(15)
        seq[step, 4] = get_rolling_sum(30)
        seq[step, 5] = 0.0

        am_val = om_data["am_soil"].get(day_str, np.nan)
        pm_val = om_data["pm_soil"].get(day_str, np.nan)

        seq[step, 6] = am_val
        seq[step, 7] = pm_val
        seq[step, 8] = 1.0 if np.isfinite(am_val) else 0.0
        seq[step, 9] = 1.0 if np.isfinite(pm_val) else 0.0
        seq[step, 10] = 1.0

        seq[step, 11] = terrain["elevation"]
        seq[step, 12] = terrain["slope"]
        seq[step, 13] = terrain["aspect"]
        seq[step, 14] = terrain["curvature"]

    return seq


def main():
    print("=" * 95)
    print("AEGIS-CORE ACCURACY BENCHMARK: RESCALED HYDROLOGY vs FROZEN DATASET")
    print("=" * 95)

    # 1. Load Preprocessing and Models
    print("[1/5] Loading frozen M11 preprocessing and LSTM models...")
    preprocessing = load_frozen_preprocessing()
    flood_model, landslide_model = load_frozen_models()
    print("      Models loaded successfully.")

    # 2. Load Frozen Sequences & Metadata
    print("[2/5] Loading historical datasets and sequence arrays...")
    flood_meta = load_metadata_csv(REPLAY_DIR / "Flood_Sequence_Metadata_M7_FROZEN.csv")
    flood_npz = np.load(REPLAY_DIR / "Flood_Sequences_M7_FROZEN.npz")
    X_flood = flood_npz["X_flood"]

    train_channel_stats = compute_training_channel_stats(X_flood)

    ls_meta = load_metadata_csv(REPLAY_DIR / "Landslide_Sequence_Metadata_M7_FROZEN.csv")
    ls_npz = np.load(REPLAY_DIR / "Landslide_Sequences_M7_FROZEN.npz")
    X_ls = ls_npz["X_landslide"]

    # Build fast index mapping
    flood_index_map = {
        (r["district"].strip().lower(), r["target_date"].strip()): (i, r)
        for i, r in enumerate(flood_meta)
    }
    ls_index_map = {
        (r["district"].strip().lower(), r["target_date"].strip()): (i, r)
        for i, r in enumerate(ls_meta)
    }

    # 3. Benchmark Dates
    print("[3/5] Selecting 48 evaluation dates across 2023...")
    flood_sample_dates = [
        "2023-01-15",  # Dry season
        "2023-03-20",  # Pre-monsoon dry
        "2023-05-10",  # Pre-monsoon transition
        "2023-06-25",  # Monsoon onset
        "2023-07-05",  # CONFIRMED FLOOD EVENT (Positive label)
        "2023-07-20",  # Active monsoon
        "2023-08-10",  # Active monsoon
        "2023-10-15",  # Post-monsoon retreat
    ]
    flood_districts = ["Bagalkot", "Belagavi", "Kodagu", "Uttara Kannada"]

    landslide_sample_dates = [
        "2023-02-15",  # Dry
        "2023-05-20",  # Pre-monsoon
        "2023-06-25",  # Early monsoon
        "2023-07-05",  # Heavy rain / flood co-occurrence
        "2023-07-15",  # Monsoon peak
        "2023-07-23",  # Monsoon peak
        "2023-08-05",  # Heavy monsoon
        "2023-10-20",  # Post-monsoon
    ]
    landslide_districts = ["Kodagu", "Uttara Kannada"]

    # 4. Fetch Open-Meteo Data
    print("[4/5] Fetching Open-Meteo data for the 4 districts...")
    om_cache = {}
    for d in ["Bagalkot", "Belagavi", "Kodagu", "Uttara Kannada"]:
        om_cache[d] = fetch_open_meteo_archive_and_multi_point_flood(d, "2022-11-15", "2023-12-31")

    # 5. Run Comparison Inference
    print("[5/5] Executing dual inference on frozen vs Rescaled Open-Meteo tensors...\n")

    results = []
    THRESHOLD = 0.50

    # A. Evaluate Flood Samples (32 cases)
    for dist in flood_districts:
        for t_date in flood_sample_dates:
            key = (dist.lower(), t_date)
            if key not in flood_index_map:
                continue

            idx, meta_row = flood_index_map[key]
            true_label = int(meta_row["target"])

            # Frozen ground-truth tensor
            frozen_seq = X_flood[idx]
            frozen_res = predict("Flood", frozen_seq, flood_model, preprocessing)
            frozen_prob = float(frozen_res["event_probability"])

            # Rescaled Open-Meteo tensor
            om_seq = build_rescaled_openmeteo_flood_sequence(
                dist, t_date, om_cache[dist], train_channel_stats
            )
            om_res = predict("Flood", om_seq, flood_model, preprocessing)
            om_prob = float(om_res["event_probability"])

            frozen_pred = 1 if frozen_prob >= THRESHOLD else 0
            om_pred = 1 if om_prob >= THRESHOLD else 0

            frozen_correct = (frozen_pred == true_label)
            om_correct = (om_pred == true_label)
            drift = abs(frozen_prob - om_prob)

            results.append({
                "date": t_date,
                "district": dist,
                "hazard": "Flood",
                "true_label": true_label,
                "frozen_probability": round(frozen_prob, 4),
                "openmeteo_probability": round(om_prob, 4),
                "frozen_correct": frozen_correct,
                "openmeteo_correct": om_correct,
                "probability_drift": round(drift, 4),
            })

    # B. Evaluate Landslide Samples (16 cases)
    for dist in landslide_districts:
        for t_date in landslide_sample_dates:
            key = (dist.lower(), t_date)
            if key not in ls_index_map:
                continue

            idx, meta_row = ls_index_map[key]
            true_label = int(meta_row["target"])

            frozen_seq = X_ls[idx]
            frozen_res = predict("Landslide", frozen_seq, landslide_model, preprocessing)
            frozen_prob = float(frozen_res["event_probability"])

            om_seq = build_openmeteo_landslide_sequence(dist, t_date, om_cache[dist])
            om_res = predict("Landslide", om_seq, landslide_model, preprocessing)
            om_prob = float(om_res["event_probability"])

            frozen_pred = 1 if frozen_prob >= THRESHOLD else 0
            om_pred = 1 if om_prob >= THRESHOLD else 0

            frozen_correct = (frozen_pred == true_label)
            om_correct = (om_pred == true_label)
            drift = abs(frozen_prob - om_prob)

            results.append({
                "date": t_date,
                "district": dist,
                "hazard": "Landslide",
                "true_label": true_label,
                "frozen_probability": round(frozen_prob, 4),
                "openmeteo_probability": round(om_prob, 4),
                "frozen_correct": frozen_correct,
                "openmeteo_correct": om_correct,
                "probability_drift": round(drift, 4),
            })

    # Save to CSV
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "date",
        "district",
        "hazard",
        "true_label",
        "frozen_probability",
        "openmeteo_probability",
        "frozen_correct",
        "openmeteo_correct",
        "probability_drift",
    ]
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    # Console Display
    header_fmt = "{:<12} {:<15} {:<10} {:<6} {:<12} {:<12} {:<10} {:<10} {:<8}"
    row_fmt    = "{:<12} {:<15} {:<10} {:<6} {:<12.4f} {:<12.4f} {:<10} {:<10} {:<8.4f}"

    print(header_fmt.format(
        "Date", "District", "Hazard", "True", "Frozen P", "OpenMet P", "Froz Ok?", "OM Ok?", "Drift"
    ))
    print("-" * 95)

    frozen_correct_count = 0
    om_correct_count = 0
    total_drift = 0.0

    flood_pos_eval = []

    for r in results:
        f_ok_str = "YES" if r["frozen_correct"] else "NO"
        o_ok_str = "YES" if r["openmeteo_correct"] else "NO"

        print(row_fmt.format(
            r["date"],
            r["district"],
            r["hazard"],
            r["true_label"],
            r["frozen_probability"],
            r["openmeteo_probability"],
            f_ok_str,
            o_ok_str,
            r["probability_drift"]
        ))

        if r["frozen_correct"]:
            frozen_correct_count += 1
        if r["openmeteo_correct"]:
            om_correct_count += 1
        total_drift += r["probability_drift"]

        if r["hazard"] == "Flood" and r["true_label"] == 1:
            flood_pos_eval.append(r)

    total_samples = len(results)
    frozen_acc = (frozen_correct_count / total_samples) * 100.0
    om_acc = (om_correct_count / total_samples) * 100.0
    delta_acc = frozen_acc - om_acc
    avg_drift = total_drift / total_samples

    print("=" * 95)
    print("BENCHMARK SUMMARY RESULTS (STATISTICALLY RESCALED HYDROLOGY)")
    print("=" * 95)
    print(f"Total Samples Evaluated:             {total_samples} (32 Flood + 16 Landslide across 2023)")
    print(f"Frozen Dataset Accuracy:             {frozen_acc:.2f}% ({frozen_correct_count}/{total_samples} correct)")
    print(f"Open-Meteo Rescaled Accuracy:        {om_acc:.2f}% ({om_correct_count}/{total_samples} correct)")
    print(f"Accuracy Delta (Frozen - OpenMeteo): {delta_acc:+.2f} percentage points")
    print(f"Average Probability Drift (MAE):     {avg_drift:.4f}")

    print("\n--- ACTUAL FLOOD EVENT VERIFICATION (2023-07-05) ---")
    for fe in flood_pos_eval:
        status_f = "TRIGGERED" if fe["frozen_probability"] >= THRESHOLD else "MISSED"
        status_o = "TRIGGERED" if fe["openmeteo_probability"] >= THRESHOLD else "MISSED"
        print(f"  {fe['district']:<15} | True=1 | Frozen P = {fe['frozen_probability']:.4f} ({status_f}) | OpenMeteo P = {fe['openmeteo_probability']:.4f} ({status_o})")

    print(f"\n[Saved] Detailed results written to: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
