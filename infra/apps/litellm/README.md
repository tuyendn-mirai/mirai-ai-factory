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

Nếu LocalStack mất secret (persistence không hoạt động ở bản Community —
xem [`../../../localstack/README.md`](../../../localstack/README.md)) và
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
