# Mirai Hub — Layer 5 (Hub UI)

Chat UI của platform, xây trên [Chainlit](https://docs.chainlit.io). Đăng
nhập, chat trực tiếp với model qua LiteLLM (Tầng 3), và có thể kết nối **1
MCP server / thread** lấy động từ danh sách project của Langflow (Tầng 4) để
model gọi thêm tool trong lúc trả lời.

Khác bản trước (không còn "agent catalog" chọn theo role/tenant rồi forward
nguyên văn sang 1 flow Langflow cố định) — xem
[`../infra/apps/mirai-hub/README.md`](../infra/apps/mirai-hub/README.md)
mục "Rebuild" để biết lý do.

## Cấu trúc

```
app.py                     # entrypoint Chainlit — mọi @cl.on_*/@cl.set_* nằm ở đây
mirai_hub/
  settings.py                # pydantic-settings — 1 nguồn duy nhất đọc env, fail-fast nếu thiếu biến bắt buộc
  auth.py                     # password login (1 user dev: admin / DEV_ADMIN_PASSWORD)
  data_layer.py                # official data layer: SQLAlchemyDataLayer + S3StorageClient, schema-scoped
  llm_client.py                 # AsyncOpenAI trỏ vào LiteLLM (Tầng 3)
  langflow_client.py             # list project + composer-url từ Langflow (Tầng 4), cho panel Settings
  mcp_client.py                   # client MCP tự quản (SDK `mcp` chính thức) — xem comment trong file, có bug
                                    # concurrency (anyio task group) đã né bằng background task pattern
  chat.py                          # tool-calling loop cho on_message
scripts/
  init_schema.py                    # (re)tạo schema Postgres `miraihub` — DDL chính thức từ chainlit-datalayer
public/
  favicon.png, logo_light.png, logo_dark.png, theme.json   # brand Mirai (navy #052362)
```

## Chạy local

```bash
uv sync
cp .env.example .env
uv run chainlit create-secret   # dán kết quả vào CHAINLIT_AUTH_SECRET trong .env
```

`.env.example` đã trỏ sẵn `localhost` cho Postgres (`5435`)/MinIO (`9100`)/
LiteLLM (`4000`)/langflow-runtime (`7860`) — đúng cho chạy trực tiếp trên máy
dev này (khác `host.k3d.internal` dùng trong cluster). Cần
`APP_AWS_SECRET_KEY`/`LITELLM_API_KEY`/`LANGFLOW_API_KEY` thật — lấy từ
LocalStack (`aws --endpoint-url=http://localhost:4566 secretsmanager
get-secret-value --secret-id mirai/mirai-hub`) hoặc file gốc
[`../localstack/seed-secrets.sh`](../localstack/seed-secrets.sh).

```bash
uv run chainlit run app.py -w
```

Đăng nhập bằng `admin` / giá trị `DEV_ADMIN_PASSWORD` (mặc định `admin`).

## Schema Postgres

```bash
uv run python scripts/init_schema.py "postgresql://mirai:PASSWORD@localhost:5435/ai_factory"
```

Drop + tạo lại schema `miraihub` mỗi lần chạy (idempotent, DDL lấy nguyên
văn từ 2 migration chính thức của
[`chainlit-datalayer`](https://github.com/Chainlit/chainlit-datalayer)) —
**chỉ** đụng tới schema `miraihub`, không đụng `public` hay schema của
litellm/langfuse trong cùng DB `ai_factory`.

## MinIO (S3-compatible storage) — cần provision tay 1 lần

Secret `mirai/mirai-hub` đã seed `BUCKET_NAME=miraihub` /
`APP_AWS_ACCESS_KEY=mirahub` / `APP_AWS_SECRET_KEY` — nhưng đây là giá trị
**mong muốn** cho user/bucket trên `mirai-dev-minio` (container ngoài repo
này), không tự động tạo ra user/bucket đó. Nếu app báo lỗi upload file /
`InvalidAccessKeyId`, chạy (cần root credentials của chính MinIO instance đó):

```bash
mc alias set local http://host.k3d.internal:9100 <ROOT_USER> <ROOT_PASSWORD>
mc admin user add local mirahub Adgjmptw1
mc mb local/miraihub
mc admin policy create local miraihub-rw /dev/stdin <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:*"],"Resource":["arn:aws:s3:::miraihub","arn:aws:s3:::miraihub/*"]}]}
EOF
mc admin policy attach local miraihub-rw --user mirahub
```

## Đóng gói Docker

```bash
docker build -t mirai-hub .
docker run --rm -p 8000:8000 --env-file .env mirai-hub
```

## Checklist cần hoàn thiện

- [ ] **Provision user/bucket MinIO thật** (mục trên) — chưa làm tại thời
      điểm viết README này (`InvalidAccessKeyId` khi test trực tiếp).
- [x] **`LLM_MODEL` mặc định `gemma4:e4b` hỗ trợ tool-calling** — đã tự
      verify thật (không phải suy đoán): gọi qua LiteLLM (`ollama/` cũ),
      model luôn trả JSON tool-call dưới dạng text thường, không set
      `tool_calls`; gọi trực tiếp `/api/chat` của Ollama (bỏ qua LiteLLM)
      với cùng `tools=` thì model trả `tool_calls` đúng chuẩn ngay. Bug nằm
      ở routing `ollama/` của LiteLLM (dùng `/api/generate` cũ, không dịch
      được `tools=`) — đã sửa thành `ollama_chat/` trong
      `infra/apps/litellm/values.yaml` (chưa deploy, xem mục dưới).
- [ ] **Deploy: `git push` + rebuild image + `kubectl apply -f infra/apps/mirai-hub/external-secret.yaml`**
      — code + manifest đã sẵn (kể cả fix `ollama_chat/` cho litellm ở
      trên), chưa đẩy lên để ArgoCD sync (xem
      [`../infra/apps/mirai-hub/README.md`](../infra/apps/mirai-hub/README.md)).
- [ ] **Không có test tự động** — verify hiện tại là chạy `chainlit run`
      + gọi `scripts/init_schema.py` thật lúc viết code này, chưa có test
      suite.
