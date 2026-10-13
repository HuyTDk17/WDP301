/**
 * HÓA ĐƠN / BIÊN LAI cho khách hàng — hàm thuần, chỉ dựng dữ liệu để hiển thị.
 *
 * Cố ý KHÔNG đưa ra các trường nội bộ (hoa hồng chủ sân, tỉ lệ hoa hồng, mã giao dịch
 * cổng thanh toán...). Hóa đơn chỉ gồm những gì khách đã trả và đã nhận.
 */

// Chỉ lượt đặt đã xác nhận thanh toán hoặc đã dùng xong mới có hóa đơn.
const INVOICEABLE_STATUSES = ['confirmed', 'completed'];

const METHOD_LABEL = {
    bank_transfer: 'Chuyển khoản ngân hàng',
    credit: 'Số dư khuyến mãi',
    manual: 'Thanh toán tại sân',
};

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Số hóa đơn ổn định theo lượt đặt: ES360-YYYYMMDD-XXXXXX (ngày tạo theo giờ Việt Nam). */
function invoiceNumber(booking) {
    const created = booking.createdAt ? new Date(booking.createdAt) : new Date(0);
    const ymd = new Date(created.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
    const tail = String(booking._id).slice(-6).toUpperCase();
    return `ES360-${ymd}-${tail}`;
}

const int = (n) => Math.round(Number(n) || 0);

function formatAddress(address = {}) {
    return [address.street, address.district, address.city].filter(Boolean).join(', ');
}

function buildInvoice({ booking, venue, owner, customer, payment, settings = {} }) {
    const amount = int(booking.amount);
    const serviceFee = int(booking.serviceFee);
    const discount = int(booking.discountAmount);
    const total = amount + serviceFee - discount;

    const lines = [{ label: 'Tiền thuê sân', amount }];
    if (serviceFee > 0) lines.push({ label: 'Phí dịch vụ', amount: serviceFee });
    if (discount > 0) lines.push({ label: 'Giảm giá', amount: -discount });

    const method = payment?.method || booking.paymentMethod || 'manual';
    const creditApplied = int(booking.creditApplied);

    return {
        invoiceNo: invoiceNumber(booking),
        issuedAt: payment?.updatedAt || booking.updatedAt || booking.createdAt,
        bookingId: booking._id,
        status: booking.status,
        platform: { name: settings.platformName || 'ESport360', supportEmail: settings.supportEmail || '' },
        seller: {
            venueName: booking.venueName || venue?.name || '',
            address: formatAddress(venue?.address),
            ownerName: owner?.name || '',
        },
        customer: { name: customer?.name || '', email: customer?.email || '', phone: customer?.phone || '' },
        service: {
            venueName: booking.venueName || venue?.name || '',
            courtName: booking.courtName || '',
            sport: booking.sport || '',
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            duration: booking.duration || 1,
        },
        lines,
        total,
        payment: {
            method,
            methodLabel: METHOD_LABEL[method] || METHOD_LABEL.manual,
            reference: payment?.orderRef || '',
            // Phần trả bằng số dư khuyến mãi (nếu có) — phần còn lại là tiền thật.
            creditApplied,
            cashPaid: Math.max(0, total - creditApplied),
        },
    };
}

module.exports = { buildInvoice, invoiceNumber, INVOICEABLE_STATUSES, METHOD_LABEL };
