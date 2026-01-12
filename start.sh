#!/bin/bash
cd "$(dirname "$0")"
echo "=== Diagnostic Start Script ==="

# Activate env
if [ -d "env" ]; then
    echo "Activating env..."
    source env/bin/activate
else
    echo "No 'env' directory found!"
    exit 1
fi

echo "Python path: $(which python)"
echo "Python ls: $(ls -l $(which python))"

echo "--- Test 1: Simple Print ---"
python -c "print('Python is executing commands properly')"
if [ $? -eq 0 ]; then
    echo "Test 1 PASSED"
else
    echo "Test 1 FAILED (Entered REPL?)"
fi

echo "--- Attempting to start with Gunicorn ---"
if [ -f "env/bin/gunicorn" ]; then
    ./env/bin/gunicorn -b 0.0.0.0:5002 wsgi:app
else
    echo "Gunicorn not found."
fi

echo "--- Attempting to start with Flask explicitly ---"
export FLASK_APP=wsgi.py
export FLASK_RUN_PORT=5002
./env/bin/flask run --host=0.0.0.0
