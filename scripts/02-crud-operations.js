// ============================================================
// 02-crud-operations.js
// Mục đích: Minh họa Create - Read - Update - Delete trên 4 collection
// Chạy từng phần trong mongosh (copy-paste) hoặc chạy cả file.
// ============================================================

db = db.getSiblingDB("ecommerce_db");

// ============ CREATE ============

// Thêm 1 category mới
db.categories.insertOne({ name: "Đồng hồ thông minh", slug: "dong-ho-thong-minh" });

// Thêm 1 sản phẩm mới, tham chiếu tới category vừa tạo
const newCat = db.categories.findOne({ slug: "dong-ho-thong-minh" });
db.products.insertOne({
  name: "Apple Watch Series 10",
  price: 11000000,
  category_id: newCat._id,
  stock: 30,
  description: "Đồng hồ thông minh",
  ratings: []
});

// ============ READ ============

// Lấy tất cả sản phẩm thuộc 1 category, sắp xếp theo giá giảm dần
db.products.find({ category_id: newCat._id }).sort({ price: -1 });

// Lấy sản phẩm có giá trong khoảng, kèm projection (chỉ lấy vài field)
db.products.find(
  { price: { $gte: 10000000, $lte: 25000000 } },
  { name: 1, price: 1, _id: 0 }
);

// Tìm user theo email (thường dùng cho đăng nhập)
db.users.findOne({ email: "a@example.com" });

// Lấy đơn hàng của 1 user, mới nhất trước
const someUser = db.users.findOne({ email: "a@example.com" });
db.orders.find({ user_id: someUser._id }).sort({ created_at: -1 });

// Đếm số đơn hàng theo trạng thái
db.orders.countDocuments({ status: "completed" });

// ============ UPDATE ============

// Cập nhật giá 1 sản phẩm
db.products.updateOne(
  { name: "Apple Watch Series 10" },
  { $set: { price: 10500000 } }
);

// Giảm stock khi có đơn hàng mới (atomic decrement)
db.products.updateOne(
  { name: "Apple Watch Series 10" },
  { $inc: { stock: -1 } }
);

// Cập nhật trạng thái đơn hàng
db.orders.updateOne(
  { user_id: someUser._id, status: "pending" },
  { $set: { status: "completed" } }
);

// Thêm 1 rating mới vào mảng ratings (embedded array) của sản phẩm
db.products.updateOne(
  { name: "iPhone 15" },
  { $push: { ratings: { user: "C", star: 5 } } }
);

// Update nhiều document cùng lúc: tăng giá 5% cho cả category "Laptop"
const laptopCat = db.categories.findOne({ slug: "laptop" });
db.products.updateMany(
  { category_id: laptopCat._id },
  { $mul: { price: 1.05 } }
);

// ============ DELETE ============

// Xóa 1 sản phẩm cụ thể
db.products.deleteOne({ name: "Apple Watch Series 10" });

// Xóa category vừa tạo (dọn dẹp demo)
db.categories.deleteOne({ slug: "dong-ho-thong-minh" });

// Xóa các đơn hàng đã bị hủy quá lâu (ví dụ minh họa xóa theo điều kiện)
db.orders.deleteMany({ status: "cancelled" });

print("✅ Đã chạy xong các thao tác CRUD minh họa.");
