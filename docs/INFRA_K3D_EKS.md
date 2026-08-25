# Local Kubernetes (mô phỏng EKS) — nhật ký hạ tầng

Tài liệu này ghi lại từng bước đã thực hiện để dựng một cụm Kubernetes local
bằng k3d, mô phỏng đặc điểm vận hành của AWS EKS, phục vụ test GitOps
(ArgoCD) trước khi lên môi trường thật. Cập nhật theo từng bước đã làm —
không viết trước phần chưa triển khai.

## 1. Cài CLI

Cài trên Linux x86_64: `k3d`, `kubectl`, `helm`, `argocd`.

```bash
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/kubectl
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
sudo install argocd /usr/local/bin/argocd
```

**Lưu ý:** chạy các lệnh `curl -LO` / `curl -sSL -o` từ trong thư mục repo sẽ
tải binary ngay vào working directory. Đã xảy ra với `argocd` (249MB) và
`kubectl` (59MB) bị rơi vào root repo — đã xoá vì bản cài thật nằm ở
`/usr/local/bin`. Lần sau nên `cd /tmp` hoặc `cd ~/Downloads` trước khi tải.

Verify:

```bash
k3d version            # v5.9.0 / k3s v1.35.5-k3s1
kubectl version --client   # v1.36.4
helm version            # v3.21.4
argocd version --client    # v3.5.1
```

## 2. Cấu trúc thư mục `infra/`

```
infra/
├── eks-cluster.yaml              # config cụm k3d mô phỏng EKS
├── gp2-storageclass.yaml         # StorageClass gp2 (thay local-path mặc định)
└── ingress/
    ├── ingress-nginx-values.yaml # Helm values cho INGRESS CONTROLLER dùng chung
    └── argocd-ingress.yaml       # Ingress resource riêng CHO APP ArgoCD
```

Phân biệt hai file trong `ingress/`: `ingress-nginx-values.yaml` cài **một
lần duy nhất** bằng Helm để dựng controller (điểm vào chung cho mọi app).
`argocd-ingress.yaml` là Ingress **của riêng ArgoCD**, apply bằng `kubectl
apply` như manifest thường — mỗi app cần route ra ngoài sẽ có thêm một file
kiểu này trong cùng thư mục, không đụng tới controller.

## 3. Cụm k3d mô phỏng EKS

Config: [`infra/eks-cluster.yaml`](../infra/eks-cluster.yaml)

Điểm mô phỏng EKS:

| Đặc điểm EKS thật | Cách mô phỏng bằng k3d |
|---|---|
| Control plane managed, không schedule pod | 1 server node, taint `node-role.kubernetes.io/control-plane:NoSchedule` |
| Worker chia theo node group / AZ | 3 agent node, label `eks.amazonaws.com/nodegroup=default` + `topology.kubernetes.io/zone` (a/c/d) |
| Không kèm sẵn ingress controller (phải tự cài ALB/nginx controller) | Tắt Traefik mặc định của k3s (`--disable=traefik`) |
| Không kèm sẵn L4 LoadBalancer nội bộ (dùng ELB qua cloud-controller) | Tắt servicelb (`--disable=servicelb`) |
| Storage mặc định là EBS, StorageClass tên `gp2` | Tạo StorageClass `gp2` (provisioner `rancher.io/local-path`) làm default, bỏ default khỏi `local-path` |
| Phiên bản K8s theo EKS hỗ trợ | Pin image `rancher/k3s:v1.31.4-k3s1` |

Tạo cluster:

```bash
k3d cluster create --config infra/eks-cluster.yaml
```

StorageClass `gp2`: [`infra/gp2-storageclass.yaml`](../infra/gp2-storageclass.yaml)

```bash
kubectl apply -f infra/gp2-storageclass.yaml
kubectl patch storageclass local-path \
  -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
```

Verify:

```bash
kubectl config current-context   # k3d-mirai-eks
kubectl get nodes -o wide        # 1 control-plane + 3 agent, Ready
kubectl get nodes --show-labels  # nodegroup=system / nodegroup=default + zone a/c/d
kubectl get storageclass         # gp2 (default)
```

