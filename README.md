# Đồ án MongoDB e-Commerce

Hệ thống MongoDB cho thương mại điện tử, chạy hoàn toàn bằng Docker: Replica Set 3 node, Sharding, benchmark, phân quyền, sao lưu và một API Node.js minh họa. Database: `ecommerce_db` (users, categories, products, orders).

## Yêu cầu

- Docker và Docker Compose.
- Khoảng 4 GB RAM. Cụm Replica Set và cụm Sharding **không chạy cùng lúc**; hãy dừng cụm này trước khi bật cụm kia.
- Cần internet ở lần đầu (tải image, build ứng dụng). Sau đó chạy offline được.

## Cấu trúc thư mục

| Thư mục | Nội dung |
|---|---|
| `docker/` | `docker-compose.yml` (Replica Set rs0), `docker-compose.sharding.yml` (sharding), `docker-compose.bench.yml` (node standalone để benchmark), `setup-keyfile.sh` |
| `scripts/` | Các script theo tuần (`00` đến `07`) và `run-js.sh` để chạy một file `.js` trên rs0 |
| `demo-app/` | API Node.js/Express chạy trong container, kết nối rs0 bằng `app_user` |

## Dựng Replica Set rs0 từ đầu

Làm lần lượt, từ thư mục gốc của repo:

```bash
# 1. Tạo keyFile (xác thực nội bộ giữa các node; file này không được commit)
./docker/setup-keyfile.sh

# 2. Bật 3 node
cd docker && docker compose up -d && cd ..

# 3. Khởi tạo Replica Set (đợi khoảng 15 giây để bầu Primary)
./scripts/00-init-replica-set.sh
```

Sau bước 3 phải thấy đúng 1 node `PRIMARY` và 2 node `SECONDARY`.

## Nạp dữ liệu và chạy các script

Dùng `run-js.sh` (tự tìm Primary). Chạy theo thứ tự:

```bash
cd scripts
./run-js.sh 01-seed-data.js            # tạo dữ liệu mẫu
./run-js.sh 02-crud-operations.js      # thao tác CRUD (có sửa/xóa dữ liệu)
./run-js.sh 03-aggregation-pipelines.js
./run-js.sh 04-indexing.js             # tạo index và so sánh trước/sau bằng explain()
./run-js.sh 07-rbac.js                 # tạo app_user, report_user và kiểm tra phân quyền
```

Lưu ý:

- `02-crud-operations.js` thay đổi dữ liệu. Muốn quay về dữ liệu gốc, chạy lại `01-seed-data.js`, sau đó chạy lại `04-indexing.js` để có đủ index.
- Cần chạy `07-rbac.js` **trước** khi bật ứng dụng demo, vì ứng dụng dùng `app_user`.
- Sao lưu và phục hồi: `CONTAINER=mongo-single ./07-backup-restore.sh backup` (file lưu ở `~/mongo-backups/`, ngoài repo), `./07-backup-restore.sh verify`.

## Ứng dụng demo

```bash
cd demo-app
docker compose up -d --build     # lần đầu cần internet để build
curl -s localhost:3000/health
curl -s "localhost:3000/products?q=Air"
```

Theo dõi failover: mở một terminal chạy `./failover-watch.sh http://localhost:3000 60`, rồi ở terminal khác lấy tên Primary từ `/health` và chạy `docker kill <tên Primary>`.

API tự tạo các index cần thiết khi khởi động. API không có xác thực; đây là giới hạn của bản demo.

## Cụm Sharding (dừng rs0 trước)

```bash
cd docker
docker compose -f docker-compose.sharding.yml up -d
docker exec -it mongo-cfg    mongosh --quiet --eval 'rs.initiate({ _id: "cfgrs", configsvr: true, members: [{ _id: 0, host: "mongo-cfg:27017" }] })'
docker exec -it mongo-shard1 mongosh --quiet --eval 'rs.initiate({ _id: "shard1rs", members: [{ _id: 0, host: "mongo-shard1:27017" }] })'
docker exec -it mongo-shard2 mongosh --quiet --eval 'rs.initiate({ _id: "shard2rs", members: [{ _id: 0, host: "mongo-shard2:27017" }] })'
docker exec -it mongo-router mongosh --quiet --eval 'db.getSiblingDB("admin").createUser({ user: "admin", pwd: "admin123", roles: ["root"] })'
```

Rồi chạy các script trên `mongos` theo thứ tự (chi tiết trong phần đầu mỗi file):

```bash
cd ../scripts
for f in 05-sharding.js 05-sharding-seed.js 05-sharding.js; do
  docker cp $f mongo-router:/tmp/
  docker exec -it mongo-router mongosh -u admin -p admin123 --authenticationDatabase admin --quiet /tmp/$f
done
```

Lần đầu chạy `05-sharding.js` để shard collection khi còn trống, sau đó nạp dữ liệu, rồi chạy lại để xem phân phối và so sánh truy vấn.

## Benchmark

`06-benchmark.js` tự nhận biết đang chạy trên node standalone hay trên `mongos`, và dùng database riêng `bench_db` với dữ liệu giả lập (không đụng `ecommerce_db`). Cả hai cụm chạy cùng một script nên so sánh vẫn công bằng.

```bash
cd docker
docker compose -f docker-compose.bench.yml up -d          # node standalone (cổng 27021)
cd ../scripts
docker cp 06-benchmark.js mongo-bench:/tmp/
docker exec -it mongo-bench mongosh -u admin -p admin123 --authenticationDatabase admin --quiet /tmp/06-benchmark.js
# sau đó dừng mongo-bench, bật cụm sharding rồi chạy cùng script trên mongo-router
```

## Lưu ý

- Mật khẩu trong script và file cấu hình (admin, app_user, report_user) chỉ dùng cho môi trường học tập, không dùng cho môi trường thật.
- `docker/mongo-keyfile` là bí mật, bị `.gitignore` chặn; mỗi máy tự tạo bằng `setup-keyfile.sh`.
- Mọi cụm chạy trên một máy, nên kết quả benchmark phản ánh chi phí của sharding chứ không chứng minh khả năng mở rộng.
