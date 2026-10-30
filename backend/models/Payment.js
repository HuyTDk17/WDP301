const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
    {
        // Không bắt buộc: một giao dịch có thể gắn với YÊU CẦU CHUYỂN SÂN
        // (thu thêm/hoàn tiền) thay vì gắn trực tiếp với một đơn đặt sân.
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
        transferId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransferRequest', default: null },
        // Quyết định luồng xử lý (booking thường / bù tiền chuyển sân / hoàn tiền).
        purpose: {
            type: String,
            enum: ['booking', 'transfer_topup', 'transfer_refund', 'cancellation_refund'],
            default: 'booking',
        },
        // 'bank_transfer' = khách chuyển khoản trực tiếp vào tài khoản ngân
        // hàng của nền tảng (thay cho VNPay/MoMo trước đây — không cần đăng ký
        // merchant, không cần chờ duyệt). 'credit' = trả hoàn toàn bằng số dư
        // khuyến mãi, không phát sinh dòng tiền thật.
        method: { type: String, enum: ['bank_transfer', 'manual', 'credit'], required: true },
        amount: { type: Number, required: true },
        status: {
            type: String,
            enum: [
                'pending',
                // Khách đã bấm "Tôi đã chuyển khoản" nhưng CHƯA được xác nhận —
                // bằng tay (quản trị viên đối chiếu sao kê) hoặc tự động (webhook
                // đối soát ngân hàng). Ở trạng thái này đơn KHÔNG bị tác vụ nền
                // tự huỷ dù đã quá cửa sổ thanh toán thông thường — xem
                // jobs/index.js.
                'awaiting_confirmation',
                'completed', 'failed', 'refund_requested', 'refunded',
            ],
            default: 'pending',
        },
        // Nội dung khách cần ghi khi chuyển khoản, dùng để đối chiếu — trùng
        // với orderRef nhưng tách riêng để lỡ sau này đổi định dạng orderRef
        // thì lịch sử các giao dịch cũ vẫn còn nguyên nội dung đã hiển thị.
        orderRef: { type: String, required: true, unique: true },
        transactionRef: { type: String, default: '' },
        gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null },
        refundReason: { type: String, default: '' },
        // Chuyển khoản ngân hàng trực tiếp không có phí trung gian (khác với
        // 1–2,2% mà VNPay/MoMo từng thu) — luôn bằng 0, giữ lại field để không
        // phải sửa các báo cáo doanh thu đang đọc field này.
        gatewayFee: { type: Number, default: 0 },
        // Phần của đơn được trả bằng số dư khuyến mãi tại thời điểm giao dịch.
        creditApplied: { type: Number, default: 0 },

        // Khoá đảm bảo MỖI ĐƠN ĐẶT SÂN chỉ có một giao dịch chuyển khoản đang mở:
        // = `booking:<bookingId>` khi giao dịch còn 'pending'/'awaiting_confirmation',
        // bỏ trống khi đã xong. Tự duy trì trong hook pre('save') bên dưới — đừng
        // gán tay. Có unique partial index nên hai yêu cầu đồng thời (bấm đúp, hai
        // tab) không thể cùng tạo giao dịch thứ hai.
        openKey: { type: String },

        // ===== TÀI KHOẢN NHẬN TIỀN (ảnh chụp tại thời điểm tạo giao dịch) =====
        // Đơn đặt sân: khách chuyển khoản TRỰC TIẾP cho chủ sân của địa điểm đó,
        // chủ sân là người đối chiếu và xác nhận — quản trị viên không dính vào.
        // Lưu lại bản sao tài khoản đã hiển thị cho khách, để nếu chủ sân đổi
        // tài khoản sau này thì lịch sử và tranh chấp vẫn tra được đúng tài khoản
        // khách đã chuyển vào. Không có field này = giao dịch cũ/khoản chuyển sân
        // (nhận bằng tài khoản nền tảng).
        receiver: {
            type: new mongoose.Schema({
                ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                bankName: { type: String, default: '' },
                bankBin: { type: String, default: '' },
                accountNumber: { type: String, default: '' },
                accountName: { type: String, default: '' },
            }, { _id: false }),
            default: null,
        },

        // Khoản HOÀN TIỀN do CHỦ SÂN thực hiện: khách đã chuyển tiền thẳng cho chủ sân
        // nên chủ sân (không phải quản trị viên) là người chuyển khoản trả lại. Null = nền
        // tảng hoàn (khoản bù/hoàn khi chuyển sân, giao dịch cũ nhận bằng tài khoản nền tảng).
        refundOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

        // ===== XÁC NHẬN CHUYỂN KHOẢN =====
        customerMarkedPaidAt: { type: Date, default: null },
        // Chủ sân (đơn đặt sân) hoặc quản trị viên (khoản chuyển sân) đã xác nhận.
        bankConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        bankConfirmedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ transferId: 1, purpose: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ method: 1, status: 1 });
paymentSchema.index(
    { openKey: 1 },
    { unique: true, partialFilterExpression: { openKey: { $type: 'string' } }, name: 'one_open_payment_per_booking' }
);

paymentSchema.pre('save', async function () {
    const open = this.purpose === 'booking' && this.bookingId
        && ['pending', 'awaiting_confirmation'].includes(this.status);
    this.openKey = open ? `booking:${this.bookingId}` : undefined;
});

module.exports = mongoose.model('Payment', paymentSchema);
