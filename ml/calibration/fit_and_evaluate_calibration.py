import os
import sys
import pickle
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss, confusion_matrix, roc_auc_score
from sklearn.calibration import calibration_curve

PROJECT_ROOT = Path(r"d:\Major Project Ageis core\AegisCore")
CALIBRATION_DIR = PROJECT_ROOT / "ml" / "calibration"
CALIBRATION_DIR.mkdir(parents=True, exist_ok=True)

# 1. Load data
meta = pd.read_csv(PROJECT_ROOT / "historical-replay" / "Flood_Sequence_Metadata_M7_FROZEN.csv")
cache = np.load(PROJECT_ROOT / "scratch" / "preds_cache.npz")
meta["raw_prob"] = cache["flood_preds"]
meta["year"] = pd.to_datetime(meta["target_date"]).dt.year

districts = ["Bagalkot", "Belagavi", "Kodagu", "Uttara Kannada"]

print("=" * 90)
print("  AEGISCORE LEVEL 2 PROBABILITY CALIBRATION ANALYSIS (FLOOD_T06_FINAL)")
print("=" * 90)

results = {}

for dist in districts:
    print(f"\n" + "#" * 90)
    print(f"  DISTRICT: {dist.upper()}")
    print("#" * 90)
    
    sub = meta[meta["district"] == dist].copy()
    train_mask = sub["year"] <= 2022
    val_mask = sub["year"] >= 2023
    
    train_df = sub[train_mask]
    val_df = sub[val_mask]
    
    X_train_raw = train_df["raw_prob"].values
    y_train = train_df["target"].values
    
    X_val_raw = val_df["raw_prob"].values
    y_val = val_df["target"].values
    
    print(f"Dataset split: Train (2015-2022) = {len(train_df)} (Pos: {y_train.sum()}) | Val (2023-2024) = {len(val_df)} (Pos: {y_val.sum()})")
    print(f"Raw Prob Summary - Train: Min={X_train_raw.min():.4f}, Mean={X_train_raw.mean():.4f}, Max={X_train_raw.max():.4f}")
    print(f"Raw Prob Summary - Val:   Min={X_val_raw.min():.4f}, Mean={X_val_raw.mean():.4f}, Max={X_val_raw.max():.4f}")
    
    # Baseline: Uncalibrated metrics on validation set
    brier_uncal = brier_score_loss(y_val, X_val_raw)
    tn_u, fp_u, fn_u, tp_u = confusion_matrix(y_val, (X_val_raw >= 0.50).astype(int)).ravel()
    spec_u = tn_u / (tn_u + fp_u) * 100
    sens_u = tp_u / (tp_u + fn_u) * 100 if (tp_u + fn_u) > 0 else 0
    acc_u = (tp_u + tn_u) / len(y_val) * 100
    
    print(f"\n--- Baseline: Uncalibrated Raw Probability on Val (2023-2024) ---")
    print(f"  Brier Score: {brier_uncal:.4f}")
    print(f"  Cutoff 0.50: Accuracy={acc_u:.2f}%, Specificity={spec_u:.2f}%, Sensitivity={sens_u:.2f}% (TP={tp_u}, FP={fp_u}, TN={tn_u}, FN={fn_u})")

    # Method A: Platt Scaling (Logistic Regression)
    # Using logit transform of probabilities or direct prob
    # In sklearn: LogisticRegression on raw prob
    platt = LogisticRegression(solver="lbfgs", C=1.0, random_state=42)
    platt.fit(X_train_raw.reshape(-1, 1), y_train)
    p_val_platt = platt.predict_proba(X_val_raw.reshape(-1, 1))[:, 1]
    
    brier_platt = brier_score_loss(y_val, p_val_platt)
    tn_p, fp_p, fn_p, tp_p = confusion_matrix(y_val, (p_val_platt >= 0.50).astype(int)).ravel()
    spec_p = tn_p / (tn_p + fp_p) * 100
    sens_p = tp_p / (tp_p + fn_p) * 100 if (tp_p + fn_p) > 0 else 0
    acc_p = (tp_p + tn_p) / len(y_val) * 100
    
    print(f"\n--- Method A: Platt Scaling (Sigmoid) on Val (2023-2024) ---")
    print(f"  Brier Score: {brier_platt:.4f} (Delta: {brier_platt - brier_uncal:+.4f})")
    print(f"  Cutoff 0.50: Accuracy={acc_p:.2f}%, Specificity={spec_p:.2f}%, Sensitivity={sens_p:.2f}% (TP={tp_p}, FP={fp_p}, TN={tn_p}, FN={fn_p})")

    # Method B: Isotonic Regression (Non-parametric monotonic)
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(X_train_raw, y_train)
    p_val_iso = iso.predict(X_val_raw)
    
    brier_iso = brier_score_loss(y_val, p_val_iso)
    tn_i, fp_i, fn_i, tp_i = confusion_matrix(y_val, (p_val_iso >= 0.50).astype(int)).ravel()
    spec_i = tn_i / (tn_i + fp_i) * 100
    sens_i = tp_i / (tp_i + fn_i) * 100 if (tp_i + fn_i) > 0 else 0
    acc_i = (tp_i + tn_i) / len(y_val) * 100
    
    print(f"\n--- Method B: Isotonic Regression on Val (2023-2024) ---")
    print(f"  Brier Score: {brier_iso:.4f} (Delta: {brier_iso - brier_uncal:+.4f})")
    print(f"  Cutoff 0.50: Accuracy={acc_i:.2f}%, Specificity={spec_i:.2f}%, Sensitivity={sens_i:.2f}% (TP={tp_i}, FP={fp_i}, TN={tn_i}, FN={fn_i})")

    # Check 2023-07-05 Flood Event specifically
    event_row = sub[sub["target_date"] == "2023-07-05"]
    if not event_row.empty:
        raw_event_p = event_row["raw_prob"].values[0]
        true_event_y = event_row["target"].values[0]
        platt_event_p = platt.predict_proba([[raw_event_p]])[0, 1]
        iso_event_p = float(iso.predict([raw_event_p])[0])
        print(f"\n--- Historical Flood Benchmark Check: 2023-07-05 (True Label = {true_event_y}) ---")
        print(f"  Raw Model Probability: {raw_event_p:.4f}")
        print(f"  Platt Calibrated:      {platt_event_p:.4f} -> {'FLAGGED (>=0.50)' if platt_event_p >= 0.50 else 'MISSED (<0.50)'}")
        print(f"  Isotonic Calibrated:   {iso_event_p:.4f} -> {'FLAGGED (>=0.50)' if iso_event_p >= 0.50 else 'MISSED (<0.50)'}")
    else:
        print("\nNote: 2023-07-05 not present in sequence target dates.")

    # Determine winner
    # Criteria: Lower Brier score, higher specificity at 0.50, and preservation of event sensitivity
    # Let's check which is superior
    if brier_iso < brier_platt:
        winner = "isotonic"
        winning_model = iso
        winning_brier = brier_iso
        winning_spec = spec_i
    else:
        winner = "platt"
        winning_model = platt
        winning_brier = brier_platt
        winning_spec = spec_p
        
    print(f"\n>>> WINNER for {dist}: {winner.upper()} (Brier: {winning_brier:.4f}, Spec@0.50: {winning_spec:.1f}%)")
    
    results[dist] = {
        "winner": winner,
        "model": winning_model,
        "brier_uncal": brier_uncal,
        "brier_platt": brier_platt,
        "brier_iso": brier_iso,
        "spec_uncal": spec_u,
        "spec_platt": spec_p,
        "spec_iso": spec_i,
        "sens_uncal": sens_u,
        "sens_platt": sens_p,
        "sens_iso": sens_i,
        "platt_model": platt,
        "iso_model": iso
    }

# Save models
for dist, res in results.items():
    dist_slug = dist.lower().replace(" ", "_")
    winner_name = res["winner"]
    model_to_save = res["model"]
    
    out_pkl = CALIBRATION_DIR / f"flood_calibration_{dist_slug}.pkl"
    with open(out_pkl, "wb") as f:
        pickle.dump({
            "district": dist,
            "hazard": "flood",
            "method": winner_name,
            "model": model_to_save,
            "platt_fallback": res["platt_model"],
            "isotonic_fallback": res["iso_model"]
        }, f)
    print(f"[Saved] {out_pkl}")

print("\n" + "=" * 90)
print("CALIBRATION FITTING COMPLETE")
print("=" * 90)
