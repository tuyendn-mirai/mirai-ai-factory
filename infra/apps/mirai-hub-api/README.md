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

## Rebuild (Aug 2026): bỏ agent catalog, chat trực tiếp qua LiteLLM + MCP

Bản trước forward tin nhắn sang 1 flow Langflow cố định chọn qua
`chat_profiles` lọc theo role/tenant (seed JSON tĩnh). Bản này bỏ hẳn catalog
đó — mirai-hub giờ tự chạy 1 tool-calling loop (gọi LiteLLM/Tầng 3 trực
tiếp), và mỗi thread có thể kết nối tới **1 MCP server** lấy động từ danh
sách project của Langflow (Tầng 4) qua panel Settings — không seed bằng
JSON. Chi tiết thiết kế + lý do từng quyết định nằm trong
[`../../../mirai-hub/README.md`](../../../mirai-hub/README.md) và comment
trực tiếp trong code (`mirai_hub/mcp_client.py`, `mirai_hub/chat.py`,
`.chainlit/config.toml`).

Vẫn dùng chung Postgres `ai_factory` (schema `miraihub`, xem
[`../../../mirai-hub/scripts/init_schema.py`](../../../mirai-hub/scripts/init_schema.py)
— DDL chính thức từ `chainlit-datalayer`, không phải tự viết), giờ có thêm
S3-compatible storage (MinIO) cho file element, và Postgres/S3 credentials
seed trong `mirai/mirai-hub` (xem
[`../../../localstack/seed-secrets.sh`](../../../localstack/seed-secrets.sh)).

## Áp dụng

```bash
# 1. (Đã làm 1 lần) schema Postgres — xem mirai-hub/scripts/init_schema.py
# 2. (Cần làm tay, ngoài repo) tạo user/bucket MinIO thật khớp secret đã
#    seed — mirai-dev-minio không do repo này quản lý, xem
#    mirai-hub/README.md phần MinIO.
# 3. Build + import image (không dùng registry, xem Dockerfile)
cd mirai-hub-api && docker build -t mirai-hub-api:latest . && k3d image import mirai-hub-api:latest -c mirai-eks

# 4. Commit + push — ArgoCD chỉ thấy file qua git remote, không phải local
#    working tree.
git add infra/apps/mirai-hub-api mirai-hub-api localstack/seed-secrets.sh
git commit -m "..." && git push

# 5. External secret — cần namespace mirai-hub tồn tại trước (ArgoCD tự tạo
#    qua CreateNamespace=true sau khi Application sync xong ở bước 4)
kubectl apply -f infra/apps/mirai-hub/external-secret.yaml
```

## Quyết định thiết kế đáng chú ý

- **`features.mcp.enabled = false` trong `config.toml` là cố ý** — MCP native
  của Chainlit (icon 🔌) quản lý connection theo browser-session, không theo
  thread, và không có API phía server để mở connection thay người dùng. App
  tự nói chuyện MCP (SDK `mcp` chính thức) driven bởi panel Settings, cho
  phép bind đúng 1 server / thread + tự reconnect khi resume thread. Xem
  comment đầy đủ trong `.chainlit/config.toml` và `mirai_hub/mcp_client.py`.
- **`LANGFLOW_RUNTIME_BASE_URL` hard-code service DNS nội bộ** — Layer 5 gọi
  Layer 4 trong-cluster (list project + composer-url + kết nối MCP), không
  qua Ingress.
- **`LITELLM_BASE_URL` không phải secret** (chỉ service DNS), nhưng
  `LITELLM_API_KEY` dùng lại masterkey plaintext của `litellm-helm` — chấp
  nhận rủi ro POC local giống các app khác trong repo này, không mint virtual
  key riêng.
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
