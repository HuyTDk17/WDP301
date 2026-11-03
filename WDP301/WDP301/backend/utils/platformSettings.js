const PlatformSetting = require('../models/PlatformSetting');

// Cache ngắn hạn để tránh phải query DB trên MỌI lượt tạo booking (rate hầu
// như không đổi). invalidateCache() được gọi ngay khi admin lưu cài đặt mới,
// nên thay đổi có hiệu lực ngay lập tức chứ không phải đợi cache hết hạn.
let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000;

async function getSettings() {
    const now = Date.now();
    if (cache && now - cacheTime < CACHE_TTL_MS) return cache;
    let settings = await PlatformSetting.findOne({ singleton: 'main' });
    if (!settings) settings = await PlatformSetting.create({ singleton: 'main' });
    cache = settings;
    cacheTime = now;
    return settings;
}

// Trả về tỉ lệ hoa hồng dạng số thập phân (vd: 0.05 cho 5%) để dùng trực tiếp
// trong phép tính, thay vì hardcode `* 0.05` rải rác trong nhiều controller.
async function getCommissionRate() {
    const settings = await getSettings();
    return settings.commissionRate / 100;
}

// Cấu hình hoa hồng đầy đủ: tỉ lệ (0–100) và phần khách chịu (0–100) — đưa thẳng
// vào utils/commission.splitCommission.
async function getCommissionConfig() {
    const settings = await getSettings();
    return {
        ratePct: settings.commissionRate ?? 0,
        customerSharePct: settings.commissionCustomerSharePct ?? 0,
    };
}

function invalidateCache() {
    cache = null;
}

/**
 * Nạp thông tin tài khoản ngân hàng từ biến môi trường vào CSDL, CHỈ MỘT LẦN
 * lúc khởi động và CHỈ KHI chưa có sẵn — nguồn sự thật là bản ghi trong CSDL
 * (chỉnh qua trang Cài đặt), biến môi trường chỉ là tiện ích cho lần triển
 * khai đầu tiên khi CSDL còn trống.
 *
 * Không dùng biến môi trường làm nguồn chính vì admin cần sửa được thông tin
 * này (đổi ngân hàng, đổi số tài khoản) mà không phải sửa .env và khởi động
 * lại toàn bộ máy chủ.
 */
async function bootstrapBankFromEnv() {
    if (!process.env.BANK_BIN || !process.env.BANK_ACCOUNT_NUMBER) return;

    let settings = await PlatformSetting.findOne({ singleton: 'main' });
    if (!settings) settings = new PlatformSetting({ singleton: 'main' });
    if (settings.bankBin && settings.bankAccountNumber) return; // đã có rồi, không ghi đè

    settings.bankBin = process.env.BANK_BIN.trim();
    settings.bankAccountNumber = process.env.BANK_ACCOUNT_NUMBER.trim();
    if (process.env.BANK_ACCOUNT_NAME) settings.bankAccountName = process.env.BANK_ACCOUNT_NAME.trim().toUpperCase();
    if (process.env.BANK_NAME) settings.bankName = process.env.BANK_NAME.trim();
    await settings.save();
    invalidateCache();
    console.log('✅ Đã nạp thông tin tài khoản ngân hàng từ biến môi trường vào cơ sở dữ liệu');
}

module.exports = {
    getSettings, getCommissionRate, getCommissionConfig, invalidateCache, bootstrapBankFromEnv,
};
