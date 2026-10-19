#!/usr/bin/env bash
# ============================================================
# 07-backup-restore.sh
# Tuần 7: Backup và restore ecommerce_db trên replica set rs0
#
# Cách dùng (cụm rs0 phải đang chạy):
#   ./07-backup-restore.sh backup
#       Sao lưu ecommerce_db (đọc từ Secondary, nén gzip) vào ~/mongo-backups/
#   ./07-backup-restore.sh restore <file.archive.gz> [ecommerce_db.<collection>]
#       Phục hồi toàn bộ database, hoặc chỉ một collection nếu truyền namespace.
#       Đặt DROP=1 để xóa collection hiện có trước khi phục hồi.
#   ./07-backup-restore.sh verify
#       In số document và số index của từng collection để đối chiếu.
#
# Biến môi trường tùy chọn: CONTAINER, BACKUP_DIR
# Mật khẩu admin bên dưới chỉ dùng cho môi trường lab.
# File backup nằm ngoài repo, không commit lên git.
# ============================================================
set -euo pipefail

CONTAINER="${CONTAINER:-mongo-node2}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/mongo-backups}"
DB="ecommerce_db"
URI="mongodb://admin:admin123@mongo-single:27017,mongo-node2:27017,mongo-node3:27017/?replicaSet=rs0&authSource=admin"

usage() {
  sed -n '4,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

cmd="${1:-}"

case "$cmd" in
  backup)
    mkdir -p "$BACKUP_DIR"
    file="$BACKUP_DIR/${DB}_$(date +%Y%m%d_%H%M).archive.gz"
    tmp="$file.tmp"
    # Ghi ra file tạm rồi mới đổi tên, tránh để lại file backup dở dang nếu lệnh lỗi
    docker exec "$CONTAINER" mongodump --uri="${URI}&readPreference=secondary" \
      --db "$DB" --archive --gzip > "$tmp"
    mv "$tmp" "$file"
    echo "Đã backup: $file"
    ls -lh "$file"
    ;;

  restore)
    file="${2:-}"
    ns="${3:-}"
    [[ -n "$file" && -f "$file" ]] || { echo "Thiếu hoặc không tìm thấy file backup"; usage; }
    args=()
    [[ -n "$ns" ]] && args+=(--nsInclude="$ns")
    [[ "${DROP:-0}" == "1" ]] && args+=(--drop)
    docker exec -i "$CONTAINER" mongorestore --uri="$URI" --archive --gzip \
      "${args[@]}" < "$file"
    ;;

  verify)
    docker exec "$CONTAINER" mongosh "$URI" --quiet --eval '
      const d = db.getSiblingDB("'"$DB"'");
      d.getCollectionNames().forEach(c =>
        print(c + ": " + d[c].countDocuments() + " docs, " + d[c].getIndexes().length + " indexes"))'
    ;;

  *)
    usage
    ;;
esac
