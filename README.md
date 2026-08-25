# README cho Agent — Dựng local mimic AI Factory Platform trên k3d

Tài liệu này để đưa cho một coding agent (Claude Code hoặc tương đương) làm việc trong repo này.
Agent đọc file này trước, hiểu đúng bối cảnh và ràng buộc, rồi mới bắt tay thực thi
`k3d-eks-mimic-runbook.md` — không tự suy diễn thêm ngoài phạm vi ở đây.

## Mục tiêu

Dựng một bản mimic local trên 1 máy Linux của AI Factory Platform (layer 3 AI Hub, layer 4 Agents,
layer 5 Hub UI), dùng k3d thay AWS EKS, quản lý toàn bộ bằng GitOps qua Argo CD. Mục đích: lặp thử
cấu hình Helm chart / manifest trước khi áp dụng lên EKS staging thật, không phải để chạy production.

## Bối cảnh đã có sẵn — KHÔNG dựng lại

- Một project docker-compose khác, **cùng máy**, đang chạy Postgres, Redis, ClickHouse, MinIO trên
  Docker network `platform-net`. Agent không được sửa file docker-compose của project đó, chỉ được
  **thêm** service `localstack` vào cùng file nếu chưa có.
- IP tĩnh từng service lấy từ `docker network inspect platform-net` tại thời điểm thực thi — không
  hardcode IP đã ghi trong runbook nếu thực tế khác, phải tự kiểm tra lại trước khi tạo Endpoints.
- Repo GitOps cho Argo CD là repo Git riêng, tách khỏi 2 repo ứng dụng (Hub Web App, BFF).

## Quyết định đã chốt — KHÔNG đổi mà không hỏi lại

| Vấn đề | Đã chọn | Không dùng |
|---|---|---|
| K8s distro local | k3d (multi-node trong Docker, join network `platform-net`) | k3s bare-metal, kind, minikube |
| AWS service giả lập (Secrets Manager...) | LocalStack | Vault, SSM thật |
| Bridge secret vào k8s | External Secrets Operator, trỏ LocalStack qua `AWS_ENDPOINT_URL_SECRETSMANAGER` | tự code sync secret |
| Nối tới Postgres/Redis/ClickHouse/MinIO | Service + Endpoints thủ công trỏ IP tĩnh trong `platform-net` | deploy lại các service này trong cluster |
| LoadBalancer Service | MetalLB (nếu cần IP riêng từng Service) | mặc định k3d serverlb nếu cần test đa IP |
| Cài OSS (LiteLLM, Langflow, Langfuse, Keycloak...) | Helm chart chính thức của từng project | tự viết manifest tay |
| Quản lý deploy | Argo CD, app-of-apps, tự động sync từ Git | `helm install` tay ngoài GitOps sau bước bootstrap |
| S3-compatible | MinIO (đã có) | KHÔNG bật thêm `s3` trong LocalStack — tránh hai nguồn S3 |

## Việc cần làm

Thực thi đúng theo thứ tự trong `k3d-eks-mimic-runbook.md` (8 bước, cùng thư mục với file này).
Sau mỗi bước, agent tự kiểm tra bằng đúng lệnh verify ghi trong runbook trước khi qua bước kế tiếp;
nếu một bước fail, dừng lại và báo lỗi cụ thể, không tự "sửa lụi" sang hướng khác chưa được duyệt.

Thứ tự bám sát runbook:
1. Chuẩn bị công cụ (k3d, kubectl, helm, argocd CLI) + xác nhận network `platform-net`
2. Thêm LocalStack vào docker-compose cũ (chỉ `secretsmanager`, `ssm`)
3. Tạo cluster k3d `eks-mimic`, gán label zone/nodegroup giả lập EKS
4. Service + Endpoints trỏ 5 external service (postgres/redis/clickhouse/minio/localstack)
5. Cài hạ tầng nền: MetalLB (nếu cần), cert-manager, External Secrets Operator, DNS local
6. Bootstrap Argo CD (bước cài tay duy nhất)
7. Tạo repo GitOps app-of-apps, deploy LiteLLM/Langflow/Langfuse/Keycloak qua Helm
8. Build & push Hub Web App / BFF vào registry local, thêm Application tương ứng

## Việc KHÔNG được làm

- Không tạo tài khoản, không nhập credential thật (API key Anthropic/OpenAI thật, mật khẩu) vào
  bất kỳ file commit lên Git — dùng placeholder hoặc secret sync qua ESO/LocalStack.
- Không chạy `kubectl delete` trên namespace/cluster ngoài phạm vi `eks-mimic` mà agent tự tạo.
- Không sync Argo CD với `prune: true` lên môi trường nào khác ngoài cluster `k3d-eks-mimic` local.
- Không cài Longhorn/OpenEBS trong k3d (đã xác định không phù hợp Docker-in-Docker) — nếu cần test
  phần này, báo lại để chuyển hướng sang k3s/VM thay vì tự ép chạy trong k3d.
- Không đổi lựa chọn ở bảng "Quyết định đã chốt" — nếu thấy có vấn đề (ví dụ LocalStack không đáp
  ứng), báo lại lý do cụ thể và hỏi trước khi đổi hướng, không tự âm thầm thay bằng công cụ khác.

## Definition of Done

Tương ứng đúng checklist ở cuối `k3d-eks-mimic-runbook.md`:

- [ ] Node cluster có đúng label zone/nodegroup giả lập
- [ ] Cả 5 external service (postgres/redis/clickhouse/minio/localstack) resolve và connect được
      từ trong cluster
- [ ] Secret tạo trong LocalStack sync thành công thành k8s Secret qua ESO
- [ ] Argo CD: root-app + toàn bộ app con ở trạng thái `Synced` / `Healthy`
- [ ] LiteLLM, Langflow, Langfuse, Keycloak chạy được, gọi xuyên qua nhau đúng luồng (LiteLLM →
      Langfuse trace, Langflow → LiteLLM model call, Keycloak → Hub Web App SSO)
- [ ] Hub Web App và BFF build/push/deploy thành công từ registry local

## Tài liệu tham khảo

- `k3d-eks-mimic-runbook.md` — chi tiết lệnh, manifest, values cho từng bước ở trên.