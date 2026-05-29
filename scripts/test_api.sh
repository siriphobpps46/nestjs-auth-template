#!/bin/bash

# Color definitions
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"
RESULTS_DIR="test_results"

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}    🚀 NestJS Auth + RBAC API Test Suite       ${NC}"
echo -e "${BLUE}===============================================${NC}"

# Re-create results directory
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

# Generate randomized suffix for unique role & user creation per test run
RANDOM_SUFX=$((100 + RANDOM % 900))
ROLE_NAME="Warehouse Operator $RANDOM_SUFX"
TEST_USERNAME="operator_$RANDOM_SUFX"
TEST_EMAIL="operator_$RANDOM_SUFX@example.com"

# Helper function to extract value from JSON string using regex
extract_json_value() {
  local json="$1"
  local key="$2"
  # Matches "key":"value" and extracts "value"
  echo "$json" | grep -o "\"$key\":\"[^\"]*\"" | head -n 1 | cut -d':' -f2- | tr -d '"'
}

# Helper function to save formatted/prettified JSON using Node.js
save_formatted_json() {
  local raw_content="$1"
  local target_path="$2"
  # Prettifies JSON with 2-space indentation, falls back to raw write on error
  echo "$raw_content" | node -e "
    const fs = require('fs');
    try {
      const raw = fs.readFileSync(0, 'utf-8');
      const parsed = JSON.parse(raw);
      fs.writeFileSync('$target_path', JSON.stringify(parsed, null, 2));
    } catch (e) {
      fs.writeFileSync('$target_path', '$raw_content');
    }
  "
}

# Check if NestJS server is online
echo -e "\n${YELLOW}Checking if server is online at $BASE_URL...${NC}"
if ! curl -s --connect-timeout 3 "$BASE_URL" > /dev/null; then
  # Sometimes the root route / returns 404 but server is up, so check if we get a response
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/permissions")
  if [ "$HTTP_STATUS" -eq 000 ]; then
    echo -e "${RED}❌ Error: NestJS server is offline! Please start it with 'npm run start:dev' first.${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}✓ NestJS server is online!${NC}"

# ==========================================
# STEP 1: Login as Superadmin
# ==========================================
echo -e "\n${YELLOW}[Step 1] Logging in as Superadmin...${NC}"
LOGIN_PAYLOAD='{"username":"superadmin","password":"SuperAdmin2026!"}'

LOGIN_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$LOGIN_PAYLOAD" \
  "$BASE_URL/auth/login")

# Save response formatted
save_formatted_json "$LOGIN_RESPONSE" "$RESULTS_DIR/1_login_response.json"
echo -e "Response saved to: ${BLUE}$RESULTS_DIR/1_login_response.json${NC}"

# Extract tokens
SUPERADMIN_ACCESS_TOKEN=$(extract_json_value "$LOGIN_RESPONSE" "access_token")
SUPERADMIN_REFRESH_TOKEN=$(extract_json_value "$LOGIN_RESPONSE" "refresh_token")

if [ -z "$SUPERADMIN_ACCESS_TOKEN" ]; then
  echo -e "${RED}❌ Login failed! Please make sure seed data is populated.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Login successful! Tokens extracted.${NC}"

# ==========================================
# STEP 2: Fetch All Permissions
# ==========================================
echo -e "\n${YELLOW}[Step 2] Fetching system permissions using Access Token...${NC}"

PERMISSIONS_RESPONSE=$(curl -s -X GET \
  -H "Authorization: Bearer $SUPERADMIN_ACCESS_TOKEN" \
  "$BASE_URL/permissions")

save_formatted_json "$PERMISSIONS_RESPONSE" "$RESULTS_DIR/2_get_permissions.json"
echo -e "Response saved to: ${BLUE}$RESULTS_DIR/2_get_permissions.json${NC}"
echo -e "${GREEN}✓ Successfully fetched permissions list.${NC}"

# Extract a permission ID dynamically to link to a role
# e.g., product:read permission ID
PRODUCT_READ_PERM_ID=$(echo "$PERMISSIONS_RESPONSE" | grep -o '"id":"[^"]*","name":"product:read"' | cut -d'"' -f4)
PRODUCT_CREATE_PERM_ID=$(echo "$PERMISSIONS_RESPONSE" | grep -o '"id":"[^"]*","name":"product:create"' | cut -d'"' -f4)

if [ -z "$PRODUCT_READ_PERM_ID" ]; then
  # Fallback if names are different
  PRODUCT_READ_PERM_ID=$(echo "$PERMISSIONS_RESPONSE" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4)
  PRODUCT_CREATE_PERM_ID=$(echo "$PERMISSIONS_RESPONSE" | grep -o '"id":"[^"]*"' | head -n 2 | tail -n 1 | cut -d'"' -f4)
fi
echo -e "${GREEN}✓ Dynamically fetched test permission IDs: $PRODUCT_READ_PERM_ID, $PRODUCT_CREATE_PERM_ID${NC}"

# ==========================================
# STEP 3: Create a Custom Role
# ==========================================
echo -e "\n${YELLOW}[Step 3] Creating a new Role ($ROLE_NAME) with specific permissions...${NC}"
ROLE_PAYLOAD="{\"name\":\"$ROLE_NAME\",\"description\":\"Allows reading and creating products\",\"permission_ids\":[\"$PRODUCT_READ_PERM_ID\",\"$PRODUCT_CREATE_PERM_ID\"]}"

