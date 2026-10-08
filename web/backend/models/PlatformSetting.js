const mongoose = require('mongoose');

// Chỉ có DUY NHẤT 1 document trong collection này (singleton pattern) — field
// `singleton` luôn cố định là 'main' và có unique index để đảm bảo không thể
// tạo document thứ 2. Trước đây các giá trị này (tên nền tảng, email hỗ trợ,
// % hoa hồng) đều bị hardcode rải rác trong code, không có nơi nào lưu/sửa được.
const platformSettingSchema = new mongoose.Schema(
    {
        singleton: { type: String, default: 'main', unique: true },
        platformName: { type: String, default: 'ESport360' },
        supportEmail: { type: String, default: 'support@esport360.vn' },
        // Lưu dưới dạng số nguyên/thập phân 0-100 (vd: 5 nghĩa là 5%), KHÔNG
        // phải số thập phân 0-1, để hiển thị trực quan hơn trên giao diện.
        commissionRate: { type: Number, default: 5, min: 0, max: 100 },
        // Phần trăm HOA HỒNG do KHÁCH chịu (cộng thêm vào giá khi đặt sân); phần còn
        // lại do CHỦ SÂN chịu (trừ vào tiền họ nhận). 0 = chủ sân chịu toàn bộ (mặc
        // định), 50 = chia đôi, 100 = khách chịu toàn bộ (cách tính cũ). Xem utils/commission.js.
        // ===== ĐỐI SOÁT HOA HỒNG VỚI CHỦ SÂN (khách chuyển thẳng cho chủ sân) =====
        // Số ngày chủ sân có để nộp phí dịch vụ kể từ khi nhận hoá đơn (mặc định 7 ngày; cộng thêm
        // commissionGraceDays = 3 ngày ân hạn → sau 10 ngày chưa nộp thì địa điểm bị khoá).
        commissionDueDays: { type: Number, default: 7, min: 1, max: 90 },
        // Tự động lập hoá đơn mỗi tháng cho chủ sân còn nợ hoa hồng.
        commissionAutoIssueEnabled: { type: Boolean, default: true },
        // Quá hạn + ngần này ngày mà chưa nộp thì địa điểm tạm ngưng nhận đặt MỚI
        // (đơn đã đặt vẫn giữ nguyên). Bật/tắt bằng commissionBlockEnabled.
        commissionBlockEnabled: { type: Boolean, default: true },
        commissionGraceDays: { type: Number, default: 3, min: 0, max: 90 },
        commissionCustomerSharePct: { type: Number, default: 0, min: 0, max: 100 },

        // ===== THAM SỐ KẾ TOÁN =====
        // Tỉ lệ phí cổng thanh toán (0.015 = 1,5%) — khoản chi phí
        // trước đây bị bỏ qua khi tính lợi nhuận.
        gatewayFeeRate: { type: Number, default: 0.015, min: 0, max: 1 },

        // ===== CHUYỂN SÂN =====
        transferEnabled: { type: Boolean, default: true },
        // Dưới ngưỡng này chủ sân cũ không còn cơ hội bán lại khung giờ, nên
        // không cho chuyển nữa — khách phải dùng chính sách huỷ.
        transferMinLeadTimeHours: { type: Number, default: 2, min: 0 },
        maxTransfersPerBooking: { type: Number, default: 1, min: 0 },
        quoteTtlMinutes: { type: Number, default: 10, min: 1 },
        ownerApprovalTimeoutMinutes: { type: Number, default: 30, min: 1 },

        // Biểu phí bậc thang. minLeadHours = ngưỡng DƯỚI của bậc, mảng phải
        // được sắp xếp giảm dần khi tra cứu (xem utils/transferPolicy.js).
        transferFeeTiers: {
            type: [{
                _id: false,
                minLeadHours: Number,
                sameVenueRate: Number,   // T1, T2
                sameOwnerRate: Number,   // T3
                crossOwnerRate: Number,  // T4
            }],
            default: () => ([
                { minLeadHours: 24, sameVenueRate: 0, sameOwnerRate: 0.02, crossOwnerRate: 0.05 },
                { minLeadHours: 12, sameVenueRate: 0, sameOwnerRate: 0.03, crossOwnerRate: 0.08 },
                { minLeadHours: 6, sameVenueRate: 0.03, sameOwnerRate: 0.05, crossOwnerRate: 0.10 },
                { minLeadHours: 0, sameVenueRate: 0.05, sameOwnerRate: 0.08, crossOwnerRate: 0.15 },
            ]),
        },
        transferFeeMin: { type: Number, default: 5000, min: 0 },
        transferFeeMax: { type: Number, default: 100000, min: 0 },
        transferFixedFeeT5: { type: Number, default: 10000, min: 0 },

        // Bồi thường chủ sân gốc — CHỈ áp cho T4, vì chỉ khi đó mới có một chủ
        // sân thực sự bị mất doanh thu.
        compensationTiers: {
            type: [{ _id: false, minLeadHours: Number, rate: Number }],
            default: () => ([
                { minLeadHours: 24, rate: 0 },
                { minLeadHours: 12, rate: 0.10 },
                { minLeadHours: 6, rate: 0.20 },
                { minLeadHours: 0, rate: 0.40 },
            ]),
        },

        // Trần hoàn TIỀN MẶT khi chuyển sang sân rẻ hơn. Phần vượt trần được
        // ghi vào số dư khuyến mãi — chặn hành vi đặt sân đắt rồi chuyển sang
        // sân rẻ để rút tiền qua cổng thanh toán.
        maxRefundRatio: { type: Number, default: 0.5, min: 0, max: 1 },
        refundToCreditEnabled: { type: Boolean, default: true },

        // ===== HUỶ ĐƠN =====
        // Cố tình đặt KÉM hấp dẫn hơn chuyển sân, để khi khách bận đột xuất thì
        // chuyển sân luôn là lựa chọn rẻ hơn huỷ.
        cancellationTiers: {
            type: [{ _id: false, minLeadHours: Number, refundRate: Number }],
            default: () => ([
                { minLeadHours: 24, refundRate: 1.0 },
                { minLeadHours: 12, refundRate: 0.7 },
                { minLeadHours: 6, refundRate: 0.5 },
                { minLeadHours: 2, refundRate: 0.2 },
                { minLeadHours: 0, refundRate: 0 },
            ]),
        },

        // ===== TÀI KHOẢN NHẬN THANH TOÁN (chuyển khoản ngân hàng) =====
        // Thay cho VNPay/MoMo: khách chuyển khoản trực tiếp vào tài khoản này,
        // hệ thống hiển thị mã QR VietQR và nội dung chuyển khoản (chính là
        // orderRef của giao dịch) để đối chiếu. Không cần đăng ký merchant,
        // không cần chờ duyệt. Đây là tài khoản NỀN TẢNG, chỉ dùng để chủ sân nộp
        // hoa hồng theo hoá đơn đối soát — khách đặt sân chuyển thẳng cho chủ sân.
        bankName: { type: String, default: '' },          // Tên hiển thị, vd "Ngân hàng TMCP Á Châu (ACB)"
        // Mã BIN theo chuẩn Napas — bắt buộc để tạo được mã QR VietQR.
        // Danh sách mã: https://api.vietqr.io/v2/banks
        bankBin: { type: String, default: '' },
        bankAccountNumber: { type: String, default: '' },
        bankAccountName: { type: String, default: '' },    // Không dấu, đúng như trên thẻ/tài khoản
        // Cửa sổ thời gian khách được phép hoàn tất chuyển khoản trước khi đơn
        // tự huỷ. Chuyển khoản ngân hàng cần nhiều thời gian hơn quẹt thẻ, nên
        // mặc định rộng hơn hẳn so với khi còn dùng cổng thanh toán (15 phút).
        bankTransferWindowMinutes: { type: Number, default: 30, min: 5 },

        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
