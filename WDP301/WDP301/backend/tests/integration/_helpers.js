/**
 * HẠ TẦNG DÙNG CHUNG CHO KIỂM THỬ TÍCH HỢP.
 *
 * Khác với các file tests/*.test.js ở thư mục cha (kiểm thử hàm thuần, không
 * cần cơ sở dữ liệu), các file trong thư mục này BẮT BUỘC một MongoDB thật có
 * replica set — vì mục đích của chúng chính là kiểm tra những thứ chỉ CSDL
 * thật mới phơi bày được: ràng buộc duy nhất, giao dịch nguyên tử, tình huống
 * hai request chạy đồng thời.
 *
 * ============ CÁCH CHẠY ============
 *
 * 1. Cần một MongoDB có replica set. Cách nhanh nhất — một container dùng
 *    một lần, xoá sạch sau khi xong việc kiểm thử:
 *
 *      docker run -d --name sv-test-mongo -p 27018:27017 mongo:7 \
 *          mongod --replSet rs0 --bind_ip_all
 *      sleep 3
 *      docker exec sv-test-mongo mongosh --quiet --eval \
 *          "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
 *
 * 2. Chạy bộ test:
 *
 *      TEST_MONGO_URI="mongodb://localhost:27018/e360sport_test?replicaSet=rs0&directConnection=true" \
 *          npm run test:integration
 *
 * 3. Dọn dẹp:
 *
 *      docker rm -f sv-test-mongo
 *
 * Mỗi file test tự xoá sạch dữ liệu của mình lúc bắt đầu (dropDatabase) nên
 * chạy nhiều lần liên tiếp trên cùng một Mongo không tích luỹ rác.
 *
 * ⚠️ LƯU Ý QUAN TRỌNG: bộ test này được viết cẩn thận và bám sát đúng các hàm
 * thật trong controllers/services (xem cách mỗi file import và gọi thẳng
 * paymentController, transferService...), nhưng CHƯA TỪNG được chạy thử ở môi
 * trường tạo ra nó — nơi đó không có MongoDB và không có quyền tải về. Rất có
 * thể lần chạy đầu tiên trên máy bạn sẽ lộ ra một vài lỗi cú pháp nhỏ hoặc lệch
 * tên trường. Đây vẫn là công cụ tốt hơn nhiều so với việc không có kiểm thử
 * tích hợp nào, nhưng đừng coi một lần chạy xanh là bằng chứng tuyệt đối —
 * đọc qua assertion của từng test để hiểu nó đang kiểm tra điều gì.
 */

const mongoose = require('mongoose');

const DEFAULT_URI = 'mongodb://localhost:27017/e360sport_test?replicaSet=rs0&directConnection=true';

async function connect() {
    const uri = process.env.TEST_MONGO_URI || DEFAULT_URI;
    await mongoose.connect(uri);
    await mongoose.connection.dropDatabase();
    return mongoose.connection;
}

async function disconnect() {
    await mongoose.connection.close();
}

