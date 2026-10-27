/**
 * Chuẩn bị dữ liệu CŨ cho các tính năng mới. Chạy MỘT LẦN sau khi cập nhật mã:
 *     npm run migrate
 *
 * Script an toàn để chạy lại nhiều lần (idempotent).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Booking = require('../models/Booking');
const SlotLock = require('../models/SlotLock');
const Payment = require('../models/Payment');
const OwnerSettlement = require('../models/OwnerSettlement');
const PlatformSetting = require('../models/PlatformSetting');
const User = require('../models/User');
const { calculateAmount, durationHours, slotIndices } = require('../utils/timeSlots');

async function ensureSettings() {
    let settings = await PlatformSetting.findOne({ singleton: 'main' });
    if (!settings) settings = await PlatformSetting.create({ singleton: 'main' });
    // Các trường mới lấy giá trị mặc định của schema nếu chưa có
    await settings.save();
    console.log('✔ Cấu hình nền tảng đã sẵn sàng (hoa hồng %d%%, chuyển sân: %s)',
        settings.commissionRate, settings.transferEnabled ? 'bật' : 'tắt');
}

/**
 * Dựng khoá khung giờ cho các đơn CÒN HIỆU LỰC đã có sẵn trong cơ sở dữ liệu.
 * Không có bước này thì ràng buộc chống đặt trùng chỉ bảo vệ được đơn mới.
 */
async function backfillSlotLocks() {
    const bookings = await Booking.find({
        status: { $in: ['confirmed', 'pending', 'completed', 'no_show'] },
    }).select('_id courtId date startTime endTime');

    let created = 0;
    let skipped = 0;
    for (const b of bookings) {
        const indices = slotIndices(b.startTime, b.endTime);
        for (const slotIndex of indices) {
            try {
                await SlotLock.updateOne(
                    { courtId: b.courtId, date: b.date, slotIndex },
                    { $setOnInsert: { bookingId: b._id } },
                    { upsert: true }
                );
                created += 1;
            } catch {
                skipped += 1; // ô đã bị đơn khác giữ — dữ liệu cũ có thể đã trùng
            }
        }
    }
    console.log(`✔ Khoá khung giờ: tạo/xác nhận ${created} ô, bỏ qua ${skipped} ô trùng`);
    if (skipped > 0) {
        console.warn('⚠️  Có khung giờ bị đặt trùng từ trước. Hãy rà soát thủ công các đơn liên quan.');
    }
}

/**
 * Sửa các đơn cũ bị tính thiếu tiền do lỗi amount = pricePerHour (không nhân
 * số giờ). CHỈ cập nhật trường `duration` để báo cáo đúng — KHÔNG sửa `amount`
 * của đơn đã thanh toán, vì số tiền khách đã trả là dữ liệu lịch sử, sửa đè sẽ
 * làm lệch đối soát.
 */
async function backfillDurations() {
    const bookings = await Booking.find({ $or: [{ duration: { $exists: false } }, { duration: 1 }] })
        .select('_id startTime endTime duration amount');
    let updated = 0;
    let suspicious = 0;
    for (const b of bookings) {
        const hours = durationHours(b.startTime, b.endTime);
        if (!hours || hours === b.duration) continue;
        await Booking.updateOne({ _id: b._id }, { duration: hours });
        updated += 1;
        if (hours > 1) suspicious += 1;
    }
    console.log(`✔ Cập nhật số giờ cho ${updated} đơn`);
    if (suspicious > 0) {
        console.warn(`⚠️  ${suspicious} đơn có khung giờ dài hơn 1 tiếng và nhiều khả năng đã bị THU THIẾU TIỀN theo công thức cũ. Số tiền không được sửa tự động — hãy quyết định chính sách bù trừ.`);
    }
}

/** Đơn gốc của chuỗi chuyển: đơn cũ chưa từng chuyển thì tự trỏ về chính nó. */
async function backfillRootBooking() {
    const r = await Booking.updateMany(
        { rootBookingId: null },
        [{ $set: { rootBookingId: '$_id' } }]
    );
    console.log(`✔ Gán đơn gốc cho ${r.modifiedCount} bản ghi`);
}

/**
 * Chuyển giấy tờ hồ sơ chủ sân đã tồn tại TRƯỚC bản vá bảo mật này (còn lưu
 * đường dẫn công khai `/uploads/...`) sang thư mục riêng + đường dẫn có xác
 * thực (`/owner-documents/...`, xem controllers/documentController.js).
 * An toàn chạy lại nhiều lần: bản ghi đã ở đúng đường dẫn mới thì bỏ qua,
 * file nguồn không còn tồn tại (đã dọn tay trước đó) thì chỉ cảnh báo chứ
 * không làm hỏng dữ liệu.
 */
