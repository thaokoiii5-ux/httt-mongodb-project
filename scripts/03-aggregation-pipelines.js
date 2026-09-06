// ============================================================
// 03-aggregation-pipelines.js
// Mục đích: Các pipeline Aggregation phục vụ báo cáo / phân tích
//           — đây thường là phần "ăn điểm" khi demo đồ án.
// ============================================================

db = db.getSiblingDB("ecommerce_db");

// ---------------------------------------------------------------
// 1. Doanh thu theo từng category (JOIN products <-> orders.items)
// ---------------------------------------------------------------
db.orders.aggregate([
  { $unwind: "$items" },
  {
    $lookup: {
      from: "products",
      localField: "items.product_id",
      foreignField: "_id",
      as: "product_info"
    }
  },
  { $unwind: "$product_info" },
  {
    $group: {
      _id: "$product_info.category_id",
      revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
      total_items_sold: { $sum: "$items.quantity" }
    }
  },
  {
    $lookup: {
      from: "categories",
      localField: "_id",
      foreignField: "_id",
      as: "category"
    }
  },
  { $unwind: "$category" },
  {
    $project: {
      _id: 0,
      category_name: "$category.name",
      revenue: 1,
      total_items_sold: 1
    }
  },
  { $sort: { revenue: -1 } }
]);

// ---------------------------------------------------------------
// 2. Top 3 sản phẩm bán chạy nhất (theo số lượng)
// ---------------------------------------------------------------
db.orders.aggregate([
  { $unwind: "$items" },
  {
    $group: {
      _id: "$items.name",
      total_quantity: { $sum: "$items.quantity" },
      total_revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
    }
  },
  { $sort: { total_quantity: -1 } },
  { $limit: 3 }
]);

// ---------------------------------------------------------------
// 3. Tổng chi tiêu theo từng khách hàng (JOIN orders <-> users)
// ---------------------------------------------------------------
db.orders.aggregate([
  { $match: { status: { $ne: "cancelled" } } },
  {
    $group: {
      _id: "$user_id",
      total_spent: { $sum: "$total" },
      order_count: { $sum: 1 }
    }
  },
  {
    $lookup: {
      from: "users",
      localField: "_id",
      foreignField: "_id",
      as: "user"
    }
  },
  { $unwind: "$user" },
  {
    $project: {
      _id: 0,
      customer_name: "$user.name",
      email: "$user.email",
      total_spent: 1,
      order_count: 1
    }
  },
  { $sort: { total_spent: -1 } }
]);

// ---------------------------------------------------------------
// 4. Doanh thu theo tháng (rất hay dùng cho báo cáo)
// ---------------------------------------------------------------
db.orders.aggregate([
  { $match: { status: "completed" } },
  {
    $group: {
      _id: {
        year: { $year: "$created_at" },
        month: { $month: "$created_at" }
      },
      revenue: { $sum: "$total" },
      order_count: { $sum: 1 }
    }
  },
  { $sort: { "_id.year": 1, "_id.month": 1 } }
]);

// ---------------------------------------------------------------
// 5. Sản phẩm sắp hết hàng (stock thấp) — hữu ích cho vận hành
// ---------------------------------------------------------------
db.products.aggregate([
  { $match: { stock: { $lte: 20 } } },
  { $project: { name: 1, stock: 1, price: 1, _id: 0 } },
  { $sort: { stock: 1 } }
]);

// ---------------------------------------------------------------
// 6. Đếm số đơn hàng theo trạng thái (dashboard tổng quan)
// ---------------------------------------------------------------
db.orders.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]);

print("✅ Đã chạy xong các pipeline aggregation minh họa.");
