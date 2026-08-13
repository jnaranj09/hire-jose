# infra — the GitOps demo

The site normally runs from `docker-compose.yml` on the host. This folder is
the other way to run it: a Kubernetes cluster, with ArgoCD pulling the
manifests in `k8s/` out of GitHub.

**floci is an AWS-compatible local emulator, not real AWS.** Its EKS service
starts a real k3s container, so kubectl and ArgoCD talk to a genuine
Kubernetes API server — but there is no AWS account anywhere in this, and the
credentials are the string `test`.

## What runs where

| Piece | Where | Why |
|---|---|---|
| floci | container, `:4566` | the AWS API surface |
| k3s node | container `floci-eks-hire-jose`, API on `:6500` | started by floci's EKS service |
| chat-api | pod | express: serves the page and the chat |
| loadbalancer | pod, NodePort `30080` | haproxy: rate limits, bot filter, security headers |
| ollama | **host**, `:11434` | 4.7 GB model on the laptop GPU — it stays out of the cluster |

## Bootstrap

```bash
# 0. one-off: the custom k3s image (see infra/floci/k3s/config.yaml)
docker build -t hire-jose/k3s:local infra/floci/k3s

# 1. start the emulator
docker compose -f infra/floci/docker-compose.yml up -d

# 2. point the shell at it
source infra/floci/env.sh

# 3. create the cluster
aws eks create-cluster --name "$FLOCI_CLUSTER_NAME" \
  --role-arn arn:aws:iam::000000000000:role/eks-role \
  --resources-vpc-config subnetIds=subnet-00000000,securityGroupIds=sg-00000000
aws eks update-kubeconfig --name "$FLOCI_CLUSTER_NAME"
kubectl get nodes

# 4. only for local hacking. Normally GitHub Actions builds the images, pushes
#    them to GHCR and writes the tag into k8s/, and ArgoCD deploys that commit.
scripts/load-images.sh

# 5. the secret. It is NOT in git and never should be.
kubectl create namespace hire-jose
kubectl create secret generic chat-api-secrets -n hire-jose \
  --from-literal=CHAT_BOT_TOKEN="$(openssl rand -hex 16)" \
  --from-literal=CHAT_BOT_SECRET="$(openssl rand -hex 32)"

# 6. ArgoCD. --server-side is required: the ApplicationSet CRD is larger than
#    the 262144-byte annotation a client-side apply writes, so a plain
#    `kubectl apply` installs everything else and then fails on that one CRD.
kubectl create namespace argocd
kubectl apply -n argocd --server-side -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl -n argocd rollout status deploy/argocd-server

# 7. hand the repo over to ArgoCD
kubectl apply -f infra/argocd/application.yaml
```

The admin password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d; echo
```

## The demo

```bash
scripts/set-theme.sh paper
```

That changes one word in `k8s/20-chat-api.yaml`, commits, and pushes. Nothing
else. ArgoCD notices the new commit, rolls the Deployment, and the site goes
from dark to light. `scripts/set-theme.sh default` puts it back.

## Reaching the pods from the host

The k3s node is a container, so its NodePorts are on the docker bridge, not on
localhost:

```bash
docker inspect floci-eks-hire-jose \
  -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
# -> e.g. 172.17.0.4, so the site is at http://172.17.0.4:30080
```

That address is what `/etc/cloudflared/config.yml` needs to point at. It can
change when the cluster is recreated.

## Known host requirements

- **Rootful docker.** k3s does not come up under a rootless daemon.
- **A running kernel with its `/lib/modules` tree present.** k3s loads
  `xt_mark`, `vxlan` and friends. If the kernel package was updated without a
  reboot, the modules for the *running* kernel are gone and k3s dies at
  startup — kube-proxy fails on `iptables-restore` and flannel reports
  "operation not supported".
- **`br_netfilter` loaded on the host.** floci does not mount `/lib/modules`
  into the node container, so k3s cannot load it itself — it has to already be
  loaded on the host. Without it, bridged pod traffic never passes through
  iptables, so kube-proxy's ClusterIP rules never fire: every pod DNS lookup to
  `10.43.0.10` times out and ArgoCD sits at `Unknown` with
  `lookup argocd-redis: i/o timeout`. Nothing logs an error — it just hangs.

  ```bash
  sudo modprobe br_netfilter
  sudo sysctl -w net.bridge.bridge-nf-call-iptables=1
  ```

  Persisted here in `/etc/modules-load.d/k3s.conf` and `/etc/sysctl.d/99-k3s.conf`.
- **Ollama reachable from the cluster.** It binds `127.0.0.1` by default,
  which pods cannot reach. It needs to listen on the docker bridge as well.
- **A firewall opening that binds.** With `br_netfilter` on, pod → host traffic
  is subject to the host firewall, and ufw's default `INPUT DROP` silently eats
  it. The chat-api `/api/health` probe calls Ollama, so the pod restarts every
  30s with no useful log line.

  ```bash
  sudo ufw allow from 172.17.0.0/16 to any port 11434 proto tcp
  sudo ufw allow from 10.42.0.0/16  to any port 11434 proto tcp
  ```
