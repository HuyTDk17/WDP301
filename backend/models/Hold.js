const mongoose = require('mongoose');

/**
 * Giữ chỗ tạm thời cho 1 khung giờ trong lúc khách điền thông tin + thanh toán.
 * Tự động bị MongoDB xóa khi hết hạn nhờ TTL index bên dưới — không cần cron job.
 */
const holdSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
        courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true },
        date: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        consumed: { type: Boolean, default: false },
    },
    { timestamps: true }
);

holdSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
holdSchema.index({ courtId: 1, date: 1, startTime: 1 });

module.exports = mongoose.model('Hold', holdSchema);
