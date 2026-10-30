/**
 * KIỂM THỬ: LUỒNG CHUYỂN SÂN ĐẦY ĐỦ, TỪ BÁO GIÁ ĐẾN THỰC THI.
 *
 * Đây là bài test giá trị nhất trong bộ này — nó gọi ĐÚNG các hàm controller
 * thật (transferController.createQuote, .confirm, paymentController.
 * confirmBankTransfer) thay vì gọi thẳng service, nên kiểm tra được cả lớp xử
 * lý HTTP (kiểm tra quyền, định dạng phản hồi) chứ không chỉ nghiệp vụ thuần.
 *
 * Kịch bản 1 (T4 — phải trả thêm tiền) đi thẳng vào đúng chỗ vừa được vá: khi
 * tạo hướng dẫn chuyển khoản, hạn giữ chỗ khung giờ ĐÍCH (Hold) phải được nới
 * theo đúng cửa sổ chờ chuyển khoản — nếu quên bước đó (lỗi đã có trước khi
 * vá), Hold hết hạn sớm hơn hẳn so với thời gian khách còn được phép chuyển
 * khoản, và một người khác có thể chen vào đặt mất đúng khung giờ đó.
 */
const assert = require('assert');
const {
    connect, disconnect, test, summary, call,
    makeUser, makeVenueWithCourt, makeConfirmedBooking, futureSlot,
} = require('./_helpers');

const Booking = require('../../models/Booking');
const Hold = require('../../models/Hold');
const Payment = require('../../models/Payment');
const LedgerEntry = require('../../models/LedgerEntry');
const TransferRequest = require('../../models/TransferRequest');
const PlatformSetting = require('../../models/PlatformSetting');
const SlotLock = require('../../models/SlotLock');

const transferController = require('../../controllers/transferController');
const paymentController = require('../../controllers/paymentController');
const { invalidateCache } = require('../../utils/platformSettings');

