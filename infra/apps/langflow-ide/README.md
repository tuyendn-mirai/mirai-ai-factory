# langflow-ide

Tầng 4 (Agent & Workflow Factory) — môi trường build/test flow, có UI +
API, lên `mirai-eks` qua ArgoCD. Xem [`../README.md`](../README.md) cho quy
ước chung `infra/apps/<name>/`.

Chart chính thức `langflow-ide` (repo
`https://langflow-ai.github.io/langflow-helm-charts`) — deploy 2 phần riêng:
`backend` (StatefulSet, API, port 7860) + `frontend` (Deployment, UI nginx,
port 8080). Đi cùng [`../langflow-runtime/`](../langflow-runtime/README.md)
(chạy flow đã build, headless) theo đúng model chính thức của Langflow:
build/test trong IDE, chạy production qua Runtime riêng.

## Secret nguồn trong LocalStack

`mirai/langflow` (xem [`../../../localstack/README.md`](../../../localstack/README.md))
— dùng CHUNG với `langflow-runtime` (cùng namespace `langflow`, cùng trỏ 1
Postgres database `langflow` để runtime phục vụ được flow build từ IDE).

## ExternalSecret

Manifest: [`external-secret.yaml`](external-secret.yaml) — 1 `ExternalSecret`
tạo Secret k8s `langflow-credentials` **dùng chung cho cả langflow-ide và
langflow-runtime** (khác với litellm/langfuse, mỗi app 1 ExternalSecret
riêng — ở đây 2 chart cùng namespace, cùng DB nên gộp lại). Áp dụng bằng
`kubectl apply` thường, không qua ArgoCD (cùng lý do như ClusterSecretStore —
xem [`../external-secrets/README.md`](../external-secrets/README.md)).

Verify:

```bash
kubectl get externalsecret langflow-credentials -n langflow
# STATUS: SecretSynced, READY: True
```

## PVC share Knowledge Base data với langflow-runtime

Manifest: [`pvc-shared-data.yaml`](pvc-shared-data.yaml) — 1
`PersistentVolumeClaim` (`langflow-shared-data`, RWO, `storageClassName:
local-path`) mount vào `/app/data` ở CẢ langflow-ide và
[`../langflow-runtime/`](../langflow-runtime/README.md). Trước đây mỗi
chart tự `emptyDir: {}` riêng — flow definition thì share được qua Postgres
chung, nhưng Langflow's Knowledge component (Document Q&A tool) index
Knowledge Base xuống local filesystem, không phải DB, nên KB tạo/index qua
UI IDE không thấy được ở runtime → lỗi `Metadata not found for knowledge
base: X. Ensure it has been indexed.` dù đã index. Áp dụng bằng `kubectl
apply` thường, không qua ArgoCD (cùng lý do như `external-secret.yaml`).

`local-path` chỉ hỗ trợ RWO + bind theo node đầu tiên claim
(`WaitForFirstConsumer`) — cụm 4 node nên bắt buộc `nodeSelector:
kubernetes.io/hostname: k3d-mirai-eks-agent-0` ở CẢ 2 chart (xem
`values.yaml`) để pod của cả 2 Deployment luôn nằm cùng node, nếu không pod
thứ 2 apply sau sẽ Pending do volume node affinity conflict.

## Quyết định thiết kế đáng chú ý

- **Database "langflow" riêng, không phải schema**: khác `ai_factory`
  (litellm/langfuse dùng chung, tách bằng `?schema=`) — `.env` gốc repo đã
  tách hẳn DB `langflow` riêng, không cần query string schema.
- **`externalDatabase.password`**: chart yêu cầu MỖI field
  (`driver/host/port/user/password/database`) là 1 object EnvVar hợp lệ
  (`value:` hoặc `valueFrom:`), không phải scalar thường như
  `litellm-helm`/`langfuse` — field khác (host/port/user/database) đặt
  `value:` trực tiếp trong `values.yaml`, chỉ riêng `password` trỏ
  `secretKeyRef` vào `langflow-credentials`.
- **`superuserPassword`/`secretKey` PHẢI plaintext**: khối này chỉ render
  khi values có `autoLogin` VÀ `= false` (thiếu `autoLogin` thì
  `superuser`/`superuserPassword`/`secretKey`/`newUserIsActive` bị bỏ qua
  luôn — xem `templates/backend-statefulset.yaml`). Field
  `superuserPassword`/`secretKey` chỉ nhận `value:` literal, KHÔNG hỗ trợ
  `secretKeyRef` (khác `externalDatabase.password`), và không dùng `lookup`
  để giữ ổn định qua các lần render — để trống sẽ random MỚI mỗi lần `helm
  template` chạy (đúng vấn đề `masterkey` đã gặp ở `litellm-helm`, xem
  [`../litellm/README.md`](../litellm/README.md)). Chấp nhận plaintext cho
  POC local, cùng rủi ro/lý do đã chấp nhận ở đó.
- **Ingress không có field `className`** (khác `litellm-helm`/`langfuse`/
  `langflow-runtime`) — dùng annotation legacy `kubernetes.io/ingress.class:
  nginx`, `ingress-nginx` vẫn hỗ trợ song song với `spec.ingressClassName`.
- **`sqlite.enabled: false`**: tắt fallback SQLite vì đã dùng
  `externalDatabase`.

## Verify

```bash
kubectl get pods -n langflow -l langflow-scope=backend    # 1/1 Running
kubectl get pods -n langflow -l langflow-scope=frontend   # 1/1 Running
argocd app get langflow-ide --grpc-web                    # Synced, Healthy
curl http://langflow.mirai.local/health   # qua backend service (nếu path lộ ra)
```

(cần `127.0.0.1 langflow.mirai.local` trong `/etc/hosts` trên máy chạy trình
duyệt — xem lưu ý SSH remote trong [`../../argocd/README.md`](../../argocd/README.md))

## Trạng thái hiện tại

Langflow IDE chạy trong `mirai-eks` (backend + frontend đều `1/1 Running`),
Postgres nối qua `host.k3d.internal`. `MIRAI_HUB_BASE_URL`/
`LANGFLOW_SSRF_ALLOWED_HOSTS` đã trỏ vào LiteLLM/Langfuse qua service DNS
nội bộ k8s (khớp `docker-compose.yml` gốc repo, chỉ đổi hostname). Verify
login thật: `curl -X POST http://langflow.mirai.local/api/v1/login -d
"username=admin&password=..."` → `200`.

Còn thiếu: nhập `LITELLM_MASTER_KEY` làm "OpenAI API Key" khi cấu hình
credential cho từng flow trong UI — không cấu hình được qua Helm values
(state của flow nằm trong DB, không phải infra).
