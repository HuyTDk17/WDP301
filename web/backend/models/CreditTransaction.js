const mongoose = require('mongoose');

// Nhật ký biến động SỐ DƯ KHUYẾN MÃI của tài khoản (User.creditBalance).
// Số dư này KHÔNG rút được thành tiền mặt, chỉ dùng trừ vào đơn đặt sân sau —
// nhờ đó tiền ở lại trong hệ thống và triệt tiêu động cơ lạm dụng chuyển sân
// để rút tiền qua cổng thanh toán.
const creditTransactionSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        amount: { type: Number, required: true }, // dương = cộng, âm = trừ
        balanceAfter: { type: Number, required: true },
        reason: {
            type: String,
            enum: ['transfer_refund', 'booking_payment', 'cancellation_refund', 'admin_adjust'],
            required: true,
        },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
        transferId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransferRequest', default: null },
        note: { type: String, default: '' },
    },
    { timestamps: true }
);

creditTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);
