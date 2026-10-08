const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const User = require('../models/User');
const Notification = require('../models/Notification');
const OwnerSettlement = require('../models/OwnerSettlement');
const { getSettings } = require('../utils/platformSettings');
const { balanceFromData } = require('../utils/settlementMath');

/**
 * ĐỐI SOÁT HOA HỒNG VỚI CHỦ SÂN.
 *
 * Khách chuyển tiền đặt sân THẲNG cho chủ sân nên nền tảng không có tiền trong tay để
 * "khấu trừ" 10%. Cách làm: tính SỐ DƯ cộng dồn của từng chủ sân (công thức ở
 * utils/settlementMath.js), định kỳ lập hoá đơn đối soát; chủ sân nộp phần nợ qua
 * chuyển khoản, quản trị viên đối chiếu rồi xác nhận. Chủ sân quá hạn nộp sẽ tạm
 * ngưng nhận đặt MỚI (đơn đã đặt vẫn giữ nguyên) cho tới khi thanh toán.
 *
 * Quản trị viên CHỈ xử lý quan hệ với chủ sân (hoa hồng); không dính vào việc đặt
 * sân giữa khách và chủ sân.
 */

/** Hoá đơn nhỏ hơn mức này không đáng để lập (tránh hoá đơn vài đồng do làm tròn). */
const MIN_INVOICE_VND = 1000;
const DAY = 24 * 60 * 60 * 1000;

/** Tính số dư hiện tại của một chủ sân từ dữ liệu trong CSDL. */
async function computeBalance(ownerId) {
    const venues = await Venue.find({ ownerId }).select('_id');
    const venueIds = venues.map((v) => v._id);

    const [bookings, cashPayments, ownerRefunds, settlements, payouts] = await Promise.all([
        Booking.find({ venueId: { $in: venueIds } })
            .select('status paymentMethod amount serviceFee ownerCommission compensationAmount refundAmount refundCreditAmount cancellationFee transferFeeAmount'),
        // Tiền khách đã chuyển thẳng vào tài khoản chủ sân (đã được chủ sân xác nhận)
        // Giao dịch đang/đã hoàn vẫn là tiền ĐÃ vào tài khoản chủ sân — phần hoàn được trừ riêng ở dưới.
        Payment.find({
            purpose: { $in: ['booking', 'transfer_topup'] },
            status: { $in: ['completed', 'refund_requested', 'refunded'] },
            'receiver.ownerId': ownerId,
        }).select('amount'),
        // Tiền chủ sân đã/đang phải hoàn lại cho khách (còn chờ hoàn cũng tính — đó là nghĩa vụ
        // với khách, không phải tiền của chủ sân)
        Payment.find({ refundOwnerId: ownerId, status: { $in: ['refund_requested', 'refunded'] } }).select('amount'),
        OwnerSettlement.find({ ownerId }).select('status direction amount'),
        Payout.find({ ownerId }).select('amount'),
    ]);

    return balanceFromData({ bookings, cashPayments, ownerRefunds, settlements, payouts });
}

function genCode(ownerId, now = new Date()) {
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `HH${ym}${String(ownerId).slice(-6).toUpperCase()}${rand}`;
}

