#!/usr/bin/env bash
# One-time setup: đăng ký OIDC provider + IAM role trong LocalStack cho
# ClusterSecretStore dùng auth.jwt (kiểu IRSA) thay vì static access
# key/secret key — xem infra/apps/external-secrets/README.md.
#
# QUAN TRỌNG: LocalStack KHÔNG verify chữ ký JWT, KHÔNG gọi ra issuer, KHÔNG
# cả kiểm tra role ARN tồn tại hay không lúc AssumeRoleWithWebIdentity (đã
# tự test bằng JWT giả + role không tồn tại, vẫn nhận credential). Script
# này chỉ tạo đúng SHAPE cấu hình IRSA thật (issuer, trust policy, role) để
# tập dượt trước khi lên EKS thật — KHÔNG phải test enforcement/bảo mật
# thật, xem localstack/README.md mục IAM Policy Enforcement.
#
# Idempotent — chạy lại an toàn (bắt lỗi "already exists"/EntityAlreadyExists
# bỏ qua, không có API describe rẻ như secretsmanager nên không dùng lại
# pattern seed_secret() của seed-secrets.sh).
set -euo pipefail

ENDPOINT="http://localhost:4566"
REGION="ap-northeast-1"
ACCOUNT_ID="000000000000"
OIDC_ISSUER="kubernetes.default.svc.cluster.local"
ROLE_NAME="external-secrets-role"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION="$REGION"

run_idempotent() {
  local desc="$1"; shift
  if output=$("$@" 2>&1); then
    echo "ok: $desc"
  elif echo "$output" | grep -qi "already exist\|EntityAlreadyExists"; then
    echo "unchanged (đã có): $desc"
  else
    echo "$output" >&2
    echo "LỖI: $desc" >&2
    exit 1
  fi
}

# 1. OIDC provider — url khớp đúng issuer thật của k3s (xem
#    kubectl get --raw /.well-known/openid-configuration). Thumbprint không
#    được LocalStack verify, giá trị 40-hex bất kỳ đều được chấp nhận.
run_idempotent "OIDC provider ($OIDC_ISSUER)" \
  aws --endpoint-url="$ENDPOINT" iam create-open-id-connect-provider \
  --url "https://$OIDC_ISSUER" \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list "$(python3 -c 'print("a"*40)')"

# 2. IAM role — trust policy đúng cú pháp IRSA thật: Federated principal trỏ
#    OIDC provider ở trên, điều kiện "sub" khớp ServiceAccount cụ thể
#    (external-secrets/external-secrets — ServiceAccount có sẵn của
#    controller, không tạo SA mới).
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_ISSUER}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${OIDC_ISSUER}:sub": "system:serviceaccount:external-secrets:external-secrets",
          "${OIDC_ISSUER}:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF
)
run_idempotent "IAM role $ROLE_NAME" \
  aws --endpoint-url="$ENDPOINT" iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document "$TRUST_POLICY"

# 3. Inline policy — chỉ cho đọc secret "mirai/*" (least-privilege đúng kiểu
#    sẽ dùng thật trên EKS, dù LocalStack không enforce).
INLINE_POLICY=$(cat <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "secretsmanager:ListSecrets"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:mirai/*"
    }
  ]
}
EOF
)
run_idempotent "inline policy read-mirai-secrets" \
  aws --endpoint-url="$ENDPOINT" iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name read-mirai-secrets \
  --policy-document "$INLINE_POLICY"

echo
echo "Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
