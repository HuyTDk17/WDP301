const mongoose = require('mongoose');

/**
 * ĐƠN MUA GÓI PREMIUM (khoản doanh thu của NỀN TẢNG — khác tiền đặt sân đi thẳng cho chủ sân).
 *
 * Người mua chuyển khoản vào tài khoản của nền tảng (cấu hình ở Cài đặt admin) với nội dung = `code`.
 * Xác nhận bằng một trong hai cách: webhook ngân hàng tự khớp `code` + số tiền, hoặc admin đối chiếu sao kê.
 *
 * Trạng thái:  pending → reported → paid   (hoặc rejected / cancelled)
 *   pending   : vừa tạo, chưa chuyển
 *   reported  : người mua bấm "Tôi đã chuyển khoản", chờ đối chiếu
 *   paid      : đã nhận tiền, gói có hiệu lực từ startsAt đến endsAt
 *
 * Các trường payerName/area/sport/venueName/source/seq/paidDate là ảnh chụp thông tin lúc ghi nhận
 * (dùng cho dữ liệu nhập từ bảng doanh thu), giữ nguyên dù tài khoản/sân sau này đổi tên.
 */
const PLANS = ['venue_premium', 'player_premium'];
const STATUSES = ['pending', 'reported', 'paid', 'rejected', 'cancelled'];

const premiumOrderSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, unique: true, uppercase: true, trim: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', default: null },
        plan: { type: String, enum: PLANS, required: true },
        audience: { type: String, enum: ['owner', 'player'], required: true },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'VND' },
        durationDays: { type: Number, default: 30, min: 1 },
        status: { type: String, enum: STATUSES, default: 'pending', index: true },
        method: { type: String, default: 'bank_transfer' },

        receivedAmount: { type: Number, default: 0 },
        bankTxnIds: { type: [String], default: [] },
        autoConfirmed: { type: Boolean, default: false },
        confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reportedAt: { type: Date, default: null },
        rejectReason: { type: String, default: '' },

        paidAt: { type: Date, default: null },
        startsAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },
        remindedAt: { type: Date, default: null },
        expiredNotifiedAt: { type: Date, default: null },

        // Ảnh chụp thông tin người mua
        payerName: { type: String, default: '' },
        payerEmail: { type: String, default: '' },
        venueName: { type: String, default: '' },
        area: { type: String, default: '' },
        sport: { type: String, default: '' },
        paidDate: { type: String, default: '' },
        seq: { type: Number, default: 0 },
        source: { type: String, default: '' },
    },
    { timestamps: true }
);

premiumOrderSchema.index({ status: 1, endsAt: 1 });
premiumOrderSchema.index({ paidAt: -1 });

module.exports = mongoose.model('PremiumOrder', premiumOrderSchema);
module.exports.PLANS = PLANS;
