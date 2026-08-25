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

## 6. Việc tiếp theo (chưa làm)

- [ ] Tạo Application đầu tiên trỏ vào một repo Git để test GitOps sync
- [ ] Cân nhắc quản lý các manifest app trong `infra/ingress/*.yaml` bằng
      chính ArgoCD (app-of-apps) thay vì `kubectl apply` thủ công
