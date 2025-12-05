#!/bin/bash
echo "Checking if backend is accessible..."
curl -s http://localhost:3000/api/current | head -20
echo ""
echo ""
echo "Checking database stats..."
curl -s http://localhost:3000/api/db/stats | head -20
