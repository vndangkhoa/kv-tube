#!/usr/bin/env python3
"""Build and push multi-platform Docker image."""
import subprocess

def run_cmd(cmd):
    print(f"\n>>> {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)
    return result.returncode == 0

print("="*50)
print("Building Multi-Platform Docker Image")
print("(linux/amd64 + linux/arm64)")
print("="*50)

# Create buildx builder if it doesn't exist
run_cmd("docker buildx create --name multiplatform --use 2>/dev/null || docker buildx use multiplatform")

# Build and push multi-platform image
print("\nBuilding and pushing...")
run_cmd("docker buildx build --platform linux/amd64,linux/arm64 -t vndangkhoa/kv-tube:latest --push .")

print("\n" + "="*50)
print("DONE! Image now supports both amd64 and arm64")
print("="*50)
