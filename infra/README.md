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
#    GITHUB_TOKEN is what lets the assistant push the theme change itself:
#    a fine-grained token, contents:write, this repo only. Leave it out and
#    the switch is simply off. ARGOCD_PASSWORD is the read-only viewer
#    account the answer hands to the visitor.
#    CHAT_BOT_TOKEN is not here: access links are created on the token page
#    instead, and stored on the PVC in k8s/15-chat-api-data.yaml.
kubectl create namespace hire-jose
kubectl create secret generic chat-api-secrets -n hire-jose \
  --from-literal=CHAT_BOT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=GITHUB_TOKEN="github_pat_..." \
  --from-literal=ARGOCD_PASSWORD="<the viewer password>"

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

The visitor can run it too, without a shell. Asking the chat assistant "switch
to the light theme" makes the same edit through the GitHub contents API, and
the answer comes back with the commit link, what to watch for, and the
read-only ArgoCD login. See "The one thing the assistant can do" in the root
README.

The account it hands out is the `viewer` one already in the cluster:
`accounts.viewer: login` in `argocd-cm`, `g, viewer, role:readonly` in
`argocd-rbac-cm`. Its password goes in `chat-api-secrets` as
`ARGOCD_PASSWORD`, never in a manifest.

## The token page

Access links are created there, not in an env var. It is on its own port inside
the pod, deliberately absent from the Service and from the tunnel:

```bash
kubectl -n hire-jose port-forward deploy/chat-api 3001:3001
# then http://127.0.0.1:3001
```

The links live on `chat-api-data`, a PersistentVolumeClaim served by k3s's
local-path provisioner — a directory on the node. Without it, every rollout
(including the theme demo's) would throw the links away.

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