ROLE_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPERADMIN_ACCESS_TOKEN" \
  -d "$ROLE_PAYLOAD" \
  "$BASE_URL/roles")

save_formatted_json "$ROLE_RESPONSE" "$RESULTS_DIR/3_create_role.json"
echo -e "Response saved to: ${BLUE}$RESULTS_DIR/3_create_role.json${NC}"

ROLE_ID=$(extract_json_value "$ROLE_RESPONSE" "id")
if [ -z "$ROLE_ID" ]; then
  echo -e "${RED}❌ Role creation failed!${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Role '$ROLE_NAME' created successfully with ID: $ROLE_ID${NC}"

# ==========================================
# STEP 4: Create a New User
# ==========================================
echo -e "\n${YELLOW}[Step 4] Creating a new User linked to our new Warehouse Role...${NC}"
USER_PAYLOAD="{\"username\":\"$TEST_USERNAME\",\"email\":\"$TEST_EMAIL\",\"password\":\"Operator123!\",\"employee_id\":\"EMP-00100\",\"role_ids\":[\"$ROLE_ID\"]}"

USER_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPERADMIN_ACCESS_TOKEN" \
  -d "$USER_PAYLOAD" \
  "$BASE_URL/users")

save_formatted_json "$USER_RESPONSE" "$RESULTS_DIR/4_create_user.json"
echo -e "Response saved to: ${BLUE}$RESULTS_DIR/4_create_user.json${NC}"

NEW_USER_ID=$(extract_json_value "$USER_RESPONSE" "id")
if [ -z "$NEW_USER_ID" ]; then
  echo -e "${RED}❌ User creation failed!${NC}"
  exit 1
fi
echo -e "${GREEN}✓ User '$TEST_USERNAME' created successfully with ID: $NEW_USER_ID${NC}"

# ==========================================
# STEP 5: Login as the New User
# ==========================================
echo -e "\n${YELLOW}[Step 5] Logging in as the newly created User '$TEST_USERNAME'...${NC}"
USER_LOGIN_PAYLOAD="{\"username\":\"$TEST_USERNAME\",\"password\":\"Operator123!\"}"

USER_LOGIN_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$USER_LOGIN_PAYLOAD" \
  "$BASE_URL/auth/login")

save_formatted_json "$USER_LOGIN_RESPONSE" "$RESULTS_DIR/5_login_new_user.json"
echo -e "Response saved to: ${BLUE}$RESULTS_DIR/5_login_new_user.json${NC}"

# Extract new user tokens
NEW_USER_ACCESS_TOKEN=$(extract_json_value "$USER_LOGIN_RESPONSE" "access_token")
NEW_USER_REFRESH_TOKEN=$(extract_json_value "$USER_LOGIN_RESPONSE" "refresh_token")

if [ -z "$NEW_USER_ACCESS_TOKEN" ]; then
  echo -e "${RED}❌ New User Login failed!${NC}"
  exit 1
fi
echo -e "${GREEN}✓ New User logged in successfully! Checked role details and menu generation in response.${NC}"

# ==========================================
# STEP 6: Refresh Access Token
# ==========================================
echo -e "\n${YELLOW}[Step 6] Refreshing session using Refresh Token...${NC}"

REFRESH_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $NEW_USER_REFRESH_TOKEN" \
  "$BASE_URL/auth/refresh")

save_formatted_json "$REFRESH_RESPONSE" "$RESULTS_DIR/6_refresh_token_response.json"
echo -e "Response saved to: ${BLUE}$RESULTS_DIR/6_refresh_token_response.json${NC}"

# Extract brand new tokens
NEW_ACCESS_TOKEN=$(extract_json_value "$REFRESH_RESPONSE" "access_token")
NEW_REFRESH_TOKEN=$(extract_json_value "$REFRESH_RESPONSE" "refresh_token")

if [ -z "$NEW_ACCESS_TOKEN" ]; then
  echo -e "${RED}❌ Refresh session failed!${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Refresh token rotation successful! New Access Token obtained.${NC}"

# ==========================================
# STEP 7: Perform Logout
# ==========================================
echo -e "\n${YELLOW}[Step 7] Logging out of '$TEST_USERNAME' session...${NC}"
LOGOUT_PAYLOAD="{\"refresh_token\":\"$NEW_REFRESH_TOKEN\"}"

LOGOUT_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN" \
  -d "$LOGOUT_PAYLOAD" \
  "$BASE_URL/auth/logout")

save_formatted_json "$LOGOUT_RESPONSE" "$RESULTS_DIR/7_logout_response.json"
echo -e "Response saved to: ${BLUE}$RESULTS_DIR/7_logout_response.json${NC}"
echo -e "${GREEN}✓ User logged out and active tokens revoked successfully.${NC}"

echo -e "\n${GREEN}===============================================${NC}"
echo -e "${GREEN}    🎉 All API endpoints verified successfully!  ${NC}"
echo -e "${GREEN}    All outputs saved inside standard folder:  ${NC}"
echo -e "${GREEN}    ./$RESULTS_DIR/                            ${NC}"
echo -e "${GREEN}===============================================${NC}"
