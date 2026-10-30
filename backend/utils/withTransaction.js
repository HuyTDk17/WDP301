const mongoose = require('mongoose');

/**
 * Chạy một khối lệnh trong giao dịch.
 *
 * Giao dịch của MongoDB chỉ hoạt động trên replica set. Máy phát triển thường
 * chạy MongoDB đơn lẻ (standalone) nên sẽ báo lỗi.
 *
 * ============ THAY ĐỔI SO VỚI BẢN CŨ ============
 *
 * Bản cũ tự động tụt xuống chế độ KHÔNG giao dịch ở mọi môi trường và chỉ in
 * một dòng console.warn. Cơ chế đó tiện cho lúc code nhưng cực kỳ nguy hiểm khi
 * chạy thật: nếu production lỡ trỏ vào một MongoDB standalone, nghiệp vụ chuyển
 * sân sẽ chạy nửa vời khi có lỗi giữa chừng — khách mất khung giờ cũ mà không
 * có khung giờ mới, hoặc sổ cái ghi thiếu bút toán. Không ai phát hiện ra cho
 * tới lúc đối soát.
 *
 * Giờ: development vẫn được phép chạy không giao dịch (kèm cảnh báo), nhưng
 * production thì NÉM LỖI. Thà một request thất bại rõ ràng còn hơn ghi sổ sai.
 */
let transactionsSupported = null;

const IS_PROD = process.env.NODE_ENV === 'production';

function refuse(reason) {
    const err = new Error(
        `Máy chủ MongoDB không hỗ trợ giao dịch (${reason}). ` +
        'Nghiệp vụ này liên quan tới tiền của nhiều bên nên không được phép thực thi ' +
        'nửa vời. Vui lòng cấu hình MONGO_URI trỏ tới một replica set.'
    );
    err.statusCode = 503;
    throw err;
}

async function withTransaction(work) {
    if (transactionsSupported === false) {
        if (IS_PROD) refuse('đã phát hiện ở lần gọi trước');
        return work(null);
    }

    let session;
    try {
        session = await mongoose.startSession();
    } catch (err) {
        transactionsSupported = false;
        if (IS_PROD) refuse(err.message);
        console.warn('⚠️  Không mở được session MongoDB — chạy ở chế độ không giao dịch (chỉ dành cho máy phát triển).');
        return work(null);
    }

    try {
        let result;
        await session.withTransaction(async () => { result = await work(session); });
        transactionsSupported = true;
        return result;
    } catch (err) {
        const unsupported = /Transaction numbers are only allowed|replica set|not supported|Transactions are not supported/i
            .test(err?.message || '');

        if (unsupported && transactionsSupported === null) {
            transactionsSupported = false;
            if (IS_PROD) refuse(err.message);
            console.warn(
                '⚠️  MongoDB không hỗ trợ giao dịch (cần replica set). Đang chạy ở chế độ ' +
                'không giao dịch — KHÔNG dùng cho môi trường thật.'
            );
            return work(null);
        }
        throw err;
    } finally {
        if (session) session.endSession();
    }
}

/** Cho phép nơi khác (vd. /api/health) biết tình trạng hỗ trợ giao dịch. */
withTransaction.isSupported = () => transactionsSupported;

module.exports = withTransaction;
