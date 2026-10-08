// Seed tài khoản admin (dataset không có admin).
// Chạy: npm run seed:admin  (yêu cầu MONGODB_URI + ADMIN_* trong .env).
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const NAME = process.env.ADMIN_NAME || 'Quản Trị Viên';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@e360sport.vn';
const PHONE = process.env.ADMIN_PHONE || '0900000001';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const User = mongoose.model(
    'User',
    new mongoose.Schema({}, { strict: false }),
    'users'
  );

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const existing = await User.findOne({ email: EMAIL });
  if (existing) {
    await User.updateOne({ _id: existing._id }, { $set: { role: 'admin', status: 'active' } });
    console.log(`✅ Admin đã tồn tại (đã cập nhật role=admin): ${EMAIL}`);
  } else {
    await User.create({
      name: NAME,
      email: EMAIL,
      phone: PHONE,
      password: passwordHash,
      role: 'admin',
      authProvider: 'local',
      status: 'active',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`✅ Đã tạo admin: ${EMAIL} / ${PASSWORD}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Lỗi seed admin:', e);
  process.exit(1);
});
