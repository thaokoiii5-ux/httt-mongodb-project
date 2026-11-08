#!/usr/bin/env bash
# Chạy một file .js trên cụm rs0 (kết nối bằng chuỗi replica set nên tự tìm Primary).
# Cách dùng: ./run-js.sh 04-indexing.js
# Biến môi trường tùy chọn: CONTAINER (mặc định mongo-single)
set -euo pipefail
f="${1:?Cách dùng: ./run-js.sh <file.js>}"
CONTAINER="${CONTAINER:-mongo-single}"
URI="mongodb://admin:admin123@mongo-single:27017,mongo-node2:27017,mongo-node3:27017/?replicaSet=rs0&authSource=admin"
name="$(basename "$f")"
docker cp "$f" "$CONTAINER:/tmp/$name"
docker exec "$CONTAINER" mongosh "$URI" --quiet "/tmp/$name"
