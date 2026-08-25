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

## Persistence KHÔNG hoạt động ở bản Community

`PERSISTENCE=1` + mount volume (`./volume:/var/lib/localstack`) tưởng là đủ
nhưng **không** — persistence là tính năng trả phí, cần
`LOCALSTACK_AUTH_TOKEN` (gói Base/Ultimate) mới thật sự ghi state ra đĩa, kể
cả trên tag `4.13.1` đã pin để né token cho service community (confirm qua
docs chính thức của LocalStack — không phải đoán; `volume/state/` rỗng dù
đã tạo secret từ trước). Container `localstack` restart (kể cả do máy/docker
daemon restart ngoài ý muốn, đã gặp nhiều lần trong lúc dựng LiteLLM) là mất
sạch secret.

Script [`seed-secrets.sh`](seed-secrets.sh) tạo lại (idempotent — create nếu
chưa có, update nếu đã có) toàn bộ secret biết trước. Chạy sau MỖI lần
`docker compose up` container localstack:

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
