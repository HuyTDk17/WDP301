/** Chuyển tiêu đề tiếng Việt thành slug ASCII: "Giải bóng đá Hà Nội!" → "giai-bong-da-ha-noi". */
function slugify(text, maxLength = 80) {
    return String(text || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maxLength)
        .replace(/-+$/g, '');
}
module.exports = slugify;
