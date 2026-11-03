/**
 * KIỂM THỬ: SỐ DƯ KHUYẾN MÃI KHÔNG BỊ TIÊU HAI LẦN.
 *
 * utils/credit.js dùng một lệnh findOneAndUpdate với điều kiện
 * `creditBalance: { $gte: amount }` làm chốt chặn chống tiêu trùng — bài test
 * này xác nhận chốt chặn đó có tác dụng thật khi hai request THỰC SỰ chạy
 * đồng thời, không phải chạy tuần tự rồi giả định.
 */
const assert = require('assert');
const { connect, disconnect, test, summary, makeUser } = require('./_helpers');
const User = require('../../models/User');
const credit = require('../../utils/credit');

async function main() {
    await connect();

    await test('CR-INT-01 · Hai lượt reserve() đồng thời, tổng vượt số dư → không vượt quá số dư thật', async () => {
        const user = await makeUser({ creditBalance: 100000 });

        // Hai đơn cùng lúc đều muốn dùng 80.000đ, nhưng ví chỉ có 100.000đ —
        // không được để cả hai cùng thành công (thành 160.000đ bị trừ).
        const [a, b] = await Promise.all([
            credit.reserve(user._id, 80000, { note: 'đơn A' }),
            credit.reserve(user._id, 80000, { note: 'đơn B' }),
        ]);

        const total = a + b;
        assert.ok(total <= 100000, `Tổng đã giữ chỗ (${total}) không được vượt số dư thật (100.000)`);

        const after = await User.findById(user._id);
        assert.strictEqual(
            after.creditBalance, 100000 - total,
            'Số dư còn lại phải khớp chính xác với những gì đã thật sự bị trừ'
        );
    });

    await test('CR-INT-02 · Mười lượt reserve() 20.000đ đồng thời, số dư chỉ có 50.000đ → tối đa 2 lượt thắng', async () => {
        const user = await makeUser({ creditBalance: 50000 });

        const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) => credit.reserve(user._id, 20000, { note: `đơn ${i}` }))
        );
        const totalReserved = results.reduce((s, v) => s + v, 0);
        const winners = results.filter((v) => v > 0).length;

        assert.ok(totalReserved <= 50000, `Tổng giữ chỗ (${totalReserved}) vượt số dư (50.000)`);
        assert.ok(winners <= 3, `Với đơn giá 20.000 và số dư 50.000, tối đa chỉ 2 lượt trọn vẹn (có thể +1 lượt phần dư) — thực tế ${winners}`);

        const after = await User.findById(user._id);
        assert.strictEqual(after.creditBalance, 50000 - totalReserved);
    });

    await test('CR-INT-03 · release() trả đúng số tiền, không tạo thêm tiền từ hư không', async () => {
        const user = await makeUser({ creditBalance: 100000 });
        const reserved = await credit.reserve(user._id, 40000, {});
        assert.strictEqual(reserved, 40000);

        await credit.release(user._id, reserved, {});
        const after = await User.findById(user._id);
        assert.strictEqual(after.creditBalance, 100000, 'Sau khi giữ chỗ rồi trả lại, số dư phải về đúng như ban đầu');
    });

    await test('CR-INT-04 · splitRefund áp dụng đúng khi hoàn tiền thật qua CSDL (không chỉ hàm thuần)', async () => {
        const user = await makeUser({ creditBalance: 100000 });
        const reserved = await credit.reserve(user._id, 100000, {}); // dùng hết số dư cho một đơn 100.000
        assert.strictEqual(reserved, 100000);

        // Đơn trị giá 100.000, trả hoàn toàn bằng số dư — huỷ và hoàn 50%
        const split = credit.splitRefund(50000, 100000, 100000);
        assert.strictEqual(split.cash, 0, 'Không được hoàn tiền mặt vì không có đồng tiền mặt nào trong đơn này');
        assert.strictEqual(split.credit, 50000);

        await credit.refund(user._id, split.credit, {});
        const after = await User.findById(user._id);
        assert.strictEqual(after.creditBalance, 50000, '0 (đã tiêu hết) + 50.000 (hoàn lại) = 50.000');
    });

    console.log('\n=== ĐIỂM TÍCH LUỸ — CÙNG CHỐT CHẶN, CÙNG PHẢI ĐƯỢC KIỂM ===\n');

    const ok = summary();
    await disconnect();
    process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
