#!/usr/bin/env bash
# Theo dõi API trong lúc thử failover: mỗi giây gọi /health (cần Primary) và
# /products (đọc được từ Secondary), in mã HTTP và Primary hiện tại.
# Cách dùng: ./failover-watch.sh [url] [số giây]   (mặc định http://localhost:3000, 90 giây)
URL="${1:-http://localhost:3000}"
DURATION="${2:-90}"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

end=$((SECONDS + DURATION))
while (( SECONDS < end )); do
  : > "$tmp"
  hc="$(curl -s -m 5 -o "$tmp" -w '%{http_code}' "$URL/health" || true)"
  primary="$(grep -o '"primary":"[^"]*"' "$tmp" 2>/dev/null | cut -d'"' -f4)"
  pc="$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$URL/products?limit=1" || true)"
  echo "$(date +%H:%M:%S) | /health: ${hc} primary=${primary:--} | /products: ${pc}"
  sleep 1
done
