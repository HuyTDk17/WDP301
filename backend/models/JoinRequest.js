const mongoose = require('mongoose');

/**
 * Yêu cầu tham gia một bài tìm người chơi.
 * status: pending → accepted | rejected ; accepted/pending → withdrawn (người xin tự rút).
 * `active` = true cho pending/accepted/rejected: mỗi người chỉ xin MỘT lần cho mỗi bài (bị từ chối thì không xin lại
 * được, tránh làm phiền chủ nhóm); chỉ khi tự rút (withdrawn) mới được xin lại.
 */
const joinRequestSchema = new mongoose.Schema(
    {
        postId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlayerPost', required: true },
        hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        message: { type: String, default: '', trim: true, maxlength: 200 },
        status: { type: String, enum: ['pending', 'accepted', 'rejected', 'withdrawn'], default: 'pending' },
        active: { type: Boolean, default: true },
        respondedAt: { type: Date, default: null },
    },
    { timestamps: true }
);
joinRequestSchema.index({ postId: 1, status: 1 });
joinRequestSchema.index({ userId: 1, createdAt: -1 });
joinRequestSchema.index({ postId: 1, userId: 1 }, { unique: true, partialFilterExpression: { active: true } });

module.exports = mongoose.model('JoinRequest', joinRequestSchema);
