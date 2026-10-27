const mongoose = require('mongoose');

/**
 * ĐỐI SOÁT CÔNG NỢ GIỮA NỀN TẢNG VÀ CHỦ SÂN.
 *
 * Khách chuyển tiền đặt sân THẲNG cho chủ sân, nên nền tảng không giữ tiền để tự
 * khấu trừ hoa hồng. Thay vào đó nền tảng lập một "hoá đơn đối soát" theo kỳ:
 *
 *   • direction 'owner_pays'    — chủ sân đang giữ nhiều hơn phần họ được hưởng
 *                                  (thường do hoa hồng) → chủ sân chuyển khoản cho
 *                                  nền tảng, bấm "Đã chuyển", admin xác nhận.
 *   • direction 'platform_pays' — nền tảng nợ chủ sân (khách trả một phần bằng
 *                                  số dư/điểm/khuyến mãi do nền tảng tài trợ, hoặc
 *                                  chuyển sân...) → admin chuyển cho chủ sân.
 *
 * `amount` là con số CHỐT tại lúc lập hoá đơn (luôn dương, chiều do `direction`).
 * Khi hoá đơn 'paid', nó trở thành một khoản điều chỉnh trong công thức số dư của
 * chủ sân (xem utils/settlementMath.js) — nhờ vậy số dư không bao giờ bị tính hai
 * lần dù hoá đơn lập lúc nào.
 *
 * Mỗi chủ sân chỉ có tối đa MỘT hoá đơn đang mở (issued/reported) — `openKey` +
 * unique partial index, cùng kỹ thuật với Payment.openKey.
 */
const ownerSettlementSchema = new mongoose.Schema(
    {
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        // Mã hiển thị và cũng là NỘI DUNG CHUYỂN KHOẢN khi chủ sân nộp cho nền tảng.
        code: { type: String, required: true, unique: true },
        period: { type: String, required: true }, // 'YYYY-MM' của tháng lập hoá đơn

        direction: { type: String, enum: ['owner_pays', 'platform_pays'], required: true },
        amount: { type: Number, required: true, min: 1 },

        status: { type: String, enum: ['issued', 'reported', 'paid', 'cancelled'], default: 'issued' },
        openKey: { type: String }, // = `owner:<ownerId>` khi còn issued/reported — tự duy trì ở pre('save')

        issuedAt: { type: Date, default: Date.now },
        dueDate: { type: Date, required: true },
        issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = hệ thống tự lập

        // Ảnh chụp số liệu lúc lập — để tra cứu, KHÔNG dùng để tính lại.
        snapshot: {
            type: new mongoose.Schema({
                cashHeld: { type: Number, default: 0 },
                entitlement: { type: Number, default: 0 },
                refundsByOwner: { type: Number, default: 0 },
                remitted: { type: Number, default: 0 },
                platformPaid: { type: Number, default: 0 },
                balance: { type: Number, default: 0 },
                bookingCount: { type: Number, default: 0 },
            }, { _id: false }),
            default: null,
        },

        // Tài khoản nhận tiền của bên được nhận (ảnh chụp lúc lập hoá đơn)
        payee: {
            type: new mongoose.Schema({
                bankName: { type: String, default: '' },
                bankBin: { type: String, default: '' },
                accountNumber: { type: String, default: '' },
                accountName: { type: String, default: '' },
            }, { _id: false }),
            default: null,
        },

        reportedAt: { type: Date, default: null },
        reportedNote: { type: String, default: '' },     // chủ sân ghi mã giao dịch/ghi chú
        rejectionNote: { type: String, default: '' },    // admin ghi lý do chưa nhận được tiền
        confirmedAt: { type: Date, default: null },
        confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        note: { type: String, default: '' },

        // ===== TỰ ĐỘNG XÁC NHẬN QUA SAO KÊ NGÂN HÀNG (webhook SePay/Casso...) =====
        // Tổng tiền đã khớp vào hoá đơn này (cho phép chủ sân chuyển làm nhiều lần) và mã các
        // giao dịch ngân hàng đã cộng — mã giao dịch chỉ được cộng MỘT lần dù webhook bắn lại.
        receivedAmount: { type: Number, default: 0 },
        bankTxnIds: { type: [String], default: [] },
        autoConfirmed: { type: Boolean, default: false },
        // Bậc nhắc hạn đã gửi: 0 chưa gửi, 1 sắp đến hạn, 2 quá hạn, 3 đã khoá địa điểm.
        reminderStage: { type: Number, default: 0 },
    },
    { timestamps: true }
);

ownerSettlementSchema.index({ status: 1, dueDate: 1 });
ownerSettlementSchema.index(
    { openKey: 1 },
    { unique: true, partialFilterExpression: { openKey: { $type: 'string' } }, name: 'one_open_settlement_per_owner' }
);

ownerSettlementSchema.pre('save', async function () {
    this.openKey = ['issued', 'reported'].includes(this.status) ? `owner:${this.ownerId}` : undefined;
});

module.exports = mongoose.model('OwnerSettlement', ownerSettlementSchema);
