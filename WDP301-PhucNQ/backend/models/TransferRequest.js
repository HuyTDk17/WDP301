const mongoose = require('mongoose');

/**
 * Một YÊU CẦU CHUYỂN SÂN. Tách hẳn khỏi Booking để lưu được vết của cả những
 * yêu cầu KHÔNG thành công (khách bỏ dở, chủ sân từ chối, hết hạn) — phục vụ
 * xử lý khiếu nại và thống kê. Booking chỉ lưu KẾT QUẢ cuối cùng.
 */
const quoteSchema = new mongoose.Schema(
    {
        leadTimeHours: { type: Number, default: 0 },
        commissionRate: { type: Number, default: 0 },

        oldAmount: { type: Number, default: 0 },
        oldServiceFee: { type: Number, default: 0 },
        oldDiscount: { type: Number, default: 0 },
        oldPaid: { type: Number, default: 0 },

        newAmount: { type: Number, default: 0 },
        newServiceFee: { type: Number, default: 0 },
        // Phần hoa hồng chủ sân (đích) chịu trên đơn mới — không nằm trong số tiền khách trả
        newOwnerCommission: { type: Number, default: 0 },
        newDiscount: { type: Number, default: 0 },
        newPayable: { type: Number, default: 0 },

        transferFeeRate: { type: Number, default: 0 },
        transferFee: { type: Number, default: 0 },
        compensationRate: { type: Number, default: 0 },
        compensation: { type: Number, default: 0 },

        settlement: { type: Number, default: 0 },
        direction: { type: String, enum: ['topup', 'refund', 'none'], default: 'none' },
        refundCash: { type: Number, default: 0 },
        refundCredit: { type: Number, default: 0 },
    },
    { _id: false }
);

const transferRequestSchema = new mongoose.Schema(
    {
        fromBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
        toBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

        // T1 đổi giờ cùng sân · T2 đổi sân cùng địa điểm · T3 khác địa điểm cùng
        // chủ · T4 khác chủ sân · T5 sang tên cho người khác
        type: { type: String, enum: ['T1', 'T2', 'T3', 'T4', 'T5'], required: true },

        fromVenueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue' },
        fromCourtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court' },
        fromOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        fromVenueName: { type: String, default: '' },
        fromCourtName: { type: String, default: '' },
        fromDate: { type: String, default: '' },
        fromStartTime: { type: String, default: '' },
        fromEndTime: { type: String, default: '' },

        toVenueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue' },
        toCourtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court' },
        toOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        toVenueName: { type: String, default: '' },
        toCourtName: { type: String, default: '' },
        toDate: { type: String, default: '' },
        toStartTime: { type: String, default: '' },
        toEndTime: { type: String, default: '' },

        holdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hold', default: null },

        // ── Riêng cho loại T5 (sang tên) ──
        // Mã do người chuyển tạo ra và gửi cho bạn bè. Người nhận nhập mã này
        // để lấy suất. Chỉ có ý nghĩa khi type = 'T5'.
        transferCode: { type: String, default: null, uppercase: true, trim: true },
        toCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

        // Báo giá được CHỐT tại thời điểm tạo và không tính lại khi hiển thị —
        // tránh việc khách thấy một con số lúc xem và bị trừ một con số khác.
        quote: { type: quoteSchema, default: () => ({}) },
        quoteExpiresAt: { type: Date, required: true },

        status: {
            type: String,
            enum: ['quoted', 'awaiting_payment', 'awaiting_owner_approval', 'processing',
                'completed', 'rejected', 'expired', 'cancelled', 'failed'],
            default: 'quoted',
        },

        paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
        refundPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
        rejectionReason: { type: String, default: '' },
        failureReason: { type: String, default: '' },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

transferRequestSchema.index({ fromBookingId: 1 });
transferRequestSchema.index({ customerId: 1, createdAt: -1 });
transferRequestSchema.index({ status: 1, quoteExpiresAt: 1 });
transferRequestSchema.index({ toOwnerId: 1, status: 1 });
// Mã sang tên phải duy nhất trong số các mã CÒN HIỆU LỰC. Dùng partial index
// để các yêu cầu không phải T5 (transferCode = null) không bị coi là trùng.
transferRequestSchema.index(
    { transferCode: 1 },
    { unique: true, partialFilterExpression: { transferCode: { $type: 'string' } } }
);

module.exports = mongoose.model('TransferRequest', transferRequestSchema);
