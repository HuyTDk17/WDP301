const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
    {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        guestName: { type: String, default: '' },
        guestPhone: { type: String, default: '' },

        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
        courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true },
        venueName: { type: String, default: '' },
        courtName: { type: String, default: '' },
        date: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        duration: { type: Number, default: 1 },
        sport: { type: String, default: '' },
        // Không còn hỏi số người khi đặt sân (tiền sân cố định, người chơi tự chia). Giữ trường cho đơn cũ.
        players: { type: Number, default: 1 },
        notes: { type: String, default: '' },
        amount: { type: Number, required: true, min: 0 },
        // Phần hoa hồng KHÁCH chịu — cộng thêm vào số tiền khách trả (0 khi chủ sân chịu hết).
        serviceFee: { type: Number, default: 0 },
        // Phần hoa hồng CHỦ SÂN chịu — trừ vào tiền chủ sân thực nhận (= amount − ownerCommission).
        // Đơn cũ không có trường này → coi là 0, giữ nguyên cách tính cũ. Xem utils/commission.js.
        ownerCommission: { type: Number, default: 0, min: 0 },
        // Tỉ lệ hoa hồng (0–100) ĐÃ CHỐT tại thời điểm đặt — đổi cấu hình sau này không làm lệch đơn cũ.
        commissionRate: { type: Number, default: 0 },
        promoCode: { type: String, default: '' },
        discountAmount: { type: Number, default: 0 },

        // Phần của đơn được thanh toán bằng SỐ DƯ KHUYẾN MÃI thay vì tiền mặt.
        // Được giữ chỗ (trừ khỏi User.creditBalance) ngay khi tạo URL thanh
        // toán, và trả lại nếu đơn hết hạn hoặc bị huỷ trước khi trả tiền.
        // Xem utils/credit.js.
        creditApplied: { type: Number, default: 0, min: 0 },

        status: {
            type: String,
            // 'transferred' = đơn đã được chuyển sang địa điểm/khung giờ khác.
            // Đơn KHÔNG bị xoá và KHÔNG bị sửa đè: nguyên tắc kế toán là dữ
            // liệu đã hạch toán chỉ được bù trừ bằng bút toán mới. Nhờ vậy chủ
            // sân cũ vẫn thấy được lịch sử và báo cáo tháng cũ không tự đổi.
            enum: ['awaiting_payment', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'transferred'],
            default: 'awaiting_payment',
        },
        paymentMethod: { type: String, enum: ['bank_transfer', 'manual', 'credit'], default: 'manual' },
        cancellationReason: { type: String, default: '' },

        // ===== HOÀN/HUỶ =====
        refundAmount: { type: Number, default: 0 },
        refundCreditAmount: { type: Number, default: 0 },
        cancellationFee: { type: Number, default: 0 },

        // ===== CHUYỂN SÂN =====
        transferredToBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
        transferredFromBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
        // Đơn ĐẦU TIÊN của cả chuỗi chuyển — cho phép đếm số lần chuyển và truy
        // vết về gốc mà không phải lần ngược từng mắt xích.
        rootBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
        transferCount: { type: Number, default: 0 },
        // Tiền bồi thường chủ sân GỐC nhận khi đơn này bị chuyển đi (chỉ loại T4)
        compensationAmount: { type: Number, default: 0 },
        // Phí chuyển sân nền tảng đã thu — ghi trên đơn MỚI
        transferFeeAmount: { type: Number, default: 0 },
        // Tổng tiền khách đã trả tích luỹ qua cả chuỗi chuyển, dùng áp trần hoàn
        originalPaidAmount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

bookingSchema.index({ courtId: 1, date: 1, startTime: 1 });
bookingSchema.index({ status: 1, createdAt: 1 });
bookingSchema.index({ customerId: 1, status: 1 });
// Tra cứu lịch của chủ sân theo ngày — truy vấn chạy nhiều nhất ở khu vực chủ sân.
bookingSchema.index({ venueId: 1, date: 1 });

/** Tổng số tiền khách phải trả cho đơn này (chưa trừ số dư khuyến mãi). */
bookingSchema.virtual('grossPayable').get(function () {
    return this.amount + (this.serviceFee || 0) - (this.discountAmount || 0);
});

/** Phần còn phải trả bằng TIỀN MẶT sau khi đã trừ số dư khuyến mãi. */
bookingSchema.virtual('cashPayable').get(function () {
    return Math.max(0, this.grossPayable - (this.creditApplied || 0));
});

bookingSchema.set('toJSON', { virtuals: true });
bookingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Booking', bookingSchema);
