#!/bin/sh
set -eu

TEMPLATE=/usr/local/etc/haproxy/haproxy.cfg.template
CONFIG=/tmp/haproxy.cfg

envsubst < "$TEMPLATE" > "$CONFIG"
haproxy -c -f "$CONFIG"

exec haproxy -W -db -f "$CONFIG"
