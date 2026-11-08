#!/usr/bin/env bash
# Tạo keyFile cho xác thực nội bộ giữa các node MongoDB (cụm rs0 và cụm sharding).
# Chạy một lần sau khi clone repo. keyFile là bí mật nên bị .gitignore chặn, không commit.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f mongo-keyfile ]]; then
  echo "mongo-keyfile đã tồn tại, bỏ qua (xóa file này nếu muốn tạo lại)."
  exit 0
fi

openssl rand -base64 756 > mongo-keyfile
chmod 400 mongo-keyfile
# mongod trong container chạy bằng UID 999, nên UID này phải là chủ sở hữu file
sudo chown 999:999 mongo-keyfile
ls -l mongo-keyfile
