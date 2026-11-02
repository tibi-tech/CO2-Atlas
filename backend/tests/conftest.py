import os
import tempfile

# Isolated data directory for the whole test session (must be set before importing app)
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="co2-test-"))
os.environ.setdefault("DEMO_PASSWORD", "")
os.environ["CDSE_CLIENT_ID"] = ""
os.environ["CDSE_CLIENT_SECRET"] = ""
