# Mirai Hub — Layer 5 (Hub UI)

Vỏ chat cho platform: đọc Agent Catalog (Layer 4), lọc theo role/tenant, forward
tin nhắn sang flow đã chọn ở `langflow-runtime`, stream kết quả về. Không có
orchestration/tool-calling ở đây — "Cách 2 nghiêm ngặt": mọi suy luận đã đóng
gói sẵn trong flow ở Layer 4, Layer 5 chỉ là catalog + auth + session + stream.

Xây trên [Chainlit](https://docs.chainlit.io) — chọn vì có sẵn `KeycloakOAuthProvider`,
data layer SQLAlchemy (Postgres), streaming, và `set_chat_profiles` (đúng nhu
cầu catalog lọc theo user) mà không kèm theo bất kỳ tool/agent framework nào
phải tự gỡ bỏ.

## Cấu trúc

```
app.py                  # entrypoint Chainlit — set_chat_profiles/on_chat_start/on_message
mirai_hub/
  auth.py                # password login (dev) + Keycloak oauth_callback (khi có env)
  catalog.py              # đọc catalog agent — v1: seed JSON tĩnh
  data_layer.py            # đăng ký Postgres data layer nếu có DATABASE_URL
  langflow_client.py        # gọi + stream từ langflow-runtime (Layer 4)
  data/agents_seed.json      # seed catalog v1
```

## Chạy local

```bash
uv sync
cp .env.example .env
uv run chainlit create-secret   # dán kết quả vào CHAINLIT_AUTH_SECRET trong .env
uv run chainlit run app.py -w
```

Đăng nhập bằng user dev (`admin`/`admin` hoặc `analyst`/`analyst`, đổi qua
`DEV_ADMIN_PASSWORD`/`DEV_ANALYST_PASSWORD`) — chưa có Keycloak nên đây là
đường duy nhất để vào app lúc này.

## Đóng gói Docker

```bash
docker build -t mirai-hub .
docker run --rm -p 8000:8000 --env-file .env mirai-hub
```

(Đã build + chạy thử thật khi viết README này — image boot được, trả `HTTP 200`.)

## Checklist cần hoàn thiện

Xếp theo thứ tự phụ thuộc — mỗi mục chặn mục dưới nó nếu bỏ qua:

- [ ] **Registry API thật ở Layer 4** — `langflow-runtime` hiện chưa expose
      API nào trả về domain/owner/version/eval/publish-state (xem
      `infra/apps/langflow-runtime/README.md`, "chưa có flow nào để phục
      vụ"). `mirai_hub/catalog.py` đang đọc từ
      `mirai_hub/data/agents_seed.json` — thay `_load_seed()` bằng call HTTP
      thật khi Layer 4 có API này, giữ nguyên interface
      `list_agents()`/`list_agents_for_user()` cho phần còn lại không phải
      sửa.
- [ ] **Export flow thật + set `flow_id`** — 2 agent trong seed hiện có
      `flow_id: "REPLACE_WITH_REAL_LANGFLOW_FLOW_ID"` (app tự chặn, báo lỗi
      thân thiện thay vì gọi Langflow). Cần export flow từ `langflow-ide`,
      trỏ `langflow-runtime`'s `downloadFlows.flows` vào đó (việc còn treo
      ghi trong `infra/README.md`), rồi điền `flow_id` thật vào seed.
- [ ] **Verify request/response shape thật của `langflow-runtime`** —
      `mirai_hub/langflow_client.py` viết theo tài liệu công khai
      (`docs.langflow.org/api-flows-run`: `POST /api/v1/run/{flow_id}?stream=true`,
      SSE event `{"event": "token", "data": {"chunk": "..."}}`), **chưa test
      với flow thật** vì runtime hiện rỗng. Có thể lệch giữa version Langflow
      thật đang chạy (`langflow-runtime` chart) và tài liệu — chạy thử ngay
      khi có flow đầu tiên, sửa lại field name nếu cần.
- [ ] **Deploy Keycloak** — README gốc plan có Keycloak nhưng PLATFORM.md ghi
      "chưa deploy". Chặn toàn bộ SSO thật — hiện chỉ có password login dev
      (`mirai_hub/auth.py`), không dùng được cho production.
- [ ] **Verify claim mapping Keycloak → role/tenant** — `oauth_callback`
      trong `mirai_hub/auth.py` đang đoán field (`realm_access.roles`,
      `tenant`) vì chưa có realm/client thật để soi token. Sau khi Keycloak
      lên, decode 1 ID token thật rồi sửa lại mapping cho đúng.
- [x] **Postgres cho `DATABASE_URL`** — dùng chung DB `ai_factory` với
      litellm/langfuse (không phải DB riêng như langflow), tách bằng schema
      `miraihub` qua `connect_args.server_settings.search_path`
      (`mirai_hub/data_layer.py`) — **không** dùng trick `?schema=` trong
      URL như langfuse (Prisma-specific, asyncpg không hiểu). Đã verify thật
      bằng asyncpg trực tiếp (bảng tạo ra đúng nằm trong schema `miraihub`,
      không rơi vào `public`) và đã chạy thật schema.sql của Chainlit
      (`users`/`threads`/`steps`/`elements`/`feedbacks`) vào schema đó qua
      `mirai-dev-postgres`.
- [ ] **`allowed_roles`/`allowed_tenants` mới là placeholder** — seed catalog
      dùng role đơn giản (`admin`/`analyst`/`reviewer`) và tenant giả
      (`internal`) để có gì đó test lọc; cần đối chiếu với mô hình
      role/tenant thật (theo domain AI-FP/AI-FM/AI-CR/AI-CFO trong `AI
      Factory Architecture EN.html`) khi Layer 4 Registry + Keycloak có
      thật.
- [x] **Viết `infra/apps/mirai-hub/`** — plain manifest (không Helm, không
      có chart chính thức cho app này) — `application.yaml` +
      `manifests/{deployment,service,ingress}.yaml` + `external-secret.yaml`,
      đã pass server-side dry-run thật trên cluster `mirai-eks`. Xem
      [`../infra/apps/mirai-hub/README.md`](../infra/apps/mirai-hub/README.md).
- [x] **Seed secret `mirai/mirai-hub`** — đã seed thật trong LocalStack
      (`CHAINLIT_AUTH_SECRET`/`DATABASE_URL`/`DATABASE_SCHEMA`/`DEV_ADMIN_PASSWORD`), verify bằng
      `aws secretsmanager get-secret-value`. Bỏ hẳn hướng "registry local"
      (README gốc bước 8 có nhắc nhưng không cần cho local mimic) — build
      `mirai-hub:latest` rồi `k3d image import -c mirai-eks` thẳng vào
      containerd cụm, `deployment.yaml` đã set `imagePullPolicy:
      IfNotPresent` cho đúng.
- [ ] **`git push`** — đây là việc CHƯA làm và là việc còn lại duy nhất để
      app thật sự lên: `kubectl apply -f infra/apps/mirai-hub/application.yaml`
      đã chạy, nhưng ArgoCD báo `ComparisonError: ... app path does not
      exist` vì nó pull từ git remote (`main`), không phải working tree
      local — đã tự xác nhận lỗi này thật, không phải suy đoán. Xem
      `infra/apps/mirai-hub/README.md`.
- [ ] **Không có test tự động** — mọi verify ở trên (`uv run chainlit run`,
      `docker build`/`docker run`) mới là smoke test thủ công lúc viết code
      này, chưa có test suite.
