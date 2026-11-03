const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');

exports.getNotifications = asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ notifications });
});

exports.markAsRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { read: true }, { new: true });
    if (!notification) return res.status(404).json({ message: 'Không tìm thấy thông báo này' });
    res.json({ notification });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
    res.json({ message: 'Đã đánh dấu tất cả là đã đọc' });
});

exports.deleteNotification = asyncHandler(async (req, res) => {
    await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'Đã xóa thông báo' });
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({ count });
});