**Sửa đổi so với bản đầu:** ports 80/443 trong `eks-cluster.yaml` ban đầu
route round-robin tới cả 4 node (`nodeFilters: loadbalancer`), kể cả
control-plane đã bị taint `NoSchedule` — request rơi vào node đó sẽ bị
connection refused vì không pod nào chạy ở đây. Đã sửa `nodeFilters` thành
`agents:*:proxy` để loadbalancer của k3d chỉ route tới 3 worker node, rồi xoá
và tạo lại cluster (chưa có workload nào nên không mất gì).

## 4. Cài `ingress-nginx` (thay vai trò ALB controller của EKS)

Values: [`infra/ingress/ingress-nginx-values.yaml`](../infra/ingress/ingress-nginx-values.yaml)

Vì cluster không có `servicelb` (đã tắt ở bước 2 để mô phỏng EKS không có LB
nội bộ mặc định), Service `type: LoadBalancer` mặc định của chart sẽ đứng
`<pending>` mãi mãi. Thay vào đó dùng:

- `controller.kind=DaemonSet` — 1 pod ingress-nginx trên **mỗi** worker node
- `controller.hostPort.enabled=true` — pod bind thẳng port 80/443 trên node
- `controller.service.type=ClusterIP` — không cần LB, chỉ cần Service nội bộ
- `nodeSelector: eks.amazonaws.com/nodegroup=default` — không chạy trên
  control-plane (dù đã bị taint, thêm cho rõ ý định)

Nhờ vậy k3d serverlb (route tới `agents:*:proxy`, xem mục 2) luôn có backend
sống ở cả 3 node, không cần servicelb/klipper đứng giữa.

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  -f infra/ingress/ingress-nginx-values.yaml --wait
```

Verify:

```bash
kubectl get pods -n ingress-nginx -o wide   # 1 pod Running trên mỗi agent node
kubectl get ingressclass                    # "nginx"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/   # 404 = default backend, routing OK
```

## 5. Deploy ArgoCD lên `mirai-eks`

```bash
kubectl create namespace argocd
```

`kubectl apply -f .../install.yaml` thường (client-side apply) lỗi với CRD
`applicationsets.argoproj.io` vì annotation `last-applied-configuration` vượt
262144 bytes. Dùng `--server-side` thay thế:

```bash
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml \
  --server-side --force-conflicts
kubectl wait --for=condition=available --timeout=180s deployment --all -n argocd
```

### Ingress cho argocd-server

Manifest: [`infra/ingress/argocd-ingress.yaml`](../infra/ingress/argocd-ingress.yaml)

`argocd-server` mặc định tự phục vụ TLS (self-signed) trên port container —
thay vì patch server chạy `--insecure`, dùng annotation
`nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"` để nginx re-encrypt
tới backend, giữ nguyên hành vi mặc định của ArgoCD:

```bash
kubectl apply -f infra/ingress/argocd-ingress.yaml
```

Cần route hostname `argocd.mirai.local` về `127.0.0.1` (thêm vào
`/etc/hosts`, cần sudo — máy dev, không phải cluster/CI):

```bash
echo "127.0.0.1 argocd.mirai.local" | sudo tee -a /etc/hosts
```

**Lưu ý:** nếu container/máy chạy agent bị khởi động lại, dòng này trong
`/etc/hosts` biến mất (không nằm trong docker volume của k3d) — phải thêm lại
mỗi lần môi trường agent restart. Bản thân cluster `mirai-eks` (chạy trong
Docker containers riêng, có sẵn restart policy) thì sống sót qua restart đó,
chỉ pod bên trong bị restart 1 lần theo container runtime.

### Trỏ `argocd` CLI vào server trong cluster

Lấy mật khẩu admin ban đầu và login (không echo password ra terminal):

```bash
ARGOCD_PW=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d)
argocd login argocd.mirai.local --username admin --password "$ARGOCD_PW" --insecure
```

Verify:

```bash
argocd version --grpc-web         # client v3.5.1 + server v3.5.1 khớp nhau
argocd cluster list --grpc-web    # in-cluster, k8s 1.31.4
argocd app list --grpc-web        # rỗng — đúng vì chưa tạo Application nào
```

(`--grpc-web` để tránh cảnh báo do đi qua ingress HTTP/2 không hỗ trợ gRPC
thuần.)

Đổi mật khẩu admin mặc định trước khi dùng lâu dài:

