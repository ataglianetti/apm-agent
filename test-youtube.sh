#!/bin/bash

# Test the YouTube reference bug fix specifically
echo "Testing YouTube reference search..."
echo ""

curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "role": "user",
      "content": "Find me something like this: https://youtube.com/watch?v=dQw4w9WgXcQ"
    }]
  }' | jq -r '.reply' | head -c 500

echo ""
echo ""
echo "If the response starts with { and contains 'type': 'track_results', the fix is working!"