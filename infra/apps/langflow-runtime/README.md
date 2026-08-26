# langflow-runtime

Tầng 4 (Agent & Workflow Factory) — môi trường chạy flow đã build, headless
(không UI/superuser), lên `mirai-eks` qua ArgoCD. Xem
[`../README.md`](../README.md) cho quy ước chung `infra/apps/<name>/`, và
[`../langflow-ide/README.md`](../langflow-ide/README.md) cho phần build/test
flow.

Chart chính thức `langflow-runtime` (repo
`https://langflow-ai.github.io/langflow-helm-charts`) — 1 Deployment duy
nhất, `langflow run --backend-only`, không có phần frontend/UI/superuser
như `langflow-ide`.

## Secret nguồn trong LocalStack

`mirai/langflow` — dùng CHUNG `ExternalSecret`/Secret k8s
(`langflow-credentials`) với `langflow-ide`, xem
[`../langflow-ide/external-secret.yaml`](../langflow-ide/external-secret.yaml)
và [`../langflow-ide/README.md`](../langflow-ide/README.md). Cả 2 chart cùng
namespace `langflow`, cùng trỏ 1 Postgres database `langflow`.

## Quyết định thiết kế đáng chú ý

- **`LANGFLOW_DATABASE_URL` là chuỗi đầy đủ, không tách field**: chart này
  chỉ có `env:` phẳng (mỗi entry 1 `value`/`valueFrom` trọn vẹn), không có
  `host/port/user/...` rời để chart tự ghép như `langflow-ide` — nên
  connection string đầy đủ (kèm cả password) phải nằm sẵn thành 1 field
  trong LocalStack (`LANGFLOW_DATABASE_URL`), lấy qua `secretKeyRef` thẳng
  vào biến này.
- **Không có `superuser`/`autoLogin`**: runtime chỉ phục vụ API chạy flow
  (`--backend-only`, không đăng nhập UI) — không cấu hình auth ở đây.
- **`downloadFlows.flows` chưa set**: cơ chế chart tự tải flow JSON từ URL
  lúc khởi động (`curl` vào `/app/flows` trước khi chạy `langflow run`) —
  chưa có flow nào export từ `langflow-ide` để trỏ vào, để trống an toàn
  (template dùng `range` trên list rỗng/nil, không lỗi). Việc tiếp theo khi
  có flow thật, xem [`../../README.md`](../../README.md).
- **Ingress CÓ field `className`** (khác `langflow-ide`) — set thẳng
  `nginx`, không cần annotation legacy.

## Verify

```bash
kubectl get pods -n langflow -l app.kubernetes.io/name=langflow-runtime
argocd app get langflow-runtime --grpc-web
curl http://langflow-runtime.mirai.local/api/v1/version
```

(cần `127.0.0.1 langflow-runtime.mirai.local` trong `/etc/hosts` trên máy
chạy trình duyệt — xem lưu ý SSH remote trong
[`../../argocd/README.md`](../../argocd/README.md))

## Sự cố đã gặp: crash-loop thiếu LANGFLOW_SUPERUSER_PASSWORD

Chart mặc định không set superuser (đúng — runtime không có UI đăng nhập),
nhưng bản thân **app Langflow tự bắt buộc `setup_superuser()` lúc khởi
động, kể cả chạy `--backend-only`** — không liên quan gì đến field nào chart
gate. Thiếu `LANGFLOW_SUPERUSER_PASSWORD` → crash-loop với lỗi `ValueError:
Username and password must be set`. Fix: thêm đúng 5 biến
`LANGFLOW_AUTO_LOGIN`/`SUPERUSER`/`SUPERUSER_PASSWORD`/`SECRET_KEY`/
`NEW_USER_IS_ACTIVE` — **giá trị giống hệt** `langflow-ide` (xem
`../langflow-ide/values.yaml`) vì chung 1 DB/user table, setup này idempotent
(tìm thấy superuser đã có sẵn, không tạo trùng).

## Trạng thái hiện tại

Langflow Runtime chạy trong `mirai-eks`, cùng Postgres `langflow` với
`langflow-ide`, `MIRAI_HUB_BASE_URL`/`LANGFLOW_SSRF_ALLOWED_HOSTS` đã trỏ
vào LiteLLM/Langfuse. Verify: `curl http://langflow-runtime.mirai.local/api/v1/version`
→ `200`. Chưa có flow nào để phục vụ (chưa build/export gì từ IDE).
