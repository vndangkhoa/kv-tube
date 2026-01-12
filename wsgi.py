"""
KV-Tube WSGI Entry Point
Slim entry point that uses the app factory
"""
from app import create_app

# Create the Flask application
app = create_app()

if __name__ == "__main__":
    print("Starting KV-Tube Server on port 5002")
    app.run(debug=True, host="0.0.0.0", port=5002, use_reloader=False)
