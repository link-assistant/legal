#!/usr/bin/env bash
# Issue #7: `npm pack --dry-run --json` forwards foreground lifecycle-script
# stdout (prepack/prepare) ahead of the JSON report, so JSON.parse fails.
# `--foreground-scripts=false` keeps only the report on stdout, and a failing
# script's output still appears on stderr and in the JSON error detail.
set -euo pipefail
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
cd "$dir"
for code in 0 3; do
  printf '{"name":"probe","version":"1.0.0","files":["package.json"],"scripts":{"prepack":"echo PREPACK-OUT; exit %s"}}\n' "$code" >package.json
  for foreground in true false; do
    status=0
    npm pack --dry-run --json --foreground-scripts="$foreground" >out.txt 2>err.txt || status=$?
    if node -e 'JSON.parse(require("fs").readFileSync("out.txt","utf8"))' 2>/dev/null; then
      parse=valid
    else
      parse=invalid
    fi
    echo "prepack exit=$code foreground-scripts=$foreground: npm exit=$status, stdout JSON $parse, stderr mentions output: $(grep -c PREPACK-OUT err.txt || true)"
  done
done
