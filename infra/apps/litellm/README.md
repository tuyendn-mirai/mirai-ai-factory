# litellm

Tầng 3 (AI Model Catalog / Hub) lên `mirai-eks` qua ArgoCD. Xem
[`../README.md`](../README.md) cho quy ước chung `infra/apps/<name>/`.

Chart OCI `oci://ghcr.io/berriai/litellm-helm` — ArgoCD khai báo OCI bằng
`repoURL` KHÔNG có tiền tố `oci://` (xem [`application.yaml`](application.yaml)).

## Secret nguồn trong LocalStack

`mirai/litellm` (xem [`../../../localstack/README.md`](../../../localstack/README.md))
chứa field rời khớp đúng key ExternalSecret sẽ trích ra — KHÔNG bundle
thành 1 chuỗi connection-string: `username`, `password`, `REDIS_HOST`,
`REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.

## ExternalSecret

Manifest: [`external-secret.yaml`](external-secret.yaml) — 2
`ExternalSecret` (namespace `litellm`), áp dụng bằng `kubectl apply` thường
(không qua ArgoCD, cùng lý do như ClusterSecretStore — xem
[`../external-secrets/README.md`](../external-secrets/README.md)):

- `litellm-db-credentials`: trích `username`/`password` → khớp
  `db.secret.usernameKey/passwordKey` trong [`values.yaml`](values.yaml).
- `litellm-env-secrets`: trích `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_DB`
  → bơm vào pod qua `environmentSecrets` (envFrom) vì chart không có cách nào
  khác để set các biến này khi `redis.enabled: false` (dùng Redis ngoài).

Verify:

```bash
kubectl get externalsecret -n litellm
# STATUS: SecretSynced, READY: True cho cả 2
```

Nếu LocalStack mất secret (ví dụ volume bị xoá tay — với image/token đúng
hiện tại persistence hoạt động thật qua restart bình thường, xem
[`../../../localstack/README.md`](../../../localstack/README.md)) và
ExternalSecret đã sync trước đó (Secret k8s vẫn còn cache giá trị cũ), force
sync lại:

```bash
kubectl annotate externalsecret litellm-db-credentials litellm-env-secrets -n litellm \
  force-sync=$(date +%s) --overwrite
```

## Quyết định thiết kế đáng chú ý

- **Master key plaintext**: chart tự tạo Secret `<release>-masterkey` từ
  `values.masterkey` trực tiếp (`templates/secret-masterkey.yaml`) — KHÔNG
  có field nào để trỏ ra Secret có sẵn do ExternalSecret quản lý (khác với
  `db.secret.name`, cái đó CÓ hỗ trợ). Để trống thì chart random 1 giá trị
  MỚI mỗi lần `helm template` chạy → ArgoCD `selfHeal` liên tục đổi master
  key. Chấp nhận đặt plaintext trong `values.yaml` (rủi ro tương tự `.env`
  gốc repo đã bị commit) — xem lại khi lên EKS thật.
- `db.database: "ai_factory?schema=litellm"` — ghép thẳng query string vào
  field này vì `DATABASE_URL` của chart chỉ nối chuỗi
  `postgresql://user:pass@endpoint/database`.
- `db.endpoint`/`api_base` (Ollama) dùng `host.k3d.internal` thay vì IP LAN
  tĩnh — Postgres/Redis/Ollama là container docker-compose chạy NGAY TRÊN
  máy host cụm k3d này (không phải server khác), cùng pattern LocalStack
  (xem [`../../../localstack/README.md`](../../../localstack/README.md)).
- `proxy_config` port riêng từ `layer3-litellm/config.yaml` (bản
  docker-compose), KHÔNG sửa file gốc đó — hai nơi set tên biến môi trường
  khác nhau cho cùng giá trị (docker-compose: `LITELLM_MASTER_KEY`; chart:
  luôn `PROXY_MASTER_KEY`).
- Langfuse (`success_callback`/`failure_callback`) tạm COMMENT OUT trong
  `proxy_config` — Langfuse chưa deploy vào `mirai-eks`, chỉ chạy qua
  docker-compose ở gốc repo.
- `ingress.enabled: true` thẳng trong `values.yaml` (host
  `litellm.mirai.local`) — không tạo file `infra/ingress/litellm-ingress.yaml`
  riêng, xem lý do trong [`../README.md`](../README.md).

## Model `whisperx-tiny` — nối tới LocalAI (Tầng 2)

`model_list` có 1 entry trỏ tới [`../local-ai/README.md`](../local-ai/README.md)
(model STT `whisperx-tiny`, backend `whisperx`). Khác với Ollama (chạy trên
host, gọi qua `host.k3d.internal`), LocalAI chạy NGAY TRONG cụm `mirai-eks`
(namespace `local-ai`) — nên `api_base` trỏ Service DNS nội bộ
(`http://local-ai.local-ai.svc.cluster.local/v1`), KHÔNG qua ingress
`local-ai.mirai.local` (đã tự verify: `curl`/Python `urllib` từ bên trong pod
`litellm` gọi thẳng Service DNS trả `200`).

`model: openai/whisperx-tiny` — tiền tố `openai/` báo litellm dùng provider
generic "OpenAI-compatible custom endpoint" (không phải gọi thật
`api.openai.com`), đúng cách chuẩn cho mọi server tự host implement chuẩn
OpenAI API. `api_base` phải có hậu tố `/v1` (giống mặc định
`https://api.openai.com/v1` của OpenAI SDK) vì litellm tự nối thêm
`/audio/transcriptions` phía sau. LocalAI hiện không bật xác thực API key —
`api_key: sk-local-ai-noauth` chỉ là placeholder cho OpenAI SDK hài lòng
(bắt buộc non-empty), LocalAI không kiểm tra giá trị này.

