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
kubectl apply -f infra/apps/external-secrets/application.yaml
```

**Điều kiện để multi-source hoạt động:** ArgoCD phải pull được chính repo
này từ git (push lên `origin` + có repo credentials) — xem
[`../argocd/README.md`](../argocd/README.md).

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
