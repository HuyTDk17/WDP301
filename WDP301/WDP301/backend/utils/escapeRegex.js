// Escape ký tự đặc biệt của regex trong chuỗi tìm kiếm do người dùng nhập —
// tránh lỗi runtime (regex không hợp lệ) hoặc ReDoS nếu người dùng gõ ký tự
// như (, ), *, +, [, ]... vào ô tìm kiếm.
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = escapeRegex;
