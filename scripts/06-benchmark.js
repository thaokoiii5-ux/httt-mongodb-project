// ============================================================
// 06-benchmark.js
// Tuần 6: Đo lường hiệu năng - standalone vs sharded cluster
//
// Script tự nhận biết đang chạy trên mongos (sharded) hay mongod (standalone)
// và dùng database riêng "bench_db" (không đụng tới ecommerce_db).
// Dữ liệu sinh bằng PRNG cố định seed nên mọi cụm nhận cùng một bộ dữ liệu.
//
// Chạy trên node standalone (container mongo-bench):
//   docker cp 06-benchmark.js mongo-bench:/tmp/
//   docker exec -it mongo-bench mongosh -u admin -p admin123 \
//     --authenticationDatabase admin --quiet /tmp/06-benchmark.js
//
// Chạy trên sharded cluster (container mongo-router, cần cụm đã addShard):
//   docker cp 06-benchmark.js mongo-router:/tmp/
//   docker exec -it mongo-router mongosh -u admin -p admin123 \
//     --authenticationDatabase admin --quiet /tmp/06-benchmark.js
//
// Lưu ý: cả hai cụm chạy trên cùng một máy vật lý, nên kết quả phản ánh chi phí
// và hành vi của sharding (mongos, scatter-gather) chứ không phải khả năng scale thật.
// ============================================================

const DB_NAME = "bench_db";
const USER_COUNT = 2000;
const ORDER_COUNT = 100000;
const BATCH_SIZE = 1000;
const POINT_READ_RUNS = 200;
const HEAVY_RUNS = 20;
const WARMUP_RUNS = 3;

const isSharded = db.hello().msg === "isdbgrid";
const label = isSharded ? "sharded cluster (mongos, 2 shards)" : "standalone (1 node)";
const appDb = db.getSiblingDB(DB_NAME);
const now = (typeof performance !== "undefined") ? () => performance.now() : () => Date.now();

// PRNG cố định seed (mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(x) { return Math.round(x * 100) / 100; }

function stats(samples) {
  const s = samples.slice().sort((a, b) => a - b);
  const n = s.length;
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    runs: n,
    median_ms: round2(s[Math.floor(n / 2)]),
    p95_ms: round2(s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)]),
    mean_ms: round2(sum / n),
    min_ms: round2(s[0]),
    max_ms: round2(s[n - 1])
  };
}

function bench(name, runs, fn) {
  for (let i = 0; i < WARMUP_RUNS; i++) fn(i);
  const samples = [];
  let lastResult = null;
  for (let i = 0; i < runs; i++) {
    const t0 = now();
    lastResult = fn(i);
    samples.push(now() - t0);
  }
  const r = stats(samples);
  r.result_size = lastResult;
  print("\n[" + name + "]");
  printjson(r);
  return r;
}

print("\n================================================================");
print(" BENCHMARK: " + label);
print(" Dữ liệu: " + ORDER_COUNT + " orders, " + USER_COUNT + " users");
print("================================================================");

// ---------- Chuẩn bị ----------
print("\n--- Chuẩn bị database " + DB_NAME + " ---");
appDb.dropDatabase();

if (isSharded) {
  sh.enableSharding(DB_NAME);
  sh.shardCollection(DB_NAME + ".orders", { user_id: "hashed" });
  print("Đã shard orders bằng hashed user_id");
} else {
  // Standalone: index thường trên user_id tương đương index hashed của shard key
  appDb.orders.createIndex({ user_id: 1 });
}
// Cả hai cụm đều có index trên status trước khi chèn (công bằng khi đo insert)
appDb.orders.createIndex({ status: 1 });

// Pool user_id cố định, giống hệt nhau ở mọi cụm
const userIds = [];
for (let i = 0; i < USER_COUNT; i++) {
  userIds.push(ObjectId(("000000000000000000000000" + (i + 1).toString(16)).slice(-24)));
}

// ---------- Đo ghi hàng loạt ----------
print("\n--- Đo insert hàng loạt (lô " + BATCH_SIZE + ") ---");
const rng = mulberry32(42);
const statuses = ["pending", "paid", "shipped", "delivered", "cancelled"];
const baseDate = new Date("2026-10-01T00:00:00Z").getTime();
let insertMs = 0;
for (let b = 0; b < ORDER_COUNT / BATCH_SIZE; b++) {
  const batch = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const quantity = 1 + Math.floor(rng() * 3);
    const price = 100000 * (1 + Math.floor(rng() * 50));
    batch.push({
      user_id: userIds[Math.floor(rng() * USER_COUNT)],
      order_date: new Date(baseDate - Math.floor(rng() * 180) * 86400000),
      status: statuses[Math.floor(rng() * statuses.length)],
      items: [{ name: "Sản phẩm " + Math.floor(rng() * 100), price: price, quantity: quantity }],
      total_amount: price * quantity
    });
  }
  const t0 = now();
  appDb.orders.insertMany(batch, { ordered: false });
  insertMs += now() - t0;
}
const insertResult = {
  total_docs: appDb.orders.countDocuments(),
  total_ms: round2(insertMs),
  docs_per_sec: Math.round(ORDER_COUNT / (insertMs / 1000))
};
print("\n[bulk_insert]");
printjson(insertResult);

// ---------- Đo đọc ----------
print("\n--- Đo truy vấn ---");
const rngRead = mulberry32(7);
const targets = [];
for (let i = 0; i < POINT_READ_RUNS + WARMUP_RUNS; i++) {
  targets.push(userIds[Math.floor(rngRead() * USER_COUNT)]);
}

const pointRead = bench("point_read_by_user_id (targeted)", POINT_READ_RUNS,
  i => appDb.orders.find({ user_id: targets[i] }).toArray().length);

const scatterRead = bench("filter_by_status (scatter-gather)", HEAVY_RUNS,
  () => appDb.orders.find({ status: "shipped" }, { total_amount: 1 }).toArray().length);

const aggRead = bench("aggregate_revenue_by_status", HEAVY_RUNS,
  () => appDb.orders.aggregate([
    { $group: { _id: "$status", orders: { $sum: 1 }, revenue: { $sum: "$total_amount" } } }
  ]).toArray().length);

// ---------- Tóm tắt ----------
print("\n================================================================");
print(" TÓM TẮT (" + label + ")");
print("================================================================");
printjson({
  cluster: label,
  bulk_insert_docs_per_sec: insertResult.docs_per_sec,
  point_read_median_ms: pointRead.median_ms,
  point_read_p95_ms: pointRead.p95_ms,
  scatter_filter_median_ms: scatterRead.median_ms,
  scatter_filter_p95_ms: scatterRead.p95_ms,
  aggregation_median_ms: aggRead.median_ms,
  aggregation_p95_ms: aggRead.p95_ms
});

if (isSharded) {
  print("\n--- Phân phối dữ liệu giữa các shard ---");
  appDb.orders.aggregate([
    { $collStats: { storageStats: {} } },
    { $project: { _id: 0, shard: 1, docs: "$storageStats.count", sizeBytes: "$storageStats.size" } }
  ]).forEach(s => printjson(s));
}

print("\n========== HOÀN TẤT 06-benchmark.js ==========\n");
