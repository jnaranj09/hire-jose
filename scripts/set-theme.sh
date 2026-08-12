#!/usr/bin/env bash
# The demo. Changes one word in k8s/20-chat-api.yaml, commits it, pushes it.
# Nothing here touches the cluster — ArgoCD sees the new commit and rolls the
# change out on its own.
#
#   scripts/set-theme.sh paper      # dark  -> light
#   scripts/set-theme.sh default    # light -> dark
#   scripts/set-theme.sh            # whatever is not set right now
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
manifest="$repo_root/k8s/20-chat-api.yaml"

current=$(grep -A1 'name: SITE_THEME' "$manifest" | grep 'value:' | sed 's/.*value: *"\(.*\)".*/\1/')

if [ $# -ge 1 ]; then
  target=$1
elif [ "$current" = "default" ]; then
  target=paper
else
  target=default
fi

if [ ! -f "$repo_root/frontend/public/themes/$target.css" ]; then
  echo "no such theme: $target (look in frontend/public/themes/)" >&2
  exit 1
fi

if [ "$current" = "$target" ]; then
  echo "already on '$target' — nothing to push."
  exit 0
fi

echo "theme: $current -> $target"

# Only the value on the line after 'name: SITE_THEME'.
sed -i "/name: SITE_THEME/{n;s/value: \".*\"/value: \"$target\"/}" "$manifest"

cd "$repo_root"
git add k8s/20-chat-api.yaml
git commit -q -m "Set site theme to $target"
git push -q origin main

echo "pushed. ArgoCD will sync within its poll interval (or hit Refresh in the UI)."
