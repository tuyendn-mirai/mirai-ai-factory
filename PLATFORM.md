# Mirai AI Factory — nền tảng k3d/GitOps

Tổng hợp những gì đã dựng thật trong repo này (khác với [`README.md`](README.md)
— file đó là **bản brief kế hoạch ban đầu** đưa cho agent trước khi bắt tay
làm, tham chiếu `k3d-eks-mimic-runbook.md` — file này chưa từng tồn tại
trong repo. Thực tế đã làm lệch khá xa kế hoạch gốc, xem mục
["So với bản kế hoạch gốc"](#so-với-bản-kế-hoạch-gốc) bên dưới).

## Repo này là gì, hiện tại

Chỉ còn 2 thư mục thật: [`infra/`](infra/README.md) (mọi thứ chạy trong
cụm k3d qua ArgoCD) và [`localstack/`](localstack/README.md) (mock AWS
Secrets Manager, chạy ngoài cluster). `docker-compose.yml`/`.env` ở gốc
repo — bản chạy LiteLLM/Langflow/Langfuse bằng docker container thường —
**đã bị xoá** (đang ở trạng thái `git status` chưa commit lúc viết tài liệu
này); 3 app đó giờ chạy trong `mirai-eks` qua ArgoCD thay thế hoàn toàn.

## Kiến trúc tổng quan

```
Máy host (1 máy Linux, chạy mọi thứ)
│
├── Docker containers "dev infra" có sẵn từ trước (NGOÀI repo này):
│   mirai-dev-postgres, mirai-dev-redis, mirai-dev-clickhouse, mirai-dev-minio
│   → nghe trên chính IP LAN của máy, k3d gọi vào qua hostname nội bộ
│     "host.k3d.internal" (KHÔNG hard-code IP — xem localstack/README.md)
│
├── localstack/ (docker compose riêng, repo này định nghĩa)
│   ├── localstack        — mock AWS Secrets Manager (KHÔNG persistence, xem README)
│   └── stackport          — UI xem secret (http://localhost:8090)
│
└── Cụm k3d "mirai-eks" (mô phỏng đặc điểm vận hành AWS EKS)
    ├── ingress-nginx      — điểm vào chung, *.mirai.local qua /etc/hosts
    ├── argocd              — GitOps controller, tự sync mọi Application bên dưới
    ├── external-secrets    — Operator + ClusterSecretStore trỏ LocalStack
    ├── litellm  (ns litellm)    — Tầng 3, AI Model Catalog/Hub
    ├── langfuse (ns langfuse)   — LLM observability, LiteLLM trace vào đây
    └── langflow-ide + langflow-runtime (ns langflow) — Tầng 4, build + chạy flow
```

Toàn bộ credential (trừ vài trường hợp ghi rõ ở dưới) đi qua:
**LocalStack Secrets Manager → `ClusterSecretStore` → `ExternalSecret` →
Secret k8s** — không secret nào nhập tay vào `values.yaml` trừ khi chart
không có cách khác (ghi rõ từng chỗ trong README của app đó).

## Trạng thái hiện tại

Tất cả 6 ArgoCD Application `Synced` + `Healthy`:

| Application | Namespace | Chart |
|---|---|---|
| `apps` | `argocd` | *(app-of-apps gốc, `source.directory` quét `infra/apps/*/application.yaml` — không phải Helm chart)* |
| `external-secrets` | `external-secrets` | `charts.external-secrets.io` `2.9.0` |
| `litellm` | `litellm` | OCI `ghcr.io/berriai/litellm-helm` `0.1.100` |
| `langfuse` | `langfuse` | `langfuse.github.io/langfuse-k8s` `2.0.2` |
| `langflow-ide` | `langflow` | `langflow-ai.github.io/langflow-helm-charts` `0.1.2` |
| `langflow-runtime` | `langflow` | `langflow-ai.github.io/langflow-helm-charts` `0.1.1` |

(ArgoCD tự nó cài từ manifest pin cứng — không phải Helm chart nên không có
hàng riêng ở trên, xem [`infra/argocd/README.md`](infra/argocd/README.md).)

Truy cập (cần thêm từng dòng `127.0.0.1 <host>` vào `/etc/hosts` — trên máy
chạy trình duyệt, không phải máy chạy cluster nếu qua SSH remote, xem lưu ý
trong [`infra/argocd/README.md`](infra/argocd/README.md)):

| Host | Dịch vụ |
|---|---|
| `argocd.mirai.local` | ArgoCD UI |
| `litellm.mirai.local` | LiteLLM Proxy (Tầng 3) |
| `langfuse.mirai.local` | Langfuse UI |
| `langflow.mirai.local` | Langflow IDE (build/test flow) |
| `langflow-runtime.mirai.local` | Langflow Runtime API (chạy flow đã build) |

## Từng thành phần — chi tiết trong README riêng

Không lặp lại nội dung ở đây — mỗi thư mục có README ghi đúng lý do/lệnh/
verify đã chạy thật:

- [`infra/README.md`](infra/README.md) — tổng, cấu trúc thư mục, TODO còn treo (nguồn duy nhất, cập nhật liên tục)
- [`infra/cluster/README.md`](infra/cluster/README.md) — cụm k3d mô phỏng EKS
- [`infra/storageclass/README.md`](infra/storageclass/README.md) — StorageClass `gp2`
- [`infra/ingress/README.md`](infra/ingress/README.md) — `ingress-nginx` controller dùng chung
- [`infra/argocd/README.md`](infra/argocd/README.md) — cài ArgoCD, repo credentials, sự cố git object rỗng đã gặp
- [`infra/apps/README.md`](infra/apps/README.md) — quy ước chung cho mọi app Helm/ArgoCD
- [`infra/apps/external-secrets/README.md`](infra/apps/external-secrets/README.md) — Operator + ClusterSecretStore
- [`infra/apps/litellm/README.md`](infra/apps/litellm/README.md) — Tầng 3
- [`infra/apps/langfuse/README.md`](infra/apps/langfuse/README.md) — observability
- [`infra/apps/langflow-ide/README.md`](infra/apps/langflow-ide/README.md) — Tầng 4, build/test
- [`infra/apps/langflow-runtime/README.md`](infra/apps/langflow-runtime/README.md) — Tầng 4, chạy flow
- [`localstack/README.md`](localstack/README.md) — mock Secrets Manager, giới hạn persistence, script seed

## Bug/quirk đáng chú ý đã phát hiện qua thực nghiệm

Tất cả đã tự verify bằng lệnh thật (không suy đoán), chi tiết + lệnh verify
nằm trong README của app tương ứng:

- **`litellm-helm`**: initContainer `db-ready` hard-code 1 tag Bitnami đã bị
  gỡ khỏi Docker Hub — phải `kubectl patch` + `ignoreDifferences` +
  `RespectIgnoreDifferences=true` (bản thân `ignoreDifferences` một mình
  KHÔNG đủ, chỉ ẩn diff chứ không sống sót qua sync thật).
- **`litellm-helm`**: field `masterkey` chỉ nhận plaintext, không có
  `secretKeyRef` — chấp nhận rủi ro cho POC local.
- **`langfuse` chart**: field `DATABASE_PORT` chart render ra nhưng app
  KHÔNG đọc (chỉ đọc HOST/USERNAME/PASSWORD/NAME/ARGS) — phải nhét port vào
  `host`.
- **Langfuse v4**: mặc định "events_only mode", âm thầm từ chối event
  LiteLLM gửi qua endpoint cũ — fix bằng
  `LANGFUSE_MIGRATION_V4_WRITE_MODE=dual`.
- **`langflow-ide`**: field `superuserPassword`/`secretKey` chỉ nhận
  plaintext, không `secretKeyRef`.
- **`langflow-runtime`**: crash-loop nếu thiếu `LANGFLOW_SUPERUSER_PASSWORD`
  dù chạy `--backend-only` — app tự bắt buộc setup superuser, không phải
  giới hạn của chart.
- **LocalStack Community**: `PERSISTENCE=1` không đủ — persistence là tính
  năng trả phí (cần `LOCALSTACK_AUTH_TOKEN`), container restart là mất sạch
  secret. Có script `localstack/seed-secrets.sh` seed lại (idempotent).
- **`argocd-repo-server`**: git clone cache (`emptyDir`) sống theo pod chứ
  không theo container — nhiều lần container tự restart (do máy có hiện
  tượng gián đoạn hệ thống, chưa rõ nguyên nhân gốc) mà không xoá được cache
  hỏng, gây lỗi `object file ... is empty` khi sync. Fix: xoá hẳn pod.

## So với bản kế hoạch gốc

[`README.md`](README.md) (bản brief ban đầu) chốt vài lựa chọn mà thực tế
đã đi hướng khác — ghi lại để không hiểu lầm bản kế hoạch đó vẫn còn hiệu
lực:

| Kế hoạch gốc | Thực tế đã làm |
|---|---|
| Cluster tên `eks-mimic`, namespace app riêng `eks-mimic` | Cluster `mirai-eks` |
| Service + Endpoints thủ công trỏ IP tĩnh `platform-net` | Hostname `host.k3d.internal` (k3d tự tạo, không hard-code IP) qua CoreDNS patch |
| MetalLB cho LoadBalancer Service | Không dùng — `ingress-nginx` DaemonSet + `hostPort`, k3d serverlb đã đủ |
| cert-manager | Chưa dùng — mọi ingress hiện là HTTP thuần nội bộ |
| Keycloak | Chưa deploy |
| Argo CD app-of-apps | Đã có (`infra/apps/root-application.yaml`) — nhưng chỉ quản lý object `Application`, không quản lý manifest thường (`ExternalSecret`, `ClusterSecretStore`, `argocd-ingress.yaml`), xem TODO |
| Build & push Hub Web App / BFF | Chưa làm — ngoài phạm vi các bước đã thực hiện |
| LiteLLM/Langflow/Langfuse chạy docker-compose song song k8s | docker-compose ở gốc repo đã bị xoá, k8s là bản DUY NHẤT còn chạy |

## Việc còn treo

Danh sách sống, cập nhật liên tục nằm ở
[`infra/README.md`](infra/README.md#việc-tiếp-theo-chưa-làm) — không lặp
lại ở đây để tránh 2 nguồn dễ lệch nhau.