```bash
argocd account update-password --grpc-web
```

Trạng thái hiện tại: ArgoCD đã deploy trong namespace `argocd`, tất cả pod
Running; Ingress `argocd-server` hoạt động qua `ingress-nginx`
(`https://argocd.mirai.local/` → 200); CLI `argocd` đã login vào server
trong cluster; đã đổi mật khẩu admin khỏi giá trị khởi tạo mặc định. Chưa
tạo Application nào.

## 6. Quy ước `infra/apps/<name>/` cho mọi app cài bằng Helm/ArgoCD

Từ đây trở đi, **không `helm install` tay** — mỗi app cài qua Helm/ArgoCD có
một thư mục riêng:

```
infra/apps/<name>/
├── values.yaml       # clone từ `helm show values <repo>/<chart> --version X`,
│                     # rồi chỉnh trực tiếp trong file này
└── application.yaml  # ArgoCD Application, multi-source: 1 nguồn là chart
                       # (repoURL = chart repo/OCI), 1 nguồn là chính repo
                       # git này (ref: values) để trỏ tới values.yaml ở trên
```

Ví dụ đã làm — [`infra/apps/external-secrets/`](../infra/apps/external-secrets/):

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm show values external-secrets/external-secrets --version 2.9.0 \
  > infra/apps/external-secrets/values.yaml
# viết infra/apps/external-secrets/application.yaml (xem file mẫu)
kubectl apply -f infra/apps/external-secrets/application.yaml
```

`application.yaml` cần `syncOptions: [ServerSideApply=true]` — CRD của
external-secrets (`secretstores.external-secrets.io`,
`clustersecretstores.external-secrets.io`) đủ lớn để lỗi
`last-applied-configuration` vượt 262144 bytes giống hệt lỗi gặp ở bước cài
ArgoCD (mục 5), nên phải server-side apply ngay từ đầu thay vì để tự retry.

**Điều kiện để multi-source hoạt động:** ArgoCD phải pull được chính repo
này từ git, nghĩa là:

1. Code phải **push lên `origin`** (`git@github.com:tuyendn-mirai/mirai-ai-factory.git`).
2. ArgoCD phải có credentials đọc repo (repo này private). Đã đăng ký bằng
   SSH key sẵn có `~/.ssh/id_ed25519_mirai`, dùng **hostname GitHub thật**
   (`github.com`), KHÔNG dùng alias `github.com-mirai` trong `~/.ssh/config`
   của máy — repo-server của ArgoCD không biết alias đó:
   ```bash
   kubectl create secret generic repo-mirai-ai-factory -n argocd \
     --from-literal=type=git \
     --from-literal=url=git@github.com:tuyendn-mirai/mirai-ai-factory.git \
     --from-file=sshPrivateKey="$HOME/.ssh/id_ed25519_mirai" \
     --dry-run=client -o yaml \
     | kubectl label --local -f - --dry-run=client -o yaml \
       argocd.argoproj.io/secret-type=repository \
     | kubectl apply -f -
   ```
   Verify: `argocd repo list --grpc-web` → `STATUS: Successful`.

Trạng thái hiện tại: `external-secrets` (Operator) đã deploy qua ArgoCD vào
namespace `external-secrets`, `Sync: Synced`, `Health: Healthy`.

## 7. LocalStack (mock AWS Secrets Manager) — chạy ngoài cluster

Thư mục: [`localstack/`](../localstack/) — **cố tình để ngoài `mirai-eks`**,
không phải app trong cluster. Lý do: trên EKS thật, Secrets Manager là
managed service nằm ngoài cluster, pod gọi ra ngoài qua endpoint AWS — dựng
LocalStack trong cluster sẽ làm sai mô hình đang mô phỏng. Cùng pattern với
Postgres/Redis/Ollama trong `docker-compose.yml` gốc (đều là "server ngoài").

```bash
cd localstack
docker compose up -d
```

**Lưu ý về image tag:** `localstack/localstack:latest` (và các tag
`2026.*`) từ 2026 yêu cầu `LOCALSTACK_AUTH_TOKEN` (tài khoản free) ngay cả
cho service community như Secrets Manager — báo lỗi "License activation
failed" và thoát ngay khi start. Đã pin về `4.13.1` (tag semver trước khi
đổi chính sách), chạy hoàn toàn không cần token, `edition: community`.

Verify:

```bash
curl -s http://localhost:4566/_localstack/health   # secretsmanager: "available"

