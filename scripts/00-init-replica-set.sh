#!/usr/bin/env bash
# Khởi tạo Replica Set rs0 (3 node). Chạy một lần sau khi `docker compose up -d` trong thư mục docker/.
# Chạy lại không gây lỗi: nếu rs0 đã khởi tạo thì chỉ in trạng thái.
set -euo pipefail
CONTAINER="${CONTAINER:-mongo-single}"

docker exec "$CONTAINER" mongosh -u admin -p admin123 --authenticationDatabase admin --quiet --eval '
try {
  const s = rs.status();
  print("Replica set đã khởi tạo: " + s.set);
} catch (e) {
  if (e.codeName !== "NotYetInitialized") throw e;
  printjson(rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "mongo-single:27017" },
      { _id: 1, host: "mongo-node2:27017" },
      { _id: 2, host: "mongo-node3:27017" }
    ]
  }));
}'

echo "Đợi bầu Primary..."
sleep 15
docker exec "$CONTAINER" mongosh -u admin -p admin123 --authenticationDatabase admin --quiet \
  --eval 'rs.status().members.map(m => m.name + " " + m.stateStr)'
