#!/usr/bin/env bash
# Kiểm tra nhanh Tầng 3 (LiteLLM Hub) không cần Langflow.
set -euo pipefail

BASE_URL="${LITELLM_BASE_URL:-http://localhost:4000}"
KEY="${LITELLM_MASTER_KEY:-sk-mirai-local}"

echo "== 1. Health check =="
curl -sf "$BASE_URL/health/liveliness" && echo

echo "== 2. GET /v1/models (danh sách logical_model, tương đương gallery) =="
curl -sf "$BASE_URL/v1/models" -H "Authorization: Bearer $KEY" | jq

echo "== 3. GET /model/info (kèm đầy đủ nhãn nguon_cung/hinh_thuc_trien_khai/status) =="
curl -sf "$BASE_URL/model/info" -H "Authorization: Bearer $KEY" \
  | jq '.data[] | {model_name, model_info}'

echo "== 4. POST /chat/completions bằng logical_model (Tầng 4 gọi y hệt thế này) =="
curl -sf "$BASE_URL/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "fp-analysis-default",
        "messages": [{"role": "user", "content": "Tóm tắt rủi ro tín dụng trong 1 câu."}],
        "temperature": 0.2
      }' | jq

echo "== 5. Spend/audit log gần nhất (Control Tower dùng endpoint này) =="
curl -sf "$BASE_URL/spend/logs" -H "Authorization: Bearer $KEY" | jq '.[0:2]'
