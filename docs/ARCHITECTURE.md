# Financial AI Factory Platform — Prototype Kiến trúc Tầng 3 & Tầng 4

Tài liệu này hiện thực hóa phần kiến trúc đã thống nhất trong Grand Design MIRAI,
tập trung vào ranh giới giữa **Tầng 3 (AI Model Catalog / Hub)** và
**Tầng 4 (Agent & Workflow Factory)** — phần đang được prototype trước vì có
nhiều điểm thảo luận kỹ thuật nhất.

## 1. Nguyên tắc tách lớp (bắt buộc tuân thủ khi mở rộng)

> **Tầng 4 KHÔNG BAO GIỜ gọi thẳng vendor (OpenAI/Bedrock/Anthropic) hay LiteLLM
> trực tiếp.** Tầng 4 chỉ được gọi vào **một API thống nhất duy nhất** do
> Tầng 3 export ra: `POST /v1/invoke`.

Lý do (đã thống nhất trong hội thoại thiết kế):

- Tầng 3 chịu trách nhiệm **routing theo nhãn** (nguồn cung, hình thức triển
  khai) — logic nghiệp vụ này không được rò rỉ lên Tầng 4.
- Khi đổi/thêm vendor, hoặc đổi công cụ chuẩn hóa (LiteLLM → Portkey/Kong...),
  chỉ sửa **bên trong Tầng 3**. Tầng 4 không cần biết, không cần deploy lại.
- Registry/metadata (223 mục cần chuẩn hóa) là **tài sản thật** của Hub —
  LiteLLM chỉ là lớp kỹ thuật (transport) nằm *bên trong* Tầng 3, không phải
  bản thân Hub.

```
┌─────────────────────────────────────────────────────────┐
│ Tầng 4 — Agent & Workflow Factory                        │
│   Langflow (prototype) → LangGraph (orchestration)       │
│                        → LangChain (tool/memory/chain)   │
└───────────────────────────┬───────────────────────────────┘
                             │ POST /v1/invoke  (API thống nhất)
                             │ { "logical_model": "fp-analysis-default", ... }
┌───────────────────────────▼───────────────────────────────┐
│ Tầng 3 — AI Model Catalog (Hub)                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Registry API (FastAPI)                              │  │
│  │  - Metadata: nguồn cung / hình thức triển khai       │  │
│  │  - Logical model name → routing rule                 │  │
│  │  - Audit log mọi request (phục vụ Control Tower)     │  │
│  └───────────────────┬────────────────────────────────┘  │
│                       │ forward theo routing rule          │
│  ┌───────────────────▼────────────────────────────────┐  │
│  │ LiteLLM Proxy (chuẩn hóa request/response đa vendor) │  │
│  └───────────────────┬────────────────────────────────┘  │
└───────────────────────┼───────────────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────────────┐
│ Tầng 2 — OpenAI API / AWS Bedrock / model tự fine-tune     │
└─────────────────────────────────────────────────────────────┘
```

## 2. Nhãn phân loại (metadata schema)

| Trường | Giá trị ví dụ | Mục đích |
|---|---|---|
| `logical_model` | `fp-analysis-default`, `cr-summarizer-fast` | Tên nghiệp vụ Tầng 4 dùng để gọi — **không chứa tên vendor** |
| `nguon_cung` | `openai`, `bedrock`, `anthropic-direct`, `self-finetuned` | Nguồn cung cấp model |
| `hinh_thuc_trien_khai` | `on-demand`, `provisioned-throughput`, `managed-endpoint`, `on-premise` | Hình thức triển khai |
| `vendor_model_id` | `gpt-4o`, `anthropic.claude-3-5-sonnet` | ID thật gửi cho LiteLLM |
| `fallback_logical_model` | `fp-analysis-backup` | Model dự phòng nếu model chính lỗi/quá tải |
| `status` | `active`, `deprecated`, `beta` | Vòng đời trong Registry (đăng ký/thăng cấp) |

## 4. Cách chạy prototype

Xem `README.md` ở thư mục gốc.
