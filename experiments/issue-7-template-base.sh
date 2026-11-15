#!/usr/bin/env bash
# For each file shared with the JS template, find the template revision whose
# content is closest to ours (the probable merge base) and report how far the
# file is from that base and from template HEAD.
# Usage: issue-7-template-base.sh <template-checkout> <file>...
set -euo pipefail
TPL="$1"; shift
REPO="$(pwd)"
for f in "$@"; do
  best=""; bestn=999999
  for c in $(git -C "$TPL" log --first-parent --format=%h main -- "$f" | head -40); do
    n=$(git -C "$TPL" show "$c:$f" 2>/dev/null | diff - "$REPO/$f" | grep -c '^[<>]' || true)
    if [ "$n" -lt "$bestn" ]; then bestn=$n; best=$c; fi
  done
  headn=$(git -C "$TPL" show "HEAD:$f" | diff - "$REPO/$f" | grep -c '^[<>]' || true)
  echo -e "$f\t$best\t$(git -C "$TPL" log -1 --format=%ad --date=short "$best" 2>/dev/null)\tours-vs-base=$bestn\tours-vs-head=$headn"
done
