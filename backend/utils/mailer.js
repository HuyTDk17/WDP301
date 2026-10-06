const nodemailer = require('nodemailer');

/**
 * GỬI EMAIL.
 *
 * Trước đây hệ thống không có dịch vụ email nào, nên "Quên mật khẩu" trả về 503
 * vĩnh viễn. Với người dùng thật, quên mật khẩu mà không khôi phục được nghĩa là
 * mất tài khoản — kèm theo mất luôn lịch sử đặt sân và số dư khuyến mãi.
 *
 * Thiết kế: nếu chưa cấu hình SMTP thì `isConfigured()` trả false và nơi gọi tự
 * quyết định cách xử lý (trả 503 có thông báo rõ ràng). Hệ thống KHÔNG sập vì
 * thiếu email, nhưng cũng không giả vờ là đã gửi.
 */

let transporter = null;

/**
 * HAI CÁCH GỬI (chọn tự động):
 *   1. Brevo qua HTTP API — khi có BREVO_API_KEY + MAIL_FROM. Dùng cho hosting
 *      chặn cổng SMTP (Render gói miễn phí chặn 25/465/587). Gói free ~300 email/ngày.
 *      MAIL_FROM phải là địa chỉ đã xác minh trong Brevo (Senders & IP).
 *   2. SMTP — khi có SMTP_HOST/USER/PASS (như trước).
 * Có cả hai thì ưu tiên Brevo.
 */
function brevoConfigured() {
    return !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
}

function smtpConfigured() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function isConfigured() {
    return brevoConfigured() || smtpConfigured();
}

/** 'ESport360 <a@b.com>' → { name: 'ESport360', email: 'a@b.com' };  'a@b.com' → { email: 'a@b.com' }. */
function parseAddress(value) {
    const str = String(value || '').trim();
    const m = /^(.*?)\s*<([^<>]+)>$/.exec(str);
    if (!m) return { email: str };
    const name = m[1].trim().replace(/^"|"$/g, '');
    return name ? { name, email: m[2].trim() } : { email: m[2].trim() };
}

async function sendViaBrevo({ to, subject, html, text }) {
    const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({ email }));
    let res;
    try {
        res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json',
                accept: 'application/json',
            },
            body: JSON.stringify({
                sender: parseAddress(process.env.MAIL_FROM),
                to: recipients,
                subject,
                htmlContent: html,
                textContent: text || String(html).replace(/<[^>]+>/g, ' '),
            }),
            signal: AbortSignal.timeout(15000),
        });
    } catch (e) {
        console.error('Brevo: không kết nối được:', e.message);
        const err = new Error('Không gửi được email, vui lòng thử lại sau');
        err.statusCode = 502;
        throw err;
    }
    if (!res.ok) {
        // Không đưa nội dung lỗi của Brevo ra client; chỉ ghi log để tự tra (sai API key, sender chưa xác minh...).
        const detail = await res.text().catch(() => '');
        console.error(`Brevo trả lỗi ${res.status}: ${detail.slice(0, 300)}`);
        const err = new Error('Không gửi được email, vui lòng thử lại sau');
        err.statusCode = 502;
        throw err;
    }
    return res.json().catch(() => ({}));
}

function getTransporter() {
    if (!smtpConfigured()) return null;
    if (transporter) return transporter;

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        // Cổng 465 dùng SSL ngay từ đầu; 587 dùng STARTTLS nên secure = false.
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return transporter;
}

async function sendMail({ to, subject, html, text }) {
    if (brevoConfigured()) return sendViaBrevo({ to, subject, html, text });

    const tx = getTransporter();
    if (!tx) {
        const err = new Error('Dịch vụ email chưa được cấu hình');
        err.statusCode = 503;
        throw err;
    }
    return tx.sendMail({
        from: process.env.SMTP_FROM || `ESport360 <${process.env.SMTP_USER}>`,
        to, subject, html,
        text: text || String(html).replace(/<[^>]+>/g, ' '),
    });
}

/** Mẫu email đặt lại mật khẩu. Giữ đơn giản để không rơi vào hộp thư rác. */
function resetPasswordTemplate({ name, resetUrl, expiresMinutes }) {
    return `
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
  <h2 style="margin:0 0 16px">Đặt lại mật khẩu ESport360</h2>
  <p>Chào ${name || 'bạn'},</p>
  <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút bên dưới để tạo mật khẩu mới:</p>
  <p style="margin:28px 0">
    <a href="${resetUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">
      Đặt lại mật khẩu
    </a>
  </p>
  <p style="color:#64748b;font-size:14px">
    Liên kết có hiệu lực trong ${expiresMinutes} phút và chỉ dùng được một lần.
    Nếu nút không bấm được, hãy sao chép đường dẫn sau vào trình duyệt:<br>
    <span style="word-break:break-all">${resetUrl}</span>
  </p>
  <p style="color:#64748b;font-size:14px">
    Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại của bạn vẫn giữ nguyên.
  </p>
</div>`.trim();
}

/** Mẫu email xác minh địa chỉ email khi đăng ký. */
function verifyEmailTemplate({ name, verifyUrl, expiresHours }) {
    return `
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
  <h2 style="margin:0 0 16px">Xác minh email ESport360</h2>
  <p>Chào ${name || 'bạn'},</p>
  <p>Cảm ơn bạn đã đăng ký tài khoản ESport360. Bấm nút bên dưới để xác minh email này là của bạn:</p>
  <p style="margin:28px 0">
    <a href="${verifyUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">
      Xác minh email
    </a>
  </p>
  <p style="color:#64748b;font-size:14px">
    Liên kết có hiệu lực trong ${expiresHours} giờ. Nếu nút không bấm được, hãy sao chép đường dẫn sau vào trình duyệt:<br>
    <span style="word-break:break-all">${verifyUrl}</span>
  </p>
  <p style="color:#64748b;font-size:14px">
    Bạn vẫn dùng được tài khoản bình thường nếu chưa xác minh, nhưng cần xác minh
    email trước khi nộp hồ sơ đăng ký làm chủ sân. Nếu không phải bạn đăng ký, hãy bỏ qua email này.
  </p>
</div>`.trim();
}

module.exports = { sendMail, isConfigured, parseAddress, resetPasswordTemplate, verifyEmailTemplate };
