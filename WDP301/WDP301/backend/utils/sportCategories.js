const SportCategory = require('../models/SportCategory');
const Court = require('../models/Court');

// Danh mục mặc định — trùng SPORTS ở frontend và SPORT_IDS ở courtRules. Tự nạp vào CSDL khi còn trống.
const DEFAULTS = [
    { key: 'football', name: 'Bóng đá', icon: '⚽', color: '#22C55E' },
    { key: 'basketball', name: 'Bóng rổ', icon: '🏀', color: '#F59E0B' },
    { key: 'badminton', name: 'Cầu lông', icon: '🏸', color: '#0A84FF' },
    { key: 'tennis', name: 'Tennis', icon: '🎾', color: '#FF6B2B' },
    { key: 'pickleball', name: 'Pickleball', icon: '🏓', color: '#14B8A6' },
    { key: 'volleyball', name: 'Bóng chuyền', icon: '🏐', color: '#8B5CF6' },
    { key: 'swimming', name: 'Bơi lội', icon: '🏊', color: '#06B6D4' },
    { key: 'gym', name: 'Gym', icon: '🏋️', color: '#EF4444' },
    { key: 'yoga', name: 'Yoga', icon: '🧘', color: '#EC4899' },
];

let seeding = null;
/** Nạp danh mục mặc định MỘT lần nếu bảng còn trống (an toàn khi nhiều request chạy cùng lúc). */
function ensureSeeded() {
    if (!seeding) {
        seeding = (async () => {
            if ((await SportCategory.estimatedDocumentCount()) === 0) {
                await SportCategory.insertMany(DEFAULTS.map((d, i) => ({ ...d, order: i })), { ordered: false }).catch(() => {});
            } else if (!(await SportCategory.findOne({ key: 'pickleball' })) && (await Court.exists({ type: 'pickleball' }))) {
                // Danh mục đã nạp từ trước khi có Pickleball nhưng đã có sân Pickleball → bổ sung để các sân đó vẫn
                // hiển thị đúng tên và sửa được. Chỉ làm khi thật sự có sân dùng môn này (không ép môn lên nếu Admin đã bỏ).
                const d = DEFAULTS.find((x) => x.key === 'pickleball');
                await SportCategory.create({ ...d, order: DEFAULTS.indexOf(d) }).catch(() => {});
            }
        })().catch((err) => { seeding = null; throw err; });
    }
    return seeding;
}

async function listAll() {
    await ensureSeeded();
    return SportCategory.find().sort({ order: 1, createdAt: 1 });
}

/**
 * Kiểm tra môn của sân. Trả về chuỗi lỗi, hoặc null nếu hợp lệ.
 * Môn đã tắt không cho gán cho sân MỚI, nhưng sân đang dùng môn đó vẫn sửa được (currentType).
 */
async function checkSport(type, currentType = '') {
    await ensureSeeded();
    const cat = await SportCategory.findOne({ key: type });
    if (!cat) return 'Môn thể thao không hợp lệ';
    if (!cat.isActive && type !== currentType) return 'Môn thể thao này hiện không nhận thêm sân mới';
    return null;
}

/** Chỉ dùng cho test: cho phép nạp lại mặc định sau khi dọn dữ liệu giả. */
function _resetSeeding() { seeding = null; }

module.exports = { DEFAULTS, ensureSeeded, listAll, checkSport, _resetSeeding };
