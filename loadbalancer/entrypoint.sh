#!/bin/sh
set -eu

# Defaults keep the docker-compose setup behaving exactly as before: haproxy
# on loopback, the API in the same network namespace. Kubernetes overrides
# them — there the pod must listen on all interfaces and reach the API by
# service name.
: "${LB_BIND:=127.0.0.1}"
: "${CHAT_API_HOST:=127.0.0.1}"
: "${TRUSTED_PROXY_CIDR:=127.0.0.0/8}"
export LB_BIND CHAT_API_HOST TRUSTED_PROXY_CIDR

TEMPLATE=/usr/local/etc/haproxy/haproxy.cfg.template
CONFIG=/tmp/haproxy.cfg

envsubst < "$TEMPLATE" > "$CONFIG"
haproxy -c -f "$CONFIG"

exec haproxy -W -db -f "$CONFIG"
