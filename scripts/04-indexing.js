// ============================================================
// 04-indexing.js
// Tuần 3: Indexing & Query Performance
// Mục tiêu:
//   - So sánh hiệu năng truy vấn trước/sau khi tạo index
//   - Tạo Single Field Index, Compound Index, Text Index
//   - Ghi lại executionStats để đối chiếu trong báo cáo
//
// Cách chạy (interactive, khuyến nghị để xem từng bước):
//   docker exec -it mongo-single mongosh -u admin -p admin123 --authenticationDatabase admin
//   use ecommerce_db
//   load("04-indexing.js")
// ============================================================

use("ecommerce_db");

print("\n========== BƯỚC 1: Single Field Index (products.category_id) ==========\n");

// Lấy 1 category_id có thật để test
const sampleCategory = db.categories.findOne();
print("Category mẫu dùng để test: " + sampleCategory.name + " (" + sampleCategory._id + ")");

print("\n--- 1.1. Trước khi có index (baseline) ---");
const before1 = db.products.find({ category_id: sampleCategory._id }).explain("executionStats");
printjson({
  stage: before1.queryPlanner.winningPlan.stage,
  totalDocsExamined: before1.executionStats.totalDocsExamined,
  totalKeysExamined: before1.executionStats.totalKeysExamined,
  nReturned: before1.executionStats.nReturned
});

print("\n--- 1.2. Tạo index ---");
const idx1 = db.products.createIndex({ category_id: 1 });
print("Đã tạo index: " + idx1);

print("\n--- 1.3. Sau khi có index ---");
const after1 = db.products.find({ category_id: sampleCategory._id }).explain("executionStats");
printjson({
  stage: after1.queryPlanner.winningPlan.stage,
  totalDocsExamined: after1.executionStats.totalDocsExamined,
  totalKeysExamined: after1.executionStats.totalKeysExamined,
  nReturned: after1.executionStats.nReturned
});

print("\n=> Nhận xét: COLLSCAN (quét toàn bộ collection) chuyển thành FETCH + IXSCAN");
print("   (tra thẳng vào index B-tree), giảm số document phải kiểm tra.");


print("\n========== BƯỚC 2: Compound Index (orders.user_id + order_date) ==========\n");

const sampleUser = db.users.findOne();
print("User mẫu dùng để test: " + sampleUser.name + " (" + sampleUser._id + ")");

print("\n--- 2.1. Trước khi có index (baseline) ---");
const before2 = db.orders.find({ user_id: sampleUser._id }).explain("executionStats");
printjson({
  stage: before2.queryPlanner.winningPlan.stage,
  totalDocsExamined: before2.executionStats.totalDocsExamined,
  totalKeysExamined: before2.executionStats.totalKeysExamined,
  nReturned: before2.executionStats.nReturned
});

print("\n--- 2.2. Tạo compound index ---");
// Compound index { user_id: 1, order_date: -1 } phục vụ đồng thời:
//   - Query lọc theo user_id
//   - Query lọc theo user_id + sort theo order_date (nhờ nguyên tắc prefix)
const idx2 = db.orders.createIndex({ user_id: 1, order_date: -1 });
print("Đã tạo index: " + idx2);

print("\n--- 2.3. Sau khi có index - chỉ lọc theo user_id ---");
const after2a = db.orders.find({ user_id: sampleUser._id }).explain("executionStats");
printjson({
  stage: after2a.queryPlanner.winningPlan.stage,
  totalDocsExamined: after2a.executionStats.totalDocsExamined,
  totalKeysExamined: after2a.executionStats.totalKeysExamined,
  nReturned: after2a.executionStats.nReturned
});

print("\n--- 2.4. Sau khi có index - lọc theo user_id + sort order_date ---");
const after2b = db.orders.find({ user_id: sampleUser._id })
  .sort({ order_date: -1 })
  .explain("executionStats");
printjson({
  stage: after2b.queryPlanner.winningPlan.stage,
  totalDocsExamined: after2b.executionStats.totalDocsExamined,
  totalKeysExamined: after2b.executionStats.totalKeysExamined,
  nReturned: after2b.executionStats.nReturned
});

print("\n=> Nhận xét: Compound index phục vụ được cả 2 loại truy vấn (nguyên tắc prefix).");
print("   Khi sort trùng thứ tự index, MongoDB không cần thêm bước SORT trong bộ nhớ.");


print("\n========== BƯỚC 3: Text Index (products.name) ==========\n");

print("--- 3.1. Trước khi có text index: dùng $regex (baseline) ---");
const before3 = db.products.find({ name: { $regex: "air", $options: "i" } }).explain("executionStats");
printjson({
  stage: before3.queryPlanner.winningPlan.stage,
  totalDocsExamined: before3.executionStats.totalDocsExamined,
  totalKeysExamined: before3.executionStats.totalKeysExamined,
  nReturned: before3.executionStats.nReturned
});

print("\n--- 3.2. Tạo text index ---");
const idx3 = db.products.createIndex({ name: "text" });
print("Đã tạo index: " + idx3);

print("\n--- 3.3. Sau khi có text index: dùng $text ---");
const after3 = db.products.find({ $text: { $search: "Air" } }).explain("executionStats");
printjson({
  stage: after3.queryPlanner.winningPlan.stage,
  totalDocsExamined: after3.executionStats.totalDocsExamined,
  totalKeysExamined: after3.executionStats.totalKeysExamined,
  nReturned: after3.executionStats.nReturned
});

print("\n=> Nhận xét: $regex tìm theo substring (khớp cả 'AirPods'),");
print("   trong khi $text tìm theo từ hoàn chỉnh (whole-word, có stemming),");
print("   nên chỉ khớp 'MacBook Air M2', không khớp 'Tai nghe AirPods'.");
print("   => Chọn loại index tùy theo nhu cầu tìm kiếm thực tế của hệ thống.");


print("\n========== BƯỚC 4: Liệt kê toàn bộ index hiện có ==========\n");

print("--- Indexes của collection 'products' ---");
db.products.getIndexes().forEach(idx => printjson(idx));

print("\n--- Indexes của collection 'orders' ---");
db.orders.getIndexes().forEach(idx => printjson(idx));

print("\n========== HOÀN TẤT 04-indexing.js ==========\n");