**Đổi `proxy_config` (ConfigMap) KHÔNG tự làm pod restart** — LiteLLM chỉ đọc
`config.yaml` lúc khởi động process, không hot-reload khi ConfigMap đổi
(chart này không có checksum annotation nào trên Deployment để ép rolling
update theo nội dung ConfigMap). Sau mỗi lần sửa `model_list`/`proxy_config`
và ArgoCD sync xong, phải tự:

```bash
kubectl rollout restart deployment/litellm -n litellm
kubectl rollout status deployment/litellm -n litellm
```

Đã verify thật (không chỉ lý thuyết) trên `mirai-eks`: gọi
`/v1/audio/transcriptions` qua chính LiteLLM (`model=whisperx-tiny`, kèm
`Authorization: Bearer <masterkey>`) trả `200` với transcript thật — LiteLLM
proxy đúng tới LocalAI phía sau.

```bash
curl -X POST http://litellm.mirai.local/v1/audio/transcriptions \
  -H "Authorization: Bearer Adgjmptw1" \
  -F model="whisperx-tiny" \
  -F file="@sample.wav;type=audio/wav"
```

## Model `vits-ljs-sherpa` — TTS, cùng LocalAI

Cùng entry pattern với `whisperx-tiny` ở trên (cùng `api_base`, cùng lý do
`openai/` prefix), khác endpoint: `/v1/audio/speech` (TTS) thay vì
`/v1/audio/transcriptions` (STT). Model này serve bằng backend `vits` qua
sherpa-onnx trên LocalAI.

**`voice` là field BẮT BUỘC** trên `/v1/audio/speech` của LiteLLM (mirror
đúng chuẩn OpenAI TTS API) — thiếu field này lỗi `500`:
`TypeError: Router.aspeech() missing 1 required positional argument: 'voice'`
(xem traceback qua `kubectl logs -n litellm deploy/litellm`, message trả về
cho client chỉ chung chung `"Internal server error"`, không lộ traceback).
`vits-ljs-sherpa` là model 1-giọng (LJSpeech), LocalAI không dùng giá trị
`voice` để chọn giọng khác — set gì cũng được (không để trống), ví dụ
`"default"`.

Đã verify thật: `/v1/audio/speech` qua LiteLLM trả `200`,
`content-type: audio/mpeg`, file audio thật (~36KB cho câu ngắn).

```bash
curl -X POST http://litellm.mirai.local/v1/audio/speech \
  -H "Authorization: Bearer Adgjmptw1" \
  -H "Content-Type: application/json" \
  -d '{"model": "vits-ljs-sherpa", "input": "Hello from LiteLLM.", "voice": "default"}' \
  --output out.mp3
```

## Bug của chart `litellm-helm` (mọi version tính đến `0.1.100`)

initContainer `db-ready` hard-code cứng image
`docker.io/bitnami/postgresql:16.1.0-debian-11-r20` thẳng trong
`templates/deployment.yaml` — KHÔNG đọc `values.image.dbReadyImage/dbReadyTag`
(2 field đó tồn tại trong `values.yaml` nhưng chart không dùng, dead value).
Tag đó đã bị Bitnami gỡ khỏi Docker Hub (confirm bằng `docker pull` thật —
`not found`), không sửa được qua `values.yaml`. Xử lý:

```bash
kubectl patch deployment litellm -n litellm --type='json' \
  -p='[{"op":"replace","path":"/spec/template/spec/initContainers/0/image","value":"docker.io/postgres:16-alpine"}]'
```

+ trong [`application.yaml`](application.yaml):

```yaml
ignoreDifferences:
  - group: apps
    kind: Deployment
    name: litellm
    jsonPointers:
      - /spec/template/spec/initContainers/0/image
syncPolicy:
  syncOptions:
    - RespectIgnoreDifferences=true
```

**`ignoreDifferences` một mình KHÔNG đủ** — chỉ ẩn diff lúc xem status,
KHÔNG áp dụng lúc sync thật (tự kiểm chứng: 1 sync do lý do khác — sửa
masterkey — đã ghi đè lại field bị ignore, phải patch tay lại lần nữa).
`RespectIgnoreDifferences=true` bắt ArgoCD splice giá trị LIVE vào manifest
desired TRƯỚC khi áp dụng — đã verify qua 3 lần sync thật liên tiếp, image
patch sống sót qua cả 3.

Script wait-for-db bên trong initContainer đó cũng có bug riêng (không liên
quan bug image): dùng `psql -h $(DATABASE_HOST)` với `DATABASE_HOST` chứa cả
port (ví dụ `host.k3d.internal:5435`) → `psql` không tự tách port ra được,
luôn báo lỗi DNS. Vô hại vì script không có `exit $ret` ở cuối — dù thất bại
đủ 60 lần (~120s) vẫn thoát mã 0, container chính vẫn chạy tiếp bình thường
(mỗi lần pod restart tốn thêm ~120s vì lý do này, chấp nhận được).

Verify:

```bash
kubectl get pods -n litellm            # 1/1 Running
argocd app get litellm --grpc-web      # Synced, Healthy
curl http://litellm.mirai.local/health/readiness
# {"status":"healthy","db":"connected"}
```

## Trạng thái hiện tại

LiteLLM chạy trong `mirai-eks`, DB/Redis/Ollama nối qua `host.k3d.internal`,
model_list dùng Ollama, đọc credential qua ExternalSecret từ LocalStack (trừ
master key — plaintext, xem trên). Reachable qua `http://litellm.mirai.local/`
(cần `127.0.0.1 litellm.mirai.local` trong `/etc/hosts` trên máy chạy trình
duyệt — xem lưu ý SSH remote trong [`../../argocd/README.md`](../../argocd/README.md)).
