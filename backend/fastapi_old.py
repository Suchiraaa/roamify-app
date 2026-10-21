
from fastapi.cpython import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Roamify backend is running!"}

