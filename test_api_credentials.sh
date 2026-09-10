#!/bin/bash

# Test script for DB-backed API credential feature
# Base URL: http://localhost:3000
# Auth cookie: tg_admin_session=31abc58299136684e59a8e44d474700eb64414723a6f62c7364ed44f25b3ffca

BASE_URL="http://localhost:3000"
AUTH_COOKIE="tg_admin_session=31abc58299136684e59a8e44d474700eb64414723a6f62c7364ed44f25b3ffca"

echo "=========================================="
echo "API Credential Feature Testing"
echo "=========================================="
echo ""

# Test 1: Unauthorized checks (401 without cookie)
echo "=========================================="
echo "TEST 1: Unauthorized Access Checks (401)"
echo "=========================================="
echo ""

echo "1.1 GET /api/settings/tglion (no auth)"
curl -s -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/settings/tglion
echo ""

echo "1.2 PUT /api/settings/tglion (no auth)"
curl -s -X PUT -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/settings/tglion
echo ""

echo "1.3 DELETE /api/settings/tglion (no auth)"
curl -s -X DELETE -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/settings/tglion
echo ""

echo "1.4 GET /api/settings/ai-keys (no auth)"
curl -s -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/settings/ai-keys
echo ""

echo "1.5 POST /api/settings/ai-keys (no auth)"
curl -s -X POST -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/settings/ai-keys
echo ""

echo "1.6 PATCH /api/settings/ai-keys (no auth)"
curl -s -X PATCH -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/settings/ai-keys
echo ""

echo "1.7 DELETE /api/settings/ai-keys (no auth)"
curl -s -X DELETE -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/settings/ai-keys
echo ""

# Test 2: GET /api/settings/tglion (with auth)
echo "=========================================="
echo "TEST 2: GET /api/settings/tglion (with auth)"
echo "=========================================="
echo ""
curl -s -H "Cookie: $AUTH_COOKIE" -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/settings/tglion
echo ""

# Test 3: GET /api/settings/ai-keys (with auth)
echo "=========================================="
echo "TEST 3: GET /api/settings/ai-keys (with auth)"
echo "=========================================="
echo ""
curl -s -H "Cookie: $AUTH_COOKIE" -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/settings/ai-keys
echo ""

# Test 4: POST /api/settings/ai-keys - Add test keys
echo "=========================================="
echo "TEST 4: POST /api/settings/ai-keys - Add test keys"
echo "=========================================="
echo ""

echo "4.1 Adding 2 test keys"
curl -s -X POST -H "Cookie: $AUTH_COOKIE" -H "Content-Type: application/json" \
  -d '{"keys":"gsk_testkeyAAAAAAAAAAAA1\ngsk_testkeyAAAAAAAAAAAA2"}' \
  -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:3000/api/settings/ai-keys
echo ""

echo "4.2 Re-POST same keys (should return 400 'already saved')"
curl -s -X POST -H "Cookie: $AUTH_COOKIE" -H "Content-Type: application/json" \
  -d '{"keys":"gsk_testkeyAAAAAAAAAAAA1\ngsk_testkeyAAAAAAAAAAAA2"}' \
  -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:3000/api/settings/ai-keys
echo ""