# smoke test thật (test/test là access key giả LocalStack chấp nhận bất kỳ giá trị nào)
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=ap-northeast-1 \
  aws --endpoint-url=http://localhost:4566 secretsmanager create-secret \
  --name smoke-test/hello --secret-string '{"ping":"pong"}'
```

### UI xem resource trong LocalStack

LocalStack Community không kèm UI local nào (chỉ có edge port `4566` là API
endpoint). Web UI thật của LocalStack (`app.localstack.cloud`) là dịch vụ
cloud, cần đăng nhập tài khoản + `LOCALSTACK_AUTH_TOKEN` để attach vào
instance local — đi ngược lý do đã pin image xuống `4.13.1` ở trên (tránh
đòi token). Thay vào đó dùng
[`davireis/stackport`](https://github.com/DaviReisVieira/stackport) (MIT,
đang maintain tích cực), thêm làm service `stackport` trong
[`localstack/docker-compose.yml`](../localstack/docker-compose.yml), trỏ
vào `localstack` qua network nội bộ của compose (`http://localstack:4566`).

**Lưu ý:** biến region đúng tên là `AWS_REGION`, không phải
`AWS_DEFAULT_REGION` (khác với AWS CLI) — set sai thì stackport mặc định
`us-east-1`, list secret ra rỗng dù secret có thật trong LocalStack ở vùng
khác.

```bash
cd localstack && docker compose up -d
```

Verify:

```bash
curl -s http://localhost:8090/api/health
# {"status":"ok", ..., "endpoint_url":"http://localstack:4566", "region":"ap-northeast-1", ...}
curl -s http://localhost:8090/api/secretsmanager/secrets   # list secret hiện có
```

Truy cập UI: `http://localhost:8090` (port `8080` mặc định của image đã bị
container khác trên máy này chiếm, nên map ra `8090` ở host).

### Cho pod trong `mirai-eks` gọi ra LocalStack

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

**Quan trọng:** patch CoreDNS này **không nằm trong `infra/eks-cluster.yaml`**
— phải chạy lại thủ công mỗi khi cluster `mirai-eks` bị `k3d cluster
delete` + `create` lại (gateway IP của docker network có thể đổi giữa các
lần tạo).

Trạng thái hiện tại: LocalStack chạy ngoài cluster, `secretsmanager`
available, pod trong `mirai-eks` gọi được qua `http://host.k3d.internal:4566`.
Chưa nối `external-secrets` (mục 6) vào LocalStack này qua `SecretStore`.

### Persistence KHÔNG hoạt động ở bản Community

`PERSISTENCE=1` + mount volume (`./volume:/var/lib/localstack`) tưởng là đủ
nhưng **không** — persistence là tính năng trả phí, cần
`LOCALSTACK_AUTH_TOKEN` (gói Base/Ultimate) mới thật sự ghi state ra đĩa, kể
cả trên tag `4.13.1` đã pin để né token cho service community (confirm qua
docs chính thức của LocalStack — không phải đoán; `volume/state/` rỗng dù
đã tạo secret từ trước). Container `localstack` restart (kể cả do máy/docker
daemon restart ngoài ý muốn, đã gặp 2 lần trong lúc dựng LiteLLM — mục 9) là
mất sạch secret.

Script [`localstack/seed-secrets.sh`](../localstack/seed-secrets.sh) tạo lại
(idempotent — create nếu chưa có, update nếu đã có) toàn bộ secret biết
trước. Chạy sau MỖI lần `docker compose up` container localstack:

```bash
./localstack/seed-secrets.sh
```

Nếu ExternalSecret trong cluster đã sync trước lúc mất secret (Secret k8s
vẫn còn cache giá trị cũ), force sync lại:

```bash
kubectl annotate externalsecret litellm-db-credentials litellm-env-secrets -n litellm \
  force-sync=$(date +%s) --overwrite
```

## 8. ClusterSecretStore trỏ external-secrets vào LocalStack

