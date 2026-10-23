'use strict';

// demo-app/server.js
// API demo cho hệ thống MongoDB e-commerce (replica set rs0).
//  - Danh mục sản phẩm đọc từ Secondary (secondaryPreferred): vẫn phục vụ được
//    khi Primary đang được bầu lại.
//  - Đơn hàng đọc/ghi trên Primary; tạo đơn dùng transaction (trừ kho và ghi đơn
//    cùng thành công hoặc cùng thất bại).
//  - Kết nối bằng app_user (quyền readWrite trên ecommerce_db), không dùng admin.

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const PORT = Number(process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Thiếu biến môi trường MONGO_URI');
  process.exit(1);
}

const client = new MongoClient(MONGO_URI, {
  serverSelectionTimeoutMS: 15000, // chờ tối đa 15s để cụm bầu Primary mới
  writeConcern: { w: 'majority' }
});
let db;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const OID_RE = /^[0-9a-fA-F]{24}$/;

function toObjectId(value, field) {
  if (typeof value !== 'string' || !OID_RE.test(value)) {
    throw new HttpError(400, `${field} không phải ObjectId hợp lệ`);
  }
  return new ObjectId(value);
}

function parseLimit(raw) {
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 20;
}

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const app = express();
app.use(express.json({ limit: '100kb' }));

// Cho biết node nào trả lời và Primary hiện tại là node nào
app.get('/health', wrap(async (req, res) => {
  const h = await db.command({ hello: 1 });
  res.json({
    ok: true,
    answeredBy: h.me,
    primary: h.primary,
    setName: h.setName,
    time: new Date().toISOString()
  });
}));

// Danh sách / tìm kiếm sản phẩm (text index tuần 3: tìm theo từ hoàn chỉnh)
app.get('/products', wrap(async (req, res) => {
  const filter = req.query.q ? { $text: { $search: String(req.query.q) } } : {};
  const docs = await db.collection('products')
    .find(filter, {
      readPreference: 'secondaryPreferred',
      projection: { name: 1, price: 1, category_id: 1, stock: 1 }
    })
    .limit(parseLimit(req.query.limit))
    .toArray();
  res.json(docs);
}));

app.get('/products/:id', wrap(async (req, res) => {
  const product = await db.collection('products').findOne(
    { _id: toObjectId(req.params.id, 'id') },
    { readPreference: 'secondaryPreferred' }
  );
  if (!product) throw new HttpError(404, 'Không tìm thấy sản phẩm');
  res.json(product);
}));

// Đơn hàng của một user, mới nhất trước (dùng index { user_id: 1, created_at: -1 })
app.get('/users/:userId/orders', wrap(async (req, res) => {
  const docs = await db.collection('orders')
    .find({ user_id: toObjectId(req.params.userId, 'userId') })
    .sort({ created_at: -1 })
    .limit(parseLimit(req.query.limit))
    .toArray();
  res.json(docs);
}));

// Tạo đơn hàng: giá và tên sản phẩm lấy từ database, không tin dữ liệu client gửi
app.post('/orders', wrap(async (req, res) => {
  const body = req.body || {};
  const userId = toObjectId(body.user_id, 'user_id');
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) {
    throw new HttpError(400, 'items phải là mảng gồm 1-20 phần tử');
  }
  const wanted = body.items.map((it, i) => {
    if (!it || typeof it !== 'object') throw new HttpError(400, `items[${i}] không hợp lệ`);
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 100) {
      throw new HttpError(400, `items[${i}].quantity phải là số nguyên từ 1 đến 100`);
    }
    return { productId: toObjectId(it.product_id, `items[${i}].product_id`), quantity: it.quantity };
  });

  const session = client.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      const user = await db.collection('users')
        .findOne({ _id: userId }, { session, projection: { _id: 1 } });
      if (!user) throw new HttpError(404, 'Không tìm thấy user');

      const items = [];
      let total = 0;
      for (const w of wanted) {
        // Chỉ trừ kho khi còn đủ hàng; nếu không, transaction bị hủy
        const p = await db.collection('products').findOneAndUpdate(
          { _id: w.productId, stock: { $gte: w.quantity } },
          { $inc: { stock: -w.quantity } },
          { session, returnDocument: 'before', projection: { name: 1, price: 1 } }
        );
        if (!p) throw new HttpError(409, `Sản phẩm ${w.productId} không tồn tại hoặc không đủ hàng`);
        items.push({ product_id: p._id, name: p.name, price: p.price, quantity: w.quantity });
        total += p.price * w.quantity;
      }

      const doc = { user_id: userId, items, total, status: 'pending', created_at: new Date() };
      const r = await db.collection('orders').insertOne(doc, { session });
      order = { _id: r.insertedId, ...doc };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    res.status(201).json(order);
  } finally {
    await session.endSession();
  }
}));

app.use((req, res) => res.status(404).json({ error: 'Không tìm thấy' }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Body không phải JSON hợp lệ' });
  }
  if (err && err.name === 'MongoServerSelectionError') {
    return res.status(503).json({
      error: 'Chưa chọn được node MongoDB phù hợp (cụm có thể đang bầu Primary mới), thử lại sau'
    });
  }
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

async function main() {
  await client.connect();
  db = client.db(); // tên database lấy từ MONGO_URI (ecommerce_db)
  const server = app.listen(PORT, () => console.log(`API đang chạy ở cổng ${PORT}`));
  const shutdown = async () => {
    server.close();
    await client.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Không khởi động được:', err.message);
  process.exit(1);
});
