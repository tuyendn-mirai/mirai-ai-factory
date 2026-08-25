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
# Langflow: CHƯA deploy vào mirai-eks (chưa có chart/values.yaml thật để
# biết đúng tên field ExternalSecret cần trích) — field ở đây là best-guess
# theo tên biến trong .env gốc repo, nhiều khả năng phải reshape lại khi
# thật sự viết infra/apps/langflow/, giống bài học ở LiteLLM/Langfuse.
seed_secret "mirai/langfuse" "Credentials cho Langfuse (self-host)" '{
  "DB_USERNAME": "mirai",
  "DB_PASSWORD": "Adgjmptw1",
  "CLICKHOUSE_USER": "mirai",
  "CLICKHOUSE_PASSWORD": "Adgjmptw1",
  "REDIS_PASSWORD": "Adgjmptw1",
  "MINIO_ROOT_USER": "langfuse",
  "MINIO_ROOT_PASSWORD": "Adgjmptw1",
  "LANGFUSE_SALT": "fqQqfZJ+3ppm5LBLyiA00I4Cd/GLWg/AApygkO/HrBM=",
  "LANGFUSE_ENCRYPTION_KEY": "f7ba6e5fab85c550ac77042c300d5bf5b632a43406d37d934105732159473a61",
  "NEXTAUTH_SECRET": "d/N4lKAMRxoaGbRhowCmYaQKDghEcB/WyOk5zq9oDGQ="
}'

seed_secret "mirai/langflow" "Credentials cho Langflow (Tầng 4)" '{
  "LANGFLOW_SUPERUSER": "admin",
  "LANGFLOW_SUPERUSER_PASSWORD": "Adgjmptw1",
  "DB_USERNAME": "mirai",
  "DB_PASSWORD": "Adgjmptw1"
}'

echo
echo "Nếu ExternalSecret trong cluster đã sync trước đó (Secret k8s vẫn còn cache"
echo "giá trị cũ), force sync lại bằng:"
echo "  kubectl annotate externalsecret litellm-db-credentials litellm-env-secrets -n litellm force-sync=\$(date +%s) --overwrite"
