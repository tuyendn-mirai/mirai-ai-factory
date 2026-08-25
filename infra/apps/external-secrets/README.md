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

## ClusterSecretStore trỏ vào LocalStack

Manifest: [`clustersecretstore.yaml`](clustersecretstore.yaml)
— áp dụng bằng `kubectl apply` thường (không qua ArgoCD Application/Helm,
xem lý do trong [`../README.md`](../README.md)), gồm 2 resource:

- Secret `localstack-aws-creds` (namespace `external-secrets`) chứa access
  key/secret key giả `test`/`test` — tạo tay bằng `kubectl`, không qua
  ExternalSecret (gà-trứng: đây chính là credential để ExternalSecret gọi ra
  ngoài, cùng lý do repo-credential secret ở ArgoCD cũng tạo tay).
- `ClusterSecretStore` tên `localstack`, `provider.aws.service:
  SecretsManager`, `region: ap-northeast-1`, auth trỏ vào secret ở trên.

**CRD không có field `endpoint` trong `spec.provider.aws`** (đã kiểm tra
bằng `kubectl explain clustersecretstore.spec.provider.aws` — không có, dù
một số ví dụ tìm được trên mạng cho là có). Endpoint LocalStack phải trỏ qua
biến môi trường **controller-level** `AWS_SECRETSMANAGER_ENDPOINT` (field
`extraEnv` trong [`values.yaml`](values.yaml)), ảnh hưởng TẤT CẢ
SecretStore/ClusterSecretStore dùng service SecretsManager trong cluster —
không set riêng per-store được.

Xem [`../../../localstack/README.md`](../../../localstack/README.md) cho
chi tiết LocalStack.

Verify:

```bash
kubectl get clustersecretstore localstack
# CAPABILITIES: Ready=True
```
