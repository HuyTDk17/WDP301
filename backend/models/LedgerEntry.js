const mongoose = require('mongoose');

/**
 * SỔ CÁI GIAO DỊCH — mỗi document là MỘT dòng tiền vào hoặc ra khỏi nền tảng.
 *
 * Trước đây mọi số liệu tài chính đều được suy ra bằng cách cộng dồn trường
 * `amount`/`serviceFee` trên Booking. Cách đó chỉ đúng khi mỗi đơn sinh ra
 * đúng MỘT dòng tiền. Nghiệp vụ chuyển sân phá vỡ giả định đó: một đơn gốc
 * sinh ra đồng thời tiền cho chủ sân mới, tiền bồi thường cho chủ sân cũ và
 * phí chuyển cho nền tảng. Sổ cái là nơi duy nhất biểu diễn được điều này.
 */
const ledgerEntrySchema = new mongoose.Schema(
    {
        entryType: {
            type: String,
            required: true,
            enum: [
                'booking_commission',   // phí dịch vụ nền tảng thu trên 1 đơn
                'transfer_fee',         // phí chuyển sân
                'cancellation_fee',     // phí huỷ đơn nền tảng giữ lại
                'no_show_fee',
                'owner_earning',        // giá sân chủ sân được nhận
                'owner_compensation',   // bồi thường chủ sân bị chuyển đi
                'promotion_cost',       // chi phí khuyến mãi nền tảng gánh
                'gateway_fee',          // phí cổng thanh toán
                'payout',               // chi trả cho chủ sân
                'refund',               // hoàn tiền cho khách
                'credit_issued',        // ghi số dư khuyến mãi (nợ tiềm tàng)
                // Khách tiêu số dư khuyến mãi vào một đơn mới. Ghi nhận là một
                // khoản THU vì khi phát hành số dư (credit_issued) nền tảng đã
                // ghi một khoản CHI tương ứng; không có bút toán đối ứng này
                // thì nợ tiềm tàng trên sổ sách sẽ phình mãi không bao giờ tất
                // toán, dù thực tế khách đã dùng hết.
                'credit_redeemed',
                'rounding_adjustment',
                'manual_adjustment',
            ],
        },
        direction: { type: String, enum: ['platform_in', 'platform_out'], required: true },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'VND' },

        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
        transferId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransferRequest', default: null },
        paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
        payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', default: null },
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

        occurredAt: { type: Date, default: Date.now },
        note: { type: String, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

ledgerEntrySchema.index({ occurredAt: -1 });
ledgerEntrySchema.index({ bookingId: 1 });
ledgerEntrySchema.index({ transferId: 1 });
ledgerEntrySchema.index({ ownerId: 1, occurredAt: -1 });
ledgerEntrySchema.index({ entryType: 1, occurredAt: -1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
