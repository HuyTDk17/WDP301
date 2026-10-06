/**
 * CHUYỂN KHOẢN NGÂN HÀNG — thay thế VNPay/MoMo.
 *
 * ============ VÌ SAO ĐỔI SANG CHUYỂN KHOẢN ============
 *
 * VNPay/MoMo yêu cầu đăng ký merchant, duyệt hồ sơ doanh nghiệp mất 1–2 tuần,
 * và một khoản phí giao dịch theo phần trăm. Chuyển khoản ngân hàng trực tiếp
 * không cần đăng ký gì cả — chỉ cần một tài khoản ngân hàng bất kỳ — nên có thể
 * chạy thật ngay hôm nay. Đánh đổi: xác nhận thanh toán không còn tự động 100%
 * trừ khi trả thêm cho một dịch vụ đối soát sao kê (SePay, Casso...).
 *
 * ============ VIETQR — KHÔNG CẦN ĐĂNG KÝ, KHÔNG CẦN KHOÁ API ============
 *
 * img.vietqr.io là dịch vụ công khai do Napas/VietQR vận hành, sinh ảnh mã QR
 * "VietQR nhanh" (quick link) từ 4 tham số: mã BIN ngân hàng, số tài khoản, số
 * tiền, nội dung. Hầu hết app ngân hàng Việt Nam quét được để tự điền sẵn form
 * chuyển khoản. Không có gì bí mật trong các tham số này — số tài khoản vốn dĩ
 * đã hiển thị công khai trên hoá đơn — nên gọi thẳng dịch vụ ngoài mà không cần
 * lo rò rỉ dữ liệu nhạy cảm.
 */

/** Sinh URL ảnh mã QR VietQR. Không cần gọi mạng — chỉ ghép chuỗi. */
function buildQrUrl({ bin, accountNumber, accountName, amount, content }) {
    if (!bin || !accountNumber) return null;
    const params = new URLSearchParams({
        amount: String(Math.round(amount || 0)),
        addInfo: content || '',
        accountName: accountName || '',
    });
    return `https://img.vietqr.io/image/${bin}-${accountNumber}-compact2.png?${params.toString()}`;
}

/**
 * Gói đầy đủ thông tin để frontend hiển thị: tên ngân hàng, số tài khoản, chủ
 * tài khoản, số tiền, nội dung chuyển khoản, và URL mã QR.
 *
 * @param {object} settings  PlatformSetting hiện hành
 * @param {number} amount    số tiền cần chuyển
 * @param {string} content   nội dung chuyển khoản — PHẢI là orderRef của giao
 *                            dịch, dùng để đối chiếu khi xác nhận (thủ công lẫn
 *                            tự động qua webhook)
 */
function buildInstructions({ settings, amount, content }) {
    const configured = !!(settings.bankBin && settings.bankAccountNumber);
    return {
        configured,
        bankName: settings.bankName || '',
        accountNumber: settings.bankAccountNumber || '',
        accountName: settings.bankAccountName || '',
        amount: Math.round(amount || 0),
        content,
        qrUrl: configured
            ? buildQrUrl({
                bin: settings.bankBin, accountNumber: settings.bankAccountNumber,
                accountName: settings.bankAccountName, amount, content,
            })
            : null,
        // Khách cần biết cửa sổ này để không mở app ngân hàng quá muộn khiến
        // đơn tự huỷ — nhưng LƯU Ý: một khi đã bấm "Tôi đã chuyển khoản", đơn
        // KHÔNG tự huỷ theo cửa sổ này nữa (xem jobs/index.js).
        windowMinutes: settings.bankTransferWindowMinutes || 30,
    };
}

/**
 * Trích tài khoản nhận tiền của MỘT CHỦ SÂN (từ User) về dạng chung.
 * Đơn đặt sân được khách chuyển khoản trực tiếp vào tài khoản này — KHÔNG phải
 * tài khoản của nền tảng/quản trị viên.
 */
function ownerAccount(owner) {
    return {
        ownerId: owner?._id || null,
        bankName: owner?.bankName || '',
        bankBin: owner?.bankBin || '',
        accountNumber: owner?.bankAccount || '',
        accountName: owner?.bankAccountName || '',
    };
}

/** Tài khoản đã đủ thông tin để sinh mã QR chưa (cần cả BIN lẫn số tài khoản). */
function isAccountReady(account) {
    return !!(account && account.bankBin && account.accountNumber);
}

/**
 * Giống buildInstructions nhưng nhận một tài khoản bất kỳ thay vì đọc từ cài
 * đặt nền tảng. Dùng cho đơn đặt sân (tài khoản chủ sân). Không bao giờ bật
 * đối soát tự động — webhook ngân hàng chỉ theo dõi tài khoản của nền tảng,
 * không thấy được tiền chảy vào tài khoản chủ sân; chủ sân tự xác nhận.
 *
 * @param {object} account  { bankName, bankBin, accountNumber, accountName }
 * @param {number} windowMinutes cửa sổ chờ chuyển khoản
 */
function buildInstructionsForAccount({ account, windowMinutes, amount, content }) {
    const configured = isAccountReady(account);
    return {
        configured,
        bankName: account?.bankName || '',
        accountNumber: account?.accountNumber || '',
        accountName: account?.accountName || '',
        amount: Math.round(amount || 0),
        content,
        qrUrl: configured
            ? buildQrUrl({
                bin: account.bankBin, accountNumber: account.accountNumber,
                accountName: account.accountName, amount, content,
            })
            : null,
        windowMinutes: windowMinutes || 30,
    };
}

/**
 * Chuẩn hoá một chuỗi về dạng chỉ gồm chữ hoa và số, bỏ khoảng trắng và dấu câu.
 * Dùng để so khớp "nội dung chuyển khoản" — ngân hàng thường thêm tiền tố như
 * "CT tu [tên]" hoặc chèn khoảng trắng lạ vào giữa nội dung khách nhập.
 */
function normalize(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Nội dung chuyển khoản có chứa đúng mã đơn hàng này không. */
function contentMatches(freeText, orderRef) {
    if (!orderRef) return false;
    return normalize(freeText).includes(normalize(orderRef));
}

module.exports = {
    buildQrUrl, buildInstructions, buildInstructionsForAccount,
    ownerAccount, isAccountReady, normalize, contentMatches,
};
