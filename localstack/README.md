# LocalStack (mock AWS Secrets Manager) — chạy ngoài cluster

**Cố tình để ngoài `mirai-eks`**, không phải app trong cluster. Lý do: trên
EKS thật, Secrets Manager là managed service nằm ngoài cluster, pod gọi ra
ngoài qua endpoint AWS — dựng LocalStack trong cluster sẽ làm sai mô hình
đang mô phỏng. Cùng pattern với Postgres/Redis/Ollama trong
`docker-compose.yml` gốc (đều là "server ngoài").

```bash
cd localstack
docker compose up -d
./seed-secrets.sh   # xem mục Persistence bên dưới — luôn cần chạy sau up
```

**Lưu ý về image tag:** `localstack/localstack:latest` (và các tag
`2026.*`) từ 2026 yêu cầu `LOCALSTACK_AUTH_TOKEN` (tài khoản free) ngay cả
cho service community như Secrets Manager — báo lỗi "License activation
failed" và thoát ngay khi start. Đã pin về `4.13.1` (tag semver trước khi
đổi chính sách), chạy hoàn toàn không cần token, `edition: community`.

Verify:

```bash
curl -s http://localhost:4566/_localstack/health   # secretsmanager: "available"
aws --endpoint-url=http://localhost:4566 secretsmanager list-secrets
```

## UI xem resource (`stackport`)

LocalStack Community không kèm UI local nào (chỉ có edge port `4566` là API
endpoint). Web UI thật của LocalStack (`app.localstack.cloud`) là dịch vụ
cloud, cần đăng nhập tài khoản + `LOCALSTACK_AUTH_TOKEN` để attach vào
instance local — đi ngược lý do đã pin image xuống `4.13.1` ở trên (tránh
đòi token). Thay vào đó dùng
[`davireis/stackport`](https://github.com/DaviReisVieira/stackport) (MIT,
đang maintain tích cực), chạy như service `stackport` trong
[`docker-compose.yml`](docker-compose.yml), trỏ vào `localstack` qua network
nội bộ của compose (`http://localstack:4566`).

**Lưu ý:** biến region đúng tên là `AWS_REGION`, không phải
`AWS_DEFAULT_REGION` (khác với AWS CLI) — set sai thì stackport mặc định
`us-east-1`, list secret ra rỗng dù secret có thật trong LocalStack ở vùng
khác.

Verify:

```bash
curl -s http://localhost:8090/api/health
# {"status":"ok", ..., "endpoint_url":"http://localstack:4566", "region":"ap-northeast-1", ...}
curl -s http://localhost:8090/api/secretsmanager/secrets   # list secret hiện có
```

Truy cập UI: `http://localhost:8090` (port `8080` mặc định của image đã bị
container khác trên máy này chiếm, nên map ra `8090` ở host — đổi lại nếu
máy khác không đụng cổng này).

## Cho pod trong `mirai-eks` gọi ra LocalStack (và Postgres/Redis/Ollama)

