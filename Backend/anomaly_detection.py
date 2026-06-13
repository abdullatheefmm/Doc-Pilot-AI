import time
import threading
from datetime import datetime, timezone, timedelta
from typing import Any

from supabase_client import supabase

try:
    from sklearn.ensemble import IsolationForest
    import numpy as np
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    print("WARNING: scikit-learn is not installed. Anomaly detection will not run. Run: pip install scikit-learn")

_anomaly_thread = None
_stop_event = threading.Event()
AUTO_SUSPEND_ENABLED = False

def analyze_user_behavior():
    """
    Fetches recent audit logs and runs an Isolation Forest to detect anomalous activity.
    """
    if not supabase or not ML_AVAILABLE:
        return

    try:
        # Fetch last 24 hours of logs
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        resp = supabase.table("audit_logs").select("*").gte("created_at", yesterday).execute()
        logs = resp.data
        
        if not logs or len(logs) < 10:
            return # Not enough data to train

        # Aggregate metrics per user
        user_metrics = {}
        for log in logs:
            uid = log.get("user_id")
            if not uid: continue
            action = log.get("action_type")
            
            if uid not in user_metrics:
                user_metrics[uid] = {"query_count": 0, "upload_count": 0, "download_count": 0}
            
            if action == "chat_query":
                user_metrics[uid]["query_count"] += 1
            elif action == "upload_document":
                user_metrics[uid]["upload_count"] += 1
            elif action == "download_document":
                user_metrics[uid]["download_count"] += 1

        users = list(user_metrics.keys())
        # Prepare feature matrix: [query_freq, upload_freq, download_freq]
        X = np.array([[m["query_count"], m["upload_count"], m["download_count"]] for m in user_metrics.values()])

        # Run Isolation Forest (contamination=0.05 implies ~5% are anomalies)
        model = IsolationForest(contamination=0.05, random_state=42)
        model.fit(X)
        predictions = model.predict(X)

        for i, pred in enumerate(predictions):
            if pred == -1: # -1 indicates an anomaly
                user_id = users[i]
                metrics = user_metrics[user_id]
                # Log security alert
                supabase.table("security_alerts").insert({
                    "user_id": user_id,
                    "severity": "high",
                    "alert_type": "anomalous_behavior",
                    "details": {
                        "message": "Unusual activity pattern detected by ML model.",
                        "metrics": metrics
                    }
                }).execute()
                print(f"SECURITY ALERT: Anomalous behavior detected for user {user_id}: {metrics}")
                
                if AUTO_SUSPEND_ENABLED:
                    supabase.table("user_profiles").update({"status": "revoked"}).eq("user_id", user_id).execute()
                    print(f"Auto-suspended user {user_id} due to anomalous behavior.")

    except Exception as e:
        print(f"Error in anomaly detection: {e}")

def _run_anomaly_detector_loop():
    while not _stop_event.is_set():
        analyze_user_behavior()
        # Sleep for 1 hour
        for _ in range(3600):
            if _stop_event.is_set():
                break
            time.sleep(1)

def start_anomaly_detection():
    """Starts the background thread that runs the ML anomaly detection."""
    global _anomaly_thread
    if _anomaly_thread is None:
        _stop_event.clear()
        _anomaly_thread = threading.Thread(target=_run_anomaly_detector_loop, daemon=True)
        _anomaly_thread.start()
        print("Started AI Anomaly Detection service.")

def stop_anomaly_detection():
    """Stops the background thread."""
    if _anomaly_thread is not None:
        _stop_event.set()
        _anomaly_thread.join()
        print("Stopped AI Anomaly Detection service.")
