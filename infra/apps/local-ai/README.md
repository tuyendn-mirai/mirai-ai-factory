# local-ai

Tầng 2 (Model Serving) lên `mirai-eks` qua ArgoCD. Xem
[`../README.md`](../README.md) cho quy ước chung `infra/apps/<name>/`.

Chart cộng đồng `local-ai` (repo `https://go-skynet.github.io/helm-charts`,
KHÔNG phải OCI như `litellm-helm` — `repoURL` để nguyên `https://...`, không
cần bỏ tiền tố như chart OCI). [LocalAI](https://localai.io) expose API
tương thích OpenAI (`/v1/chat/completions`, `/v1/audio/speech`,
`/v1/audio/transcriptions`, ...) — mục tiêu nối vào LiteLLM (Tầng 3) như một
"openai-compatible custom endpoint" cho các model fine-tune riêng (TTS/STT).
Model OCR không có endpoint chuẩn OpenAI tương ứng, có thể vẫn cần gọi thẳng
từ `mirai-hub-api` thay vì qua LiteLLM — xem thảo luận trong lịch sử chat.

## Quyết định thiết kế đáng chú ý

- **Không có GPU node trong cụm** (`kubectl get nodes` không thấy
  `nvidia.com/gpu`) — dùng `deployment.image.tag: latest-cpu` thay vì
  `latest` (build có CUDA, sẽ crash/không tận dụng được trên node CPU-only).
- **`persistence.models`/`persistence.output` ép `storageClass: local-path` +
  `accessModes: [ReadWriteOnce]`** — chart mặc định `ReadWriteMany`, nhưng
  cụm `mirai-eks` (k3d) chỉ có `local-path`/`gp2`
  (provisioner `rancher.io/local-path`), CHỈ hỗ trợ `ReadWriteOnce`. Cùng gotcha
  đã gặp ở [`../langflow-ide/pvc-shared-data.yaml`](../langflow-ide/pvc-shared-data.yaml).
  `replicaCount: 1` nên RWO không phải vấn đề (không có 2 pod cùng mount).
- **`ingress.enabled: true` thẳng trong `values.yaml`** — host
  `local-ai.mirai.local`, cùng pattern mọi app khác (xem
  [`../README.md`](../README.md#ingress-dùng-field-của-chart-không-tạo-file-riêng)),
  không tạo file ingress riêng.
- **Chưa cấu hình model nào** (`modelsConfigs: {}`, `persistence.models` là
  PVC rỗng) — đây mới là bước deploy runtime LocalAI, việc tiếp theo là add
  model fine-tune (OCR/TTS/STT) vào PVC hoặc build custom image/backend rồi
  khai báo `modelsConfigs` tương ứng.

## Verify

```bash
kubectl get pods -n local-ai
argocd app get local-ai --grpc-web      # Synced, Healthy
curl http://local-ai.mirai.local/readyz
curl http://local-ai.mirai.local/v1/models
```

(cần `127.0.0.1 local-ai.mirai.local` trong `/etc/hosts` trên máy chạy trình
duyệt — xem lưu ý SSH remote trong [`../../argocd/README.md`](../../argocd/README.md))

## Trạng thái hiện tại

Mới add app-of-apps entry, chưa apply/verify thật trên cụm (chưa commit+push
nên ArgoCD root app chưa thấy). Chưa có model fine-tune nào được nạp.
