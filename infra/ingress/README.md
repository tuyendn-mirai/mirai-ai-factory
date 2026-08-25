# `ingress-nginx` — điểm vào chung (thay vai trò ALB controller của EKS)

Values: [`ingress-nginx-values.yaml`](ingress-nginx-values.yaml)

Cài **một lần duy nhất** bằng Helm để dựng controller — điểm vào chung cho
mọi app. Mỗi app tự khai báo Ingress riêng theo cách phù hợp với chart của
nó (ví dụ field `ingress.enabled` trong `values.yaml` — xem
[`../apps/litellm/`](../apps/litellm/README.md)) và tham chiếu ngược lại
controller này qua `ingressClassName: nginx`. Ngoại lệ là ArgoCD (không
phải Helm chart) — Ingress riêng của nó nằm ở
[`../argocd/argocd-ingress.yaml`](../argocd/argocd-ingress.yaml).

Vì cluster không có `servicelb` (đã tắt lúc tạo cluster để mô phỏng EKS
không có LB nội bộ mặc định — xem [`../cluster/`](../cluster/README.md)),
Service `type: LoadBalancer` mặc định của chart sẽ đứng `<pending>` mãi mãi.
Thay vào đó dùng:

- `controller.kind=DaemonSet` — 1 pod ingress-nginx trên **mỗi** worker node
- `controller.hostPort.enabled=true` — pod bind thẳng port 80/443 trên node
- `controller.service.type=ClusterIP` — không cần LB, chỉ cần Service nội bộ
- `nodeSelector: eks.amazonaws.com/nodegroup=default` — không chạy trên
  control-plane (dù đã bị taint, thêm cho rõ ý định)

Nhờ vậy k3d serverlb (route tới `agents:*:proxy`) luôn có backend sống ở cả
3 node, không cần servicelb/klipper đứng giữa.

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
