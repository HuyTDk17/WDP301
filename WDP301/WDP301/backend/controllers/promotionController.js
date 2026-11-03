const Promotion = require('../models/Promotion');

/**
 * Mã giảm giá KHÔNG còn do nền tảng/quản trị viên quản lý (chủ sân tự quyết định
 * giảm giá cho khách của mình). Không còn route tạo/sửa/xoá hay nhập mã khi đặt sân.
 *
 * Hàm dưới đây CHỈ còn dùng để tính lại giảm giá cho các đơn CŨ đã áp mã khi chúng
 * được chuyển sân (services/transferService.js).
 */
async function validateAndCalculateDiscount(code, bookingAmount, serviceFee) {
    if (!code?.trim()) return { valid: false, message: 'Vui lòng nhập mã khuyến mãi' };

    const promotion = await Promotion.findOne({ code: code.trim().toUpperCase() });
    if (!promotion) return { valid: false, message: 'Mã khuyến mãi không tồn tại' };
    if (!promotion.isActive) return { valid: false, message: 'Mã khuyến mãi này đã ngừng áp dụng' };

    const now = new Date();
    if (now < promotion.startDate) return { valid: false, message: 'Mã khuyến mãi chưa đến ngày áp dụng' };
    if (now > promotion.endDate) return { valid: false, message: 'Mã khuyến mãi đã hết hạn' };
    if (promotion.maxUses > 0 && promotion.usedCount >= promotion.maxUses) {
        return { valid: false, message: 'Mã khuyến mãi đã hết lượt sử dụng' };
    }
    if (bookingAmount < promotion.minBookingAmount) {
        return { valid: false, message: `Đơn tối thiểu ${promotion.minBookingAmount.toLocaleString('vi-VN')}đ để dùng mã này` };
    }

    let discount = promotion.discountType === 'percent'
        ? Math.round(bookingAmount * (promotion.discountValue / 100))
        : promotion.discountValue;
    if (promotion.discountType === 'percent' && promotion.maxDiscountAmount > 0) {
        discount = Math.min(discount, promotion.maxDiscountAmount);
    }
    // Giảm giá không bao giờ vượt quá phí dịch vụ — đảm bảo nền tảng tự chịu
    // chi phí khuyến mãi, KHÔNG trừ vào phần chủ sân được nhận (amount).
    discount = Math.min(discount, serviceFee);

    return { valid: true, promotion, discount };
}

module.exports.validateAndCalculateDiscount = validateAndCalculateDiscount;
