import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import uvicorn

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))
load_dotenv(backend_dir / ".env")
load_dotenv(backend_dir.parent / ".env")
load_dotenv()

if __name__ == "__main__":
    print("==================================================")
    print("  Roamify Scenic Routing FastAPI Server")
    print("  Endpoints: http://127.0.0.1:8000")
    print("  Swagger Docs: http://127.0.0.1:8000/docs")
    print("==================================================")
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "127.0.0.1")
    uvicorn.run("main:app", host=host, port=port, reload=True, app_dir=str(backend_dir))
