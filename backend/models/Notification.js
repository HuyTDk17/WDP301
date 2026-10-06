const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, default: 'system' },
        icon: { type: String, default: '🔔' },
        title: { type: String, required: true },
        message: { type: String, required: true },
        // Đường dẫn frontend liên quan đến thông báo này (vd: '/owner/dashboard').
        // Cho phép người dùng bấm vào thông báo để đi thẳng đến trang liên quan.
        link: { type: String, default: '' },
        read: { type: Boolean, default: false },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
