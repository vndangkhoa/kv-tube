#!/bin/bash

# KV-Tube Updater Script
# This script pulls the latest code and Docker images, then restarts the service.

echo "--- 1. Pulling latest code changes... ---"
git pull origin main

echo "--- 2. Pulling latest Docker image (v2.0)... ---"
docker-compose pull

echo "--- 3. Restarting service with new configuration... ---"
# We down it first to ensure port bindings (5001 -> 5000) are updated
docker-compose down
docker-compose up -d --force-recreate

echo "--- Done! Checking logs... ---"
docker-compose logs --tail=20 -f kv-tube
