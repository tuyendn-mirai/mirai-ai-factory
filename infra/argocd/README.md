# ArgoCD

ArgoCD không phải Helm chart trong repo này — cài từ bundle manifest thô,
nên không có `values.yaml`/`infra/apps/argocd/` như các app khác.

## Deploy lên `mirai-eks`

```bash
kubectl create namespace argocd
```

`kubectl apply -f .../install.yaml` thường (client-side apply) lỗi với CRD
`applicationsets.argoproj.io` vì annotation `last-applied-configuration` vượt
262144 bytes. Dùng `--server-side` thay thế:

```bash
kubectl apply -n argocd -f infra/argocd/install.yaml --server-side --force-conflicts
kubectl wait --for=condition=available --timeout=180s deployment --all -n argocd
```

[`install.yaml`](install.yaml) là bản pin của
`https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.1/manifests/install.yaml`
— ban đầu apply thẳng từ URL "stable" (floating tag), đã lưu lại bản đúng
version đang chạy (`v3.5.1`) vào đây để reproducible từ git thay vì phụ
thuộc "stable" trỏ đi đâu sau này.

## Ingress cho argocd-server

Manifest: [`argocd-ingress.yaml`](argocd-ingress.yaml)

`argocd-server` mặc định tự phục vụ TLS (self-signed) trên port container —
thay vì patch server chạy `--insecure`, dùng annotation
`nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"` để nginx re-encrypt
tới backend, giữ nguyên hành vi mặc định của ArgoCD:

```bash
kubectl apply -f infra/argocd/argocd-ingress.yaml
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

**Truy cập từ máy khác qua SSH (VS Code Remote-SSH):** `/etc/hosts` chỉ có
tác dụng trên máy chạy trình duyệt, không phải máy chạy cluster. Cần thêm
dòng `127.0.0.1 argocd.mirai.local` vào `/etc/hosts` trên **laptop**, và
forward port 443 qua tab PORTS của VS Code (Remote-SSH không tự forward
theo hostname, chỉ theo số cổng).

## Trỏ `argocd` CLI vào server trong cluster

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
argocd app list --grpc-web        # danh sách Application hiện có
```

(`--grpc-web` để tránh cảnh báo do đi qua ingress HTTP/2 không hỗ trợ gRPC
thuần.)

Đổi mật khẩu admin mặc định trước khi dùng lâu dài:

```bash
argocd account update-password --grpc-web
```

## Repo credentials cho multi-source Application

Mọi app trong [`../apps/`](../apps/README.md) dùng multi-source Application
(1 nguồn chart, 1 nguồn chính repo git này để lấy `values.yaml`) — ArgoCD
cần đọc được repo này:

1. Code phải **push lên `origin`** (`git@github.com:tuyendn-mirai/mirai-ai-factory.git`).
2. ArgoCD phải có credentials đọc repo (repo này private). Đã đăng ký bằng
   SSH key sẵn có `~/.ssh/id_ed25519_mirai`, dùng **hostname GitHub thật**
   (`github.com`), KHÔNG dùng alias (ví dụ `github.com-mirai`) trong
   `~/.ssh/config` của máy — repo-server của ArgoCD không biết alias đó:
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

## Sự cố đã gặp: git object rỗng trong cache của `argocd-repo-server`

`argocd-repo-server` giữ git clone cache trong `emptyDir` — sống theo
**pod**, không theo container, nên nhiều lần container bị kubelet restart
(do liveness probe fail lúc máy có hiện tượng gián đoạn hệ thống — chưa rõ
nguyên nhân gốc) không xoá được cache đã hỏng (object 0 byte, dính
sync/fetch bị ngắt giữa chừng). Triệu chứng: `argocd app sync` báo `object
file ... is empty`, `did not send all necessary configuration` dù push lên
`origin` bình thường. Fix: xoá hẳn pod (không phải chỉ container) để ép tạo
`emptyDir` mới:

```bash
kubectl delete pod -n argocd -l app.kubernetes.io/name=argocd-repo-server
```

Cùng sự cố này còn làm hỏng vài object trong chính repo git local (cùng
timestamp) — xem `git fsck --full`, xoá object 0-byte rồi `git fetch origin`
lại là đủ (GitHub luôn có bản gốc nguyên vẹn).

## Trạng thái hiện tại

ArgoCD đã deploy trong namespace `argocd`, tất cả pod Running; Ingress
`argocd-server` hoạt động qua `ingress-nginx`; CLI `argocd` đã login vào
server trong cluster; đã đổi mật khẩu admin khỏi giá trị khởi tạo mặc định.
Application đang chạy: xem [`../apps/README.md`](../apps/README.md).
