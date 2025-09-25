#!/usr/bin/env python3
import os, sys, json, platform, datetime

FIXED_LOG_DIR = "/Volumes/ATOM RAID/Dropbox/_Personal Files/12 - AI Vibe Coding/02 - Cursor Projects/02 - RhythmRNA V3/Logs"

def ensure_dir_writable(d):
  os.makedirs(d, mode=0o755, exist_ok=True)
  probe = os.path.join(d, ".write_test")
  with open(probe, "w") as f:
    f.write("ok")
  os.remove(probe)

ensure_dir_writable(FIXED_LOG_DIR)

info = {}
try:
  import torch
  dev = "mps" if (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()) else ("cuda" if torch.cuda.is_available() else "cpu")
  info["torch"] = {
    "version": torch.__version__,
    "device_selected": dev,
    "mps_available": bool(hasattr(torch.backends, "mps") and torch.backends.mps.is_available()),
    "cuda_available": torch.cuda.is_available(),
  }
except Exception as e:
  info["torch"] = {"error": str(e)}

payload = {
  "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
  "host": {"platform": platform.platform(), "machine": platform.machine()},
  **info,
}

json_path = os.path.join(FIXED_LOG_DIR, "accel-report-py.json")
with open(json_path, "w") as f:
  json.dump(payload, f, indent=2)

print(f"[ACCEL] Python report dir: {FIXED_LOG_DIR}")
print(json_path)