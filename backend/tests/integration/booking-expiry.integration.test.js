/**
 * KIỂM THỬ: TÁC VỤ NỀN HUỶ ĐƠN QUÁ HẠN THANH TOÁN.
 *
 * Trọng tâm là quy tắc quan trọng nhất được thêm khi đổi sang chuyển khoản
 * ngân hàng: một đơn mà khách đã bấm "Tôi đã chuyển khoản" (Payment ở trạng
 * thái 'awaiting_confirmation') KHÔNG ĐƯỢC tự huỷ, dù đã quá cửa sổ thời gian
 * — vì tiền có thể đã thực sự về, chỉ là quản trị viên chưa kịp xác nhận. Đây
 * là loại lỗi kiểm thử đơn vị không bắt được vì nó cần Payment + Booking thật
 * tồn tại đồng thời trong CSDL và một tác vụ đọc cả hai.
 */
const assert = require('assert');
const { connect, disconnect, test, summary, makeUser, makeVenueWithCourt, futureSlot } = require('./_helpers');
const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const User = require('../../models/User');
const jobs = require('../../jobs/index');
const credit = require('../../utils/credit');

async function main() {
    await connect();
    const owner = await makeUser({ role: 'owner' });
    const { venue, court } = await makeVenueWithCourt({ ownerId: owner._id });

    // Đơn "cũ" giả lập bằng cách lùi createdAt bằng thao tác CSDL trực tiếp —
    // Mongoose không cho set createdAt lúc create() vì có option timestamps.
    async function ageBooking(bookingId, minutesAgo) {
        await Booking.updateOne(
            { _id: bookingId },
            { createdAt: new Date(Date.now() - minutesAgo * 60 * 1000) }
        );
    }

    await test('EXP-01 · Đơn quá hạn, khách CHƯA từng báo đã chuyển khoản → tự huỷ', async () => {
        const customer = await makeUser({ creditBalance: 0 });
        const { date, startTime, endTime } = futureSlot(72);
        const booking = await Booking.create({
            customerId: customer._id, venueId: venue._id, courtId: court._id,
            venueName: venue.name, courtName: court.name,
            date, startTime, endTime, duration: 1,
            amount: 200000, serviceFee: 10000, status: 'awaiting_payment',
        });
        await ageBooking(booking._id, 40); // mặc định cửa sổ là 30 phút

        await jobs.expireStaleBookings();

        const after = await Booking.findById(booking._id);
        assert.strictEqual(after.status, 'cancelled', 'Đơn quá hạn không báo gì phải tự huỷ');
        assert.strictEqual(after.cancellationReason, 'Quá hạn thanh toán');
    });

    await test('EXP-02 · Đơn quá hạn nhưng khách ĐÃ báo "đã chuyển khoản" → KHÔNG được tự huỷ', async () => {
        const customer = await makeUser({ creditBalance: 0 });
        const { date, startTime, endTime } = futureSlot(73);
        const booking = await Booking.create({
            customerId: customer._id, venueId: venue._id, courtId: court._id,
            venueName: venue.name, courtName: court.name,
            date, startTime, endTime, duration: 1,
            amount: 200000, serviceFee: 10000, status: 'awaiting_payment',
        });
        await Payment.create({
            bookingId: booking._id, purpose: 'booking', method: 'bank_transfer',
            amount: 210000, orderRef: `TEST${booking._id}`, status: 'awaiting_confirmation',
            customerMarkedPaidAt: new Date(),
        });
        await ageBooking(booking._id, 90); // quá hạn rất lâu — vẫn không được huỷ

        await jobs.expireStaleBookings();

        const after = await Booking.findById(booking._id);
        assert.strictEqual(
            after.status, 'awaiting_payment',
            'Đơn đang chờ quản trị viên xác nhận chuyển khoản không được tự huỷ dù quá hạn rất lâu'
        );
    });

    await test('EXP-03 · Đơn quá hạn có dùng số dư khuyến mãi → huỷ VÀ hoàn lại đúng số tiền', async () => {
        const customer = await makeUser({ creditBalance: 50000 });
        await credit.reserve(customer._id, 30000, { note: 'test giữ chỗ' }); // giả lập đã giữ chỗ 30k
        const { date, startTime, endTime } = futureSlot(74);
        const booking = await Booking.create({
            customerId: customer._id, venueId: venue._id, courtId: court._id,
            venueName: venue.name, courtName: court.name,
            date, startTime, endTime, duration: 1,
            amount: 200000, serviceFee: 10000, creditApplied: 30000, status: 'awaiting_payment',
        });
        await ageBooking(booking._id, 40);

        await jobs.expireStaleBookings();

        const afterBooking = await Booking.findById(booking._id);
        const afterUser = await User.findById(customer._id);
        assert.strictEqual(afterBooking.status, 'cancelled');
        assert.strictEqual(afterBooking.creditApplied, 0, 'creditApplied trên đơn phải về 0 sau khi hoàn');
        assert.strictEqual(afterUser.creditBalance, 50000, 'Số dư phải được trả về nguyên vẹn như trước khi giữ chỗ');
    });

    await test('EXP-04 · Đơn còn trong hạn → không bị đụng tới', async () => {
        const customer = await makeUser();
        const { date, startTime, endTime } = futureSlot(75);
        const booking = await Booking.create({
            customerId: customer._id, venueId: venue._id, courtId: court._id,
            venueName: venue.name, courtName: court.name,
            date, startTime, endTime, duration: 1,
            amount: 200000, serviceFee: 10000, status: 'awaiting_payment',
        });
        // Không lùi createdAt — đơn vừa tạo, còn trong cửa sổ 30 phút.

        await jobs.expireStaleBookings();

        const after = await Booking.findById(booking._id);
        assert.strictEqual(after.status, 'awaiting_payment', 'Đơn còn trong hạn không được đụng tới');
    });

    const ok = summary();
    await disconnect();
    process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
