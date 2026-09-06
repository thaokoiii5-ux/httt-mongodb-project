// ============================================================
// 01-seed-data.js
// Mục đích: Tạo dữ liệu mẫu cho 4 collection: categories, users,
//           products, orders trong database "ecommerce_db"
//
// Cách chạy (từ máy host, MongoDB đang chạy trong Docker):
//   mongosh "mongodb://admin:<password>@localhost:27017/?authSource=admin" scripts/01-seed-data.js
//
// Hoặc chạy trực tiếp trong container:
//   docker exec -i <ten_container_mongo> mongosh -u admin -p <password> --authenticationDatabase admin < scripts/01-seed-data.js
// ============================================================

db = db.getSiblingDB("ecommerce_db");

// Xóa dữ liệu cũ để có thể chạy lại script nhiều lần mà không trùng lặp
db.categories.drop();
db.users.drop();
db.products.drop();
db.orders.drop();

// ---------- 1. CATEGORIES ----------
const catResult = db.categories.insertMany([
  { name: "Điện thoại", slug: "dien-thoai" },
  { name: "Laptop", slug: "laptop" },
  { name: "Phụ kiện", slug: "phu-kien" }
]);
const catIds = catResult.insertedIds;

// ---------- 2. USERS ----------
const userResult = db.users.insertMany([
  {
    name: "Nguyễn Văn A",
    email: "a@example.com",
    password_hash: "hashed_pw_1",
    address: { street: "123 Lê Lợi", city: "TP.HCM", country: "VN" },
    created_at: new Date()
  },
  {
    name: "Trần Thị B",
    email: "b@example.com",
    password_hash: "hashed_pw_2",
    address: { street: "45 Nguyễn Huệ", city: "Hà Nội", country: "VN" },
    created_at: new Date()
  },
  {
    name: "Lê Văn C",
    email: "c@example.com",
    password_hash: "hashed_pw_3",
    address: { street: "9 Trần Phú", city: "Đà Nẵng", country: "VN" },
    created_at: new Date()
  }
]);
const userIds = userResult.insertedIds;

// ---------- 3. PRODUCTS ----------
const productResult = db.products.insertMany([
  {
    name: "iPhone 15",
    price: 22000000,
    category_id: catIds[0],
    stock: 50,
    description: "Điện thoại flagship",
    ratings: [{ user: "A", star: 5 }, { user: "B", star: 4 }]
  },
  {
    name: "Samsung Galaxy S24",
    price: 19000000,
    category_id: catIds[0],
    stock: 40,
    description: "Android flagship",
    ratings: [{ user: "C", star: 4 }]
  },
  {
    name: "MacBook Air M2",
    price: 28000000,
    category_id: catIds[1],
    stock: 20,
    description: "Laptop mỏng nhẹ",
    ratings: [{ user: "A", star: 5 }]
  },
  {
    name: "Dell XPS 13",
    price: 25000000,
    category_id: catIds[1],
    stock: 15,
    description: "Laptop văn phòng cao cấp",
    ratings: []
  },
  {
    name: "Tai nghe AirPods",
    price: 4500000,
    category_id: catIds[2],
    stock: 100,
    description: "Tai nghe không dây",
    ratings: []
  }
]);
const productIds = productResult.insertedIds;

// ---------- 4. ORDERS ----------
db.orders.insertMany([
  {
    user_id: userIds[0],
    items: [
      { product_id: productIds[0], name: "iPhone 15", price: 22000000, quantity: 1 },
      { product_id: productIds[4], name: "Tai nghe AirPods", price: 4500000, quantity: 2 }
    ],
    total: 22000000 + 4500000 * 2,
    status: "completed",
    created_at: new Date("2026-08-15")
  },
  {
    user_id: userIds[1],
    items: [
      { product_id: productIds[2], name: "MacBook Air M2", price: 28000000, quantity: 1 }
    ],
    total: 28000000,
    status: "pending",
    created_at: new Date("2026-08-20")
  },
  {
    user_id: userIds[2],
    items: [
      { product_id: productIds[1], name: "Samsung Galaxy S24", price: 19000000, quantity: 1 },
      { product_id: productIds[3], name: "Dell XPS 13", price: 25000000, quantity: 1 }
    ],
    total: 19000000 + 25000000,
    status: "completed",
    created_at: new Date("2026-09-01")
  },
  {
    user_id: userIds[0],
    items: [
      { product_id: productIds[4], name: "Tai nghe AirPods", price: 4500000, quantity: 1 }
    ],
    total: 4500000,
    status: "cancelled",
    created_at: new Date("2026-09-03")
  }
]);

print("✅ Đã seed xong: " + db.categories.countDocuments() + " categories, "
  + db.users.countDocuments() + " users, "
  + db.products.countDocuments() + " products, "
  + db.orders.countDocuments() + " orders.");
