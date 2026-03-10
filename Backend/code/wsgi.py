# Backend/code/wsgi.py
# This file is the production entry point.
# Development: python app.py
# Production:  gunicorn -w 4 -b 0.0.0.0:5001 wsgi:app

from app import app, load_models

# Pre-load ML models exactly once before Gunicorn forks workers
load_models()

if __name__ == '__main__':
    # Only for local development fallback
    app.run(host='0.0.0.0', port=5001, debug=False)