// ============================================================
// BỘ ĐẾM / KHẲNG ĐỊNH TỐI GIẢN — cùng phong cách với tests/*.test.js ở thư
// mục cha, không kéo thêm Jest/Mocha làm phụ thuộc mới.
// ============================================================
let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed += 1;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    ${err.message}`);
        failed += 1;
    }
}

function summary() {
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    return failed === 0;
}

// ============================================================
// GIẢ LẬP req/res CỦA EXPRESS — để gọi thẳng các hàm controller (đã bọc
// asyncHandler) mà không cần dựng cả server HTTP.
//
// asyncHandler chỉ làm `Promise.resolve(fn(...)).catch(next)` — bản thân nó
// KHÔNG trả về promise của fn, nên `await handler(...)` không đợi được việc gì
// cả. call() ở đây bọc một Promise riêng, resolve khi res.json()/res.end()
// được gọi, reject khi next(err) được gọi — mô phỏng đúng cách Express vận
// hành vòng đời một request.
// ============================================================
function call(handler, { params = {}, body = {}, query = {}, user = null, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const res = { statusCode: 200 };
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => { res.body = data; resolve(res); return res; };
        res.end = () => resolve(res);
        const req = { params, body, query, user, headers };
        const next = (err) => { if (err) reject(err); };
        Promise.resolve(handler(req, res, next)).catch(reject);
    });
}

// ============================================================
// SEED — dựng nhanh dữ liệu tối thiểu cho một kịch bản.
// ============================================================
const User = require('../../models/User');
const Venue = require('../../models/Venue');
const Court = require('../../models/Court');
const Booking = require('../../models/Booking');
const { calculateAmount, durationHours, toLocalDateString, toLocalTimeString } = require('../../utils/timeSlots');

let counter = 0;
const uniq = (prefix) => `${prefix}${Date.now().toString(36)}${(counter += 1)}`;

async function makeUser(overrides = {}) {
    return User.create({
        name: overrides.name || 'Người dùng test',
        email: overrides.email || `${uniq('user')}@test.local`,
        password: 'password123',
        phone: overrides.phone || '0900000000',
        role: overrides.role || 'customer',
        status: 'active',
        ...overrides,
    });
}

async function makeVenueWithCourt({ ownerId, pricePerHour = 200000, transferRequiresApproval = false } = {}) {
    const venue = await Venue.create({
        ownerId, name: `Sân test ${uniq('v')}`, status: 'approved', isActive: true,
        transferRequiresApproval,
        address: { street: '1 Test', district: 'Q1', city: 'HCM' },
    });
    const court = await Court.create({
        venueId: venue._id, name: 'Sân 1', type: 'football', pricePerHour, status: 'active',
    });
    return { venue, court };
}

/**
 * Trả về { date, startTime, endTime } cho một khung giờ bắt đầu sau đúng
 * `hoursFromNow` tiếng, kéo dài `durationHrs` tiếng — tính theo đúng múi giờ
 * mà timeSlots.js dùng (APP_TZ_OFFSET_MINUTES), không phải giờ hệ điều hành.
 */
function futureSlot(hoursFromNow, durationHrs = 1) {
    const startMs = Date.now() + hoursFromNow * 3600 * 1000;
    const start = new Date(startMs + require('../../utils/timeSlots').TZ_OFFSET_MINUTES * 60 * 1000);
    const date = start.toISOString().slice(0, 10);
    const startTime = start.toISOString().slice(11, 16);
    const endMs = startMs + durationHrs * 3600 * 1000;
    const end = new Date(endMs + require('../../utils/timeSlots').TZ_OFFSET_MINUTES * 60 * 1000);
    const endTime = end.toISOString().slice(11, 16);
    return { date, startTime, endTime };
}

async function makeConfirmedBooking({ customer, venue, court, hoursFromNow = 72, durationHrs = 1 }) {
    const { date, startTime, endTime } = futureSlot(hoursFromNow, durationHrs);
    const amount = calculateAmount(court.pricePerHour, startTime, endTime);
    const serviceFee = Math.round(amount * 0.05);
    const gross = amount + serviceFee;
    const booking = await Booking.create({
        customerId: customer._id,
        venueId: venue._id, courtId: court._id,
        venueName: venue.name, courtName: court.name,
        date, startTime, endTime, duration: durationHours(startTime, endTime),
        amount, serviceFee, status: 'confirmed', paymentMethod: 'bank_transfer',
        originalPaidAmount: gross,
    });
    await require('../../utils/slotLock').acquire({ courtId: court._id, date, startTime, endTime, bookingId: booking._id });
    return booking;
}

module.exports = {
    connect, disconnect, test, summary, call,
    makeUser, makeVenueWithCourt, makeConfirmedBooking, futureSlot, uniq,
};
