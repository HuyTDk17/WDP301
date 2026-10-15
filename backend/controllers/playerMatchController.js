const PlayerMatch = require('../models/PlayerMatch');
const asyncHandler = require('../utils/asyncHandler');
const escapeRegex = require('../utils/escapeRegex');
const { durationHours, isValidDateString, isValidTimeString, leadTimeHours, toLocalDateString } = require('../utils/timeSlots');

exports.listMatches = asyncHandler(async (req, res) => {
    const { area, sport, date } = req.query;
    const filter = {
        status: { $in: ['open', 'full'] },
        date: { $gte: toLocalDateString() },
    };
    if (area) filter.area = { $regex: escapeRegex(String(area).slice(0, 100)), $options: 'i' };
    if (sport) filter.sport = String(sport).slice(0, 40);
    if (date) {
        if (!isValidDateString(date)) return res.status(400).json({ message: 'Ngày không đúng định dạng' });
        filter.date = date;
    }

    const matches = await PlayerMatch.find(filter)
        .sort({ date: 1, startTime: 1, createdAt: -1 })
        .limit(100)
        .populate('creatorId', 'name avatar')
        .populate('players.userId', 'name avatar');
    res.json({ matches, total: matches.length });
});

exports.createMatch = asyncHandler(async (req, res) => {
    const { sport, area, date, startTime, endTime, maxPlayers, description = '' } = req.body;
    const normalizedSport = typeof sport === 'string' ? sport.trim() : '';
    const normalizedArea = typeof area === 'string' ? area.trim() : '';
    const normalizedDescription = typeof description === 'string' ? description.trim() : null;

    if (!normalizedSport || normalizedSport.length > 40) {
        return res.status(400).json({ message: 'Môn thể thao không hợp lệ' });
    }
    if (!normalizedArea || normalizedArea.length > 100) {
        return res.status(400).json({ message: 'Khu vực phải có từ 1 đến 100 ký tự' });
    }
    if (!isValidDateString(date) || !isValidTimeString(startTime) || !isValidTimeString(endTime)) {
        return res.status(400).json({ message: 'Ngày hoặc khung giờ không hợp lệ' });
    }
    if (leadTimeHours(date, startTime) <= 0 || durationHours(startTime, endTime) <= 0) {
        return res.status(400).json({ message: 'Thời gian trận đấu phải nằm trong tương lai và có giờ kết thúc sau giờ bắt đầu' });
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 30) {
        return res.status(400).json({ message: 'Số người chơi tối đa phải từ 2 đến 30' });
    }
    if (normalizedDescription === null || normalizedDescription.length > 300) {
        return res.status(400).json({ message: 'Ghi chú tối đa 300 ký tự' });
    }

    const match = await PlayerMatch.create({
        creatorId: req.user._id,
        sport: normalizedSport,
        area: normalizedArea,
        date,
        startTime,
        endTime,
        maxPlayers,
        description: normalizedDescription,
        players: [{ userId: req.user._id }],
    });
    await match.populate('creatorId', 'name avatar');
    await match.populate('players.userId', 'name avatar');
    res.status(201).json({ match });
});

exports.joinMatch = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const match = await PlayerMatch.findOneAndUpdate(
        {
            _id: req.params.id,
            status: 'open',
            'players.userId': { $ne: userId },
            $expr: { $lt: [{ $size: '$players' }, '$maxPlayers'] },
        },
        [{
            $set: {
                players: { $concatArrays: ['$players', [{ userId, joinedAt: new Date() }]] },
                status: {
                    $cond: [
                        { $eq: [{ $add: [{ $size: '$players' }, 1] }, '$maxPlayers'] },
                        'full',
                        'open',
                    ],
                },
            },
        }],
        { new: true }
    ).populate('creatorId', 'name avatar').populate('players.userId', 'name avatar');

    if (match) return res.json({ match });

    const existing = await PlayerMatch.findById(req.params.id).select('status maxPlayers players');
    if (!existing || existing.status === 'cancelled') {
        return res.status(404).json({ message: 'Không tìm thấy trận đang mở này' });
    }
    if (existing.players.some((player) => String(player.userId) === String(userId))) {
        return res.status(409).json({ message: 'Bạn đã tham gia trận này' });
    }
    return res.status(409).json({ message: 'Trận đã đủ người hoặc không còn nhận thêm người chơi' });
});