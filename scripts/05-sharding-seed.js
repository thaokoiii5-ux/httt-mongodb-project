// ============================================================
// 05-sharding-seed.js
// Tuần 5: Sharding - seed dữ liệu lớn để quan sát phân phối chunk
//
// Dùng ĐÚNG schema của ecommerce_db (users: name/email/created_at;
// orders: user_id/items/total/status/created_at) để các truy vấn khác chạy được trên dữ liệu này.
//
// Chạy trên mongos (container mongo-router):
//   docker cp 05-sharding-seed.js mongo-router:/tmp/
//   docker exec -it mongo-router mongosh -u admin -p admin123 \
//     --authenticationDatabase admin --quiet /tmp/05-sharding-seed.js
//
// Script xóa dữ liệu cũ, rồi (khi orders đang trống) shard collection bằng hashed user_id
// để MongoDB tự pre-split chunk, rồi mới chèn dữ liệu. Chạy lại nhiều lần không bị trùng.
// ============================================================

if (db.hello().msg !== "isdbgrid") {
  print("Script này chạy trên mongos (mongo-router), không phải node thường. Dừng.");
  quit(1);
}

const appDb = db.getSiblingDB("ecommerce_db");

const USER_COUNT = 1000;
const ORDER_BATCHES = 20;
const BATCH_SIZE = 1000;

print("\n--- Xóa dữ liệu cũ ---");
appDb.users.deleteMany({});
appDb.orders.deleteMany({});

print("--- Đảm bảo orders đã shard (hashed user_id), khi collection còn trống ---");
// Collection trống: MongoDB tự tạo index hashed và pre-split. Nếu orders đã có dữ liệu mà
// chưa shard thì phải tạo index { user_id: "hashed" } trước (xem tài liệu sh.shardCollection).
sh.enableSharding("ecommerce_db");
printjson(sh.shardCollection("ecommerce_db.orders", { user_id: "hashed" }));

print("--- Tạo " + USER_COUNT + " users ---");
const userIds = [];
for (let i = 0; i < USER_COUNT; i++) userIds.push(new ObjectId());
appDb.users.insertMany(
  userIds.map((id, i) => ({
    _id: id,
    name: "User " + i,
    email: "user" + i + "@example.com",
    created_at: new Date()
  }))
);

print("--- Tạo " + ORDER_BATCHES * BATCH_SIZE + " orders (lô " + BATCH_SIZE + ") ---");
const statuses = ["pending", "completed", "cancelled"];
for (let b = 0; b < ORDER_BATCHES; b++) {
  const batch = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const quantity = 1 + Math.floor(Math.random() * 3);
    const price = 100000 * (1 + Math.floor(Math.random() * 50));
    batch.push({
      user_id: userIds[Math.floor(Math.random() * userIds.length)],
      items: [{
        product_id: new ObjectId(),
        name: "Sản phẩm " + Math.floor(Math.random() * 100),
        price: price,
        quantity: quantity
      }],
      total: price * quantity,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      created_at: new Date(Date.now() - Math.floor(Math.random() * 180) * 86400000)
    });
  }
  appDb.orders.insertMany(batch);
}

print("\n--- Kết quả ---");
print("Tổng users:  " + appDb.users.countDocuments());
print("Tổng orders: " + appDb.orders.countDocuments());
print("\n--- Phân phối dữ liệu giữa các shard ---");
// getShardDistribution() không tự in khi chạy bằng file, nên dùng $collStats (mongos trả về 1 dòng/shard)
appDb.orders.aggregate([
  { $collStats: { storageStats: {} } },
  { $project: { _id: 0, shard: 1, docs: "$storageStats.count", sizeBytes: "$storageStats.size" } }
]).forEach(s => printjson(s));
