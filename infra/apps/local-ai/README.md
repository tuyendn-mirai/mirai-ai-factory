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

- **`deployment.image.tag: v4.9.0`, KHÔNG dùng `latest-cpu`** (gợi ý trong
  values mặc định của chart) — `latest-cpu` là tag CŨ đứng yên ở LocalAI
  v3.0.0 (xác nhận bằng `local-ai run --help` bên trong pod), không hiểu
  schema backend gallery hiện tại → xem mục "Backend gallery: whisperx" bên
  dưới. Tag `latest` (không suffix) mới là build CPU multi-arch theo release
  mới nhất (digest trùng tag version cụ thể trên quay.io lúc viết README
  này) — pin version cụ thể (`v4.9.0`) thay vì tag nổi `latest` để tránh
  trôi version ngoài ý muốn khi upstream release tiếp. Không có GPU node
  trong cụm (`kubectl get nodes` không thấy `nvidia.com/gpu`) nên không cần
  build CUDA.
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

### Backend gallery: whisperx

Test load model `whisperx-tiny` (backend `whisperx`) qua `/v1/audio/transcriptions`
lỗi:

```
ERR Server error error="failed to load model with internal loader: backend not found:
/tmp/localai/backend_data/backend-assets/grpc/whisperx" ... status=500 url=/v1/audio/transcriptions
```

Nguyên nhân #1: image `local-ai` chỉ bundle sẵn các backend "core" (llama.cpp,
whisper.cpp, piper, bert, ...). `whisperx` (kèm torch/ctranslate2, nặng) là
gallery backend, chỉ tải về khi được cài rõ ràng — LocalAI KHÔNG tự
install-on-demand lúc load model (xem `pkg/model/initializers.go`:
`spawnGRPCModel` trả lỗi `backend not found` ngay nếu backend chưa có sẵn
trong `backend-assets/grpc/`, không có fallback tự tải).

Nguyên nhân #2 (phát hiện sau khi fix #1): set `EXTERNAL_BACKENDS=whisperx`
xong vẫn lỗi tiếp, đổi thành:

```
ERR error installing external backends error="failed to get image \"\":
could not parse reference: \nerror installing backend whisperx"
```

Do image đang dùng tag `latest-cpu` — tag này CŨ, đứng yên ở LocalAI v3.0.0
(`local-ai run --help` trong pod in ra `Version: v3.0.0`). Flag
`--backend-galleries` mặc định trỏ `backend/index.yaml@master` (HEAD hiện
tại của repo, LUÔN mới nhất bất kể version binary) — nhưng schema của file
đó trên `master` đã đổi (mỗi entry gallery giờ có field `capabilities` lồng
theo platform) so với lúc binary v3.0.0 được build, nên binary v3.0.0 không
tách được URI image cụ thể cho `whisperx` → ra chuỗi rỗng. Kiểm tra thêm:
tag `@v3.0.0` của `backend/index.yaml` thậm chí chưa có entry `whisperx`
(backend này được thêm sau đó) — nên pin gallery về đúng version binary
cũng không giải quyết được, phải đổi hẳn sang tag image mới hơn (xem
`deployment.image.tag` ở trên).

Fix — đổi `deployment.image.tag` sang `v4.9.0` + 2 field thêm vào
`deployment.env`:

- `external_backends: "whisperx"` → env `EXTERNAL_BACKENDS`, danh sách
  backend cài từ gallery lúc boot (xem `core/application/startup.go`, vòng
  lặp gọi `galleryop.InstallExternalBackend` cho từng entry). Đặt tên gallery
  gốc (`whisperx`), KHÔNG phải tên capability cụ thể (`cpu-whisperx`) — hệ
  thống tự chọn capability theo phần cứng phát hiện được (ở đây không có GPU
  → tự chọn `cpu-whisperx`).
- `backends_path: "/models/backends"` → env `BACKENDS_PATH`. Mặc định backend
  tải về nằm ở `${basepath}/backends`, KHÔNG PVC nào mount vào đó — restart
  pod là mất, phải tải lại (whisperx kéo theo torch/ctranslate2, khá nặng).
  Trỏ vào PVC `persistence.models` (đã mount sẵn ở `/models`) để cache qua
  các lần restart/deploy lại.

Sau khi commit+push, ArgoCD `selfHeal` tự áp lại (không cần `kubectl apply`
tay, chỉ cần đợi vòng poll ~3 phút hoặc ép `kubectl annotate application
local-ai -n argocd argocd.argoproj.io/refresh=hard --overwrite` để không phải
đợi) — pod restart, backend `whisperx` được tải về lúc boot (~4.2GB layer,
kèm venv Python/torch riêng cho backend — mất vài phút, HTTP server CHỈ mở
port sau khi cài xong vì `InstallExternalBackend` chạy blocking trước khi
start API, xem `core/application/startup.go`). Đã verify thật (không chỉ lý
thuyết) trên `mirai-eks`: `curl .../v1/audio/transcriptions -F
model=whisperx-tiny` trả `200` kèm transcript. Verify lại:

```bash
kubectl logs -n local-ai deploy/local-ai | grep -i whisperx
# WARN installing OCI backend ... backend=cpu-whisperx ... (không còn lỗi "backend not found")
curl -X POST http://local-ai.mirai.local/v1/audio/transcriptions \
  -F file="@sample.wav" -F model="whisperx-tiny"
```

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

Chạy trong `mirai-eks` (namespace `local-ai`, image `v4.9.0`, 1 pod Running).
Backend gallery `whisperx` cài thành công lúc boot, đã verify
`/v1/audio/transcriptions` trả `200`. Chưa có model fine-tune (OCR/TTS/STT)
riêng nào của team được nạp — model `whisperx-tiny` hiện dùng chỉ để verify
pipeline, xem mục "Backend gallery: whisperx" ở trên.
