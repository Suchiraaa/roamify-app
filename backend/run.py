import uvicorn

if __name__ == "__main__":
    print("==================================================")
    print("  🌍 Roamify Scenic Routing FastAPI Server")
    print("  Endpoints: http://localhost:8000")
    print("  Swagger Docs: http://localhost:8000/docs")
    print("==================================================")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
