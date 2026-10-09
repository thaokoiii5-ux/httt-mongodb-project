// ============================================================
// 05-sharding-seed.js
// Tuần 5: Sharding - seed dữ liệu lớn để quan sát phân phối chunk
//
// Chạy trên mongos (port 27020 ở host, container mongo-router):
//   docker cp 05-sharding-seed.js mongo-router:/tmp/
//   docker exec -it mongo-router mongosh -u admin -p admin123 \
//     --authenticationDatabase admin /tmp/05-sharding-seed.js
//
// Script có thể chạy lại nhiều lần (xóa dữ liệu cũ trước khi chèn).
// ============================================================

const appDb = db.getSiblingDB("ecommerce_db");

const USER_COUNT = 1000;
const ORDER_BATCHES = 20;
const BATCH_SIZE = 1000;

print("\n--- Xóa dữ liệu cũ ---");
appDb.users.deleteMany({});
appDb.orders.deleteMany({});

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
const statuses = ["pending", "paid", "shipped", "delivered", "cancelled"];
for (let b = 0; b < ORDER_BATCHES; b++) {
  const batch = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const quantity = 1 + Math.floor(Math.random() * 3);
    const price = 100000 * (1 + Math.floor(Math.random() * 50));
    batch.push({
      user_id: userIds[Math.floor(Math.random() * userIds.length)],
      order_date: new Date(Date.now() - Math.floor(Math.random() * 180) * 86400000),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      items: [{
        name: "Sản phẩm " + Math.floor(Math.random() * 100),
        price: price,
        quantity: quantity
      }],
      total_amount: price * quantity
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