Manifest: [`infra/apps/external-secrets/clustersecretstore-localstack.yaml`](../infra/apps/external-secrets/clustersecretstore-localstack.yaml)
— áp dụng bằng `kubectl apply` thường (giống `infra/ingress/*.yaml`, KHÔNG
qua ArgoCD Application/Helm), gồm 2 resource:

- Secret `localstack-aws-creds` (namespace `external-secrets`) chứa access
  key/secret key giả `test`/`test` — tạo tay bằng `kubectl`, không qua
  ExternalSecret (gà-trứng: đây chính là credential để ExternalSecret gọi ra
  ngoài, cùng lý do repo-credential secret ở mục 6 cũng tạo tay).
- `ClusterSecretStore` tên `localstack`, `provider.aws.service:
  SecretsManager`, `region: ap-northeast-1`, auth trỏ vào secret ở trên.

**CRD không có field `endpoint` trong `spec.provider.aws`** (đã kiểm tra
bằng `kubectl explain clustersecretstore.spec.provider.aws` — không có, dù
một số ví dụ tìm được trên mạng cho là có). Endpoint LocalStack phải trỏ qua
biến môi trường **controller-level** `AWS_SECRETSMANAGER_ENDPOINT` (field
`extraEnv` trong [`infra/apps/external-secrets/values.yaml`](../infra/apps/external-secrets/values.yaml)),
ảnh hưởng TẤT CẢ SecretStore/ClusterSecretStore dùng service SecretsManager
trong cluster — không set riêng per-store được.

Verify:

```bash
kubectl get clustersecretstore localstack
# CAPABILITIES: Ready=True
```

## 9. ExternalSecret + LiteLLM (Tầng 3) lên `mirai-eks` qua ArgoCD

### Secret nguồn trong LocalStack

`mirai/litellm` (tạo ở mục 7) chứa field rời khớp đúng key ExternalSecret sẽ
trích ra — KHÔNG bundle thành 1 chuỗi connection-string:
`username`, `password`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`,
`REDIS_DB`.

### ExternalSecret

Manifest: [`infra/apps/litellm/external-secret.yaml`](../infra/apps/litellm/external-secret.yaml)
— 2 `ExternalSecret` (namespace `litellm`), áp dụng bằng `kubectl apply`
thường (không qua ArgoCD, cùng lý do như ClusterSecretStore ở mục 8):

- `litellm-db-credentials`: trích `username`/`password` → khớp
  `db.secret.usernameKey/passwordKey` trong values.yaml của chart.
- `litellm-env-secrets`: trích `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_DB`
  → bơm vào pod qua `environmentSecrets` (envFrom) vì chart không có cách nào
  khác để set các biến này khi `redis.enabled: false` (dùng Redis ngoài).

Verify:

```bash
kubectl get externalsecret -n litellm
# STATUS: SecretSynced, READY: True cho cả 2
```

### App LiteLLM (Helm `litellm-helm`)

[`infra/apps/litellm/values.yaml`](../infra/apps/litellm/values.yaml) +
[`infra/apps/litellm/application.yaml`](../infra/apps/litellm/application.yaml)
— chart OCI `oci://ghcr.io/berriai/litellm-helm` (ArgoCD khai báo OCI bằng
`repoURL` KHÔNG có tiền tố `oci://`).

Quyết định thiết kế đáng chú ý:

- **Master key plaintext**: chart tự tạo Secret `<release>-masterkey` từ
  `values.masterkey` trực tiếp (`templates/secret-masterkey.yaml`) — KHÔNG
  có field nào để trỏ ra Secret có sẵn do ExternalSecret quản lý (khác với
  `db.secret.name`, cái đó CÓ hỗ trợ). Để trống thì chart random 1 giá trị
  MỚI mỗi lần `helm template` chạy → ArgoCD `selfHeal` liên tục đổi master
  key. Chấp nhận đặt plaintext trong `values.yaml` (rủi ro tương tự `.env`
  đã flag ở mục 7) — xem lại khi lên EKS thật.
- `db.database: "ai_factory?schema=litellm"` — ghép thẳng query string vào
  field này vì `DATABASE_URL` của chart chỉ nối chuỗi
  `postgresql://user:pass@endpoint/database`.
