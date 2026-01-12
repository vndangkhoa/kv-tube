#!/bin/bash
cd "$(dirname "$0")"
echo "=== Diagnostic Start Script ==="

# Activate env
# Activate env
if [ -d ".venv_clean" ]; then
    echo "Activating .venv_clean..."
    export PYTHONPATH="$(pwd)/.venv_clean/lib/python3.14/site-packages"
    # Use system python with PYTHONPATH if bindir is missing/broken
    PYTHON_EXEC="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
    export FLASK_APP=wsgi.py
    export FLASK_RUN_PORT=5002
    
    echo "--- Starting with System Python + PYTHONPATH ---"
    $PYTHON_EXEC -m flask run --host=0.0.0.0 --port=5002
    exit 0
elif [ -d ".venv" ]; then
    echo "Activating .venv..."
    source .venv/bin/activate
elif [ -d "env" ]; then
    echo "Activating env..."
    source env/bin/activate
else
    echo "No '.venv' or 'env' directory found!"
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
echo "--- Attempting to start with Gunicorn ---"
if command -v gunicorn &> /dev/null; then
    gunicorn -b 0.0.0.0:5002 wsgi:app
else
    echo "Gunicorn not found in path."
fi

echo "--- Attempting to start with Flask explicitly ---"
export FLASK_APP=wsgi.py
export FLASK_RUN_PORT=5002
python -m flask run --host=0.0.0.0
