#!/bin/bash
# Fetch MongoDB URI from AWS .env file

echo "Fetching MongoDB URI from AWS..."
echo ""

# Try to connect and get the MongoDB URI
ssh -o ConnectTimeout=10 ubuntu@34.207.180.66 "grep MONGODB_URI ~/SurfLiquid_Velocity/.env" 2>&1 || echo "Could not connect to AWS"
