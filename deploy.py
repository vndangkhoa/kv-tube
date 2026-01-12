#!/usr/bin/env python3
"""Check git status and redeploy."""
import subprocess
import os

def run_cmd(cmd):
    print(f"\n>>> {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)
    return result.returncode == 0

print("="*50)
print("Checking git status...")
print("="*50)
run_cmd("git status")

print("\n" + "="*50)
print("Staging all changes...")
print("="*50)
run_cmd("git add .")

print("\n" + "="*50)
print("Committing...")
print("="*50)
run_cmd('git commit -m "Latest local changes"')

print("\n" + "="*50)
print("Pushing to GitHub...")
print("="*50)
run_cmd("git push origin main")

print("\n" + "="*50)
print("Pushing to Forgejo...")
print("="*50)
run_cmd("git push private main")

print("\n" + "="*50)
print("Building Docker image...")
print("="*50)
if run_cmd("docker build -t vndangkhoa/kv-tube:latest ."):
    print("\nPushing Docker image...")
    run_cmd("docker push vndangkhoa/kv-tube:latest")

print("\n" + "="*50)
print("DEPLOYMENT COMPLETE!")
print("="*50)
