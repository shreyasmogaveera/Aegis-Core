import os
import sys
import datetime
from pathlib import Path
import numpy as np
import h5py
import requests

# Coordinate centroids for the 4 project districts in Karnataka
DISTRICTS = {
    "Kodagu": {"lat": 12.4244, "lon": 75.7382, "hazard_target": "Landslide & Flood"},
    "Uttara Kannada": {"lat": 14.8153, "lon": 74.6868, "hazard_target": "Landslide & Flood"},
    "Belagavi": {"lat": 15.8497, "lon": 74.4977, "hazard_target": "Flood"},
    "Bagalkot": {"lat": 16.1853, "lon": 75.6868, "hazard_target": "Flood"}
}

CMR_SEARCH_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"

class SmapAdapterService:
    def __init__(self, staging_dir=None):
        if staging_dir is None:
            # backend/src/scripts/smap_staging
            project_root = Path(__file__).resolve().parents[3]
            self.staging_dir = project_root / "backend" / "src" / "scripts" / "smap_staging"
        else:
            self.staging_dir = Path(staging_dir)
            
        self.staging_dir.mkdir(parents=True, exist_ok=True)
        self._cached_metadata = None
        self._cache_time = None
        self._cached_district_sm = {}

    def get_bearer_token(self):
        token = (
            os.getenv("EARTHDATA_BEARER_TOKEN")
            or os.getenv("EARTHDATA_TOKEN")
            or os.getenv("NASA_EARTHDATA_TOKEN")
            or os.getenv("NASA_TOKEN")
        )
        if not token:
            # Attempt to read from backend/.env if not present in process environment
            project_root = Path(__file__).resolve().parents[3]
            env_path = project_root / "backend" / ".env"
            if env_path.is_file():
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("EARTHDATA_BEARER_TOKEN="):
                            token = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break
        return token

    def fetch_latest_granule_metadata(self):
        # Query CMR with 15-minute memory cache
        now = datetime.datetime.now(datetime.timezone.utc)
        if self._cached_metadata and self._cache_time:
            if (now - self._cache_time).total_seconds() < 900:
                return self._cached_metadata

        params = {
            "short_name": "SPL4SMGP",
            "version": "008",
            "bounding_box": "73.5,11.5,78.0,17.5",
            "page_size": 1,
            "sort_key": "-start_date"
        }
        
        resp = requests.get(CMR_SEARCH_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        entries = data.get("feed", {}).get("entry", [])
        if not entries:
            raise RuntimeError("No SPL4SMGP Version 8 granules found in NASA CMR.")
            
        granule = entries[0]
        title = granule.get("title", "")
        time_start = granule.get("time_start", "")
        time_end = granule.get("time_end", "")
        
        h5_url = None
        for link in granule.get("links", []):
            href = link.get("href", "")
            if href.endswith(".h5") and "data.nsidc" in href:
                h5_url = href
                break
            elif href.endswith(".h5") and not h5_url:
                h5_url = href
                
        if not h5_url:
            raise RuntimeError(f"Could not locate direct .h5 URL for granule {title}")

        filename = title
        if not filename.endswith(".h5"):
            if ".h5" in filename:
                filename = filename[:filename.find(".h5") + 3]
            else:
                filename = f"{filename}.h5"

        meta = {
            "title": title,
            "filename": filename,
            "time_start": time_start,
            "time_end": time_end,
            "download_url": h5_url
        }
        
        self._cached_metadata = meta
        self._cache_time = now
        return meta

    def ensure_granule_downloaded(self, meta):
        target_path = self.staging_dir / meta["filename"]
        
        # If file already exists and is non-empty (>50MB), reuse it
        if target_path.is_file() and target_path.stat().st_size > 50 * 1024 * 1024:
            try:
                with h5py.File(target_path, "r") as test_h5:
                    if "Geophysical_Data" in test_h5:
                        return target_path
            except Exception:
                pass # corrupted or partial, re-download

        token = self.get_bearer_token()
        if not token:
            raise RuntimeError("Missing NASA Earthdata Bearer Token (EARTHDATA_BEARER_TOKEN).")

        headers = {
            "Authorization": f"Bearer {token}",
            "User-Agent": "AegisCore-DisasterManagement/1.0"
        }
        
        url = meta["download_url"]
        # Handle NASA EDL 303 Redirect to AWS S3 signed URL
        with requests.get(url, headers=headers, stream=True, allow_redirects=False, timeout=30) as r:
            if r.status_code in [301, 302, 303, 307]:
                redirect_url = r.headers.get("Location")
                if redirect_url:
                    # Strip Authorization header on AWS CloudFront/S3 signed redirect
                    s3_headers = {"User-Agent": "AegisCore-DisasterManagement/1.0"}
                    with requests.get(redirect_url, headers=s3_headers, stream=True, timeout=60) as r2:
                        r2.raise_for_status()
                        self._write_stream_to_file(r2, target_path)
                        return target_path
            r.raise_for_status()
            self._write_stream_to_file(r, target_path)

        return target_path

    def _write_stream_to_file(self, response, path):
        temp_path = path.with_suffix(".part")
        with open(temp_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
        temp_path.replace(path)

    def extract_district_telemetry(self, target_date_str=None):
        """
        Extracts sm_surface and calculates causal_smap_age_days for all districts.
        """
        meta = self.fetch_latest_granule_metadata()
        h5_path = self.ensure_granule_downloaded(meta)

        # Parse observation date
        obs_utc = meta["time_start"] # e.g. 2026-09-22T21:00:00.000Z
        obs_date_str = obs_utc.split("T")[0]
        obs_date = datetime.datetime.strptime(obs_date_str, "%Y-%m-%d").date()

        # Parse target date
        if target_date_str:
            target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d").date()
        else:
            target_date = datetime.date.today()

        age_days = float((target_date - obs_date).days)
        if age_days < 0:
            # Target date is prior to observation date: causal violation
            smap_status = "unavailable"
        elif age_days == 0:
            smap_status = "same_day"
        elif age_days <= 7.0:
            smap_status = "causal_lag"
        else:
            smap_status = "unavailable"

        districts_output = {}
        with h5py.File(h5_path, "r") as h5:
            geophys = h5["Geophysical_Data"]
            ds_sm = geophys["sm_surface"]
            fill_val = float(ds_sm.attrs.get("_FillValue", -9999.0))
            sm_grid = ds_sm[:]

            # Coordinates
            lat_arr = h5["cell_lat"][:]
            lon_arr = h5["cell_lon"][:]
            
            lat_1d = lat_arr[:, 0] if lat_arr.ndim == 2 else lat_arr
            lon_1d = lon_arr[0, :] if lon_arr.ndim == 2 else lon_arr

            n_rows, n_cols = sm_grid.shape

            for d_name, d_info in DISTRICTS.items():
                d_lat = d_info["lat"]
                d_lon = d_info["lon"]

                row_idx = int(np.argmin(np.abs(lat_1d - d_lat)))
                col_idx = int(np.argmin(np.abs(lon_1d - d_lon)))

                # 3x3 local district window
                r_start = max(0, row_idx - 1)
                r_end = min(n_rows, row_idx + 2)
                c_start = max(0, col_idx - 1)
                c_end = min(n_cols, col_idx + 2)

                window = sm_grid[r_start:r_end, c_start:c_end]
                valid_mask = (window != fill_val) & (window >= 0.0) & (window <= 1.0) & np.isfinite(window)

                center_val = float(sm_grid[row_idx, col_idx])
                center_valid = (center_val != fill_val) and (0.0 <= center_val <= 1.0) and np.isfinite(center_val)

                if np.any(valid_mask):
                    valid_vals = window[valid_mask]
                    min_val = float(np.min(valid_vals))
                    max_val = float(np.max(valid_vals))
                    mean_val = float(np.mean(valid_vals))
                else:
                    min_val = max_val = mean_val = float("nan")

                soil_moisture = center_val if center_valid else (mean_val if not np.isnan(mean_val) else None)

                districts_output[d_name] = {
                    "soil_moisture": round(soil_moisture, 4) if soil_moisture is not None else None,
                    "center": round(center_val, 4) if center_valid else None,
                    "window_min": round(min_val, 4) if not np.isnan(min_val) else None,
                    "window_max": round(max_val, 4) if not np.isnan(max_val) else None,
                    "window_mean": round(mean_val, 4) if not np.isnan(mean_val) else None,
                    "units": "m3 m-3",
                    "causal_smap_age_days": age_days,
                    "smap_status": smap_status if soil_moisture is not None else "unavailable",
                    "available": bool(soil_moisture is not None and smap_status in ["same_day", "causal_lag"])
                }

        return {
            "status": "success",
            "granule_id": meta["filename"],
            "observation_utc": meta["time_start"],
            "observation_date": obs_date_str,
            "target_date": target_date.strftime("%Y-%m-%d"),
            "causal_age_days": age_days,
            "dataset": "NASA SMAP L4 (SPL4SMGP Version 8)",
            "variable": "sm_surface (0-5 cm)",
            "units": "m3 m-3",
            "districts": districts_output
        }

smap_adapter_service = SmapAdapterService()
