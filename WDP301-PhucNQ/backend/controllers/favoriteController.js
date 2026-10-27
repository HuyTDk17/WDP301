const Favorite = require('../models/Favorite');
const Venue = require('../models/Venue');
const asyncHandler = require('../utils/asyncHandler');

exports.getFavorites = asyncHandler(async (req, res) => {
    const favorites = await Favorite.find({ userId: req.user._id });
    const venueIds = favorites.map((f) => f.venueId);
    const venues = await Venue.find({ _id: { $in: venueIds } });
    res.json({ venues });
});

exports.addFavorite = asyncHandler(async (req, res) => {
    const { venueId } = req.body;
    const exists = await Favorite.findOne({ userId: req.user._id, venueId });
    if (!exists) await Favorite.create({ userId: req.user._id, venueId });
    res.status(201).json({ message: 'Đã thêm vào danh sách yêu thích' });
});

exports.removeFavorite = asyncHandler(async (req, res) => {
    await Favorite.findOneAndDelete({ userId: req.user._id, venueId: req.params.venueId });
    res.json({ message: 'Đã xóa khỏi danh sách yêu thích' });
});
