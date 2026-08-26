# external-secrets

Xem [`../README.md`](../README.md) cho quy ước chung `infra/apps/<name>/`.

`application.yaml` cần `syncOptions: [ServerSideApply=true]` — CRD của
external-secrets (`secretstores.external-secrets.io`,
`clustersecretstores.external-secrets.io`) đủ lớn để lỗi
`last-applied-configuration` vượt 262144 bytes, giống hệt lỗi gặp lúc cài
ArgoCD (xem [`../../argocd/README.md`](../../argocd/README.md)), nên phải
server-side apply ngay từ đầu thay vì để tự retry.

Trạng thái hiện tại: `external-secrets` (Operator) đã deploy qua ArgoCD vào
namespace `external-secrets`, `Sync: Synced`, `Health: Healthy`.

## ClusterSecretStore trỏ vào LocalStack — auth kiểu IRSA (`auth.jwt`)

Manifest: [`clustersecretstore.yaml`](clustersecretstore.yaml) — áp dụng
bằng `kubectl apply` thường (không qua ArgoCD Application/Helm, xem lý do
trong [`../README.md`](../README.md)).

**CRD không có field `endpoint` trong `spec.provider.aws`** (đã kiểm tra
bằng `kubectl explain clustersecretstore.spec.provider.aws` — không có, dù
một số ví dụ tìm được trên mạng cho là có). Endpoint LocalStack phải trỏ qua
biến môi trường **controller-level** `AWS_SECRETSMANAGER_ENDPOINT` +
`AWS_STS_ENDPOINT` (field `extraEnv` trong [`values.yaml`](values.yaml)),
ảnh hưởng TẤT CẢ SecretStore/ClusterSecretStore trong cluster — không set
riêng per-store được.

**Không dùng static access key/secret key** (`test`/`test` — cách cũ) mà
dùng `auth.jwt` (kiểu IRSA thật của EKS):

- Role thật lấy từ annotation `eks.amazonaws.com/role-arn` trên chính
  ServiceAccount `external-secrets` (field `serviceAccount.annotations`
  trong [`values.yaml`](values.yaml)) — **KHÔNG** phải qua field
  `provider.aws.role`. Đã tự gặp lỗi khi set cả 2: có `role` cùng giá trị
  role đã lấy qua JWT khiến code cố `sts:AssumeRole` thêm 1 lần nữa **lên
  chính role đó** → `403 AccessDenied` (role không có trust policy tự
  assume chính nó). `role` field chỉ dùng khi cần chain sang role KHÁC sau
  khi đã có credential gốc.
- RBAC `serviceaccounts/token: create` (để mint token qua TokenRequest API)
  **đã có sẵn** trong ClusterRole `external-secrets-controller` mặc định —
  không cần thêm gì.
- OIDC provider + IAM role + trust policy tạo bằng
  [`../../../localstack/setup-oidc-iam.sh`](../../../localstack/setup-oidc-iam.sh)
  (idempotent, chạy 1 lần).

**QUAN TRỌNG — giới hạn của LocalStack**: đã tự test bằng JWT giả (chữ ký
rác) + role ARN không tồn tại, gọi thẳng `sts:AssumeRoleWithWebIdentity` —
LocalStack **vẫn trả về credential**, không hề verify chữ ký/issuer/role có
thật hay không. `auth.jwt` ở đây chỉ tập dượt đúng SHAPE cấu hình IRSA thật
(ServiceAccount annotation, trust policy JSON, OIDC provider) để chuyển
sang EKS gần như nguyên xi — **KHÔNG phải test enforcement/bảo mật thật**,
cùng giới hạn với IAM Policy Enforcement đã ghi trong
[`../../../localstack/README.md`](../../../localstack/README.md) (khác ở
chỗ: Policy Enforcement — có token đúng bản mới — hoạt động enforce thật;
riêng việc xác thực JWT/issuer của `AssumeRoleWithWebIdentity` thì không).

Xem [`../../../localstack/README.md`](../../../localstack/README.md) cho
chi tiết LocalStack.

Verify:

```bash
kubectl get clustersecretstore localstack
# STATUS: Valid, READY: True
kubectl get externalsecret -A
# SecretSynced: True cho tất cả — xác nhận JWT auth thật sự lấy được secret,
# không phải cache cũ (force sync để chắc chắn):
#   kubectl annotate externalsecret <name> -n <ns> force-sync=$(date +%s) --overwrite
```
