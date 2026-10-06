/**
 * KIỂM THỬ: HAI NGƯỜI CÙNG GIÀNH MỘT KHUNG GIỜ (IT-06 trong tài liệu).
 *
 * Đây là kịch bản duy nhất mà kiểm thử đơn vị KHÔNG BAO GIỜ phát hiện được —
 * nó chỉ lộ ra khi có một CSDL thật xử lý hai request chạy thật sự đồng thời.
 * `slotLock.acquire()` dựa vào ràng buộc duy nhất (unique index) ở cấp MongoDB
 * làm chốt chặn cuối cùng; bài test này xác nhận chốt chặn đó có thật.
 */
const assert = require('assert');
const { connect, disconnect, test, summary, makeVenueWithCourt, makeUser, futureSlot } = require('./_helpers');
const slotLock = require('../../utils/slotLock');
const Booking = require('../../models/Booking');
const SlotLock = require('../../models/SlotLock');

async function main() {
    await connect();
    const owner = await makeUser({ role: 'owner' });
    const { court } = await makeVenueWithCourt({ ownerId: owner._id });
    const { date, startTime, endTime } = futureSlot(24);

    await test('RACE-01 · Hai lượt acquire() đồng thời cùng một khung giờ — chỉ đúng một bên thắng', async () => {
        const bookingIdA = new (require('mongoose').Types.ObjectId)();
        const bookingIdB = new (require('mongoose').Types.ObjectId)();

        // Promise.all bắn cả hai gần như cùng lúc — đây là phép thử thật, khác
        // hẳn việc gọi tuần tự rồi giả định "chắc cũng vậy".
        const [gotA, gotB] = await Promise.all([
            slotLock.acquire({ courtId: court._id, date, startTime, endTime, bookingId: bookingIdA }),
            slotLock.acquire({ courtId: court._id, date, startTime, endTime, bookingId: bookingIdB }),
        ]);

        assert.strictEqual(gotA !== gotB, true, 'Phải có đúng một bên giành được, một bên thất bại');

        const winnerId = gotA ? bookingIdA : bookingIdB;
        const locks = await SlotLock.find({ courtId: court._id, date });
        assert.ok(locks.length > 0, 'Phải có ít nhất một khoá được ghi nhận');
        assert.ok(
            locks.every((l) => String(l.bookingId) === String(winnerId)),
            'Mọi khoá của khung giờ này phải thuộc về đúng một người thắng — không được lẫn của cả hai bên'
        );

        await slotLock.release(winnerId);
    });

    await test('RACE-02 · Mười lượt cùng giành một khung giờ — vẫn đúng một bên thắng', async () => {
        const { date: d2, startTime: s2, endTime: e2 } = futureSlot(30);
        const ids = Array.from({ length: 10 }, () => new (require('mongoose').Types.ObjectId)());

        const results = await Promise.all(
            ids.map((id) => slotLock.acquire({ courtId: court._id, date: d2, startTime: s2, endTime: e2, bookingId: id }))
        );

        const winners = results.filter(Boolean).length;
        assert.strictEqual(winners, 1, `Phải có đúng 1 người thắng trong 10 lượt, thực tế: ${winners}`);

        const winnerId = ids[results.findIndex(Boolean)];
        await slotLock.release(winnerId);
    });

    await test('RACE-03 · isTargetTaken() nhìn thấy khung giờ vừa bị khoá bởi người khác', async () => {
        const { date: d3, startTime: s3, endTime: e3 } = futureSlot(40);
        const someoneElseId = new (require('mongoose').Types.ObjectId)();
        await slotLock.acquire({ courtId: court._id, date: d3, startTime: s3, endTime: e3, bookingId: someoneElseId });

        const transferService = require('../../services/transferService');
        const taken = await transferService.isTargetTaken({
            courtId: court._id, date: d3, startTime: s3, endTime: e3,
            excludeBookingId: null, userId: null,
        });
        assert.strictEqual(taken, true);

        await slotLock.release(someoneElseId);
    });

    const ok = summary();
    await disconnect();
    process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
