/**
 * Avatar dựng sẵn để người dùng chọn trong Hồ sơ.
 *
 * Giá trị lưu ở User.avatar:
 *   - 'preset:<id>'     avatar dựng sẵn (file SVG nằm ở e360sport/public/avatars/<id>.svg)
 *   - '/uploads/<file>' ảnh người dùng tự tải lên
 *   - 'https://...'     ảnh Google (đăng nhập bằng Google)
 *   - null              dùng ảnh chữ cái đầu mặc định
 *
 * DANH SÁCH NÀY PHẢI KHỚP với thư mục public/avatars của frontend
 * (tests/avatars.test.js kiểm tra điều đó).
 */
const PRESET_IDS = [
    'avatar-01', 'avatar-02', 'avatar-03', 'avatar-04', 'avatar-05', 'avatar-06',
    'avatar-07', 'avatar-08', 'avatar-09', 'avatar-10', 'avatar-11', 'avatar-12',
];

const PRESET_PREFIX = 'preset:';

const isPreset = (value) => typeof value === 'string' && value.startsWith(PRESET_PREFIX);

/** 'preset:avatar-03' → true nếu id nằm trong danh sách cho phép. */
const isValidPreset = (value) => isPreset(value) && PRESET_IDS.includes(value.slice(PRESET_PREFIX.length));

/** Chỉ file do chính hệ thống lưu trong /uploads mới được xoá khi đổi avatar. */
const isLocalUpload = (value) => typeof value === 'string' && /^\/uploads\/[\w.-]+$/.test(value);

module.exports = { PRESET_IDS, PRESET_PREFIX, isPreset, isValidPreset, isLocalUpload };
