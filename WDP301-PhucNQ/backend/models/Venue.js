const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
    { street: { type: String, default: '' }, district: { type: String, default: '' }, city: { type: String, default: '' } },
    { _id: false }
);
const openHoursSchema = new mongoose.Schema(
    { open: { type: String, default: '06:00' }, close: { type: String, default: '22:00' } },
    { _id: false }
);

const venueSchema = new mongoose.Schema(
    {
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, required: [true, 'Vui lòng nhập tên địa điểm'], trim: true },
        description: { type: String, default: '' },
        sports: { type: [String], default: [] },
        address: { type: addressSchema, default: () => ({}) },
        amenities: { type: [String], default: [] },
        images: { type: [String], default: [] },
        openHours: { type: openHoursSchema, default: () => ({}) },
        rules: { type: String, default: '' },
        rating: { type: Number, default: 0, min: 0, max: 5 },
        reviewCount: { type: Number, default: 0 },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        rejectionReason: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
        // Đánh dấu venue này bị TỰ ĐỘNG ẩn vì chủ sân bị khóa/mất quyền chủ sân
        // (không phải do admin tự tay tạm ngưng riêng venue này vì lý do khác).
        // Nhờ vậy khi mở khóa chủ sân, hệ thống chỉ khôi phục đúng những venue
        // mà CHÍNH việc khóa đã ẩn đi, không đụng tới venue admin đã tạm ngưng
        // riêng trước đó vì lý do khác. Xem userController.updateUserStatus.
        suspendedByOwnerBan: { type: Boolean, default: false },
        // Chủ sân có thể yêu cầu tự tay duyệt mỗi lượt CHUYỂN ĐẾN địa điểm này.
        // Mặc định tắt để khách được chuyển ngay, tránh phụ thuộc tốc độ phản
        // hồi của chủ sân.
        transferRequiresApproval: { type: Boolean, default: false },
    },
    { timestamps: true }
);

venueSchema.index({ name: 'text', 'address.city': 1, 'address.district': 1 });

module.exports = mongoose.model('Venue', venueSchema);
