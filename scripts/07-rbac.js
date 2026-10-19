// ============================================================
// 07-rbac.js
// Tuần 7: Phân quyền (RBAC) theo nguyên tắc quyền tối thiểu
//
// Tạo 2 user trên replica set rs0 (database xác thực: ecommerce_db):
//   - app_user    : readWrite trên ecommerce_db (dành cho ứng dụng)
//   - report_user : read trên ecommerce_db (dành cho báo cáo, chỉ đọc)
// Sau đó tự kiểm tra các thao tác được phép và bị chặn.
//
// Script kết nối bằng connection string replica set nên tự tìm Primary,
// chạy lại nhiều lần không bị lỗi (chỉ tạo user nếu chưa có).
// Mật khẩu dưới đây chỉ dùng cho môi trường lab, không dùng cho production.
//
// Cách chạy (cụm rs0 phải đang chạy):
//   docker cp 07-rbac.js mongo-node2:/tmp/
//   docker exec -it mongo-node2 mongosh --quiet /tmp/07-rbac.js
// ============================================================

const HOSTS = "mongo-single:27017,mongo-node2:27017,mongo-node3:27017";
const RS = "replicaSet=rs0";
const APP_DB = "ecommerce_db";

function connect(user, pwd, authDb) {
  return new Mongo("mongodb://" + user + ":" + pwd + "@" + HOSTS + "/?" + RS + "&authSource=" + authDb);
}

// ---------- Bước 1: tạo user (bằng tài khoản admin) ----------
print("\n========== BƯỚC 1: Tạo user ==========\n");
const adminConn = connect("admin", "admin123", "admin");
const appDbAdmin = adminConn.getDB(APP_DB);

function ensureUser(name, pwd, role) {
  if (appDbAdmin.getUser(name)) {
    print("User '" + name + "' đã tồn tại, bỏ qua.");
    return;
  }
  appDbAdmin.createUser({ user: name, pwd: pwd, roles: [{ role: role, db: APP_DB }] });
  print("Đã tạo user '" + name + "' với role " + role + " trên " + APP_DB);
}

ensureUser("app_user", "app123", "readWrite");
ensureUser("report_user", "report123", "read");

// ---------- Bước 2: kiểm tra phân quyền ----------
let passed = 0;
let failed = 0;

function expectAllowed(label, fn) {
  try {
    fn();
    print("  PASS  " + label + " -> được phép");
    passed++;
  } catch (e) {
    print("  FAIL  " + label + " -> bị chặn ngoài dự kiến: " + e.message);
    failed++;
  }
}

function expectDenied(label, fn) {
  try {
    fn();
    print("  FAIL  " + label + " -> lẽ ra phải bị chặn");
    failed++;
  } catch (e) {
    if (e.codeName === "Unauthorized") {
      print("  PASS  " + label + " -> bị chặn (Unauthorized)");
      passed++;
    } else {
      print("  FAIL  " + label + " -> lỗi khác dự kiến: " + e.message);
      failed++;
    }
  }
}

print("\n========== BƯỚC 2a: report_user (chỉ đọc) ==========\n");
const reportConn = connect("report_user", "report123", APP_DB);
const reportDb = reportConn.getDB(APP_DB);
expectAllowed("report_user đọc products", () => reportDb.products.countDocuments());
expectDenied("report_user ghi vào products", () => reportDb.products.insertOne({ name: "rbac-test-doc" }));

print("\n========== BƯỚC 2b: app_user (đọc/ghi trong ecommerce_db) ==========\n");
const appConn = connect("app_user", "app123", APP_DB);
const appDb = appConn.getDB(APP_DB);
expectAllowed("app_user ghi vào products", () => appDb.products.insertOne({ name: "rbac-test-doc", price: 1 }));
expectAllowed("app_user xóa bản ghi thử", () => appDb.products.deleteOne({ name: "rbac-test-doc" }));
expectDenied("app_user ghi vào database khác (other_db)", () => appConn.getDB("other_db").test.insertOne({ x: 1 }));
expectDenied("app_user đọc admin.system.users", () => appConn.getDB("admin").system.users.find().toArray());

print("\n========== KẾT QUẢ: " + passed + " PASS, " + failed + " FAIL ==========\n");