async function main() {
    await connect();

    // Cấu hình tài khoản ngân hàng để createTopupInstructions() trả về
    // configured:true — không có bước này, hướng dẫn chuyển khoản luôn rỗng.
    await PlatformSetting.create({
        singleton: 'main',
        bankBin: '970416', bankAccountNumber: '0123456789', bankAccountName: 'TEST',
        bankName: 'Ngân hàng test', bankTransferWindowMinutes: 30,
    });
    invalidateCache();

    const admin = await makeUser({ role: 'admin' });
    const customer = await makeUser({ role: 'customer' });

    // ============================================================
    // KỊCH BẢN 1 — T4: khác chủ sân, đích đắt hơn, phải chuyển khoản thêm
    // ============================================================
    await test('T4-01 · Báo giá xác định đúng loại T4 và chờ chuyển khoản', async () => {
        const ownerA = await makeUser({ role: 'owner' });
        const ownerB = await makeUser({ role: 'owner' });
        const { court: courtA } = await makeVenueWithCourt({ ownerId: ownerA._id, pricePerHour: 200000 });
        const { venue: venueB, court: courtB } = await makeVenueWithCourt({ ownerId: ownerB._id, pricePerHour: 350000 });

        const bookingA = await makeConfirmedBooking({ customer, venue: { _id: courtA.venueId, name: 'V-A' }, court: courtA, hoursFromNow: 48 });
        const target = futureSlot(60);

        const quoteRes = await call(transferController.createQuote, {
            params: { id: bookingA._id }, user: customer,
            body: { toVenueId: venueB._id, toCourtId: courtB._id, toDate: target.date, toStartTime: target.startTime, toEndTime: target.endTime },
        });
        assert.strictEqual(quoteRes.statusCode, 201, quoteRes.body?.message);
        const transfer = quoteRes.body.transfer;
        assert.strictEqual(transfer.type, 'T4', 'Khác chủ sân phải là loại T4');
        assert.ok(transfer.quote.settlement > 0, 'Đích đắt hơn thì phải phát sinh khoản thu thêm (S > 0)');

        const confirmRes = await call(transferController.confirm, { params: { id: transfer._id }, user: customer });
        assert.strictEqual(confirmRes.statusCode, 200, confirmRes.body?.message);
        assert.strictEqual(confirmRes.body.status, 'awaiting_payment');
        assert.ok(confirmRes.body.bankTransfer?.configured, 'Phải trả về hướng dẫn chuyển khoản đã cấu hình sẵn');
        assert.ok(confirmRes.body.paymentId, 'Phải có paymentId để khách bấm "Tôi đã chuyển khoản"');

        // ── Đúng chỗ vừa vá: Hold của khung giờ ĐÍCH phải được nới theo cùng
        // hạn với transfer.quoteExpiresAt, không được lệch nhau. ──
        const freshTransfer = await TransferRequest.findById(transfer._id);
        const hold = await Hold.findById(freshTransfer.holdId);
        assert.ok(hold, 'Hold của khung giờ đích phải còn tồn tại');
        const diffMs = Math.abs(hold.expiresAt.getTime() - freshTransfer.quoteExpiresAt.getTime());
        assert.ok(diffMs < 5000, `Hold (${hold.expiresAt.toISOString()}) và quoteExpiresAt (${freshTransfer.quoteExpiresAt.toISOString()}) phải khớp nhau (lệch ${diffMs}ms)`);
        // Và phải thực sự được NỚI RA — ít nhất 25 phút nữa, không phải hạn báo giá ngắn ban đầu (mặc định 10 phút).
        const minutesLeft = (hold.expiresAt.getTime() - Date.now()) / 60000;
        assert.ok(minutesLeft > 20, `Hold phải còn hơn 20 phút để khách kịp chuyển khoản, thực tế còn ${minutesLeft.toFixed(1)} phút`);

        // ── Admin xác nhận chuyển khoản → toàn bộ giao dịch chuyển sân chạy ──
        const confirmBankRes = await call(paymentController.confirmBankTransfer, {
            params: { id: confirmRes.body.paymentId }, user: admin,
        });
        assert.strictEqual(confirmBankRes.statusCode, 200, confirmBankRes.body?.message);

        const oldBooking = await Booking.findById(bookingA._id);
        assert.strictEqual(oldBooking.status, 'transferred', 'Đơn gốc phải chuyển sang trạng thái transferred, KHÔNG bị xoá');
        assert.ok(oldBooking.transferredToBookingId, 'Đơn gốc phải trỏ sang đơn mới');

        const newBooking = await Booking.findById(oldBooking.transferredToBookingId);
        assert.strictEqual(newBooking.status, 'confirmed');
        assert.strictEqual(String(newBooking.courtId), String(courtB._id));
        assert.strictEqual(newBooking.customerId.toString(), customer._id.toString());

        // Khung giờ đích phải thực sự bị khoá bởi đơn MỚI
        const targetLock = await SlotLock.findOne({ courtId: courtB._id, date: target.date });
        assert.ok(targetLock, 'Khung giờ đích phải có khoá sau khi thực thi');
        assert.strictEqual(String(targetLock.bookingId), String(newBooking._id));

        // Sổ cái phải có bút toán cho lần chuyển này
        const entries = await LedgerEntry.find({ transferId: transfer._id });
        assert.ok(entries.length > 0, 'Phải có ít nhất một bút toán sổ cái cho giao dịch chuyển sân này');
        assert.ok(entries.some((e) => e.entryType === 'transfer_fee'), 'Phải có bút toán phí chuyển sân');

        const finalTransfer = await TransferRequest.findById(transfer._id);
        assert.strictEqual(finalTransfer.status, 'completed');
        assert.strictEqual(String(finalTransfer.toBookingId), String(newBooking._id));

        const finalHold = await Hold.findById(freshTransfer.holdId);
        assert.strictEqual(finalHold.consumed, true, 'Hold phải được đánh dấu đã dùng sau khi thực thi xong');
    });

    // ============================================================
    // KỊCH BẢN 2 — T2: cùng địa điểm, đích rẻ hơn → hoàn tiền, chạy ngay
    // không cần chuyển khoản
    // ============================================================
    await test('T2-01 · Chuyển sang sân rẻ hơn cùng địa điểm → thực thi ngay, phát sinh khoản hoàn', async () => {
        const owner = await makeUser({ role: 'owner' });
        const { venue, court: expensiveCourt } = await makeVenueWithCourt({ ownerId: owner._id, pricePerHour: 300000 });
        const { court: cheapCourt } = await makeVenueWithCourt({ ownerId: owner._id, pricePerHour: 100000 })
            .then(async (r) => {
                // Ép sân rẻ về CHUNG một địa điểm với sân đắt, để đúng là loại T2
                // (cùng venue, khác sân) thay vì T3 (khác venue, cùng chủ).
                const Court = require('../../models/Court');
                await Court.updateOne({ _id: r.court._id }, { venueId: venue._id });
                return { ...r, court: await Court.findById(r.court._id) };
            });

        const booking = await makeConfirmedBooking({ customer, venue, court: expensiveCourt, hoursFromNow: 48 });
        const target = futureSlot(50);

        const quoteRes = await call(transferController.createQuote, {
            params: { id: booking._id }, user: customer,
            body: { toVenueId: venue._id, toCourtId: cheapCourt._id, toDate: target.date, toStartTime: target.startTime, toEndTime: target.endTime },
        });
        assert.strictEqual(quoteRes.statusCode, 201, quoteRes.body?.message);
        const transfer = quoteRes.body.transfer;
        assert.strictEqual(transfer.type, 'T2', 'Cùng địa điểm, khác sân phải là loại T2');
        assert.ok(transfer.quote.settlement <= 0, 'Đích rẻ hơn thì không thể phát sinh thu thêm');

        const confirmRes = await call(transferController.confirm, { params: { id: transfer._id }, user: customer });
        assert.strictEqual(confirmRes.statusCode, 200, confirmRes.body?.message);
        // S <= 0 → chạy ngay, không cần bước chuyển khoản nào cả
        assert.strictEqual(confirmRes.body.status, 'completed');

        const oldBooking = await Booking.findById(booking._id);
        assert.strictEqual(oldBooking.status, 'transferred');

        if (transfer.quote.refundCash > 0) {
            const refundPayment = await Payment.findOne({ transferId: transfer._id, purpose: 'transfer_refund' });
            assert.ok(refundPayment, 'Phải tạo một bản ghi hoàn tiền cho phần tiền mặt được hoàn');
            assert.strictEqual(refundPayment.status, 'refund_requested', 'Hoàn qua chuyển khoản là thủ công — phải chờ quản trị viên xử lý, không tự đóng ngay');
        }
    });

    const ok = summary();
    await disconnect();
    process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
