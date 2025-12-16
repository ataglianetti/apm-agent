#!/bin/bash

# Test the rock disambiguation fix

echo "1. Testing 'rock' query to get disambiguation..."
echo ""

# First request - get disambiguation
response1=$(curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "rock"}
    ]
  }')

if [ -z "$response1" ]; then
  echo "ERROR: No response from server"
  exit 1
fi

echo "Response 1 (disambiguation):"
echo "$response1" | python3 -m json.tool 2>/dev/null | head -20 || echo "$response1" | head -20
echo ""
echo "---"
echo ""

# Extract the reply content for the second request
reply=$(echo "$response1" | python3 -c "import sys, json; print(json.load(sys.stdin).get('reply', ''))" 2>/dev/null)

if [ -z "$reply" ]; then
  echo "ERROR: Could not extract reply from response"
  exit 1
fi

echo "2. Testing 'garage' response to select Garage Rock..."
echo ""

# Second request - select garage
start_time=$(date +%s%3N)

response2=$(curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"messages\": [
      {\"role\": \"user\", \"content\": \"rock\"},
      {\"role\": \"assistant\", \"content\": $(echo "$reply" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")},
      {\"role\": \"user\", \"content\": \"garage\"}
    ]
  }")

end_time=$(date +%s%3N)
elapsed=$((end_time - start_time))

echo "Response time: ${elapsed}ms"
echo ""

if [ -z "$response2" ]; then
  echo "ERROR: No response from server"
  exit 1
fi

# Check if we got track results
if echo "$response2" | grep -q '"type".*"track_results"'; then
  echo "✅ SUCCESS: Got track results!"
  echo ""
  echo "Response preview:"
  echo "$response2" | python3 -m json.tool 2>/dev/null | head -50 || echo "$response2" | head -50

  track_count=$(echo "$response2" | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data.get('tracks', [])))" 2>/dev/null)
  echo ""
  echo "Tracks returned: $track_count"

  if [ "$elapsed" -lt 5000 ]; then
    echo ""
    echo "🎉 EXCELLENT: Response time improved from 40-60s to ${elapsed}ms!"
  elif [ "$elapsed" -lt 10000 ]; then
    echo ""
    echo "⚠️ OK: Response time is ${elapsed}ms (better than before but could be faster)"
  else
    echo ""
    echo "⚠️ WARNING: Response time is still slow at ${elapsed}ms"
  fi
else
  echo "❌ ISSUE: Did not get track_results response"
  echo "This means it's falling back to Claude instead of using the optimized path"
  echo ""
  echo "Response:"
  echo "$response2" | python3 -m json.tool 2>/dev/null | head -50 || echo "$response2" | head -50
fi