#!/usr/bin/env bash
# Build the two app images and push them straight into the k3s node.
#
# Why not a registry: floci runs an ECR emulator, but it serves plain HTTP
# and containerd inside k3s insists on HTTPS. Importing the image into the
# node's own containerd sidesteps that completely. The manifests use
# imagePullPolicy: Never to match.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
source "$repo_root/infra/floci/env.sh"

node="floci-eks-${FLOCI_CLUSTER_NAME}"

if ! docker ps --format '{{.Names}}' | grep -qx "$node"; then
  echo "k3s node container '$node' is not running. Start floci and create the cluster first." >&2
  exit 1
fi

build_and_load() {
  local tag=$1 context=$2 dockerfile=$3

  echo "==> building $tag"
  docker build -t "$tag" -f "$dockerfile" "$context"

  echo "==> importing $tag into $node"
  docker save "$tag" | docker exec -i "$node" ctr --namespace k8s.io images import -
}

build_and_load hire-jose/chat-api:local     "$repo_root" "$repo_root/backend/Dockerfile"
build_and_load hire-jose/loadbalancer:local "$repo_root/loadbalancer" "$repo_root/loadbalancer/Dockerfile"

echo
echo "==> images now in the node:"
docker exec "$node" ctr --namespace k8s.io images ls -q | grep hire-jose
