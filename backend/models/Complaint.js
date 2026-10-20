const mongoose = require('mongoose');

/**
 * KHIẾU NẠI của khách hàng gửi lên quản trị viên (về chủ sân / địa điểm / một lượt đặt).
 *
 * Luồng trạng thái:  open → investigating → resolved | rejected
 *   - open          : khách vừa gửi, admin chưa nhận xử lý.
 *   - investigating : admin đang xem bằng chứng / liên hệ khách hoặc chủ sân.
 *   - resolved      : admin đã giải quyết, `resolution` là phản hồi gửi cho khách.
 *   - rejected      : admin xét thấy không đủ cơ sở, `resolution` nêu lý do.
 *
 * `messages` là nhật ký các lần admin liên hệ khách/chủ sân (mỗi lần cũng tạo
 * một Notification cho người nhận) để admin và khách đều xem lại được diễn biến.
 */
const CATEGORIES = ['service', 'facility', 'payment', 'refund', 'staff', 'other'];
const STATUSES = ['open', 'investigating', 'resolved', 'rejected'];

const messageSchema = new mongoose.Schema(
    {
        to: { type: String, enum: ['customer', 'owner'], required: true },
        text: { type: String, required: true, trim: true, maxlength: 2000 },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const complaintSchema = new mongoose.Schema(
    {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
        // Lưu tên tại thời điểm gửi để danh sách vẫn đọc được dù địa điểm bị đổi tên/xóa sau này.
        venueName: { type: String, default: '' },

        category: { type: String, enum: CATEGORIES, default: 'other' },
        subject: { type: String, required: [true, 'Vui lòng nhập tiêu đề khiếu nại'], trim: true, maxlength: 120 },
        description: { type: String, required: [true, 'Vui lòng mô tả nội dung khiếu nại'], trim: true, maxlength: 3000 },
        evidence: { type: [String], default: [], validate: [(v) => v.length <= 5, 'Tối đa 5 ảnh bằng chứng'] },

        // Khiếu nại của người chơi Premium hoặc về sân Premium được xử lý trước.
        priority: { type: Boolean, default: false },
        status: { type: String, enum: STATUSES, default: 'open' },
        // true khi còn đang xử lý (open/investigating). Có trường riêng vì chỉ mục duy nhất một phần
        // chỉ dùng được phép so sánh bằng — `$in` trên status không chạy trên MongoDB đời cũ.
        active: { type: Boolean, default: true },
        messages: { type: [messageSchema], default: [] },

        resolution: { type: String, default: '', maxlength: 3000 },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        resolvedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

complaintSchema.index({ customerId: 1, createdAt: -1 });
complaintSchema.index({ status: 1, createdAt: -1 });
// Mỗi lượt đặt chỉ có tối đa MỘT khiếu nại đang xử lý — chặn gửi trùng/spam ở mức dữ liệu.
complaintSchema.index(
    { bookingId: 1 },
    { unique: true, partialFilterExpression: { bookingId: { $type: 'objectId' }, active: true } }
);

module.exports = mongoose.model('Complaint', complaintSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUSES = STATUSES;
