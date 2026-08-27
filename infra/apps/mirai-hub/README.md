# mirai-hub

Layer 5 (Hub UI) — app tự viết (Chainlit), source ở
[`../../../mirai-hub/`](../../../mirai-hub/README.md). Khác mọi app còn lại
trong `infra/apps/` (không dùng Helm chart nào — không có chart chính thức
cho app này), nên cấu trúc thư mục lệch khỏi convention chung trong
[`../README.md`](../README.md):

```
infra/apps/mirai-hub/
├── application.yaml     # ArgoCD Application, single-source trỏ manifests/
├── external-secret.yaml  # kubectl apply tay, không qua ArgoCD (xem file)
└── manifests/
    ├── deployment.yaml
    ├── service.yaml
    └── ingress.yaml
```

## Trạng thái hiện tại: chỉ còn thiếu `git push`

Đã làm thật + verify (không phải giả định):

- **Image**: build từ `../../../mirai-hub/Dockerfile` (`docker build -t
  mirai-hub:latest .`), import thẳng vào containerd cụm `mirai-eks` bằng
  `k3d image import mirai-hub:latest -c mirai-eks` — **không dùng registry**
  (đã bỏ hướng "registry local" trong README gốc, không cần cho local
  mimic). `deployment.yaml` dùng `image: mirai-hub:latest` +
  `imagePullPolicy: IfNotPresent` (bắt buộc, không thì kubelet cố pull từ
  Docker Hub và fail).
- **Secret `mirai/mirai-hub` đã seed thật** trong LocalStack (4 field:
  `CHAINLIT_AUTH_SECRET`, `DATABASE_URL`, `DATABASE_SCHEMA`,
  `DEV_ADMIN_PASSWORD`) — xem
  [`../../../localstack/seed-secrets.sh`](../../../localstack/seed-secrets.sh).
  `LANGFLOW_API_KEY`/`DEV_ANALYST_PASSWORD` CHƯA seed
  (xem comment trong file đó) — `deployment.yaml` đọc các field này qua
  `optional: true` nên không chặn.
- **Schema `miraihub` trong DB `ai_factory`** đã có sẵn (owner `mirai`,
  giống litellm/langfuse) — đã chạy thật schema.sql của Chainlit
  (`users`/`threads`/`steps`/`elements`/`feedbacks`) vào đúng schema này qua
  `docker exec mirai-dev-postgres psql`, verify bằng `\dt miraihub.*`.
- **`kubectl apply -f infra/apps/mirai-hub/application.yaml`** đã chạy thật
  — Application tồn tại trong `argocd` namespace, nhưng
  `ComparisonError: infra/apps/mirai-hub/manifests: app path does not
  exist` — vì ArgoCD pull từ git **remote** (`main`), không phải working
  tree local. **Việc còn lại duy nhất: commit + push** (xem
  [`../README.md`](../README.md) — "chỉ cần commit + push, ArgoCD tự thấy
  file mới").

## Áp dụng

```bash
# 1. Commit + push — ArgoCD chỉ thấy file qua git remote, không phải local
#    working tree (đã tự xác nhận bằng ComparisonError thật).
git add infra/apps/mirai-hub mirai-hub localstack/seed-secrets.sh
git commit -m "..." && git push

# 2. Application đã apply sẵn (kubectl apply -f infra/apps/mirai-hub/application.yaml
#    đã chạy) — sau khi push, ArgoCD tự sync (automated + selfHeal), không
#    cần làm gì thêm cho bước này.

# 3. External secret — CHƯA áp dụng, cần namespace mirai-hub tồn tại trước
#    (ArgoCD tự tạo qua CreateNamespace=true sau khi sync xong ở bước 2)
kubectl apply -f infra/apps/mirai-hub/external-secret.yaml
```

## Quyết định thiết kế đáng chú ý

- **`LANGFLOW_RUNTIME_BASE_URL` hard-code service DNS nội bộ**
  (`http://langflow-runtime.langflow.svc.cluster.local:7860`), không qua
  Ingress/`*.mirai.local` — Layer 5 gọi Layer 4 trong-cluster, không cần đi
  vòng qua ingress-nginx như truy cập từ trình duyệt.
- **4 field `OAUTH_KEYCLOAK_*` không có trong `external-secret.yaml`** —
  xem comment trong chính file đó: property chưa tồn tại ở LocalStack (chưa
  seed vì Keycloak chưa deploy) sẽ làm lỗi `SecretSyncedError` cho *cả*
  object, không phải lỗi cục bộ từng field. `deployment.yaml` đã đọc 4 field
  này qua `secretKeyRef.optional: true` nên khi thêm vào ExternalSecret sau
  này không cần sửa gì ở Deployment.
- **Ingress host `hub.mirai.local`** — cần thêm dòng `127.0.0.1 hub.mirai.local`
  vào `/etc/hosts` (máy chạy trình duyệt) như mọi app khác, xem lưu ý SSH
  remote trong [`../../argocd/README.md`](../../argocd/README.md).

## Verify (sau khi commit + push)

```bash
kubectl get pods -n mirai-hub
kubectl get externalsecret mirai-hub-credentials -n mirai-hub   # STATUS: SecretSynced
argocd app get mirai-hub --grpc-web                              # Synced, Healthy
curl http://hub.mirai.local/
```
