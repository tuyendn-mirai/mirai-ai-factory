# Quy ước `infra/apps/<name>/` cho mọi app cài bằng Helm/ArgoCD

**Không `helm install` tay** — mỗi app cài qua Helm/ArgoCD có một thư mục
riêng:

```
infra/apps/<name>/
├── values.yaml       # clone từ `helm show values <repo>/<chart> --version X`,
│                     # rồi chỉnh trực tiếp trong file này
└── application.yaml  # ArgoCD Application, multi-source: 1 nguồn là chart
                       # (repoURL = chart repo/OCI), 1 nguồn là chính repo
                       # git này (ref: values) để trỏ tới values.yaml ở trên
```

Ví dụ tối thiểu — [`external-secrets/`](external-secrets/README.md):

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm show values external-secrets/external-secrets --version 2.9.0 \
  > infra/apps/external-secrets/values.yaml
# viết infra/apps/external-secrets/application.yaml (xem file mẫu)
git add infra/apps/external-secrets && git commit -m "..." && git push
```

**Không cần `kubectl apply -f .../application.yaml` nữa** — xem
[app-of-apps](#app-of-apps-tự-động-nhận-app-mới) bên dưới. Chỉ commit +
push, [`root-application.yaml`](root-application.yaml) tự phát hiện.

**Điều kiện để multi-source hoạt động:** ArgoCD phải pull được chính repo
này từ git (push lên `origin` + có repo credentials) — xem
[`../argocd/README.md`](../argocd/README.md).

## App-of-apps: tự động nhận app mới

Manifest: [`root-application.yaml`](root-application.yaml) — 1 Application
gốc (tên `apps`), `source.directory` quét `infra/apps/*/application.yaml`
(glob 1 cấp thư mục con, đặt trực tiếp trong `infra/apps/` chứ không phải
`infra/apps/root/` để không tự khớp vào chính nó). Từ khi có file này, thêm
app mới **chỉ cần commit + push** — không còn phải `kubectl apply` tay cho
riêng `application.yaml` của từng app nữa, ArgoCD tự thấy file mới trong git
và tự tạo Application con.

Bootstrap (chỉ 1 lần duy nhất, không có gì tự apply cái Application đầu
tiên):

```bash
kubectl apply -f infra/apps/root-application.yaml
```

Verify:

```bash
argocd app get apps --grpc-web
# Sync Status: Synced, Health Status: Healthy, liệt kê đủ tất cả app con
```

Không quản lý được: các manifest thường không phải `Application` (ví dụ
`external-secret.yaml`, `clustersecretstore.yaml`) — vẫn phải `kubectl
apply` tay, xem TODO trong [`../README.md`](../README.md).

## Ingress: dùng field của chart, không tạo file riêng

Trước đây mỗi app có thêm 1 file `infra/ingress/<app>-ingress.yaml` áp dụng
bằng `kubectl apply` thủ công, tách rời khỏi ArgoCD. Đã bỏ convention đó —
hầu hết chart Helm phổ biến (kể cả `litellm-helm`, xem
[`litellm/`](litellm/README.md)) tự hỗ trợ field `ingress.enabled` +
`ingress.hosts`, nên khai báo thẳng trong `values.yaml` của app đó để
ArgoCD quản lý luôn (sync/self-heal như mọi resource khác), không cần file
+ lệnh `kubectl apply` tách biệt nữa.

Ngoại lệ: ArgoCD tự nó không phải Helm chart, nên Ingress riêng của ArgoCD
vẫn là file thủ công — xem [`../argocd/argocd-ingress.yaml`](../argocd/argocd-ingress.yaml).

## Apps hiện có

- [`external-secrets/`](external-secrets/README.md) — Operator + ClusterSecretStore trỏ LocalStack
- [`litellm/`](litellm/README.md) — Tầng 3, LiteLLM Proxy
- [`langfuse/`](langfuse/README.md) — LLM observability
- [`langflow-ide/`](langflow-ide/README.md) — Tầng 4, build/test flow (UI + API)
- [`langflow-runtime/`](langflow-runtime/README.md) — Tầng 4, chạy flow đã build (headless)
