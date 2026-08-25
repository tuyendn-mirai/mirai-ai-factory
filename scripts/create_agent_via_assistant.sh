#!/usr/bin/env bash
# Dùng Langflow Assistant (POST /api/v1/agentic/assist) để tự dựng một Agent
# flow đơn giản, thay vì kéo-thả tay trong UI.
#
# Cần LANGFLOW_API_KEY: tạo trong UI Langflow → avatar góc trên phải →
# Settings → Langflow API Keys → Create.
set -euo pipefail

BASE_URL="${LANGFLOW_BASE_URL:-http://localhost:7860}"
: "${LANGFLOW_API_KEY:?set LANGFLOW_API_KEY (tạo ở Settings > Langflow API Keys trong UI Langflow)}"

FLOW_NAME="${1:-Simple Agent (assistant)}"
PROMPT="${2:-Tạo một flow gồm 3 node nối tiếp: Chat Input -> Agent -> Chat Output.
Agent dùng model provider \"OpenAI Compatible\", model name \"fp-analysis-default\",
base URL http://litellm:4000, system prompt \"tôi là chuyên gia tư vấn AI\".
Bật 2 tool có sẵn: Current Date và Calculator. Không nối thêm tool nào khác.}"

echo "== 1. Tạo flow rỗng \"$FLOW_NAME\" =="
FLOW_ID=$(curl -sf "$BASE_URL/api/v1/flows/" \
  -H "x-api-key: $LANGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\": $(jq -Rn --arg n "$FLOW_NAME" '$n'), \"data\": {\"nodes\": [], \"edges\": []}}" \
  | jq -r '.id')
echo "flow_id=$FLOW_ID"

echo "== 2. Gọi Assistant dựng Agent trong flow đó =="
curl -sf "$BASE_URL/api/v1/agentic/assist" \
  -H "x-api-key: $LANGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg fid "$FLOW_ID" --arg input "$PROMPT" \
        '{flow_id: $fid, input_value: $input}')" \
  | jq

echo
echo "Mở flow trong UI: $BASE_URL/flow/$FLOW_ID"
