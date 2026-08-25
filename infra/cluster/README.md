# Cụm k3d mô phỏng EKS

Config: [`eks-cluster.yaml`](eks-cluster.yaml)

Điểm mô phỏng EKS:

| Đặc điểm EKS thật | Cách mô phỏng bằng k3d |
|---|---|
| Control plane managed, không schedule pod | 1 server node, taint `node-role.kubernetes.io/control-plane:NoSchedule` |
| Worker chia theo node group / AZ | 3 agent node, label `eks.amazonaws.com/nodegroup=default` + `topology.kubernetes.io/zone` (a/c/d) |
| Không kèm sẵn ingress controller (phải tự cài ALB/nginx controller) | Tắt Traefik mặc định của k3s (`--disable=traefik`) |
| Không kèm sẵn L4 LoadBalancer nội bộ (dùng ELB qua cloud-controller) | Tắt servicelb (`--disable=servicelb`) |
| Phiên bản K8s theo EKS hỗ trợ | Pin image `rancher/k3s:v1.31.4-k3s1` |

Storage (`gp2` thay `local-path` mặc định) nằm ở [`../storageclass/`](../storageclass/README.md) —
áp dụng sau khi cluster đã lên.

Tạo cluster:

```bash
k3d cluster create --config infra/cluster/eks-cluster.yaml
```

Verify:

```bash
kubectl config current-context   # k3d-mirai-eks
kubectl get nodes -o wide        # 1 control-plane + 3 agent, Ready
kubectl get nodes --show-labels  # nodegroup=system / nodegroup=default + zone a/c/d
```

**Sửa đổi so với bản đầu:** ports 80/443 trong `eks-cluster.yaml` ban đầu
route round-robin tới cả 4 node (`nodeFilters: loadbalancer`), kể cả
control-plane đã bị taint `NoSchedule` — request rơi vào node đó sẽ bị
connection refused vì không pod nào chạy ở đây. Đã sửa `nodeFilters` thành
`agents:*:proxy` để loadbalancer của k3d chỉ route tới 3 worker node, rồi xoá
và tạo lại cluster (chưa có workload nào nên không mất gì).

**Lưu ý vận hành:** patch CoreDNS cho `host.k3d.internal` (xem
[`../../localstack/README.md`](../../localstack/README.md)) **không nằm
trong `eks-cluster.yaml`** — phải chạy lại thủ công mỗi khi cluster bị
`k3d cluster delete` + `create` lại (gateway IP của docker network có thể
đổi giữa các lần tạo).
