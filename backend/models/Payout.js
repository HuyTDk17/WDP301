const mongoose = require('mongoose');

// Mỗi document = 1 LẦN admin thanh toán tiền cho chủ sân (thủ công, ngoài hệ
// thống — VD chuyển khoản). Không tự động chuyển tiền thật, chỉ GHI NHẬN lại
// để cả admin và chủ sân đều biết đã thanh toán bao nhiêu, còn nợ bao nhiêu.
const payoutSchema = new mongoose.Schema(
    {
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        amount: { type: Number, required: true, min: 0 },
        note: { type: String, default: '' },
        // Mốc thời gian tính đến lúc thanh toán — dùng để tính "doanh thu còn
        // nợ" cho lần thanh toán tiếp theo (chỉ tính booking SAU mốc này).
        periodEnd: { type: Date, required: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Payout', payoutSchema);
