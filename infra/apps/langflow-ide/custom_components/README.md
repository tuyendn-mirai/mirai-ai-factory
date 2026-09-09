# custom_components

Custom Component Python cho Langflow (Tang 4), gọi LiteLLM (Tang 3) bằng
chuẩn "OpenAI-compatible custom endpoint" — cùng pattern `model:
openai/<name>` đã dùng trong `model_list` của LiteLLM, xem
[`../../litellm/README.md`](../../litellm/README.md#model-whisperx-tiny--nối-tới-localai-tầng-2).

- `litellm_speech_to_text.py` — STT, gọi `/v1/audio/transcriptions`,
  model mặc định `whisperx-tiny`.
- `litellm_text_to_speech.py` — TTS, gọi `/v1/audio/speech`, model mặc định
  `vits-ljs-sherpa`. Field `voice` bắt buộc (LiteLLM lỗi 500 nếu thiếu),
  giá trị không ảnh hưởng vì model 1-giọng.

Cả 2 nhận `base_url` (mặc định `http://litellm.litellm.svc.cluster.local:4000`
— Service DNS nội bộ cluster, port lấy từ `service.port` trong
`../../litellm/values.yaml`) và `api_key` (nhập `LITELLM_MASTER_KEY`/
`PROXY_MASTER_KEY` — SecretStrInput, không hardcode trong flow).

**KHÔNG dùng `http://litellm.mirai.local`** (hostname Ingress) làm giá trị
`base_url` — hostname đó chỉ resolve được từ máy có khai `/etc/hosts` (trình
duyệt), pod Langflow chạy trong `mirai-eks` gọi vào sẽ lỗi
`ConnectError: [Errno -2] Name or service not known` (đã tự gặp, verify
lại bằng `kubectl exec -n langflow statefulset/langflow-service -- getent
hosts litellm.litellm.svc.cluster.local` → resolve `200` OK). Đúng pattern
LiteLLM→LocalAI đã dùng, xem
[`../../litellm/README.md`](../../litellm/README.md#model-whisperx-tiny--nối-tới-localai-tầng-2).

## Cách nạp vào Langflow

Đã lên sidebar mặc định qua `LANGFLOW_COMPONENTS_PATH=/app/custom_components`
(chỉ set ở `backend`, frontend không cần — frontend chỉ gọi API backend để
lấy danh sách component, không tự scan filesystem). Nguồn 2 file `.py` nạp
qua [`../custom-components-configmap.yaml`](../custom-components-configmap.yaml)
(ConfigMap `langflow-custom-components`, mount vào `/app/custom_components`
qua `volumes`/`volumeMounts` trong `../values.yaml`) — áp dụng bằng `kubectl
apply` thường, KHÔNG qua ArgoCD (cùng lý do `pvc-shared-data.yaml`/
`external-secret.yaml`: app-of-apps chỉ quét `application.yaml`).

**Sửa code sau khi đã apply lần đầu**: sửa file `.py` trong thư mục này rồi
copy nội dung sang `../custom-components-configmap.yaml` (2 nơi phải khớp
tay, ConfigMap không tự đọc từ đây) → `kubectl apply -f
../custom-components-configmap.yaml` → **bắt buộc**
`kubectl rollout restart statefulset/langflow-service -n langflow` (đổi nội
dung ConfigMap không tự làm pod restart — không có checksum annotation,
cùng gotcha đã gặp ở `proxy_config` của litellm, xem
`../../litellm/README.md`).

Không dùng cách paste tay vào node Custom Component nữa (cách cũ, vẫn dùng
được nếu muốn sửa nhanh ngay trong 1 flow mà không đụng infra) vì giờ đã có
sẵn trong sidebar.

## Flow mẫu (agent STT → LLM → TTS)

```
File Input (audio) -> LiteLLMSpeechToText -> Agent -> LiteLLMTextToSpeech -> Chat Output
```

Agent bên trong flow cũng trỏ LiteLLM (đã cấu hình sẵn ở `langflow-ide`,
xem "Trạng thái hiện tại" trong `../README.md` — còn thiếu nhập
`LITELLM_MASTER_KEY` làm OpenAI API Key thủ công trong UI mỗi flow).
