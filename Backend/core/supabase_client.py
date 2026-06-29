import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

import httpx
from supabase.lib.client_options import SyncClientOptions

if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: SUPABASE_URL and SUPABASE_KEY are not set in the environment.")
    supabase = None
else:
    # Disable HTTP/2 multiplexing on the shared synchronous client to ensure thread safety
    # across concurrent FastAPI threadpool workers (prevents StreamIDTooLowError crashes).
    custom_options = SyncClientOptions(
        httpx_client=httpx.Client(
            http2=False,
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            timeout=120.0
        )
    )
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=custom_options)

