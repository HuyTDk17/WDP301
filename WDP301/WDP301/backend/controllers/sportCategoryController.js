const mongoose = require('mongoose');
const SportCategory = require('../models/SportCategory');
const Venue = require('../models/Venue');
const Court = require('../models/Court');
const asyncHandler = require('../utils/asyncHandler');
const { listAll, ensureSeeded } = require('../utils/sportCategories');

const isId = (v) => mongoose.isValidObjectId(v);
const toBool = (v) => !['false', '0', ''].includes(String(v));

// @route GET /api/sports  (công khai) — toàn bộ danh mục kèm isActive; frontend dùng bản đang bật cho ô chọn,
// bản đầy đủ để hiển thị đúng tên môn của dữ liệu cũ.
exports.getPublicSports = asyncHandler(async (req, res) => {
    const all = await listAll();
    res.json({ sports: all.map((s) => ({ id: s.key, name: s.name, icon: s.icon, color: s.color, order: s.order, isActive: s.isActive })) });
});

// @route GET /api/admin/sport-categories — kèm số địa điểm / sân đang dùng
exports.getCategoriesAdmin = asyncHandler(async (req, res) => {
    const all = await listAll();
    const withUsage = await Promise.all(all.map(async (c) => {
        const [venues, courts] = await Promise.all([Venue.countDocuments({ sports: c.key }), Court.countDocuments({ type: c.key })]);
        return { ...c.toObject(), usage: { venues, courts } };
    }));
    res.json({ categories: withUsage });
});

function readFields(body, { partial }) {
    const out = {};
    if (body.name !== undefined || !partial) {
        const name = String(body.name || '').trim();
        if (name.length < 2 || name.length > 40) return { error: 'Tên môn cần từ 2 đến 40 ký tự' };
        out.name = name;
    }
    if (body.icon !== undefined) {
        const icon = String(body.icon).trim();
        if (!icon || [...icon].length > 4) return { error: 'Biểu tượng chỉ nên là 1–2 emoji' };
        out.icon = icon;
    }
    if (body.color !== undefined) {
        if (!/^#[0-9a-fA-F]{6}$/.test(String(body.color))) return { error: 'Màu phải có dạng #RRGGBB' };
        out.color = String(body.color).toUpperCase();
    }
    if (body.order !== undefined) {
        const n = Number(body.order);
        if (!Number.isFinite(n)) return { error: 'Thứ tự phải là số' };
        out.order = n;
    }
    if (body.isActive !== undefined) out.isActive = typeof body.isActive === 'boolean' ? body.isActive : toBool(body.isActive);
    return { fields: out };
}

// @route POST /api/admin/sport-categories   body: { key, name, icon, color, order }
exports.createCategory = asyncHandler(async (req, res) => {
    await ensureSeeded();
    const key = String(req.body.key || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,29}$/.test(key)) return res.status(400).json({ message: 'Mã môn chỉ gồm chữ thường, số, dấu gạch ngang (2–30 ký tự, bắt đầu bằng chữ)' });
    const { fields, error } = readFields(req.body, { partial: false });
    if (error) return res.status(400).json({ message: error });
    if (await SportCategory.exists({ key })) return res.status(409).json({ message: 'Mã môn này đã tồn tại' });
    if (fields.order === undefined) {
        const last = await SportCategory.findOne().sort({ order: -1 }).select('order');
        fields.order = (last?.order ?? -1) + 1;
    }
    const category = await SportCategory.create({ ...fields, key });
    res.status(201).json({ category });
});

// @route PUT /api/admin/sport-categories/:id  (mã `key` cố định vì dữ liệu sân đang tham chiếu)
exports.updateCategory = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const { fields, error } = readFields(req.body, { partial: true });
    if (error) return res.status(400).json({ message: error });
    const category = await SportCategory.findByIdAndUpdate(req.params.id, fields, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục này' });
    res.json({ category });
});

// @route DELETE /api/admin/sport-categories/:id — chỉ xóa khi chưa có địa điểm/sân nào dùng; đang dùng thì nên TẮT
exports.deleteCategory = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const category = await SportCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục này' });
    const [venues, courts] = await Promise.all([Venue.countDocuments({ sports: category.key }), Court.countDocuments({ type: category.key })]);
    if (venues > 0 || courts > 0) {
        return res.status(409).json({ message: `Môn này đang được dùng bởi ${venues} địa điểm và ${courts} sân. Hãy tắt môn thay vì xóa để dữ liệu cũ không bị mất tên.` });
    }
    await category.deleteOne();
    res.json({ message: 'Đã xóa danh mục' });
});
