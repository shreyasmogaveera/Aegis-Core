"""
AegisCore — Level 2 Calibration Benchmark & Today's Scenario Evaluation
Evaluates:
  1. The 48-sample benchmark across all 4 districts for Flood and Landslide.
  2. Confusion matrix and accuracy before vs after calibration.
  3. Verification of today's calm-day scenario for Belagavi and Bagalkot.
"""

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, accuracy_score

import sys
PROJECT_ROOT = Path(r"d:\Major Project Ageis core\AegisCore")
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

BENCHMARK_CSV = PROJECT_ROOT / "ml" / "testing" / "accuracy_comparison_results.csv"

from ml.calibration.calibrator import calibrator

df = pd.read_csv(BENCHMARK_CSV)

print("=" * 80)
print("  AEGISCORE LEVEL 2 PROBABILITY CALIBRATION BENCHMARK (48 SAMPLES)")
print("=" * 80)

calibrated_probs = []
for idx, row in df.iterrows():
    haz = row["hazard"]
    dist = row["district"]
    p_raw = float(row["frozen_probability"])
    
    if haz == "Flood":
        p_calib = calibrator.calibrate(haz, dist, p_raw)
        calibrated_probs.append(p_calib if p_calib is not None else p_raw)
    else:
        calibrated_probs.append(p_raw)

df["calibrated_probability"] = calibrated_probs

# Flood-only benchmark evaluation (32 samples: 8 dates x 4 districts)
flood_df = df[df["hazard"] == "Flood"].copy()
y_true_f = flood_df["true_label"].values
raw_p_f = flood_df["frozen_probability"].values
cal_p_f = flood_df["calibrated_probability"].values

# Raw at 0.50
pred_raw_50 = (raw_p_f >= 0.50).astype(int)
tn_r, fp_r, fn_r, tp_r = confusion_matrix(y_true_f, pred_raw_50).ravel()
acc_r = accuracy_score(y_true_f, pred_raw_50) * 100

# Calibrated at 0.50
pred_cal_50 = (cal_p_f >= 0.50).astype(int)
tn_c, fp_c, fn_c, tp_c = confusion_matrix(y_true_f, pred_cal_50).ravel()
acc_c = accuracy_score(y_true_f, pred_cal_50) * 100

print(f"\n[FLOOD BENCHMARK (32 SAMPLES)]")
print(f"  Uncalibrated Raw @ 0.50 Cutoff:")
print(f"    Accuracy:    {acc_r:.1f}% ({tp_r + tn_r}/32)")
print(f"    Confusion:   TP={tp_r}, FP={fp_r}, TN={tn_r}, FN={fn_r}")
print(f"    Specificity: {tn_r / (tn_r + fp_r) * 100:.1f}% ({tn_r}/{tn_r + fp_r})")
print(f"    Sensitivity: {tp_r / (tp_r + fn_r) * 100:.1f}% ({tp_r}/{tp_r + fn_r})")

print(f"\n  Level 2 Calibrated @ 0.50 Cutoff:")
print(f"    Accuracy:    {acc_c:.1f}% ({tp_c + tn_c}/32)")
print(f"    Confusion:   TP={tp_c}, FP={fp_c}, TN={tn_c}, FN={fn_c}")
print(f"    Specificity: {tn_c / (tn_c + fp_c) * 100:.1f}% ({tn_c}/{tn_c + fp_c})")
print(f"    Sensitivity: {tp_c / (tp_c + fn_c) * 100:.1f}% ({tp_c}/{tp_c + fn_c})")
print(f"    False Alarms (FP): Reduced from {fp_r} -> {fp_c} (-{fp_r - fp_c} false alarms!)")

# Combined 48 samples
y_true_all = df["true_label"].values
raw_all = (df["frozen_probability"].values >= 0.50).astype(int)
cal_all = (df["calibrated_probability"].values >= 0.50).astype(int)

tn_ra, fp_ra, fn_ra, tp_ra = confusion_matrix(y_true_all, raw_all).ravel()
tn_ca, fp_ca, fn_ca, tp_ca = confusion_matrix(y_true_all, cal_all).ravel()

print(f"\n[COMBINED 48-SAMPLE BENCHMARK (32 FLOOD + 16 LANDSLIDE)]")
print(f"  Uncalibrated Raw @ 0.50: Accuracy = {accuracy_score(y_true_all, raw_all)*100:.1f}% | TP={tp_ra}, FP={fp_ra}, TN={tn_ra}, FN={fn_ra}")
print(f"  Level 2 Calibrated @ 0.50: Accuracy = {accuracy_score(y_true_all, cal_all)*100:.1f}% | TP={tp_ca}, FP={fp_ca}, TN={tn_ca}, FN={fn_ca}")
print(f"  Total False Alarms: Dropped from {fp_ra} -> {fp_ca} (-{fp_ra - fp_ca} false alarms across benchmark)")

print("\n" + "=" * 80)
print("  EVALUATION OF TODAY'S SCENARIO (CALM DRY DAY): BELAGAVI & BAGALKOT")
print("=" * 80)

# Today's observed raw prediction in Belagavi was 0.69975
belagavi_today_raw = 0.69975
belagavi_today_calib = calibrator.calibrate("Flood", "Belagavi", belagavi_today_raw)

# Today's observed raw prediction in Bagalkot was ~0.4533
bagalkot_today_raw = 0.4533
bagalkot_today_calib = calibrator.calibrate("Flood", "Bagalkot", bagalkot_today_raw)

print(f"\n1. Belagavi (Calm Day):")
print(f"   Raw Model Probability:       {belagavi_today_raw:.4f} (70.0%) -> Looked like CRITICAL risk!")
print(f"   Level 2 Calibrated Prob:     {belagavi_today_calib:.4f} ({belagavi_today_calib*100:.1f}%)")
print(f"   Status at Standard 0.50:     {'FALSE ALARM' if belagavi_today_calib >= 0.50 else 'CORRECTLY RESOLVED (NON-EVENT)'}")

print(f"\n2. Bagalkot (Calm Day):")
print(f"   Raw Model Probability:       {bagalkot_today_raw:.4f} (45.3%)")
print(f"   Level 2 Calibrated Prob:     {bagalkot_today_calib:.4f} ({bagalkot_today_calib*100:.1f}%)")
print(f"   Status at Standard 0.50:     {'FALSE ALARM' if bagalkot_today_calib >= 0.50 else 'CORRECTLY RESOLVED (NON-EVENT)'}")

print("\n" + "=" * 80)