function periodOf(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

class SettlementError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

/**
 * Lập hoá đơn đối soát cho một chủ sân theo số dư hiện tại.
 * @returns {{settlement?: object, skipped?: string}}
 */
async function issueSettlement(ownerId, { issuedBy = null } = {}) {
    const open = await OwnerSettlement.findOne({ ownerId, status: { $in: ['issued', 'reported'] } });
    if (open) throw new SettlementError(409, 'Chủ sân này đang có một hoá đơn đối soát chưa hoàn tất');

    const owner = await User.findById(ownerId).select('name bankName bankBin bankAccount bankAccountName bankInfoPendingReview');
    if (!owner) throw new SettlementError(404, 'Không tìm thấy chủ sân này');

    const bal = await computeBalance(ownerId);
    const amount = Math.abs(Math.round(bal.balance));
    if (amount < MIN_INVOICE_VND) return { skipped: 'balance_too_small', balance: bal };

    const direction = bal.balance > 0 ? 'owner_pays' : 'platform_pays';
    const settings = await getSettings();

    let payee;
    if (direction === 'owner_pays') {
        // Chủ sân nộp vào tài khoản NỀN TẢNG — phải có đủ thông tin để sinh mã QR
        if (!settings.bankBin || !settings.bankAccountNumber) {
            throw new SettlementError(409, 'Chưa cấu hình tài khoản nền tảng (Cài đặt → Tài khoản nền tảng) nên chưa thể lập hoá đơn thu phí dịch vụ.');
        }
        payee = {
            bankName: settings.bankName || '', bankBin: settings.bankBin,
            accountNumber: settings.bankAccountNumber, accountName: settings.bankAccountName || '',
        };
    } else {
        // Nền tảng chuyển cho chủ sân — giữ nguyên chốt chặn xác minh tài khoản mới đổi
        if (owner.bankInfoPendingReview) {
            throw new SettlementError(409, `Chủ sân "${owner.name}" vừa đổi thông tin ngân hàng, chưa được xác minh. Hãy xác minh trước khi lập khoản nền tảng chuyển cho chủ sân.`);
        }
        if (!owner.bankAccount) throw new SettlementError(409, 'Chủ sân chưa cập nhật tài khoản nhận tiền.');
        payee = { bankName: owner.bankName || '', bankBin: owner.bankBin || '', accountNumber: owner.bankAccount, accountName: owner.bankAccountName || '' };
    }

    const now = new Date();
    let settlement;
    try {
        settlement = await OwnerSettlement.create({
            ownerId, code: genCode(ownerId, now), period: periodOf(now),
            direction, amount,
            dueDate: new Date(now.getTime() + (settings.commissionDueDays || 7) * DAY),
            issuedBy,
            snapshot: {
                cashHeld: bal.cashHeld, entitlement: bal.entitlement, refundsByOwner: bal.refundsByOwner,
                remitted: bal.remitted, platformPaid: bal.platformPaid, balance: bal.balance, bookingCount: bal.bookingCount,
            },
            payee,
        });
    } catch (err) {
        if (err?.code === 11000) throw new SettlementError(409, 'Chủ sân này đang có một hoá đơn đối soát chưa hoàn tất');
        throw err;
    }

    const money = `${amount.toLocaleString('vi-VN')}đ`;
    await Notification.create({
        userId: ownerId, type: 'payment', icon: '🧾',
        title: direction === 'owner_pays' ? 'Phí dịch vụ tháng này cần thanh toán' : 'Điều chỉnh đối soát với nền tảng',
        message: direction === 'owner_pays'
            ? `Phí dịch vụ nền tảng kỳ ${settlement.period}: ${money}. Vui lòng chuyển khoản trước ${settlement.dueDate.toLocaleDateString('vi-VN')} (nội dung: ${settlement.code}). Quá hạn ${settings.commissionGraceDays ?? 3} ngày chưa thanh toán, địa điểm của bạn sẽ bị khoá.`
            : `Có khoản điều chỉnh đối soát ${money} (khách dùng số dư tín dụng). Quản trị viên sẽ chuyển khoản cho bạn.`,
        link: '/owner/commission',
    }).catch(() => {});

    return { settlement };
}

/** Chủ sân báo "đã chuyển khoản" cho hoá đơn owner_pays (nguyên tử: chỉ một lần). */
async function reportPaid(settlementId, ownerId, note = '') {
    const updated = await OwnerSettlement.findOneAndUpdate(
        { _id: settlementId, ownerId, direction: 'owner_pays', status: 'issued' },
        { $set: { status: 'reported', reportedAt: new Date(), reportedNote: String(note || '').slice(0, 300), rejectionNote: '' } },
        { new: true },
    );
    if (!updated) {
        const s = await OwnerSettlement.findOne({ _id: settlementId, ownerId });
        if (!s) throw new SettlementError(404, 'Không tìm thấy hoá đơn này');
        if (s.direction !== 'owner_pays') throw new SettlementError(409, 'Đây là khoản nền tảng chuyển cho bạn, không cần bạn báo chuyển khoản');
        if (s.status === 'reported') return s; // bấm lại: không báo admin lần hai
        throw new SettlementError(409, 'Hoá đơn này không còn ở trạng thái chờ thanh toán');
    }

    const admins = await User.find({ role: 'admin' }).select('_id');
    await Notification.insertMany(admins.map((a) => ({
        userId: a._id, type: 'payment', icon: '🏦',
        title: 'Chủ sân báo đã nộp phí dịch vụ',
        message: `Hoá đơn ${updated.code} — ${updated.amount.toLocaleString('vi-VN')}đ. Vui lòng đối chiếu sao kê và xác nhận.`,
        link: '/admin/settlements',
    }))).catch(() => {});
    return updated;
}

/** Admin xác nhận đã nhận tiền (owner_pays) hoặc đã chuyển tiền cho chủ sân (platform_pays). */
async function confirmSettlement(settlementId, adminId, { auto = false } = {}) {
    const claimed = await OwnerSettlement.findOneAndUpdate(
        { _id: settlementId, status: { $in: ['issued', 'reported'] } },
        { $set: { status: 'paid', confirmedAt: new Date(), confirmedBy: adminId || null, autoConfirmed: !!auto }, $unset: { openKey: '' } },
        { new: true },
    );
    if (!claimed) {
        const s = await OwnerSettlement.findById(settlementId);
        if (!s) throw new SettlementError(404, 'Không tìm thấy hoá đơn này');
        if (s.status === 'paid') return s;
        throw new SettlementError(409, 'Hoá đơn này không còn ở trạng thái có thể xác nhận');
    }
    await Notification.create({
        userId: claimed.ownerId, type: 'payment', icon: '✅',
        title: claimed.direction === 'owner_pays' ? 'Đã nhận phí dịch vụ của bạn' : 'Đã chuyển khoản điều chỉnh cho bạn',
        message: claimed.direction === 'owner_pays'
            ? `Hoá đơn ${claimed.code} (${claimed.amount.toLocaleString('vi-VN')}đ) đã được xác nhận thanh toán${auto ? ' tự động' : ''}. Cảm ơn bạn!`
            : `Hoá đơn ${claimed.code}: nền tảng đã chuyển ${claimed.amount.toLocaleString('vi-VN')}đ cho bạn.`,
        link: '/owner/commission',
    }).catch(() => {});
    return claimed;
}

/** Admin chưa thấy tiền → trả hoá đơn về 'issued' để chủ sân kiểm tra lại. */
async function rejectReport(settlementId, reason) {
    const updated = await OwnerSettlement.findOneAndUpdate(
        { _id: settlementId, direction: 'owner_pays', status: 'reported' },
        { $set: { status: 'issued', rejectionNote: String(reason || '').slice(0, 300) || 'Chưa thấy khoản chuyển khớp trên sao kê' } },
        { new: true },
    );
    if (!updated) throw new SettlementError(409, 'Chỉ từ chối được hoá đơn chủ sân đã báo chuyển khoản');
    await Notification.create({
        userId: updated.ownerId, type: 'payment', icon: '⚠️',
        title: 'Chưa xác nhận được khoản nộp phí dịch vụ',
        message: `Hoá đơn ${updated.code}: ${updated.rejectionNote}. Vui lòng kiểm tra lại và báo lại sau khi chuyển đúng.`,
        link: '/owner/commission',
    }).catch(() => {});
    return updated;
}

/** Admin huỷ một hoá đơn lập nhầm (số dư không đổi vì hoá đơn chưa 'paid'). */
async function cancelSettlement(settlementId) {
    const updated = await OwnerSettlement.findOneAndUpdate(
        { _id: settlementId, status: { $in: ['issued', 'reported'] } },
        { $set: { status: 'cancelled' }, $unset: { openKey: '' } },
        { new: true },
    );
    if (!updated) throw new SettlementError(409, 'Chỉ huỷ được hoá đơn đang chờ');
    return updated;
}

/**
 * Chủ sân có đang bị tạm ngưng nhận đặt MỚI vì nợ hoa hồng quá hạn không?
 * Chỉ tính hoá đơn 'issued' (chưa báo chuyển) quá hạn + số ngày ân hạn. Hoá đơn đã
 * 'reported' đang chờ admin đối chiếu nên không phạt chủ sân vì chờ đợi của admin.
 */
async function isOwnerBlocked(ownerId) {
    if (!ownerId) return false;
    const settings = await getSettings();
    if (!settings.commissionBlockEnabled) return false;
    const cutoff = new Date(Date.now() - (settings.commissionGraceDays ?? 3) * DAY);
    return !!(await OwnerSettlement.exists({
        ownerId, direction: 'owner_pays', status: 'issued', dueDate: { $lt: cutoff },
    }));
}

/** Phí dịch vụ nền tảng thu trên một lượt đặt = phần khách chịu + phần chủ sân chịu. */
const feeOfBooking = (b) => (b.serviceFee || 0) + (b.ownerCommission || 0);

/** Đơn nào tạo ra phí dịch vụ: đã được chủ sân xác nhận thu tiền qua hệ thống (không tính đơn tự tạo tại quầy, đơn đã chuyển đi). */
const FEE_STATUSES = ['confirmed', 'completed', 'no_show'];

/**
 * Phí dịch vụ theo TỪNG ĐƠN của chủ sân trong một tháng ('YYYY-MM', mặc định tháng hiện tại).
 * Cùng số liệu với công thức đối soát (utils/settlementMath.js) để con số chủ sân thấy ở trang
 * thống kê khớp với hoá đơn.
 */
async function listFeeOrders(ownerId, month = periodOf()) {
    const venues = await Venue.find({ ownerId }).select('_id');
    const bookings = await Booking.find({
        venueId: { $in: venues.map((v) => v._id) },
        status: { $in: FEE_STATUSES },
        paymentMethod: { $ne: 'manual' },
    }).select('date startTime endTime venueName courtName amount serviceFee ownerCommission status createdAt');

    const rows = bookings
        .filter((b) => String(b.date || '').slice(0, 7) === month)
        .map((b) => ({
            _id: b._id, date: b.date, startTime: b.startTime, endTime: b.endTime,
            venueName: b.venueName, courtName: b.courtName,
            amount: b.amount || 0, fee: feeOfBooking(b), status: b.status,
        }))
        .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    return {
        month, orders: rows,
        totalFee: rows.reduce((t, r) => t + r.fee, 0),
        totalAmount: rows.reduce((t, r) => t + r.amount, 0),
    };
}

/** Thời điểm địa điểm bị khoá nếu hoá đơn vẫn chưa được thanh toán. */
const lockDateOf = (settlement, graceDays) => new Date(new Date(settlement.dueDate).getTime() + (graceDays ?? 3) * DAY);

/** Id các chủ sân đang bị khoá (địa điểm không hiện công khai, không nhận đặt mới). */
async function blockedOwnerIds() {
    const settings = await getSettings();
    if (!settings.commissionBlockEnabled) return [];
    const cutoff = new Date(Date.now() - (settings.commissionGraceDays ?? 3) * DAY);
    const rows = await OwnerSettlement.find({
        direction: 'owner_pays', status: 'issued', dueDate: { $lt: cutoff },
    }).select('ownerId');
    return rows.map((r) => r.ownerId);
}

/**
 * TỰ ĐỘNG XÁC NHẬN từ một giao dịch tiền VÀO tài khoản nền tảng (webhook của dịch vụ đọc sao kê).
 *
 * Khớp theo MÃ HOÁ ĐƠN nằm trong nội dung chuyển khoản (đã bỏ dấu cách/ký tự lạ vì ngân hàng hay
 * chèn), kiểm tra đúng tài khoản nhận, rồi cộng số tiền vào hoá đơn. Đủ tiền → hoá đơn 'paid' ngay,
 * popup nhắc nộp tự tắt vì không còn hoá đơn mở. Chưa đủ → cộng dồn và báo chủ sân số còn thiếu.
 * Cùng một mã giao dịch bắn lại nhiều lần chỉ được cộng MỘT lần.
 *
 * @returns {{status: 'confirmed'|'partial'|'duplicate'|'no_match'|'ignored', settlement?: object}}
 */
async function autoConfirmFromBank({ txnId, amount, content, accountNumber = '', direction = 'in' }) {
    const money = Math.round(Number(amount) || 0);
    if (direction !== 'in' || money <= 0 || !txnId) return { status: 'ignored' };

    const norm = String(content || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!norm) return { status: 'no_match' };

    const open = await OwnerSettlement.find({ direction: 'owner_pays', status: { $in: ['issued', 'reported'] } });
    const target = open.find((x) => norm.includes(String(x.code).toUpperCase()));
    if (!target) return { status: 'no_match' };

    // Tiền phải vào ĐÚNG tài khoản nhận ghi trên hoá đơn (nếu nhà cung cấp gửi kèm số tài khoản)
    const acct = String(accountNumber || '').replace(/\D/g, '');
    const expected = String(target.payee?.accountNumber || '').replace(/\D/g, '');
    if (acct && expected && acct !== expected) return { status: 'no_match' };

    const updated = await OwnerSettlement.findOneAndUpdate(
        { _id: target._id, status: { $in: ['issued', 'reported'] }, bankTxnIds: { $ne: txnId } },
        { $inc: { receivedAmount: money }, $push: { bankTxnIds: String(txnId) } },
        { new: true },
    );
    if (!updated) return { status: 'duplicate' };

    if ((updated.receivedAmount || 0) >= updated.amount) {
        const paid = await confirmSettlement(updated._id, null, { auto: true });
        return { status: 'confirmed', settlement: paid };
    }

    const missing = updated.amount - (updated.receivedAmount || 0);
    await Notification.create({
        userId: updated.ownerId, type: 'payment', icon: '⚠️',
        title: 'Phí dịch vụ mới được thanh toán một phần',
        message: `Hệ thống đã nhận ${money.toLocaleString('vi-VN')}đ cho hoá đơn ${updated.code}, còn thiếu ${missing.toLocaleString('vi-VN')}đ. Vui lòng chuyển nốt (cùng nội dung ${updated.code}).`,
        link: '/owner/commission',
    }).catch(() => {});
    return { status: 'partial', settlement: updated };
}

/**
 * Nhắc hạn: sắp đến hạn (còn ≤ 2 ngày) → quá hạn → đã bị khoá. Mỗi bậc chỉ gửi MỘT lần
 * (reminderStage tăng nguyên tử nên chạy lại nhiều lần/nhiều tiến trình vẫn không gửi trùng).
 */
async function sendFeeReminders(now = new Date()) {
    const settings = await getSettings();
    const grace = settings.commissionGraceDays ?? 3;
    const open = await OwnerSettlement.find({ direction: 'owner_pays', status: 'issued' });
    let sent = 0;
    for (const s of open) {
        const due = new Date(s.dueDate).getTime();
        const lock = due + grace * DAY;
        const t = now.getTime();
        const stage = t >= lock && settings.commissionBlockEnabled ? 3 : t >= due ? 2 : t >= due - 2 * DAY ? 1 : 0;
        if (stage === 0 || (s.reminderStage || 0) >= stage) continue;

        const claimed = await OwnerSettlement.findOneAndUpdate(
            { _id: s._id, status: 'issued', reminderStage: { $lt: stage } },
            { $set: { reminderStage: stage } },
            { new: true },
        );
        if (!claimed) continue;

        const money = `${claimed.amount.toLocaleString('vi-VN')}đ`;
        const dueTxt = new Date(claimed.dueDate).toLocaleDateString('vi-VN');
        const lockTxt = new Date(lock).toLocaleDateString('vi-VN');
        const msg = stage === 1
            ? { title: 'Sắp đến hạn nộp phí dịch vụ', message: `Phí dịch vụ ${money} (hoá đơn ${claimed.code}) đến hạn ngày ${dueTxt}. Quá ${grace} ngày sau hạn chưa thanh toán, địa điểm của bạn sẽ bị khoá.` }
            : stage === 2
                ? { title: 'Phí dịch vụ đã quá hạn', message: `Hoá đơn ${claimed.code} (${money}) đã quá hạn. Hãy thanh toán trước ${lockTxt}, sau ngày này địa điểm của bạn sẽ bị khoá và không còn hiển thị trên hệ thống.` }
                : { title: 'Địa điểm của bạn đã bị khoá', message: `Do hoá đơn ${claimed.code} (${money}) quá hạn, địa điểm của bạn đã bị khoá: không hiển thị và không nhận đặt mới (các đơn đã đặt vẫn giữ nguyên). Thanh toán hoá đơn để mở lại ngay.` };
        await Notification.create({ userId: claimed.ownerId, type: 'payment', icon: stage === 3 ? '🔒' : '⏰', ...msg, link: '/owner/commission' }).catch(() => {});
        sent += 1;
    }
    return sent;
}

let lastAutoIssueDay = '';
/**
 * Tác vụ nền: những ngày đầu tháng, lập hoá đơn cho mọi chủ sân còn số dư mà tháng này
 * chưa có hoá đơn. Chạy lại nhiều lần trong ngày vẫn an toàn (kiểm tra theo kỳ + unique
 * index hoá đơn đang mở).
 */
async function autoIssueMonthly(now = new Date()) {
    const settings = await getSettings();
    if (!settings.commissionAutoIssueEnabled) return 0;
    if (now.getDate() > 3) return 0; // chỉ lập trong 3 ngày đầu tháng (chịu được lúc máy chủ tắt vài hôm)
    const today = now.toISOString().slice(0, 10);
    if (lastAutoIssueDay === today) return 0;
    lastAutoIssueDay = today;

    const period = periodOf(now);
    const owners = await User.find({ role: 'owner' }).select('_id');
    let issued = 0;
    for (const o of owners) {
        try {
            const exists = await OwnerSettlement.exists({ ownerId: o._id, period, status: { $ne: 'cancelled' } });
            if (exists) continue;
            const r = await issueSettlement(o._id);
            if (r.settlement) issued += 1;
        } catch (err) {
            console.error('autoIssueMonthly', String(o._id), err.message);
        }
    }
    return issued;
}

module.exports = {
    MIN_INVOICE_VND, SettlementError,
    computeBalance, issueSettlement, reportPaid, confirmSettlement, rejectReport, cancelSettlement,
    isOwnerBlocked, autoIssueMonthly,
    listFeeOrders, feeOfBooking, lockDateOf, blockedOwnerIds, autoConfirmFromBank, sendFeeReminders,
};