Kỳ vọng ban đầu: k3d tự inject `host.k3d.internal` vào CoreDNS lúc tạo
cluster (thấy trong log `k3d cluster create`: "Injecting records for
hostAliases (incl. host.k3d.internal)..."). **Thực tế trên cluster này
entry đó không tồn tại** — có thể do k3s's addon reconciler
(`objectset.rio.cattle.io` owner trên configmap `coredns`) ghi đè lại
ConfigMap sau khi k3d inject, hoặc bị mất sau lần cluster bị recreate.
Kiểm tra bằng:

```bash
kubectl get configmap coredns -n kube-system -o jsonpath='{.data.NodeHosts}'
# chỉ thấy tên node (k3d-mirai-eks-agent-0...), KHÔNG có host.k3d.internal
```

Fix: patch thêm dòng vào `NodeHosts` trỏ về gateway IP của docker network
`k3d-mirai-eks` (không hard-code IP vào app config — chỉ patch một lần ở
tầng CoreDNS, app luôn dùng hostname `host.k3d.internal`):

```bash
GATEWAY_IP=$(docker network inspect k3d-mirai-eks \
  --format '{{(index .IPAM.Config 0).Gateway}}')

kubectl get configmap coredns -n kube-system -o jsonpath='{.data.NodeHosts}' \
  > /tmp/nodehosts.txt
echo "$GATEWAY_IP host.k3d.internal" >> /tmp/nodehosts.txt

kubectl create configmap coredns -n kube-system \
  --from-literal=Corefile="$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}')" \
  --from-file=NodeHosts=/tmp/nodehosts.txt \
  --dry-run=client -o yaml | kubectl apply -f -
rm -f /tmp/nodehosts.txt

# ConfigMap volume không refresh ngay trong pod đang chạy — restart để áp dụng liền
kubectl rollout restart deployment coredns -n kube-system
kubectl rollout status deployment coredns -n kube-system
```

Verify từ trong cluster:

```bash
kubectl run curl-test --image=curlimages/curl:latest --restart=Never --rm -i --command -- \
  curl -s -o /dev/null -w "HTTP %{http_code}\n" http://host.k3d.internal:4566/_localstack/health
# HTTP 200
```

Postgres (`host.k3d.internal:5435`), Redis (`host.k3d.internal:6380`),
Ollama (`host.k3d.internal:11434`) — cùng container docker-compose ở gốc
repo, chạy trên chính máy host này, dùng chung hostname này (xem
[`../infra/apps/litellm/README.md`](../infra/apps/litellm/README.md)).

**Quan trọng:** patch CoreDNS này **không nằm trong
`infra/cluster/eks-cluster.yaml`** — phải chạy lại thủ công mỗi khi cluster
`mirai-eks` bị `k3d cluster delete` + `create` lại (gateway IP của docker
network có thể đổi giữa các lần tạo).

## Persistence + IAM Policy Enforcement — ĐÃ hoạt động, cần đúng version image

Trước đây pin `localstack/localstack:4.13.1` để chạy hoàn toàn không cần
token (né license cho service community). Đã đăng ký
[LocalStack for Students](https://www.localstack.cloud/localstack-for-students)
(free qua GitHub Education) và có `LOCALSTACK_AUTH_TOKEN` thật — nhưng lần
đầu set token vào bản `4.13.1` cũ, `PERSISTENCE=1`/`ENFORCE_IAM=1` **vẫn
không chạy** (tạo secret, restart, secret mất; role gắn policy Deny tường
minh vẫn gọi được `secretsmanager` bình thường). Kết luận sai lúc đó: tưởng
gói Student không đủ tier.

**Nguyên nhân thật:** `4.13.1` quá cũ, chưa tích hợp license flow cho tier
Student (log khởi động không hề có dòng `licensingv2 ... activated`) — token
bị đọc nhưng không kích hoạt được gì. Đổi sang
`localstack/localstack:2026.7.5` (bản đã tự pull + test license flow thật:
log có `Successfully requested and activated new license ...:student 🔑✅`)
— test lại từ đầu, cả 2 đều hoạt động đúng:

- **Persistence**: tạo secret → `docker restart mirai-localstack` → secret
  còn nguyên (test trên chính container production, không phải bản cách ly).
- **IAM Policy Enforcement**: role gắn policy `Deny secretsmanager:*` tường
  minh, gọi `secretsmanager` bằng credential từ `sts assume-role` → nhận
  đúng `AccessDeniedException`, giống hệt AWS thật.

`docker-compose.yml` giờ set `SERVICES=secretsmanager,iam,sts`,
`ENFORCE_IAM=1`, image `2026.7.5`. `LOCALSTACK_AUTH_TOKEN` đọc từ
`localstack/.env` (KHÔNG commit — xem `.gitignore`); copy từ
`.env.example` rồi điền token thật.

Bài học: khi 1 tính năng "không hoạt động" dù đã có token đúng gói, kiểm tra
lại **version image** trước khi kết luận do giới hạn license — feature có
thể chưa được build đó tích hợp, không liên quan gì đến tier.

Script [`seed-secrets.sh`](seed-secrets.sh) vẫn giữ để seed lần đầu / phục
hồi nếu volume bị xoá tay — với persistence hoạt động thật, không còn cần
chạy lại sau MỖI lần `docker compose up` nữa, nhưng chạy lại cũng vô hại
(idempotent — create nếu chưa có, update nếu đã có):

```bash
./localstack/seed-secrets.sh
```

Nếu ExternalSecret trong cluster đã sync trước lúc mất secret (Secret k8s
vẫn còn cache giá trị cũ), force sync lại — xem
[`../infra/apps/litellm/README.md`](../infra/apps/litellm/README.md).

## Trạng thái hiện tại

LocalStack chạy ngoài cluster, `secretsmanager` available, pod trong
`mirai-eks` gọi được qua `http://host.k3d.internal:4566`. Secret
`mirai/litellm` phục vụ `infra/apps/litellm/` qua `ClusterSecretStore` +
`ExternalSecret` (xem [`../infra/apps/external-secrets/README.md`](../infra/apps/external-secrets/README.md)).
