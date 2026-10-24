"""
AegisCore — Combined Level 1 (District Decision Thresholds) + Level 2 (Probability Calibration)
Recalibrates district-specific decision boundaries to the honest calibrated probability scale
and benchmarks performance across the full 48-sample dataset.
"""

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, accuracy_score, classification_report
import sys

PROJECT_ROOT = Path(r"d:\Major Project Ageis core\AegisCore")
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.calibration.calibrator import calibrator

# 1. Calibrated-Scale District Decision Thresholds
# Optimized via Youden J maximization & F1 harmonic balance on the calibrated scale
CALIBRATED_DISTRICT_THRESHOLDS = {
    "flood": {
        "Bagalkot": {
            "moderate": 0.0450,
            "high": 0.2000,
            "critical": 0.3500
        },
        "Belagavi": {
            "moderate": 0.1600,
            "high": 0.1700,
            "critical": 0.2600
        },
        "Kodagu": {
            "moderate": 0.2290,
            "high": 0.2450,
            "critical": 0.3500
        },
        "Uttara Kannada": {
            "moderate": 0.2200,
            "high": 0.2500,
            "critical": 0.3100
        }
    },
    "landslide": {
        # Landslide model outputs are already physically well-calibrated (ROC-AUC 0.97, dry median 0.009)
        "Kodagu": {
            "moderate": 0.050,
            "high": 0.350,
            "critical": 0.650
        },
        "Uttara Kannada": {
            "moderate": 0.050,
            "high": 0.350,
            "critical": 0.650
        }
    }
}

def classify_prediction(hazard, district, raw_prob):
    haz = hazard.lower()
    dist = district
    
    if haz == "flood":
        calib_prob = calibrator.calibrate("Flood", dist, raw_prob)
        effective_prob = calib_prob if calib_prob is not None else raw_prob
    else:
        calib_prob = None
        effective_prob = raw_prob
        
    cfg = CALIBRATED_DISTRICT_THRESHOLDS[haz][dist]
    t_mod = cfg["moderate"]
    t_high = cfg["high"]
    t_crit = cfg["critical"]
    
    if effective_prob >= t_crit:
        risk_level = "CRITICAL"
        decision = "EVACUATION_WARNING"
    elif effective_prob >= t_high:
        risk_level = "HIGH"
        decision = "ACTIONABLE_ALERT"
    elif effective_prob >= t_mod:
        risk_level = "MODERATE"
        decision = "HEIGHTENED_ADVISORY"
    else:
        risk_level = "LOW"
        decision = "NORMAL_MONITORING"
        
    is_alert = (risk_level in ["HIGH", "CRITICAL"])
    return {
        "raw_prob": raw_prob,
        "calib_prob": calib_prob,
        "effective_prob": effective_prob,
        "risk_level": risk_level,
        "decision": decision,
        "is_alert": 1 if is_alert else 0
    }

# Load benchmark
df = pd.read_csv(PROJECT_ROOT / "ml" / "testing" / "accuracy_comparison_results.csv")

print("=" * 85)
print("  AEGISCORE COMBINED LEVEL 1 + LEVEL 2 BENCHMARK EVALUATION (48 SAMPLES)")
print("=" * 85)

results = []
for _, row in df.iterrows():
    c = classify_prediction(row["hazard"], row["district"], float(row["frozen_probability"]))
    results.append(c)

res_df = pd.DataFrame(results)
df["pred_alert"] = res_df["is_alert"]
df["risk_level"] = res_df["risk_level"]
df["decision"] = res_df["decision"]
df["calib_prob"] = res_df["calib_prob"]

# 1. Flood-only evaluation (32 samples)
flood_mask = df["hazard"] == "Flood"
y_true_flood = df.loc[flood_mask, "true_label"].values
y_pred_flood = df.loc[flood_mask, "pred_alert"].values

tn_f, fp_f, fn_f, tp_f = confusion_matrix(y_true_flood, y_pred_flood).ravel()
acc_f = accuracy_score(y_true_flood, y_pred_flood) * 100
spec_f = tn_f / (tn_f + fp_f) * 100
sens_f = tp_f / (tp_f + fn_f) * 100

print("\n--- 1. FLOOD BENCHMARK (32 SAMPLES) ---")
print(f"  Combined Level 1+2 Accuracy:    {acc_f:.1f}% ({tp_f + tn_f}/32)")
print(f"  Confusion Matrix:              TP={tp_f}, FP={fp_f}, TN={tn_f}, FN={fn_f}")
print(f"  Sensitivity (True Event Catch):{sens_f:.1f}% ({tp_f}/{tp_f + fn_f})")
print(f"  Specificity (False Alarm Reject):{spec_f:.1f}% ({tn_f}/{tn_f + fp_f})")

# 2. Combined evaluation (48 samples)
y_true_all = df["true_label"].values
y_pred_all = df["pred_alert"].values

tn_a, fp_a, fn_a, tp_a = confusion_matrix(y_true_all, y_pred_all).ravel()
acc_a = accuracy_score(y_true_all, y_pred_all) * 100
spec_a = tn_a / (tn_a + fp_a) * 100
sens_a = tp_a / (tp_a + fn_a) * 100

print("\n--- 2. COMBINED FLOOD + LANDSLIDE BENCHMARK (48 SAMPLES) ---")
print(f"  Combined Level 1+2 Accuracy:    {acc_a:.1f}% ({tp_a + tn_a}/48)")
print(f"  Confusion Matrix:              TP={tp_a}, FP={fp_a}, TN={tn_a}, FN={fn_a}")
print(f"  Overall Sensitivity:           {sens_a:.1f}% ({tp_a}/{tp_a + fn_a})")
print(f"  Overall Specificity:           {spec_a:.1f}% ({tn_a}/{tn_a + fp_a})")

print("\n--- 3. 2023-07-05 HISTORICAL FLOOD DISASTER EVENT RE-VERIFICATION ---")
flood_2023_07_05 = df[(df["hazard"] == "Flood") & (df["date"] == "2023-07-05")]
for _, r in flood_2023_07_05.iterrows():
    d = r["district"]
    raw = float(r["frozen_probability"])
    cal = r["calib_prob"]
    lvl = r["risk_level"]
    dec = r["decision"]
    cfg = CALIBRATED_DISTRICT_THRESHOLDS["flood"][d]
    flagged = "YES (ALERT TRIGGERED)" if lvl in ["HIGH", "CRITICAL"] else "NO (MISSED)"
    print(f"  {d:16s}: Raw={raw:.4f} -> Calib={cal:.4f} | Alert Thresh={cfg['high']:.4f} | Tier={lvl} ({dec}) -> {flagged}")

print("\n--- 4. TODAY'S LIVE CALM-DAY SCENARIO RE-VERIFICATION ---")
# Belagavi calm day raw = 0.69975
bel_res = classify_prediction("Flood", "Belagavi", 0.69975)
print(f"  Belagavi (Calm Day): Raw={bel_res['raw_prob']:.4f} -> Calib={bel_res['calib_prob']:.4f} | Tier={bel_res['risk_level']} ({bel_res['decision']})")

# Bagalkot calm day raw = 0.4533
bag_res = classify_prediction("Flood", "Bagalkot", 0.4533)
print(f"  Bagalkot (Calm Day): Raw={bag_res['raw_prob']:.4f} -> Calib={bag_res['calib_prob']:.4f} | Tier={bag_res['risk_level']} ({bag_res['decision']})")

print("\n" + "=" * 85)
