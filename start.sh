#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

cleanup() {
  echo ""
  echo "Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait
  echo "All services stopped."
}
trap cleanup SIGINT SIGTERM EXIT

echo "Starting ChainScore dev services..."
echo ""

cd "$ROOT"

export $(grep -v '^\s*#' "$ROOT/.env" | grep -v '^\s*$' | xargs)

npm run dev -w @chainscore/frontend &
PIDS+=($!)

npm run dev -w @chainscore/api &
PIDS+=($!)

npm run dev -w @chainscore/indexer &
PIDS+=($!)

npm run dev -w @chainscore/oracle &
PIDS+=($!)

echo ""
echo "=== Services starting ==="
echo "  frontend → http://localhost:3000"
echo "  api      → http://localhost:3002"
echo "  indexer  → http://localhost:3005 (indexing on-chain data)"
echo "  oracle   → score computation + liquidation keeper"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

wait
