# custom_components

Custom Component Python cho Langflow (Tang 4), gọi LiteLLM (Tang 3) bằng
chuẩn "OpenAI-compatible custom endpoint" — cùng pattern `model:
openai/<name>` đã dùng trong `model_list` của LiteLLM, xem
[`../../litellm/README.md`](../../litellm/README.md#model-whisperx-tiny--nối-tới-localai-tầng-2).

- `litellm_speech_to_text.py` — STT, nhận file audio upload trực tiếp
  (`FileInput`) — dùng khi test tay trong Playground. Gọi
  `/v1/audio/transcriptions`, model mặc định `whisperx-tiny`.
- `litellm_speech_to_text_url.py` — STT, nhận **URL** (`MessageTextInput
  audio_url`) thay vì file upload — dùng khi flow được gọi như 1 **MCP
  tool** (MCP chỉ truyền được string, không upload file được — xem
  `_JSON_SCHEMA_TYPE_BY_FIELD_TYPE` trong
  `lfx/helpers/flow.py:json_schema_from_flow`, map cả field `file` lẫn
  `str` thành JSON schema type `"string"`). Component tự `httpx.get(audio_url)`
  rồi mới forward cho LiteLLM. Presigned S3/MinIO GET URL dùng được, đã tự
  verify pod Langflow reach được `host.k3d.internal:9100` (MinIO của
  `mirai-hub-api`, xem `../../mirai-hub-api/app/storage.py`).
- `litellm_text_to_speech.py` — TTS, gọi `/v1/audio/speech`, model mặc định
  `vits-ljs-sherpa`. Field `voice` bắt buộc (LiteLLM lỗi 500 nếu thiếu),
  giá trị không ảnh hưởng vì model 1-giọng. Có thêm field `public_base_url`
  (mặc định `http://langflow.mirai.local`) — link tải audio trả về dùng URL
  TUYỆT ĐỐI qua field này (Ingress host, reach được từ browser bên ngoài
  cluster), KHÔNG dùng `base_url` (Service DNS nội bộ, chỉ pod trong cluster
  gọi được) — cần thiết khi flow được gọi từ ngoài (mirai-hub-web) chứ không
  chỉ trong Playground cùng origin.

Cả 3 nhận `base_url` (mặc định `http://litellm.litellm.svc.cluster.local:4000`
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

## File flow JSON sẵn để import

- `litellm_stt_tts_flow.json` — flow tối giản verify 2 component:
  `LiteLLMSpeechToText -> LiteLLMTextToSpeech -> Chat Output` (không qua
  Agent/LLM, chỉ transcribe rồi đọc lại nguyên văn — dùng để test STT/TTS
  độc lập).
- `voice_ticket_triage_flow.json` — use case thực tế "Voice ticket triage":

  ```
  LiteLLMSpeechToText -> Agent (system prompt triage) -> LiteLLMTextToSpeech -> Chat Output
  ```

  Agent được lấy nguyên template thật từ chính instance Langflow đang chạy
  (qua `GET /api/v1/all`, không gõ tay lại code — xem bài học ở
  `litellm_stt_tts_flow.json` trước đó: gõ tay 30KB code nội bộ của Agent
  quá rủi ro), chỉ đổi `system_prompt` sang nhiệm vụ: đọc transcript voice
  ticket của khách hàng, phân loại mức khẩn cấp + nhóm vấn đề, trả lời bằng
  1 câu xác nhận tự nhiên (dùng luôn làm input cho TTS đọc lại cho khách).

  Dùng file này để test tay trong Playground (upload file audio thật).
  **Không dùng để expose qua MCP** — xem file kế tiếp.

- `voice_ticket_triage_mcp_flow.json` — bản MCP-ready của use case trên, để
  bind vào `mirai-hub-web`:

  ```
  LiteLLMSpeechToTextFromURL (audio_url) -> Agent (system prompt triage) -> LiteLLMTextToSpeech -> Chat Output
  ```

  2 khác biệt bắt buộc so với bản Playground, cả 2 đã tự verify thật bằng
  MCP client thật (`mcp.ClientSession`, không chỉ đọc code):
  - Node STT dùng `LiteLLMSpeechToTextFromURL` (field `audio_url`, không
    phải `FileInput`) — MCP tool call không upload file được.
  - Node STT có `"is_input": true` đặt THẲNG trong node data (không phải
    trong `template`) — bắt buộc vì `Vertex.is_input` (xem
    `lfx/graph/vertex/base.py`) chỉ tự nhận diện input node theo 1 whitelist
    tên component cố định (`INPUT_COMPONENTS`), custom component của mình
    không nằm trong đó nên KHÔNG override thì `json_schema_from_flow` không
    thấy node này → tool MCP sinh ra schema rỗng, không tham số nào cả (đã
    tự gặp lúc test, verify fix bằng cách tạo project thật + bật MCP + gọi
    `ClientSession.list_tools()` thật).
  - Field `audio_url` có thêm `"api_editable": true` — thiếu cờ này thì MCP
    sẽ lộ TẤT CẢ field visible của node input ra ngoài (kể cả `api_key`!)
    vì `honor_allowlist` mặc định permissive khi chưa node nào khai báo
    allowlist (xem `_input_nodes_declare_api_allowlist` trong
    `lfx/helpers/flow.py`). Đã verify schema thật sinh ra CHỈ có đúng
    `audio_url` (+ `session_id` tự thêm), không lộ `api_key`/`base_url`/`model`.

  Cách bind vào mirai-hub-web: import file này vào 1 Langflow Project riêng
  → `PATCH /api/v1/mcp/project/{project_id}` bật `mcp_enabled` cho flow này
  → `POST /threads/{id}/mcp` (xem `mirai-hub-api/app/routers/threads.py`)
  bind project đó vào 1 thread. Xem thêm phần "Tích hợp mirai-hub" bên dưới.

Sau khi import bất kỳ file nào ở trên, **bắt buộc làm thủ công** (không nạp
được qua JSON vì phụ thuộc trạng thái riêng của từng Langflow instance):
1. Node Agent: chọn Language Model (dropdown "Language Model" — chưa chọn
   sẵn provider/model nào).
2. Cả 2 node STT/TTS: điền `LiteLLM Master Key` — dùng đúng
   `LITELLM_MASTER_KEY`/`PROXY_MASTER_KEY` (key gán cho Agent có thể bị giới
   hạn model, KHÔNG dùng chung được cho STT/TTS — đã tự gặp lỗi 403 "key not
   allowed to access model" vì nhầm 2 key này, xem lịch sử sửa lỗi).

## Tích hợp mirai-hub (`voice_ticket_triage_mcp_flow.json`)

Đường đi đầy đủ khi user đính kèm audio vào tin nhắn `mirai-hub-web`:

1. `mirai-hub-web`: user đính file audio (generic attachment có sẵn, không
   cần UI ghi âm riêng cho MVP) → `POST /api/uploads/presign` → PUT thẳng
   lên MinIO.
2. `mirai-hub-api` (`app/chat_loop.py`): khi build history gửi cho LLM, với
   mỗi attachment có `mime` bắt đầu `audio/`, gọi `storage.presign_get(objectKey)`
   (MinIO, hàm mới thêm trong `app/storage.py`) rồi nhét
   `[audio attachment: name=... url=...]` vào NỘI DUNG TRONG BỘ NHỚ (không
   ghi xuống DB — presigned URL hết hạn sau 900s, replay lại ở turn sau vô
   nghĩa) của tin nhắn user trước khi gọi LLM.
3. LLM (qua LiteLLM) thấy URL này trong context, tự quyết định gọi MCP tool
   `voice_ticket_triage` (tool đã bind vào thread qua `POST /threads/{id}/mcp`)
   với `audio_url` = URL đó.
4. Flow Langflow chạy: STT tải audio từ URL → Agent phân loại + soạn câu xác
   nhận → TTS đọc lại, trả về text + link tải audio (dùng `public_base_url`
   — PHẢI là host reach được từ browser, không phải Service DNS nội bộ).
5. `mirai-hub-web` (`Markdown.tsx`): link `.mp3` trong reply của LLM được
   render thành `<audio controls>` phát được ngay trong chat, thay vì link
   tải xuống — xem regex `AUDIO_EXTENSION_RE`.

Giới hạn đã biết (POC, chưa fix):
- Link audio dùng `http://langflow.mirai.local` — chỉ phát được trên máy đã
  khai `/etc/hosts` (giống mọi ingress khác trong repo này), không phải
  link public thật cho end-user ngoài máy dev.
- Note audio_url không persist xuống DB — nếu user hỏi lại ở turn sau
  ("phát lại file đó đi") mà LLM không còn thấy URL trong context (đã bị
  rebuild từ DB, mất note), sẽ cần user đính lại file. Chấp nhận được vì
  URL cũ đã hết hạn 900s rồi.
- Ghi âm trực tiếp trong Composer (nút mic) CHƯA làm — mới chỉ tận dụng
  upload file audio có sẵn.
