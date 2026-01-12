import os
import sys
import site

# Try to find and activate the virtual environment
try:
    base_dir = os.path.dirname(os.path.abspath(__file__))
except NameError:
    base_dir = os.getcwd()

venv_dirs = ['.venv', 'env']
activated = False

for venv_name in venv_dirs:
    venv_path = os.path.join(base_dir, venv_name)
    if os.path.isdir(venv_path):
        # Determine site-packages path
        if sys.platform == 'win32':
            site_packages = os.path.join(venv_path, 'Lib', 'site-packages')
        else:
            # Check for python version in lib
            lib_path = os.path.join(venv_path, 'lib')
            if os.path.exists(lib_path):
                for item in os.listdir(lib_path):
                    if item.startswith('python'):
                        site_packages = os.path.join(lib_path, item, 'site-packages')
                        break
        
        if site_packages and os.path.exists(site_packages):
            print(f"Adding virtual environment to path: {site_packages}")
            site.addsitedir(site_packages)
            sys.path.insert(0, site_packages)
            activated = True
            break

if not activated:
    print("WARNING: Could not find or activate a virtual environment (env or .venv).")
    print("Attempting to run anyway (system packages might be used)...")

# Add current directory to path so 'app' can be imported
sys.path.insert(0, base_dir)

try:
    print("Importing app factory...")
    from app import create_app
    print("Creating app...")
    app = create_app()
    print("Starting KV-Tube Server on port 5002...")
    app.run(debug=True, host="0.0.0.0", port=5002, use_reloader=False)
except ImportError as e:
    print("\nCRITICAL ERROR: Could not import Flask or required dependencies.")
    print(f"Error details: {e}")
    print("\nPlease ensure you are running this script with the correct Python environment.")
    print("If you are stuck in a '>>>' prompt, try typing exit() first, then run:")
    print("  source env/bin/activate && python kv_server.py")
except Exception as e:
    print(f"\nAn error occurred while starting the server: {e}")