# Test 5: GET /api/settings/ai-keys again to see the new keys
echo "=========================================="
echo "TEST 5: GET /api/settings/ai-keys (after adding test keys)"
echo "=========================================="
echo ""
AI_KEYS_RESPONSE=$(curl -s -H "Cookie: $AUTH_COOKIE" http://localhost:3000/api/settings/ai-keys)
echo "$AI_KEYS_RESPONSE" | jq '.'
echo ""

# Extract test key IDs (not id 1)
TEST_KEY_ID_1=$(echo "$AI_KEYS_RESPONSE" | jq -r '.keys[] | select(.key | contains("gsk_testkeyAAAAAAAAAAAA1")) | .id')
TEST_KEY_ID_2=$(echo "$AI_KEYS_RESPONSE" | jq -r '.keys[] | select(.key | contains("gsk_testkeyAAAAAAAAAAAA2")) | .id')

echo "Test Key 1 ID: $TEST_KEY_ID_1"
echo "Test Key 2 ID: $TEST_KEY_ID_2"
echo ""

# Test 6: PATCH /api/settings/ai-keys - disable, enable, reset
if [ -n "$TEST_KEY_ID_1" ]; then
  echo "=========================================="
  echo "TEST 6: PATCH /api/settings/ai-keys - disable/enable/reset"
  echo "=========================================="
  echo ""
  
  echo "6.1 PATCH - Disable key $TEST_KEY_ID_1"
  curl -s -X PATCH -H "Cookie: $AUTH_COOKIE" -H "Content-Type: application/json" \
    -d "{\"id\":$TEST_KEY_ID_1,\"action\":\"disable\"}" \
    -w "\nHTTP Status: %{http_code}\n" \
    http://localhost:3000/api/settings/ai-keys
  echo ""
  
  echo "6.2 GET /api/settings/ai-keys (verify disabled status)"
  curl -s -H "Cookie: $AUTH_COOKIE" http://localhost:3000/api/settings/ai-keys | jq ".keys[] | select(.id == $TEST_KEY_ID_1)"
  echo ""
  
  echo "6.3 PATCH - Enable key $TEST_KEY_ID_1"
  curl -s -X PATCH -H "Cookie: $AUTH_COOKIE" -H "Content-Type: application/json" \
    -d "{\"id\":$TEST_KEY_ID_1,\"action\":\"enable\"}" \
    -w "\nHTTP Status: %{http_code}\n" \
    http://localhost:3000/api/settings/ai-keys
  echo ""
  
  echo "6.4 GET /api/settings/ai-keys (verify enabled status)"
  curl -s -H "Cookie: $AUTH_COOKIE" http://localhost:3000/api/settings/ai-keys | jq ".keys[] | select(.id == $TEST_KEY_ID_1)"
  echo ""
  
  echo "6.5 PATCH - Reset key $TEST_KEY_ID_1"
  curl -s -X PATCH -H "Cookie: $AUTH_COOKIE" -H "Content-Type: application/json" \
    -d "{\"id\":$TEST_KEY_ID_1,\"action\":\"reset\"}" \
    -w "\nHTTP Status: %{http_code}\n" \
    http://localhost:3000/api/settings/ai-keys
  echo ""
  
  echo "6.6 GET /api/settings/ai-keys (verify reset status)"
  curl -s -H "Cookie: $AUTH_COOKIE" http://localhost:3000/api/settings/ai-keys | jq ".keys[] | select(.id == $TEST_KEY_ID_1)"
  echo ""
fi

# Test 7: POST /api/generate-names
echo "=========================================="
echo "TEST 7: POST /api/generate-names (verify DB key rotation)"
echo "=========================================="
echo ""
curl -s -X POST -H "Cookie: $AUTH_COOKIE" -H "Content-Type: application/json" \
  -d '{"quantity":3,"prompt":"short cool english nicknames"}' \
  -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:3000/api/generate-names
echo ""

# Test 8: GET /api/tglion
echo "=========================================="
echo "TEST 8: GET /api/tglion (verify tg-lion creds from DB)"
echo "=========================================="
echo ""
curl -s -H "Cookie: $AUTH_COOKIE" -w "\nHTTP Status: %{http_code}\n" http://localhost:3000/api/tglion
echo ""

# Test 9: Validation tests
echo "=========================================="
echo "TEST 9: Validation Tests (400 errors)"
echo "=========================================="
echo ""

echo "9.1 PUT /api/settings/tglion with empty apiKey"
curl -s -X PUT -H "Cookie: $AUTH_COOKIE" -H "Content-Type: application/json" \
  -d '{"apiKey":"","userId":"7188243734"}' \
  -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:3000/api/settings/tglion
echo ""

echo "9.2 POST /api/settings/ai-keys with empty keys"
curl -s -X POST -H "Cookie: $AUTH_COOKIE" -H "Content-Type: application/json" \
  -d '{"keys":""}' \
  -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:3000/api/settings/ai-keys
echo ""

# Test 10: DELETE test keys (cleanup)
if [ -n "$TEST_KEY_ID_1" ] && [ -n "$TEST_KEY_ID_2" ]; then
  echo "=========================================="
  echo "TEST 10: DELETE test keys (cleanup)"
  echo "=========================================="
  echo ""
  
  echo "10.1 DELETE test key 1 (id=$TEST_KEY_ID_1)"
  curl -s -X DELETE -H "Cookie: $AUTH_COOKIE" \
    -w "\nHTTP Status: %{http_code}\n" \
    "http://localhost:3000/api/settings/ai-keys?id=$TEST_KEY_ID_1"
  echo ""
  
  echo "10.2 DELETE test key 2 (id=$TEST_KEY_ID_2)"
  curl -s -X DELETE -H "Cookie: $AUTH_COOKIE" \
    -w "\nHTTP Status: %{http_code}\n" \
    "http://localhost:3000/api/settings/ai-keys?id=$TEST_KEY_ID_2"
  echo ""
  
  echo "10.3 GET /api/settings/ai-keys (verify test keys are gone)"
  curl -s -H "Cookie: $AUTH_COOKIE" http://localhost:3000/api/settings/ai-keys | jq '.'
  echo ""
fi

echo "=========================================="
echo "Testing Complete"
echo "=========================================="
