const mongoose = require('mongoose');

const playerMatchSchema = new mongoose.Schema({
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sport: { type: String, required: true, trim: true, maxlength: 40 },
    area: { type: String, required: true, trim: true, maxlength: 100 },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    maxPlayers: { type: Number, required: true, min: 2, max: 30 },
    description: { type: String, default: '', maxlength: 300 },
    status: { type: String, enum: ['open', 'full', 'cancelled'], default: 'open' },
    players: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        joinedAt: { type: Date, default: Date.now },
    }],
}, { timestamps: true });

playerMatchSchema.index({ status: 1, date: 1, sport: 1 });
playerMatchSchema.index({ 'players.userId': 1, date: 1 });

module.exports = mongoose.model('PlayerMatch', playerMatchSchema);