async function migrateOwnerDocsToPrivate() {
    const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
    const privateDir = path.join(__dirname, '..', process.env.PRIVATE_UPLOAD_DIR || 'private-uploads', 'owner-docs');
    fs.mkdirSync(privateDir, { recursive: true });

    const users = await User.find({ 'ownerApplicationDocuments.0': { $exists: true } });
    let moved = 0, alreadyDone = 0, missing = 0;
    for (const user of users) {
        let changed = false;
        for (const doc of user.ownerApplicationDocuments) {
            if (doc.url.startsWith('/owner-documents/')) { alreadyDone++; continue; }
            const filename = path.basename(doc.url);
            const src = path.join(uploadDir, filename);
            const dest = path.join(privateDir, filename);
            if (fs.existsSync(src)) {
                fs.renameSync(src, dest);
                moved++;
            } else if (!fs.existsSync(dest)) {
                console.warn(`⚠️  Không tìm thấy file gốc cho ${doc.url} (user ${user.email}) — chỉ đổi đường dẫn trong DB, không có file để chuyển.`);
                missing++;
            }
            doc.url = `/owner-documents/${filename}`;
            changed = true;
        }
        if (changed) await user.save();
    }
    console.log(`✔ Giấy tờ chủ sân: đã chuyển ${moved} file, ${alreadyDone} đã ở đúng chỗ từ trước${missing ? `, ${missing} thiếu file gốc` : ''}`);
}

/**
 * Mỗi đơn đặt sân chỉ được có MỘT giao dịch chuyển khoản đang mở. Dữ liệu cũ có
 * thể đã có hai (checkout bị gọi hai lần): giữ lại giao dịch khách đã báo chuyển
 * (nếu có) hoặc giao dịch mới nhất, đóng các giao dịch còn lại, rồi dựng unique
 * index `one_open_payment_per_booking`. Chạy lại nhiều lần vẫn an toàn.
 */
async function dedupeOpenPayments() {
    const open = await Payment.find({
        purpose: 'booking', bookingId: { $ne: null }, status: { $in: ['pending', 'awaiting_confirmation'] },
    }).sort({ createdAt: -1 });

    const byBooking = new Map();
    for (const p of open) {
        const key = String(p.bookingId);
        if (!byBooking.has(key)) byBooking.set(key, []);
        byBooking.get(key).push(p);
    }

    let closed = 0;
    for (const list of byBooking.values()) {
        // Ưu tiên giao dịch khách đã báo; hoà thì lấy cái mới nhất (list đã sắp mới → cũ)
        const keep = list.find((p) => p.status === 'awaiting_confirmation') || list[0];
        for (const p of list) {
            if (p === keep) { await p.save(); continue; } // pre-save gán openKey
            p.status = 'failed';
            p.refundReason = 'Giao dịch trùng — tự động đóng khi nâng cấp';
            await p.save();
            closed += 1;
        }
    }
    await Payment.createIndexes();
    await OwnerSettlement.createIndexes(); // dựng index 'một hoá đơn đang mở cho mỗi chủ sân'
    console.log(`✔ Giao dịch chuyển khoản: đóng ${closed} giao dịch trùng, đã dựng index chống trùng`);
}

/**
 * Admin không còn tham gia luồng thanh toán/hoàn tiền (chỉ vận hành hệ thống và
 * thu hoa hồng), nên:
 *  - giao dịch chuyển khoản ĐANG MỞ cũ nhận bằng tài khoản nền tảng được chuyển
 *    cho CHỦ SÂN xử lý (gắn receiver = tài khoản chủ sân hiện tại). Chủ sân chưa
 *    có tài khoản nhận tiền thì đóng giao dịch (đơn tự hết hạn như thường).
 *  - khoản hoàn đang chờ mà chưa có người hoàn được giao cho chủ sân của đơn.
 * Giao dịch ĐÃ hoàn tất nhận bằng tài khoản nền tảng giữ nguyên: sổ đối soát coi
 * nền tảng đang giữ khoản đó và sẽ lập hoá đơn nền tảng → chủ sân khi cần.
 */
