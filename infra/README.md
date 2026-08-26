# Local Kubernetes (mô phỏng EKS) — hạ tầng

Một cụm Kubernetes local bằng k3d, mô phỏng đặc điểm vận hành của AWS EKS,
phục vụ test GitOps (ArgoCD) trước khi lên môi trường thật. Mỗi thư mục con
có README riêng ghi lại từng bước đã làm cho phần đó — cập nhật theo từng
bước đã triển khai, không viết trước phần chưa làm.

## Cài CLI

Cài trên Linux x86_64: `k3d`, `kubectl`, `helm`, `argocd`.

```bash
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/kubectl
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
sudo install argocd /usr/local/bin/argocd
```

**Lưu ý:** chạy các lệnh `curl -LO` / `curl -sSL -o` từ trong thư mục repo sẽ
tải binary ngay vào working directory. Đã xảy ra với `argocd` (249MB) và
`kubectl` (59MB) bị rơi vào root repo — đã xoá vì bản cài thật nằm ở
`/usr/local/bin`. Lần sau nên `cd /tmp` hoặc `cd ~/Downloads` trước khi tải.

Verify:

```bash
k3d version            # v5.9.0 / k3s v1.35.5-k3s1
kubectl version --client   # v1.36.4
helm version            # v3.21.4
argocd version --client    # v3.5.1
```

## Cấu trúc thư mục

```
infra/
├── cluster/        # config cụm k3d mô phỏng EKS
├── storageclass/    # StorageClass gp2 (thay local-path mặc định)
├── ingress/         # Helm values cho ingress-nginx CONTROLLER dùng chung
│                    # (điểm vào duy nhất — không còn 1 file Ingress/app ở đây,
│                    # xem lý do trong infra/apps/README.md)
├── argocd/          # Manifest cài ArgoCD (pinned) + Ingress riêng của nó
│                    # (ArgoCD không phải Helm chart nên không có infra/apps/argocd/)
└── apps/            # Mỗi app cài qua Helm/ArgoCD — xem infra/apps/README.md
    ├── root-application.yaml  # app-of-apps gốc, quét */application.yaml
    ├── external-secrets/
    ├── litellm/
    ├── langfuse/
    ├── langflow-ide/
    └── langflow-runtime/
```

Xem README trong từng thư mục con để biết chi tiết cách dựng.

## Việc tiếp theo (chưa làm)

- [x] Seed secret thật vào LocalStack cho các app khác (Langfuse, Langflow)
      — `mirai/langfuse`, `mirai/langflow` trong
      [`../localstack/seed-secrets.sh`](../localstack/seed-secrets.sh). Field
      là best-guess theo `.env` (chưa có chart/values.yaml thật để biết tên
      field chính xác ExternalSecret cần trích — nhiều khả năng phải reshape
      lại khi thật sự viết `infra/apps/langfuse/`, giống bài học ở LiteLLM).
- [x] Deploy Langfuse vào `mirai-eks` qua ArgoCD — xem
      [`apps/langfuse/README.md`](apps/langfuse/README.md). Postgres/Redis/
      ClickHouse/MinIO nối qua `host.k3d.internal`, đọc credential (kể cả
      salt/encryption-key/nextauth-secret) qua ExternalSecret — không
      plaintext như `masterkey` của LiteLLM.
- [x] Trỏ `LANGFUSE_HOST=http://langfuse-web.langfuse.svc.cluster.local:3000`
      rồi bật lại `success_callback`/`failure_callback` trong `proxy_config`
      của LiteLLM — xem [`apps/litellm/README.md`](apps/litellm/README.md).
      Phát sinh thêm: Langfuse v4 mặc định "events_only mode" từ chối event
      LiteLLM gửi (endpoint cũ) — fix bằng
      `LANGFUSE_MIGRATION_V4_WRITE_MODE=dual`, xem
      [`apps/langfuse/README.md`](apps/langfuse/README.md).
- [x] Deploy Langflow (Tầng 4) qua ArgoCD — CẢ `langflow-ide` (build/test,
      có UI) LẪN `langflow-runtime` (chạy flow đã build, headless), xem
      [`apps/langflow-ide/README.md`](apps/langflow-ide/README.md) /
      [`apps/langflow-runtime/README.md`](apps/langflow-runtime/README.md).
      `MIRAI_HUB_BASE_URL`/`LANGFLOW_SSRF_ALLOWED_HOSTS` đã trỏ vào
      LiteLLM/Langfuse trong cluster.
- [ ] Export flow thật từ `langflow-ide`, trỏ `langflow-runtime`'s
      `downloadFlows.flows` vào đó để runtime có flow phục vụ (hiện đang
      rỗng)
- [x] App-of-apps cho `infra/apps/*/application.yaml` — xem
      [`apps/root-application.yaml`](apps/root-application.yaml) và
      [`apps/README.md`](apps/README.md#app-of-apps-tự-động-nhận-app-mới).
      Thêm app mới từ giờ chỉ cần commit + push, không cần `kubectl apply`
      tay cho `application.yaml` nữa.
- [ ] Cân nhắc quản lý các manifest kubectl-apply thủ công còn lại — KHÔNG
      phải kind `Application` nên app-of-apps ở trên không tự động hoá được
      (`infra/argocd/argocd-ingress.yaml`,
      `infra/apps/external-secrets/clustersecretstore.yaml`,
      `infra/apps/litellm/external-secret.yaml`,
      `infra/apps/langfuse/external-secret.yaml`,
      `infra/apps/langflow-ide/external-secret.yaml`) — cần thêm làm source
      thứ 3 (kiểu `directory`) trong multi-source Application của từng app
      thay vì `kubectl apply` thủ công
