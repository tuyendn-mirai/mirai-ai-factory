# Mirai AI Factory — POC Tầng 3 & Tầng 4

Prototype cho ranh giới kiến trúc mô tả ở [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Không viết Registry API riêng: **LiteLLM Proxy tự thân đóng vai trò Tầng 3**
(Registry + API thống nhất). **Langflow** đóng vai trò Tầng 4 và chỉ được
cấu hình trỏ vào LiteLLM — không có custom code/plugin nào gọi thẳng vendor.

```
Tầng 4  Langflow  ──POST /chat/completions (model=<logical_model>)──▶  Tầng 3  LiteLLM Proxy ──▶  Tầng 2  Ollama (server riêng, không key)
    │                                                                        │
    │ trace                                                                  ▼
    ▼                                                              Postgres (server riêng, audit/spend log)
Langfuse web+worker (self-host) ──▶ Postgres / ClickHouse / Redis / MinIO (đều server riêng)
```

Toàn bộ hạ tầng nền (Ollama, Postgres, ClickHouse, Redis, MinIO) đều là
**server ngoài đã dựng sẵn**, không chạy container nào trong compose này.
`docker compose up` chỉ khởi 4 service **app**:
- **LiteLLM** (Tầng 3) — DB trỏ ra Postgres ngoài.
- **Langflow** (Tầng 4) — DB trỏ ra Postgres ngoài (không còn dùng SQLite
  mặc định trong container).
- **Langfuse web + worker** (self-host) — LLM observability cho Langflow;
  metadata trỏ Postgres ngoài, trace/analytics trỏ ClickHouse ngoài, queue
  trỏ Redis ngoài, blob sự kiện trỏ MinIO/S3 ngoài.

Không có volume cục bộ nào trong repo này nữa — mọi state đều nằm ở các
server ngoài.

| Khái niệm trong docs/ARCHITECTURE.md | Triển khai thật bằng LiteLLM |
|---|---|
| Registry (metadata nguon_cung, hinh_thuc_trien_khai...) | `model_list[].model_info` trong [layer3-litellm/config.yaml](layer3-litellm/config.yaml) |
| `logical_model` | `model_name` trong config, chính là field `"model"` khi gọi API |
| `vendor_model_id` | `litellm_params.model` (Tầng 4 không bao giờ thấy giá trị này) |
| `fallback_logical_model` | `router_settings.fallbacks` |
| API thống nhất `POST /v1/invoke` | `POST /chat/completions` (OpenAI-compatible) của LiteLLM |
| `GET /v1/models` | `GET /model/info` (đầy đủ nhãn) hoặc `GET /v1/models` (chỉ tên) |
| Audit log mọi request | Postgres + `GET /spend/logs`, tự động khi có `DATABASE_URL` |

## 1. Cài đặt / thư viện cần thiết

Chỉ cần **Docker Desktop** (hoặc Docker Engine + Compose plugin) — không cần
cài Python/Node cục bộ, mọi thứ chạy trong container:

- Docker >= 24.x, Docker Compose v2 (`docker compose version`)
- `jq` (để đọc JSON khi test) — `brew install jq`
- Một Ollama server đã chạy sẵn, mạng này reach được (ví dụ
  `http://192.168.1.50:11434`), và đã pull model `gemma4:e4b` trên chính
  server đó:
  ```bash
  # chạy trên server đang host Ollama, KHÔNG phải máy chạy compose này
  ollama pull gemma4:e4b
  ```
  Không cần API key — Ollama mặc định không xác thực.
- Một Postgres server đã chạy sẵn:
  - **LiteLLM và Langfuse** dùng Prisma → có thể **share chung 1 database**,
    tách bằng schema qua `?schema=<tên>` (Prisma hiểu trực tiếp):
    ```sql
    CREATE SCHEMA IF NOT EXISTS litellm;
    GRANT ALL ON SCHEMA litellm TO mirai;   -- đổi "mirai" thành user thật

    CREATE SCHEMA IF NOT EXISTS langfuse;
    GRANT ALL ON SCHEMA langfuse TO mirai;
    ```
  - **Langflow** dùng SQLAlchemy (không phải Prisma) → **đã thử** chia
    schema qua tham số `options=-c search_path=...` nhưng migration Alembic
    không áp dụng đáng tin cậy (lỗi `relation "user" does not exist` khi
    chạy thật). Kết luận: Langflow cần **DATABASE riêng**, không share
    được theo kiểu schema như 2 cái trên:
    ```sql
    CREATE DATABASE langflow;
    ```

  Cả 3 đều tự tạo bảng ở lần chạy đầu, không cần chạy migration tay.
- Một **ClickHouse** server đã chạy sẵn (Langfuse dùng để lưu trace/analytics).
- Một **Redis** server đã chạy sẵn (Langfuse dùng làm queue).
- Một **MinIO/S3** server đã chạy sẵn, với 1 bucket đã tạo trước (mặc định
  tên `langfuse`, đổi qua `LANGFUSE_S3_BUCKET` nếu dùng tên khác) — Langfuse
  dùng để lưu blob sự kiện.

Không cần `pip install litellm` hay `pip install langflow` — dùng thẳng
image chính thức:

- LiteLLM: `ghcr.io/berriai/litellm:main-latest`
  (repo: https://github.com/BerriAI/litellm)
- Langflow: `langflowai/langflow:latest`
  (repo: https://github.com/langflow-ai/langflow)

## 2. Chạy prototype

```bash
cp .env.example .env
# Điền các biến bắt buộc trong .env:
#   OLLAMA_BASE_URL, DATABASE_URL                     (LiteLLM)
#   LANGFLOW_DATABASE_URL                             (Langflow)
#   LANGFUSE_DATABASE_URL                              (Langfuse)
#   LANGFUSE_SALT / LANGFUSE_ENCRYPTION_KEY / NEXTAUTH_SECRET   (tự sinh:
#     openssl rand -base64 32 / openssl rand -hex 32 / openssl rand -base64 32)
#   CLICKHOUSE_MIGRATION_URL / CLICKHOUSE_URL / CLICKHOUSE_USER / CLICKHOUSE_PASSWORD
#   MINIO_ENDPOINT / MINIO_ROOT_USER / MINIO_ROOT_PASSWORD / LANGFUSE_S3_BUCKET
#   REDIS_HOST / REDIS_PORT / REDIS_PASSWORD (LiteLLM) + REDIS_CONNECTION_STRING (Langfuse)
#   LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_INIT_USER_EMAIL / LANGFUSE_INIT_USER_PASSWORD
# (OPENAI_API_KEY/ANTHROPIC_API_KEY/AWS_* để trống — không cần cho POC này)

docker compose up -d
docker compose ps        # đợi tất cả service running
```

- LiteLLM (Tầng 3): http://localhost:4000
- LiteLLM Admin UI (xem model, spend log qua UI): http://localhost:4000/ui
- Langflow (Tầng 4): http://localhost:7860
- Langfuse (observability): http://localhost:3000 — **không cần đăng ký
  tay**. Org/Project/user/API-key được tự khởi tạo ngay từ `.env`
  (`LANGFUSE_INIT_*`) ở lần chạy đầu; `LANGFUSE_PUBLIC_KEY`/`SECRET_KEY`
  trong `.env` chính là key Langflow đã dùng sẵn để gửi trace. Muốn tự vào
  UI xem trace thì đăng nhập bằng `LANGFUSE_INIT_USER_EMAIL` /
  `LANGFUSE_INIT_USER_PASSWORD`.

## 3. Kiểm tra Tầng 3 độc lập (chưa cần Langflow)

```bash
./scripts/smoke_test.sh
```

Script này gọi lần lượt: health check, danh sách logical_model kèm nhãn,
và một request `POST /chat/completions` bằng đúng tên nghiệp vụ
`fp-analysis-default` — giống hệt cách Tầng 4 sẽ gọi.

Muốn xem model nào thực sự đã trả lời request (để verify "resolved_vendor"
đúng như thiết kế), xem field `model` trong response hoặc:

```bash
curl -s http://localhost:4000/spend/logs \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" | jq '.[0] | {model, custom_llm_provider}'
```

## 4. Nối Tầng 4 (Langflow) vào Tầng 3

Trước khi đụng vào Langflow, xác nhận Tầng 3 đã trả lời được bằng
`./scripts/smoke_test.sh` (mục 3) — nếu bước đó lỗi thì sửa ở LiteLLM
trước, đừng debug trong Langflow UI.

**Bước cụ thể trong Langflow UI:**

1. Mở http://localhost:7860 → **New Flow** (hoặc Blank Flow).
2. Kéo 3 component vào canvas, nối theo thứ tự:
   **Chat Input → OpenAI → Chat Output**
   (component "OpenAI" nằm trong nhóm **Models** ở sidebar bên trái, gõ
   "OpenAI" vào ô tìm kiếm component nếu không thấy ngay).
3. Click vào node **OpenAI**, sửa 3 field:
   | Field trong Langflow | Giá trị |
   |---|---|
   | **OpenAI API Base** (hoặc "Base URL" — nằm dưới mục *Advanced* nếu không thấy ngay) | `http://litellm:4000` — **dùng tên service `litellm`**, không phải `localhost`, vì Langflow gọi từ trong container khác trên cùng docker network |
   | **OpenAI API Key** | giá trị `LITELLM_MASTER_KEY` trong `.env` (mặc định `sk-mirai-local`) — LiteLLM chỉ kiểm tra đây là Bearer token hợp lệ của chính nó, không liên quan gì tới OpenAI thật |
   | **Model Name** | gõ tay `fp-analysis-default` (hoặc `cr-summarizer-fast`) |

   Nếu **Model Name** là dropdown khoá cứng (chỉ cho chọn model OpenAI có
   sẵn, không gõ được): tìm nút bút chì/"Edit" cạnh field đó, hoặc bật
   **Advanced** ở panel component — Langflow luôn có cách nhập model name
   tự do vì đây chính là cơ chế để dùng API OpenAI-compatible của bên thứ 3
   (LiteLLM, vLLM, LocalAI...).
4. Chạy thử ở **Playground** (nút phía trên canvas), gõ 1 câu hỏi, xem
   Chat Output có trả lời không.

**Nếu dùng Agent component** (thay vì OpenAI + Chat Output đơn giản):
component **Agent** trong Langflow có dropdown "Model Provider" — chọn
**OpenAI**, sau đó đúng 3 field ở trên (API Base / API Key / Model Name)
sẽ hiện inline ngay trong Agent, điền y hệt bảng trên.

**Debug nhanh nếu lỗi:**
- *Connection refused / timeout*: dùng nhầm `localhost:4000` thay vì
  `litellm:4000` trong network của docker compose.
- *401 Unauthorized*: sai `OpenAI API Key` — phải đúng `LITELLM_MASTER_KEY`.
- *404 / model not found*: gõ sai `logical_model` — đối chiếu với
  `curl http://localhost:4000/v1/models -H "Authorization: Bearer $LITELLM_MASTER_KEY"`.

Vì đây là component "OpenAI-compatible" chuẩn của Langflow trỏ `base_url`
vào LiteLLM, **không có dòng code custom nào** ở Tầng 4 — đúng nguyên tắc
"Tầng 4 chỉ gọi vào một API thống nhất" trong ARCHITECTURE.md.

Khi Langflow prototype này được nâng cấp lên LangGraph/LangChain thật
(bước tiếp theo trong ARCHITECTURE.md), nguyên tắc giữ nguyên: mọi
LLM call trong graph phải trỏ `base_url=http://<hub>:4000` +
`model=<logical_model>`, không import SDK của vendor trực tiếp.

## 5. Thêm/đổi model (chỉ sửa Tầng 3, Tầng 4 không cần deploy lại)

Sửa `layer3-litellm/config.yaml` (thêm entry vào `model_list`, khai báo
`model_info` và fallback nếu cần), rồi:

```bash
docker compose restart litellm
```

Logical model mới lập tức xuất hiện ở `GET /model/info` — Langflow chỉ
việc gõ đúng tên mới, không cần sửa gì bên Tầng 4.

## 6. Dừng / dọn dẹp

```bash
docker compose down
```

Không có volume cục bộ nào trong repo này — Ollama, Postgres, ClickHouse,
Redis, MinIO đều là server ngoài, dữ liệu của chúng không bị ảnh hưởng bởi
`docker compose down`. Flow của Langflow cũng an toàn vì đã trỏ ra Postgres
ngoài, không còn phụ thuộc SQLite trong container nữa.
