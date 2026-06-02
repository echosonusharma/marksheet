#!/usr/bin/env bash
# build.sh — package the extension as <name>_<version>.zip, honoring .gitignore.
set -euo pipefail

cd "$(dirname "$0")"

NAME=$(grep -oE '"name"\s*:\s*"[^"]+"' manifest.json | sed -E 's/.*"([^"]+)"$/\1/')
VERSION=$(grep -oE '"version"\s*:\s*"[^"]+"' manifest.json | sed -E 's/.*"([^"]+)"$/\1/')
OUT="${NAME}_${VERSION}.zip"

rm -f "$OUT"

# Build find pruning conditions from .gitignore + hardcoded extras.
PATTERNS=(.git .gitignore build.sh gen-key.sh README.md PRIVACY.md "*.zip" title.svg)
if [[ -f .gitignore ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" ]] && continue
    PATTERNS+=("${line%/}")
  done < .gitignore
fi

# Build a single `( -name a -o -name b -o ... )` group, then prune those.
FIND_ARGS=(\()
first=1
for p in "${PATTERNS[@]}"; do
  if [[ $first -eq 1 ]]; then
    FIND_ARGS+=(-name "$p"); first=0
  else
    FIND_ARGS+=(-o -name "$p")
  fi
done
FIND_ARGS+=(\) -prune -o -type f -print0)

find . -mindepth 1 "${FIND_ARGS[@]}" | xargs -0 zip "$OUT" > /dev/null

echo "→ $OUT  ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | tail -n +4 | head -n -2
