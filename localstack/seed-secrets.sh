#!/usr/bin/env bash
# Seed lại secret vào LocalStack Secrets Manager sau MỖI lần
# `docker compose up` container localstack — LocalStack Community (không có
# LOCALSTACK_AUTH_TOKEN) không hỗ trợ persistence dù đã set PERSISTENCE=1 +
# mount volume (tính năng trả phí — xem README.md trong cùng thư mục này).
# Container restart (kể cả do máy/docker daemon restart, không phải mình
# chủ động) là mất sạch secret — chạy lại script này để tạo lại, idempotent
# (create nếu chưa có, update nếu đã có).
#
# Giá trị lấy từ .env ở gốc repo, TRỪ REDIS_HOST: .env dùng IP LAN
# (172.16.0.191) vì đó là giá trị cho docker-compose ở gốc repo gọi trực
# tiếp; secret này phục vụ ExternalSecret trong mirai-eks nên dùng
# host.k3d.internal (Postgres/Redis là container docker-compose chạy trên
# CHÍNH máy host cụm k3d, xem infra/apps/litellm/values.yaml).
set -euo pipefail

ENDPOINT="http://localhost:4566"
REGION="ap-northeast-1"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION="$REGION"

seed_secret() {
  local name="$1" description="$2" json="$3"
  if aws --endpoint-url="$ENDPOINT" secretsmanager describe-secret --secret-id "$name" >/dev/null 2>&1; then
    aws --endpoint-url="$ENDPOINT" secretsmanager update-secret \
      --secret-id "$name" --secret-string "$json" >/dev/null
    echo "updated: $name"
  else
    aws --endpoint-url="$ENDPOINT" secretsmanager create-secret \
      --name "$name" --description "$description" --secret-string "$json" >/dev/null
    echo "created: $name"
  fi
}

seed_secret "mirai/litellm" "Credentials cho LiteLLM (layer3)" '{
  "username": "mirai",
  "password": "Adgjmptw1",
  "REDIS_HOST": "host.k3d.internal",
  "REDIS_PORT": "6380",
  "REDIS_PASSWORD": "Adgjmptw1",
  "REDIS_DB": "1",
  "LANGFUSE_HOST": "http://langfuse-web.langfuse.svc.cluster.local:3000",
  "LANGFUSE_PUBLIC_KEY": "pk-lf-3a992d47-aa05-4508-9168-5b3fa9eadd6c",
  "LANGFUSE_SECRET_KEY": "sk-lf-fda8e66d-61e3-452a-957f-ab27030b64eb"
}'

# Langfuse: đã deploy (infra/apps/langfuse/), field bên dưới khớp đúng
# ExternalSecret ở đó (xem infra/apps/langfuse/external-secret.yaml).
#
# ĐÃ BỎ DB_USERNAME/CLICKHOUSE_USER — không phải secret, ExternalSecret ở
# đó không trích field nào tên vậy cả (username đặt thẳng literal trong
# infra/apps/langfuse/values.yaml: postgresql.auth.username,
# clickhouse.auth.username — giữ trong LocalStack chỉ để đó, không app nào
# đọc, dễ hiểu lầm là đang đi qua ESO trong khi thực ra không).
seed_secret "mirai/langfuse" "Credentials cho Langfuse (self-host)" '{
  "DB_PASSWORD": "Adgjmptw1",
  "CLICKHOUSE_PASSWORD": "Adgjmptw1",
  "REDIS_PASSWORD": "Adgjmptw1",
  "MINIO_ROOT_USER": "langfuse",
  "MINIO_ROOT_PASSWORD": "Adgjmptw1",
  "LANGFUSE_SALT": "fqQqfZJ+3ppm5LBLyiA00I4Cd/GLWg/AApygkO/HrBM=",
  "LANGFUSE_ENCRYPTION_KEY": "f7ba6e5fab85c550ac77042c300d5bf5b632a43406d37d934105732159473a61",
  "NEXTAUTH_SECRET": "d/N4lKAMRxoaGbRhowCmYaQKDghEcB/WyOk5zq9oDGQ="
}'

