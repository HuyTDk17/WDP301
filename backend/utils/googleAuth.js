const { OAuth2Client } = require('google-auth-library');

/**
 * Xác minh ID token do Google Identity Services trả về ở trình duyệt.
 *
 * Luồng: trình duyệt hiện nút "Đăng nhập bằng Google" → người dùng chọn tài
 * khoản → Google trả về `credential` (một JWT ký bởi Google) cho frontend →
 * frontend gửi credential đó lên POST /api/auth/google → hàm này xác minh.
 *
 * Không cần GOOGLE_CLIENT_SECRET: đây là luồng ID token (chỉ cần Client ID để
 * kiểm tra token được cấp ĐÚNG CHO ứng dụng này), không phải luồng đổi
 * authorization code phía server.
 *
 * Cấu hình: tạo "OAuth 2.0 Client ID" loại Web application ở Google Cloud
 * Console (APIs & Services → Credentials), thêm domain frontend vào
 * "Authorized JavaScript origins", rồi đặt GOOGLE_CLIENT_ID ở backend và
 * VITE_GOOGLE_CLIENT_ID (cùng giá trị) ở frontend lúc build.
 */

class GoogleAuthError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

let client = null;

const isConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleCredential(credential) {
    if (!isConfigured()) {
        throw new GoogleAuthError(503, 'Đăng nhập bằng Google chưa được cấu hình trên hệ thống.');
    }
    if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4096) {
        throw new GoogleAuthError(400, 'Thông tin đăng nhập Google không hợp lệ.');
    }

    client = client || new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    let payload;
    try {
        // verifyIdToken kiểm tra: chữ ký (khoá công khai của Google), issuer,
        // thời hạn, và `audience` — token phải được cấp cho ĐÚNG Client ID của
        // ta, nếu không thì một token Google hợp lệ lấy từ ứng dụng KHÁC của
        // kẻ tấn công cũng đăng nhập được vào đây.
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
    } catch (err) {
        throw new GoogleAuthError(401, 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.');
    }

    if (!payload || !payload.sub || !payload.email) {
        throw new GoogleAuthError(401, 'Không lấy được thông tin tài khoản Google.');
    }
    // BẮT BUỘC email đã được Google xác minh. Nếu không, kẻ tấn công tạo tài
    // khoản Google khai báo email của nạn nhân (chưa xác minh) rồi "liên kết"
    // vào tài khoản của nạn nhân trên hệ thống này → chiếm tài khoản.
    if (payload.email_verified !== true) {
        throw new GoogleAuthError(403, 'Email của tài khoản Google này chưa được Google xác minh.');
    }

    return {
        googleId: payload.sub,
        email: String(payload.email).toLowerCase().trim(),
        name: payload.name || String(payload.email).split('@')[0],
        picture: payload.picture || null,
    };
}

module.exports = { verifyGoogleCredential, isConfigured, GoogleAuthError };