- `proxy_config` port riêng từ `layer3-litellm/config.yaml`, KHÔNG sửa file
  gốc đó — hai nơi set tên biến môi trường khác nhau cho cùng giá trị
  (docker-compose: `LITELLM_MASTER_KEY`; chart: luôn `PROXY_MASTER_KEY`).
- Langfuse (`success_callback`/`failure_callback`) tạm COMMENT OUT trong
  `proxy_config` — Langfuse chưa deploy vào `mirai-eks`, chỉ chạy qua
  docker-compose ở gốc repo.

**Bug của chart (mọi version tính đến `0.1.100`):** initContainer
`db-ready` hard-code cứng image
`docker.io/bitnami/postgresql:16.1.0-debian-11-r20` thẳng trong
`templates/deployment.yaml` — KHÔNG đọc `values.image.dbReadyImage/dbReadyTag`
(2 field đó tồn tại trong `values.yaml` nhưng chart không dùng, dead value).
Tag đó đã bị Bitnami gỡ khỏi Docker Hub (confirm bằng `docker pull` thật —
`not found`), không sửa được qua `values.yaml`. Xử lý:

```bash
kubectl patch deployment litellm -n litellm --type='json' \
  -p='[{"op":"replace","path":"/spec/template/spec/initContainers/0/image","value":"docker.io/postgres:16-alpine"}]'
```

+ thêm `ignoreDifferences` vào `application.yaml` (path
`/spec/template/spec/initContainers/0/image`) để `selfHeal` không ghi đè lại
image gốc đã hỏng mỗi lần reconcile. Đã verify: `argocd app get litellm
--refresh` báo `Synced`/`Healthy` dù live image khác chart gốc.

Script wait-for-db bên trong initContainer đó cũng có bug riêng (không liên
quan bug image): dùng `psql -h $(DATABASE_HOST)` với `DATABASE_HOST` chứa cả
port (`172.16.0.191:5435`) → `psql` không tự tách port ra được, luôn báo lỗi
DNS. Vô hại vì script không có `exit $ret` ở cuối — dù thất bại đủ 60 lần
(~120s) vẫn thoát mã 0, container chính vẫn chạy tiếp bình thường.

Verify:

```bash
kubectl get pods -n litellm            # 1/1 Running
argocd app get litellm --grpc-web      # Synced, Healthy
```

### Ingress

Manifest: [`infra/ingress/litellm-ingress.yaml`](../infra/ingress/litellm-ingress.yaml)
— cùng pattern `argocd-ingress.yaml` (mục 5), host `litellm.mirai.local` →
`127.0.0.1` trong `/etc/hosts` (cùng lưu ý: mất khi agent restart, xem mục
5). Service `litellm` phục vụ HTTP thuần (không như `argocd-server`), không
cần annotation backend-protocol.

Verify:

```bash
curl http://litellm.mirai.local/health/readiness
# {"status":"healthy","db":"connected"}
```

Trạng thái hiện tại: LiteLLM chạy trong `mirai-eks`, DB/Redis nối vào server
ngoài đã có sẵn, model_list dùng Ollama, đọc credential qua ExternalSecret từ
LocalStack (trừ master key — plaintext, xem trên). Reachable qua
`http://litellm.mirai.local/`.

## 10. Việc tiếp theo (chưa làm)

- [ ] Seed secret thật vào LocalStack cho các app khác (Langfuse, Langflow)
      — thay cho giá trị đang nằm trong `.env` đã bị commit (cảnh báo bảo
      mật đang treo, chưa xử lý)
- [ ] Deploy Langfuse vào `mirai-eks` (hoặc trỏ `LANGFUSE_HOST=
      http://host.k3d.internal:<port>` giống pattern LocalStack) rồi bật lại
      `success_callback`/`failure_callback` trong `proxy_config` của LiteLLM
- [ ] Deploy Langflow (Tầng 4) qua ArgoCD, trỏ vào `http://litellm.litellm.svc.cluster.local:4000`
- [ ] Cân nhắc quản lý các manifest kubectl-apply thủ công (`infra/ingress/*.yaml`,
      `infra/apps/external-secrets/clustersecretstore-localstack.yaml`,
      `infra/apps/litellm/external-secret.yaml`) bằng chính ArgoCD
      (app-of-apps hoặc thêm làm source thứ 3 trong multi-source Application)
      thay vì `kubectl apply` thủ công
