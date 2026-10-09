// ============================================================
// 05-sharding.js
// Tuần 5: Sharding - cấu hình sharded cluster và so sánh truy vấn
//
// Kiến trúc (docker/docker-compose.sharding.yml, project "shardlab"):
//   mongo-router (mongos, host port 27020)
//   mongo-cfg    (config server, replica set cfgrs)
//   mongo-shard1 (replica set shard1rs)
//   mongo-shard2 (replica set shard2rs)
//
// Thứ tự dựng cụm (chạy từ bash, trong thư mục docker/):
//   docker compose -f docker-compose.sharding.yml up -d
//   docker exec -it mongo-cfg    mongosh --quiet --eval 'rs.initiate({ _id: "cfgrs", configsvr: true, members: [{ _id: 0, host: "mongo-cfg:27017" }] })'
//   docker exec -it mongo-shard1 mongosh --quiet --eval 'rs.initiate({ _id: "shard1rs", members: [{ _id: 0, host: "mongo-shard1:27017" }] })'
//   docker exec -it mongo-shard2 mongosh --quiet --eval 'rs.initiate({ _id: "shard2rs", members: [{ _id: 0, host: "mongo-shard2:27017" }] })'
//   docker exec -it mongo-router mongosh --quiet --eval 'db.getSiblingDB("admin").createUser({ user: "admin", pwd: "admin123", roles: ["root"] })'
//
// Lưu ý: --configsvr mặc định port 27019 và --shardsvr mặc định port 27018,
// nên compose phải ép --port 27017 cho các node này.
//
// Sau đó chạy script này trên mongos:
//   docker cp 05-sharding.js mongo-router:/tmp/
//   docker exec -it mongo-router mongosh -u admin -p admin123 \
//     --authenticationDatabase admin --quiet /tmp/05-sharding.js
//
// Cần chạy 05-sharding-seed.js trước nếu muốn có dữ liệu để so sánh.
// ============================================================

const appDb = db.getSiblingDB("ecommerce_db");

print("\n========== BƯỚC 1: Đăng ký shard (idempotent) ==========\n");
printjson(sh.addShard("shard1rs/mongo-shard1:27017"));
printjson(sh.addShard("shard2rs/mongo-shard2:27017"));

print("\n========== BƯỚC 2: Bật sharding cho database ==========\n");
printjson(sh.enableSharding("ecommerce_db"));

print("\n========== BƯỚC 3: Shard collection orders (hashed user_id) ==========\n");
// Hashed key: phân phối đều dữ liệu, MongoDB tự pre-split thành 4 chunk (2 chunk/shard)
// khi collection còn trống. Truy vấn theo user_id là targeted (1 shard);
// truy vấn theo khoảng user_id hoặc theo trường khác là scatter-gather.
printjson(sh.shardCollection("ecommerce_db.orders", { user_id: "hashed" }));

print("\n========== BƯỚC 4: Phân phối dữ liệu giữa các shard ==========\n");
appDb.orders.aggregate([
  { $collStats: { storageStats: {} } },
  { $project: { _id: 0, shard: 1, docs: "$storageStats.count", sizeBytes: "$storageStats.size" } }
]).forEach(s => printjson(s));

// Tóm tắt kết quả explain để dễ so sánh
function summarize(label, cursor) {
  const plan = cursor.explain("executionStats");
  const stats = plan.executionStats;
  print(label);
  printjson({
    stage: plan.queryPlanner.winningPlan.stage,
    shardsQueried: stats.executionStages.shards.length,
    totalKeysExamined: stats.totalKeysExamined,
    totalDocsExamined: stats.totalDocsExamined,
    nReturned: stats.nReturned
  });
}

print("\n========== BƯỚC 5: Targeted query (có shard key) ==========\n");
const sampleUser = appDb.users.findOne();
if (sampleUser) {
  summarize("find({ user_id }) -> kỳ vọng SINGLE_SHARD",
    appDb.orders.find({ user_id: sampleUser._id }));
} else {
  print("Chưa có dữ liệu users - hãy chạy 05-sharding-seed.js trước.");
}

print("\n========== BƯỚC 6: Scatter-gather (không có shard key) ==========\n");
summarize("find({ status: 'paid' }) khi chưa có index status -> SHARD_MERGE + COLLSCAN",
  appDb.orders.find({ status: "paid" }));

print("\n========== BƯỚC 7: Index hỗ trợ scatter-gather ==========\n");
print("Tạo index: " + appDb.orders.createIndex({ status: 1 }));
summarize("find({ status: 'paid' }) sau khi có index -> vẫn SHARD_MERGE nhưng IXSCAN",
  appDb.orders.find({ status: "paid" }));

print("\n=> Nhận xét: index giúp mỗi shard bớt quét document, nhưng truy vấn không");
print("   chứa shard key vẫn phải hỏi tất cả shard. Chọn shard key theo truy vấn phổ biến.");

print("\n========== HOÀN TẤT 05-sharding.js ==========\n");
