#!/usr/bin/env python3
"""
KV-Tube Deployment Script
Handles cleanup, git operations, and provides docker commands.
Run this with: exec(open("deploy.py").read())
"""
import os
import subprocess
import sys

# Files to remove
files_to_remove = [
    "server.log",
    "response.json",
    "response_error.json",
    "proxy_check.m3u8",
    "nul",
    "CONSOLE_ERROR_FIXES.md",
    "DOWNLOAD_FIXES.md",
    "TEST_REPORT.md",
    "debug_transcript.py",
    "generate_icons.py",
    "deploy-docker.bat",
    "deploy-docker.ps1",
    "deploy_v2.ps1",
    "cleanup.py",
]

def run_cmd(cmd, cwd=None):
    """Run a shell command and return success status."""
    print(f"\n>>> {cmd}")
    try:
        result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr)
        return result.returncode == 0
    except Exception as e:
        print(f"Error: {e}")
        return False

def main():
    base_dir = os.getcwd()
    print(f"Working directory: {base_dir}")
    
    # Step 1: Cleanup
    print("\n" + "="*50)
    print("STEP 1: Cleaning up files...")
    print("="*50)
    for filename in files_to_remove:
        filepath = os.path.join(base_dir, filename)
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
                print(f"✓ Removed: {filename}")
            except Exception as e:
                print(f"✗ Error removing {filename}: {e}")
        else:
            print(f"- Skipped (not found): {filename}")
    
    # Step 2: Git operations
    print("\n" + "="*50)
    print("STEP 2: Git operations...")
    print("="*50)
    
    # Add remote if not exists
    run_cmd("git remote add private https://git.khoavo.myds.me/vndangkhoa/kv-tube 2>/dev/null || true")
    
    # Stage all changes
    run_cmd("git add .")
    
    # Commit
    run_cmd('git commit -m "Cleanup and documentation update"')
    
    # Push to origin
    print("\nPushing to origin...")
    run_cmd("git push origin main || git push origin master")
    
    # Push to private
    print("\nPushing to private server...")
    run_cmd("git push private main || git push private master")
    
    # Step 3: Docker instructions
    print("\n" + "="*50)
    print("STEP 3: Docker Build & Push")
    print("="*50)
    print("\nTo build and push Docker image, run these commands manually:")
    print("  docker build -t vndangkhoa/kv-tube:latest .")
    print("  docker push vndangkhoa/kv-tube:latest")
    
    # Optionally try to run docker commands
    print("\nAttempting Docker build...")
    if run_cmd("docker build -t vndangkhoa/kv-tube:latest ."):
        print("\nAttempting Docker push...")
        run_cmd("docker push vndangkhoa/kv-tube:latest")
    
    print("\n" + "="*50)
    print("DEPLOYMENT COMPLETE!")
    print("="*50)
    print("\nYou can delete this file (deploy.py) now.")

if __name__ == "__main__":
    main()
else:
    # When run via exec()
    main()
