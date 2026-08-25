# StorageClass `gp2`

Manifest: [`gp2-storageclass.yaml`](gp2-storageclass.yaml)

Mô phỏng EKS thật: storage mặc định là EBS, StorageClass tên `gp2`. Tạo
`gp2` (provisioner `rancher.io/local-path` — vẫn dùng local-path
provisioner có sẵn của k3s, chỉ đổi tên/đặt làm default) làm default, bỏ
default khỏi `local-path`.

Áp dụng sau khi cluster ([`../cluster/`](../cluster/README.md)) đã lên:

```bash
kubectl apply -f infra/storageclass/gp2-storageclass.yaml
kubectl patch storageclass local-path \
  -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
```

Verify:

```bash
kubectl get storageclass         # gp2 (default)
```
