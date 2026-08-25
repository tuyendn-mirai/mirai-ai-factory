# langfuse

LLM observability (self-host) lên `mirai-eks` qua ArgoCD. Xem
[`../README.md`](../README.md) cho quy ước chung `infra/apps/<name>/`.

Chart chính thức `langfuse/langfuse` (repo
`https://langfuse.github.io/langfuse-k8s`), bundle sẵn subchart Postgres/
Valkey/SeaweedFS + template ClickHouseCluster CR — TẤT CẢ đã tắt
(`deploy: false` / không dùng operator) vì Postgres/Redis/ClickHouse/MinIO
đã chạy sẵn qua docker-compose ở gốc repo, trên chính máy host cụm k3d này
(`host.k3d.internal`, cùng pattern LiteLLM/LocalStack — xem
[`../../../localstack/README.md`](../../../localstack/README.md)).

## Secret nguồn trong LocalStack

`mirai/langfuse` (xem [`../../../localstack/README.md`](../../../localstack/README.md))
chứa field rời: `DB_PASSWORD`, `REDIS_PASSWORD`, `CLICKHOUSE_PASSWORD`,
`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, `LANGFUSE_SALT`,
`LANGFUSE_ENCRYPTION_KEY`, `NEXTAUTH_SECRET`. Username (Postgres/ClickHouse)
không phải secret, đặt thẳng trong `values.yaml`.

## ExternalSecret

Manifest: [`external-secret.yaml`](external-secret.yaml) — 1 `ExternalSecret`
tạo Secret k8s `langfuse-credentials` (namespace `langfuse`), áp dụng bằng
`kubectl apply` thường (không qua ArgoCD, cùng lý do như ClusterSecretStore —
xem [`../external-secrets/README.md`](../external-secrets/README.md)). Tên
field nguồn (LocalStack) và tên key đích (Secret k8s) KHÔNG cần trùng nhau —
`remoteRef.property` và `secretKey` map độc lập, ví dụ
`MINIO_ROOT_USER` → `s3-access-key-id`.

Verify:

```bash
kubectl get externalsecret -n langfuse
# STATUS: SecretSynced, READY: True
```

## Quyết định thiết kế đáng chú ý

- **`langfuse.salt`/`langfuse.encryptionKey`/`langfuse.nextauth.secret`**:
  chart hỗ trợ `value` HOẶC `secretKeyRef` trỏ Secret có sẵn — dùng
  `secretKeyRef` trỏ `langfuse-credentials`, KHÔNG cần plaintext trong
  `values.yaml` (khác hẳn vấn đề `masterkey` của `litellm-helm`, xem
  [`../litellm/README.md`](../litellm/README.md) để so sánh). Chart tự cảnh
  báo trong `templates/langfuse-app-secret.yaml`: để trống thì dùng `lookup`
  để không đổi giá trị mỗi lần render, nhưng "`lookup` không thấy cluster
  dưới GitOps (helm template qua ArgoCD)" — nên PHẢI set secretKeyRef, không
  để chart tự sinh.
- **`postgresql.auth.args: "schema=langfuse"`**: `ai_factory` dùng chung
  nhiều app, mỗi app 1 schema riêng (xem `.env` gốc repo). Chart này build
  `DATABASE_HOST/PORT/USERNAME/PASSWORD/NAME/ARGS` rời (không bundle URL như
  `litellm-helm`) — `DATABASE_ARGS` chính là chỗ nối `?schema=...` vào.
- **`redis.auth.username: ""`**: Redis ngoài không dùng ACL, chỉ password
  đơn — để trống thì chart build đúng dạng `redis://:$(REDIS_PASSWORD)@host:port/db`,
  không có phần username.
- **`redis.auth.database: 2`**: cùng server Redis với LiteLLM
  (`host.k3d.internal:6380`) nhưng khác DB index để không đụng key (LiteLLM
  dùng index 1).
- **`clickhouse.cluster.enabled: false`**: ClickHouse ngoài không phải
  cluster (1 instance docker-compose) — tắt `CLICKHOUSE_CLUSTER_ENABLED` để
  Langfuse không cố chạy DDL kiểu `ON CLUSTER`.
- **`s3.accessKeyId`/`s3.secretAccessKey`**: MinIO root user/password dùng
  thẳng làm access key/secret key (quy ước S3-compatible chuẩn của MinIO).

## Ingress

`langfuse.ingress.enabled: true` thẳng trong `values.yaml` (host
`langfuse.mirai.local`) — không tạo file riêng trong `infra/ingress/`, xem
[`../README.md`](../README.md).

Verify:

```bash
kubectl get pods -n langfuse             # web + worker, 1/1 Running
argocd app get langfuse --grpc-web       # Synced, Healthy
curl http://langfuse.mirai.local/api/public/health
```

(cần `127.0.0.1 langfuse.mirai.local` trong `/etc/hosts` trên máy chạy trình
duyệt — xem lưu ý SSH remote trong [`../../argocd/README.md`](../../argocd/README.md))

## Trạng thái hiện tại

Langfuse chạy trong `mirai-eks`, Postgres/Redis/ClickHouse/MinIO nối qua
`host.k3d.internal`, đọc credential qua ExternalSecret từ LocalStack (kể cả
salt/encryption-key/nextauth-secret — không plaintext). Chưa nối
`success_callback`/`failure_callback` của LiteLLM vào đây (việc tiếp theo,
xem [`../../README.md`](../../README.md)).