# Langflow: đã deploy (infra/apps/langflow-ide/, infra/apps/langflow-runtime/)
# — 2 chart riêng (IDE build flow + Runtime chạy flow đã build) dùng CHUNG 1
# DB "langflow" (không phải schema trong ai_factory như litellm/langfuse —
# .env gốc repo tách hẳn DB riêng) để runtime phục vụ được flow build từ IDE.
# DB_PASSWORD dùng cho externalDatabase.password của langflow-ide (field rời
# host/port/user/password/database, hỗ trợ secretKeyRef). LANGFLOW_DATABASE_URL
# (chuỗi đầy đủ) dùng cho langflow-runtime — chart đó chỉ có field `env` phẳng
# (mỗi entry 1 value/secretKeyRef trọn vẹn, không có host/port/user rời để
# ghép), nên phải bundle sẵn cả URL.
#
# ĐÃ BỎ LANGFLOW_SUPERUSER/LANGFLOW_SUPERUSER_PASSWORD/DB_USERNAME/
# LANGFLOW_SECRET_KEY — cả langflow-ide lẫn langflow-runtime đều set 4 giá
# trị này bằng literal thẳng trong values.yaml (superuserPassword/secretKey
# của langflow-ide chỉ nhận value, KHÔNG hỗ trợ secretKeyRef — xem
# infra/apps/langflow-ide/README.md), không ExternalSecret nào trích các
# field này cả. Giữ trong LocalStack chỉ gây hiểu lầm là đang đi qua ESO.
seed_secret "mirai/langflow" "Credentials cho Langflow (Tầng 4) — IDE + Runtime" '{
  "DB_PASSWORD": "Adgjmptw1",
  "LANGFLOW_DATABASE_URL": "postgresql://mirai:Adgjmptw1@host.k3d.internal:5435/langflow"
}'

# mirai-hub (Tầng 5): DB dùng CHUNG "ai_factory" với litellm/langfuse, tách
# bằng schema "miraihub" (dùng scripts/init_schema.py để (re)tạo — DDL chính
# thức từ github.com/Chainlit/chainlit-datalayer, không phải tự viết) thay vì
# DB riêng như langflow. Không dùng trick "?schema=" trong URL như langfuse
# (Prisma-specific, asyncpg không hiểu) — DATABASE_SCHEMA tách riêng, app tự
# truyền qua connect_args.server_settings.search_path (mirai_hub/data_layer.py).
#
# Rebuild (Aug 2026): app giờ tự chạy tool-calling loop qua LiteLLM (Tầng 3)
# thay vì chỉ forward sang 1 flow Langflow cố định — LITELLM_API_KEY thêm
# mới, dùng LẠI masterkey plaintext của litellm-helm (xem
# infra/apps/litellm/values.yaml, field masterkey — rủi ro plaintext đã được
# chấp nhận cho POC local ở đó, seed lại ở đây thay vì mint virtual key riêng
# cho đơn giản). APP_AWS_REGION thêm mới — boto3 bắt buộc dù chạy với MinIO
# (giá trị không cần đúng nghĩa AWS region thật). LANGFLOW_API_KEY giờ dùng
# thật cho mirai_hub/langflow_client.py (header x-api-key khi liệt kê
# project/lấy composer-url cho màn hình chọn MCP server) — không còn là
# optional/chưa test như bản cũ. Đã bỏ DEV_ANALYST_PASSWORD — app mới không
# còn khái niệm nhiều user/role (agent catalog theo role/tenant đã bỏ, xem
# mirai-hub/README.md). external-secret.yaml CHỈ khai đúng field đã seed ở
# đây — thêm field nào thì phải thêm cả ở đó (thiếu 1 property trong
# LocalStack làm ExternalSecret lỗi SecretSyncedError cho cả object, không
# phải lỗi cục bộ).
seed_secret "mirai/mirai-hub" "Credentials cho Mirai Hub (Tầng 5)" '{
  "CHAINLIT_AUTH_SECRET": "77ptErei0?^?X-HS5WCqM=G^2HHO8eU_.v9jM5QYueg%_*L_@I66>XrA_lu~jl~:",
  "DATABASE_URL": "postgresql+asyncpg://mirai:Adgjmptw1@host.k3d.internal:5435/ai_factory",
  "DATABASE_SCHEMA": "miraihub",
  "DEV_ADMIN_PASSWORD": "admin",
  "LANGFLOW_API_KEY": "sk-sdG2abq2W4PZm-no1sU98fbp8qpaMzOT2btWgVaHHFc",
  "BUCKET_NAME": "miraihub",
  "APP_AWS_ACCESS_KEY": "mirahub",
  "APP_AWS_SECRET_KEY": "Adgjmptw1",
  "APP_AWS_REGION": "ap-northeast-1",
  "DEV_AWS_ENDPOINT": "http://host.k3d.internal:9100",
  "LITELLM_API_KEY": "Adgjmptw1"
}'

echo
echo "Nếu ExternalSecret trong cluster đã sync trước đó (Secret k8s vẫn còn cache"
echo "giá trị cũ), force sync lại bằng:"
echo "  kubectl annotate externalsecret litellm-db-credentials litellm-env-secrets -n litellm force-sync=\$(date +%s) --overwrite"
