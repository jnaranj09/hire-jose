# k3s with one extra server flag, for floci's EKS service to use instead of
# the stock rancher/k3s image. Point floci at it with:
#   FLOCI_SERVICES_EKS_DEFAULT_IMAGE=hire-jose/k3s:local
FROM rancher/k3s:latest

COPY config.yaml /etc/rancher/k3s/config.yaml
