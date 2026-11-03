const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, unique: true, uppercase: true, trim: true },
        description: { type: String, default: '' },
        discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
        discountValue: { type: Number, required: true, min: 0 },
        // Chỉ áp dụng cho loại 'percent' — chặn trần số tiền giảm tối đa, tránh
        // 1 mã "-50%" giảm quá nhiều với booking giá trị lớn.
        maxDiscountAmount: { type: Number, default: 0 },
        minBookingAmount: { type: Number, default: 0 },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        // 0 = không giới hạn số lượt dùng
        maxUses: { type: Number, default: 0, min: 0 },
        usedCount: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Promotion', promotionSchema);
