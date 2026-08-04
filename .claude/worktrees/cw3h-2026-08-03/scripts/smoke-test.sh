#!/usr/bin/env bash
# Automated Production & Staging Smoke Testing Suite for Maris Stella Labs Ventures

set -euo pipefail

TARGET_DOMAIN="${1:-marisstella.dev}"
PAIRWISE_DOMAIN="${2:-pairwise.marisstella.dev}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================================="
echo " 🧪 RUNNING SMOKE TESTING SUITE FOR MARIS STELLA LABS"
echo " Target Homepage Domain : https://${TARGET_DOMAIN}"
echo " Target Pairwise Domain : https://${PAIRWISE_DOMAIN}"
echo "========================================================="

FAILURES=0

test_endpoint() {
  local name="$1"
  local url="$2"
  local expected_code="${3:-200}"

  echo -n "Testing ${name} (${url})... "

  response=$(curl -s -o /dev/null -w "%{http_code}" -L --connect-timeout 10 --max-time 15 "${url}" || echo "000")

  if [ "${response}" -eq "${expected_code}" ]; then
    echo -e "${GREEN}PASSED (${response})${NC}"
  else
    echo -e "${RED}FAILED (Expected ${expected_code}, got ${response})${NC}"
    FAILURES=$((FAILURES + 1))
  fi
}

test_content() {
  local name="$1"
  local url="$2"
  local search_string="$3"

  echo -n "Testing content on ${name} for '${search_string}'... "

  body=$(curl -s -L --connect-timeout 10 --max-time 15 "${url}" || echo "")

  if echo "${body}" | grep -q "${search_string}"; then
    echo -e "${GREEN}PASSED${NC}"
  else
    echo -e "${RED}FAILED (String '${search_string}' not found)${NC}"
    FAILURES=$((FAILURES + 1))
  fi
}

test_security_header() {
  local name="$1"
  local url="$2"
  local header_name="$3"

  echo -n "Testing security header '${header_name}' on ${name}... "

  headers=$(curl -s -I -L --connect-timeout 10 --max-time 15 "${url}" || echo "")

  if echo "${headers}" | grep -iq "${header_name}"; then
    echo -e "${GREEN}PASSED${NC}"
  else
    echo -e "${YELLOW}WARNING (Header '${header_name}' missing or not returned)${NC}"
  fi
}

echo ""
echo "--- 1. HOMEPAGE SMOKE TESTS ---"
test_endpoint "Homepage Root HTTP" "http://${TARGET_DOMAIN}" 200
test_endpoint "Homepage Root HTTPS" "https://${TARGET_DOMAIN}" 200
test_content "Homepage Title Check" "https://${TARGET_DOMAIN}" "MARIS STELLA"
test_content "Homepage Venture Reference" "https://${TARGET_DOMAIN}" "Pairwise"

echo ""
echo "--- 2. PAIRWISE APPLICATION SMOKE TESTS ---"
test_endpoint "Pairwise Landing Page" "https://${PAIRWISE_DOMAIN}" 200
test_endpoint "Pairwise Process Liveness" "https://${PAIRWISE_DOMAIN}/api/health" 200
test_endpoint "Pairwise Database Readiness" "https://${PAIRWISE_DOMAIN}/api/health/ready" 200
test_content "Pairwise App Section" "https://${PAIRWISE_DOMAIN}" "How It Works"
test_content "Pairwise CTA Check" "https://${PAIRWISE_DOMAIN}" "Start choosing"
test_endpoint "Pairwise Try Page" "https://${PAIRWISE_DOMAIN}/app" 200
test_endpoint "Pairwise Couple Linking Page" "https://${PAIRWISE_DOMAIN}/couple" 200
test_endpoint "Pairwise Privacy Policy" "https://${PAIRWISE_DOMAIN}/privacy" 200
test_endpoint "Pairwise Terms Page" "https://${PAIRWISE_DOMAIN}/terms" 200

echo ""
echo "--- 3. RUNTIME SECURITY HEADER TESTS ---"
test_security_header "Homepage" "https://${TARGET_DOMAIN}" "X-Content-Type-Options"
test_security_header "Homepage" "https://${TARGET_DOMAIN}" "X-Frame-Options"
test_security_header "Pairwise App" "https://${PAIRWISE_DOMAIN}" "X-Content-Type-Options"
test_security_header "Pairwise App" "https://${PAIRWISE_DOMAIN}" "X-Frame-Options"

echo ""
echo "========================================================="
if [ "${FAILURES}" -eq 0 ]; then
  echo -e "${GREEN}✅ ALL SMOKE TESTS PASSED SUCCESSFULLY!${NC}"
  exit 0
else
  echo -e "${RED}❌ SMOKE TESTING COMPLETED WITH ${FAILURES} FAILURE(S).${NC}"
  exit 1
fi
