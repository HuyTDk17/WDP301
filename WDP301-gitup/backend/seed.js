/**
 * Script tạo tài khoản quản trị đầu tiên cho môi trường thật.
 *
 * Trước khi chạy, cấu hình trong .env:
 *   ADMIN_NAME=
 *   ADMIN_EMAIL=
 *   ADMIN_PASSWORD=
 *   ADMIN_PHONE=
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');

const seed = async () => {
    await connectDB();

    const name = process.env.ADMIN_NAME || 'Quản trị viên';
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const phone = process.env.ADMIN_PHONE || '';

    if (!email || !password) {
        throw new Error('Vui lòng cấu hình ADMIN_EMAIL và ADMIN_PASSWORD trong .env trước khi chạy seed.');
    }
    if (password.length < 8) {
        throw new Error('ADMIN_PASSWORD cần có ít nhất 8 ký tự.');
    }

    const existing = await User.findOne({ email });
    if (existing) {
        console.log(`Tài khoản ${email} đã tồn tại. Không tạo mới.`);
    } else {
        await User.create({ name, email, password, phone, role: 'admin', status: 'active' });
        console.log(`Đã tạo tài khoản quản trị: ${email}`);
    }

    await mongoose.connection.close();
    process.exit(0);
};

seed().catch((err) => {
    console.error('Lỗi khi tạo tài khoản quản trị:', err);
    process.exit(1);
});