async function moveAdminDutiesToOwners() {
    const Venue = require('../models/Venue');
    const TransferRequest = require('../models/TransferRequest');
    const bankTransfer = require('../utils/bankTransfer');

    const ownerOf = async (payment) => {
        if (payment.purpose === 'transfer_topup' && payment.transferId) {
            const t = await TransferRequest.findById(payment.transferId).select('toOwnerId fromOwnerId');
            return t ? (t.toOwnerId || t.fromOwnerId) : null;
        }
        if (payment.bookingId) {
            const b = await Booking.findById(payment.bookingId).select('venueId');
            const v = b ? await Venue.findById(b.venueId).select('ownerId') : null;
            return v?.ownerId || null;
        }
        return null;
    };

    let reassigned = 0, closed = 0;
    const open = await Payment.find({
        purpose: { $in: ['booking', 'transfer_topup'] },
        status: { $in: ['pending', 'awaiting_confirmation'] },
        'receiver.ownerId': null,
    });
    for (const p of open) {
        const ownerId = await ownerOf(p);
        const owner = ownerId ? await User.findById(ownerId).select('bankName bankBin bankAccount bankAccountName') : null;
        const account = bankTransfer.ownerAccount(owner);
        if (owner && bankTransfer.isAccountReady(account)) {
            p.receiver = {
                ownerId: owner._id, bankName: account.bankName, bankBin: account.bankBin,
                accountNumber: account.accountNumber, accountName: account.accountName,
            };
            reassigned += 1;
        } else {
            p.status = 'failed';
            p.refundReason = 'Chủ sân chưa có tài khoản nhận tiền — đóng khi nâng cấp';
            closed += 1;
        }
        await p.save();
    }

    let refunds = 0;
    const pendingRefunds = await Payment.find({ status: 'refund_requested', refundOwnerId: null });
    for (const p of pendingRefunds) {
        const ownerId = await ownerOf(p);
        if (!ownerId) continue;
        p.refundOwnerId = ownerId;
        await p.save();
        refunds += 1;
    }
    console.log(`✔ Chuyển việc của admin sang chủ sân: ${reassigned} giao dịch mở được gắn tài khoản chủ sân, ${closed} bị đóng (chủ sân chưa có tài khoản), ${refunds} khoản hoàn được giao cho chủ sân`);
}

/** Bỏ dữ liệu của tính năng tích điểm đã gỡ. Idempotent. */
async function dropLoyaltyData() {
    // Các trường này đã bị xoá khỏi schema nên phải tắt strict thì mongoose mới cho thao tác
    const RAW = { strict: false, strictQuery: false };
    const u = await User.updateMany({ loyaltyPoints: { $exists: true } }, { $unset: { loyaltyPoints: '' } }, RAW);
    const b = await Booking.updateMany(
        { $or: [{ pointsUsed: { $exists: true } }, { pointsApplied: { $exists: true } }, { refundPointsCount: { $exists: true } }] },
        { $unset: { pointsUsed: '', pointsApplied: '', refundPointsCount: '', refundPointsAmount: '' } },
        RAW,
    );
    const pay = await Payment.updateMany({ pointsApplied: { $exists: true } }, { $unset: { pointsApplied: '' } }, RAW);
    const ps = await PlatformSetting.updateMany({}, { $unset: { pointsPerAmount: '', pointsRedeemMaxRatio: '', pointValueVnd: '', bankAutoConfirmEnabled: '' } }, RAW);
    console.log(`✔ Gỡ dữ liệu tích điểm: ${u.modifiedCount} người dùng, ${b.modifiedCount} đơn, ${pay.modifiedCount} giao dịch, ${ps.modifiedCount} cấu hình`);
}

/** Mặc định mới: hạn nộp 7 ngày + ân hạn 3 ngày = khoá sau 10 ngày. Chỉ đổi cấu hình còn giữ ân hạn mặc định cũ (7). Idempotent. */
async function tuneFeeDeadlines() {
    const r = await PlatformSetting.updateMany({ commissionGraceDays: 7 }, { $set: { commissionGraceDays: 3 } });
    console.log(`✔ Ân hạn nộp phí dịch vụ về mặc định 3 ngày: ${r.modifiedCount} cấu hình`);
}

(async () => {
    await connectDB();
    console.log('--- Bắt đầu migrate ---');
    await ensureSettings();
    await backfillRootBooking();
    await backfillDurations();
    await backfillSlotLocks();
    await moveAdminDutiesToOwners();
    await dedupeOpenPayments();
    await dropLoyaltyData();
    await tuneFeeDeadlines();
    await migrateOwnerDocsToPrivate();
    console.log('--- Hoàn tất ---');
    await mongoose.disconnect();
    process.exit(0);
})().catch((err) => {
    console.error('Migrate thất bại:', err);
    process.exit(1);
});
